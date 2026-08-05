/**
 * Service checklist validation and scoring.
 *
 * A checklist run is the evidence behind a service report, so the rules here are strict:
 * a required item cannot be skipped, a numeric reading outside its tolerance band fails,
 * and every result carries a snapshot of the item's label and kind. That snapshot is what
 * stops a template edit next year from silently rewriting a report signed today.
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

import type { ChecklistItem, ChecklistItemKind } from './types';

/** Raw answer as it arrives from the form, before coercion. */
export type ChecklistAnswer = {
  itemId: string;
  valueBool?: boolean | null;
  valueNum?: number | null;
  valueText?: string | null;
  note?: string | null;
};

export interface ValidatedResult {
  itemId: string;
  labelSnapshot: string;
  kindSnapshot: ChecklistItemKind;
  position: number;
  valueBool: boolean | null;
  valueNum: number | null;
  valueText: string | null;
  passed: boolean;
  note: string | null;
}

export interface ChecklistFieldError {
  itemId: string;
  label: string;
  message: string;
}

export type ChecklistValidation =
  | { ok: true; results: ValidatedResult[] }
  | { ok: false; errors: ChecklistFieldError[] };

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * Decide whether a single answer counts as a pass.
 *
 * - `boolean` — matches `expectedBoolean` (defaults to expecting `true`).
 * - `number`  — inside `[minValue, maxValue]`, either bound optional.
 * - `text` / `select` — presence is the pass condition; a `select` must be a listed option.
 */
export function evaluateItem(item: ChecklistItem, answer: ChecklistAnswer): boolean {
  switch (item.kind) {
    case 'boolean': {
      if (answer.valueBool === null || answer.valueBool === undefined) return false;
      const expected = item.expectedBoolean ?? true;
      return answer.valueBool === expected;
    }
    case 'number': {
      const n = answer.valueNum;
      if (n === null || n === undefined || !Number.isFinite(n)) return false;
      if (item.minValue !== null && n < item.minValue) return false;
      if (item.maxValue !== null && n > item.maxValue) return false;
      return true;
    }
    case 'select': {
      if (isBlank(answer.valueText)) return false;
      const options = item.options ?? [];
      return options.includes(answer.valueText as string);
    }
    case 'text':
      return !isBlank(answer.valueText);
    default:
      return false;
  }
}

/**
 * Validate a whole checklist run against its template.
 *
 * Returns every error at once rather than failing on the first, so the technician sees
 * the complete list of what still needs attention instead of fixing one field at a time.
 */
export function validateChecklist(
  items: readonly ChecklistItem[],
  answers: readonly ChecklistAnswer[],
): ChecklistValidation {
  const byItemId = new Map(answers.map((a) => [a.itemId, a]));
  const errors: ChecklistFieldError[] = [];
  const results: ValidatedResult[] = [];

  const ordered = [...items].sort((a, b) => a.position - b.position);

  for (const item of ordered) {
    const answer = byItemId.get(item.id);

    if (!answer) {
      if (item.required) {
        errors.push({ itemId: item.id, label: item.label, message: 'This check is required.' });
      }
      continue;
    }

    // Structural checks produce errors; failing a tolerance is a *result*, not an error.
    if (item.kind === 'number' && answer.valueNum !== null && answer.valueNum !== undefined) {
      if (!Number.isFinite(answer.valueNum)) {
        errors.push({ itemId: item.id, label: item.label, message: 'Enter a valid number.' });
        continue;
      }
    }

    if (item.kind === 'select' && !isBlank(answer.valueText)) {
      const options = item.options ?? [];
      if (!options.includes(answer.valueText as string)) {
        errors.push({
          itemId: item.id,
          label: item.label,
          message: `Choose one of: ${options.join(', ')}.`,
        });
        continue;
      }
    }

    const hasValue =
      (item.kind === 'boolean' && answer.valueBool !== null && answer.valueBool !== undefined) ||
      (item.kind === 'number' && answer.valueNum !== null && answer.valueNum !== undefined) ||
      ((item.kind === 'text' || item.kind === 'select') && !isBlank(answer.valueText));

    if (item.required && !hasValue) {
      errors.push({ itemId: item.id, label: item.label, message: 'This check is required.' });
      continue;
    }

    if (!hasValue) continue;

    const passed = evaluateItem(item, answer);

    // A failed check must be explained. This is the difference between a report that
    // documents a fault and one that just records a red cross.
    if (!passed && isBlank(answer.note)) {
      errors.push({
        itemId: item.id,
        label: item.label,
        message: 'Add a note explaining the failed check.',
      });
      continue;
    }

    results.push({
      itemId: item.id,
      labelSnapshot: item.label,
      kindSnapshot: item.kind,
      position: item.position,
      valueBool: answer.valueBool ?? null,
      valueNum: answer.valueNum ?? null,
      valueText: answer.valueText ?? null,
      passed,
      note: isBlank(answer.note) ? null : (answer.note as string).trim(),
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, results };
}

export interface ChecklistScore {
  total: number;
  answered: number;
  passed: number;
  failed: number;
  /** `passed / answered`, rounded to one decimal. `100` when nothing was answered. */
  passRate: number;
  /** True when every answered check passed. */
  allPassed: boolean;
}

export function scoreChecklist(
  results: readonly Pick<ValidatedResult, 'passed'>[],
  totalItems?: number,
): ChecklistScore {
  const answered = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = answered - passed;
  const passRate = answered === 0 ? 100 : Math.round((passed / answered) * 1000) / 10;
  return {
    total: totalItems ?? answered,
    answered,
    passed,
    failed,
    passRate,
    allPassed: failed === 0,
  };
}

/** Human summary used in the work-order list and the PDF header. */
export function describeScore(score: ChecklistScore): string {
  if (score.answered === 0) return 'No checks recorded';
  if (score.allPassed) return `All ${score.passed} checks passed`;
  return `${score.failed} of ${score.answered} checks failed`;
}

/** Sanity-check a template before it is used on a job. */
export function validateTemplateItems(items: readonly ChecklistItem[]): ChecklistFieldError[] {
  const errors: ChecklistFieldError[] = [];
  const seenPositions = new Set<number>();

  for (const item of items) {
    if (isBlank(item.label)) {
      errors.push({ itemId: item.id, label: item.label, message: 'Label cannot be empty.' });
    }
    if (seenPositions.has(item.position)) {
      errors.push({
        itemId: item.id,
        label: item.label,
        message: `Duplicate position ${item.position}.`,
      });
    }
    seenPositions.add(item.position);

    if (item.kind === 'select' && (!item.options || item.options.length === 0)) {
      errors.push({
        itemId: item.id,
        label: item.label,
        message: 'A select check needs at least one option.',
      });
    }
    if (
      item.kind === 'number' &&
      item.minValue !== null &&
      item.maxValue !== null &&
      item.minValue > item.maxValue
    ) {
      errors.push({
        itemId: item.id,
        label: item.label,
        message: 'Minimum value is greater than maximum value.',
      });
    }
  }

  return errors;
}
