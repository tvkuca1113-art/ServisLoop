'use client';

import { ClipboardCheck, Lock } from 'lucide-react';
import { useActionState, useEffect, useId } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
  useToast,
} from '@/components/ui';
import type { ChecklistItemKind } from '@/domain/types';
import { cn } from '@/lib/utils';
import { fieldError, type ActionResult } from '@/server/actions/result';
import { completeWorkOrder } from '@/server/actions/work-orders';

/**
 * The checklist run — the screen a technician actually works in, standing in a plant room.
 *
 * Three decisions shape it:
 *
 * **Every check renders as the control its kind deserves.** A boolean is a pair of radio
 * buttons the size of a thumb, not a dropdown; a numeric reading is a numeric keypad with
 * its unit beside it *and its accepted range printed underneath*, so the technician knows
 * whether 1.4 bar is a pass before submitting rather than after; a select offers exactly
 * the options the template allows.
 *
 * **A failed check must be explained.** That rule is `validateChecklist`'s, not this
 * component's — the server returns a per-item message and it is rendered against the item
 * it belongs to. Nothing here re-implements the rule, and nothing here can be bypassed by
 * disabling JavaScript: this is a plain form posting to a server action.
 *
 * **Nothing is saved until everything is valid.** There is no draft state and no partial
 * write. A run that cannot close leaves the job exactly as it was, which is why a
 * technician can hit submit to find out what is missing without fear of half-closing a job.
 */

export interface ChecklistRunItem {
  id: string;
  position: number;
  label: string;
  kind: ChecklistItemKind;
  required: boolean;
  options: string[] | null;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  expectedBoolean: boolean | null;
}

export interface ChecklistRunProps {
  workOrderId: string;
  code: string;
  items: readonly ChecklistRunItem[];
  /** Today in the organisation's timezone — never the browser's idea of today. */
  today: string;
  /** Pre-fills the signature box with the site contact. */
  defaultSignedBy: string;
  /** False when the role may not close this job, or it is not this technician's. */
  canComplete: boolean;
  /**
   * Why the job cannot be closed right now, if it cannot. Computed on the server from the
   * status machine, so this component never guesses.
   */
  blockedReason?: string | null;
}

/** The accepted range for a numeric check, in the words the report will use. */
function describeTolerance(item: ChecklistRunItem): string | null {
  if (item.kind !== 'number') return null;
  const unit = item.unit ? ` ${item.unit}` : '';
  if (item.minValue !== null && item.maxValue !== null) {
    return `Passes between ${item.minValue} and ${item.maxValue}${unit}`;
  }
  if (item.minValue !== null) return `Passes at ${item.minValue}${unit} or above`;
  if (item.maxValue !== null) return `Passes at ${item.maxValue}${unit} or below`;
  return 'Any reading is recorded as a pass';
}

export function ChecklistRun({
  workOrderId,
  code,
  items,
  today,
  defaultSignedBy,
  canComplete,
  blockedReason,
}: ChecklistRunProps) {
  const { toast } = useToast();
  const completedOnId = useId();
  const signedById = useId();
  const minutesId = useId();

  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => completeWorkOrder(formData),
    null,
  );

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Job completed.', variant: 'success' });
  }, [result, toast]);

  if (!canComplete || blockedReason) {
    return (
      <Alert icon={<Lock />} variant={canComplete ? 'warning' : 'default'}>
        <AlertTitle>
          {canComplete ? 'Not ready to close' : 'You cannot close this job'}
        </AlertTitle>
        <AlertDescription>
          {blockedReason ??
            'Only the technician this job is assigned to — or an administrator — can complete it.'}
        </AlertDescription>
      </Alert>
    );
  }

  const ordered = [...items].sort((a, b) => a.position - b.position);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="id" value={workOrderId} />

      <FormAlert result={result} />

      <fieldset disabled={pending} className="flex flex-col gap-4 border-0 p-0">
        {ordered.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No checklist is attached to this job — its device type has no template. Closing it
            records the completion date and nothing else.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {ordered.map((item, index) => (
              <ChecklistItemField
                key={item.id}
                item={item}
                index={index + 1}
                error={fieldError(result, item.id)}
              />
            ))}
          </ol>
        )}

        <Separator />

        <div className="flex flex-col gap-4 rounded-card border border-border-base bg-surface-muted p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-ink">Close the job</h3>
            <p className="text-sm text-ink-muted">
              The completion date drives the next service date and the reminder ladder, so it
              is the day the work was carried out — not the day the paperwork was typed up.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={completedOnId} required>
                Date of service
              </Label>
              <Input
                id={completedOnId}
                name="completedOn"
                type="date"
                defaultValue={today}
                max={today}
                required
                aria-invalid={fieldError(result, 'completedOn') !== undefined}
                aria-describedby={`${completedOnId}-error`}
              />
              <FieldError
                id={`${completedOnId}-error`}
                message={fieldError(result, 'completedOn')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={minutesId}>Time on site (minutes)</Label>
              <Input
                id={minutesId}
                name="totalMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                placeholder="90"
                aria-invalid={fieldError(result, 'totalMinutes') !== undefined}
                aria-describedby={`${minutesId}-error`}
              />
              <FieldError id={`${minutesId}-error`} message={fieldError(result, 'totalMinutes')} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={signedById}>Signed for the customer by</Label>
              <Input
                id={signedById}
                name="signedByName"
                defaultValue={defaultSignedBy}
                maxLength={120}
                placeholder="Name of the person on site"
                aria-invalid={fieldError(result, 'signedByName') !== undefined}
                aria-describedby={`${signedById}-error`}
              />
              <FieldError id={`${signedById}-error`} message={fieldError(result, 'signedByName')} />
              <p className="text-xs text-ink-subtle">Printed on the signature block of the PDF.</p>
            </div>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Closing {code} recalculates the device’s next service date and rebuilds its
          reminders.
        </p>
        <SubmitButton pending={pending} pendingLabel="Closing…">
          <ClipboardCheck aria-hidden="true" />
          Complete job
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * One check.
 *
 * The field names are `item-{id}-bool|num|text` and `item-{id}-note`. The server rebuilds
 * the answers by walking the *template* and looking for those names, never by trusting a
 * list of ids from the browser — so a client cannot answer a check that is not on the
 * template, nor drop one and have it silently skipped.
 */
function ChecklistItemField({
  item,
  index,
  error,
}: {
  item: ChecklistRunItem;
  index: number;
  error: string | undefined;
}) {
  const valueId = useId();
  const noteId = useId();
  const errorId = `${valueId}-error`;
  const tolerance = describeTolerance(item);
  const expected = item.expectedBoolean ?? true;

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-card border p-4',
        error ? 'border-state-overdue bg-state-overdue/5' : 'border-border-base bg-surface-raised',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={valueId} required={item.required}>
            <span className="text-ink-subtle tabular-nums">{index}.</span>
            {item.label}
          </Label>
          {item.kind === 'boolean' ? (
            <p className="text-xs text-ink-subtle">
              “{expected ? 'Yes' : 'No'}” is the pass.
            </p>
          ) : null}
          {tolerance ? <p className="text-xs text-ink-subtle">{tolerance}</p> : null}
        </div>
        {item.required ? null : <Badge variant="neutral">Optional</Badge>}
      </div>

      {item.kind === 'boolean' ? (
        <fieldset className="flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">{item.label}</legend>
          {(
            [
              ['yes', 'Yes'],
              ['no', 'No'],
            ] as const
          ).map(([value, label], position) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border-base bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-border-strong has-[:checked]:border-brand-600 has-[:checked]:bg-brand-600/10"
            >
              <input
                type="radio"
                id={position === 0 ? valueId : undefined}
                name={`item-${item.id}-bool`}
                value={value}
                className="size-4 accent-brand-600"
                aria-describedby={errorId}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {item.kind === 'number' ? (
        <div className="flex items-center gap-2">
          <Input
            id={valueId}
            name={`item-${item.id}-num`}
            type="number"
            inputMode="decimal"
            step="any"
            className="max-w-40"
            aria-invalid={error !== undefined}
            aria-describedby={errorId}
          />
          {item.unit ? <span className="text-sm text-ink-muted">{item.unit}</span> : null}
        </div>
      ) : null}

      {item.kind === 'select' ? (
        <Select name={`item-${item.id}-text`}>
          <SelectTrigger id={valueId} className="max-w-72" aria-describedby={errorId}>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {(item.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {item.kind === 'text' ? (
        <Textarea
          id={valueId}
          name={`item-${item.id}-text`}
          rows={2}
          maxLength={2000}
          placeholder="What you found."
          aria-invalid={error !== undefined}
          aria-describedby={errorId}
        />
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={noteId} className="text-xs font-medium text-ink-muted">
          Note
        </Label>
        <Textarea
          id={noteId}
          name={`item-${item.id}-note`}
          rows={2}
          maxLength={1000}
          placeholder="Required if this check fails — say what you found and what you did."
          aria-invalid={error !== undefined}
          aria-describedby={errorId}
        />
      </div>

      <FieldError id={errorId} message={error} />
    </li>
  );
}
