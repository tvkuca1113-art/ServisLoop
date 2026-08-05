import { describe, expect, it } from 'vitest';
import {
  type ChecklistAnswer,
  describeScore,
  evaluateItem,
  scoreChecklist,
  validateChecklist,
  validateTemplateItems,
} from '../checklist';
import type { ChecklistItem } from '../types';

function item(over: Partial<ChecklistItem> & { id: string }): ChecklistItem {
  return {
    orgId: 'org-1',
    templateId: 'tpl-1',
    position: 1,
    label: 'Check',
    kind: 'boolean',
    required: true,
    options: null,
    unit: null,
    minValue: null,
    maxValue: null,
    expectedBoolean: null,
    ...over,
  };
}

describe('evaluateItem — boolean', () => {
  const yesIsPass = item({ id: 'i1', kind: 'boolean', expectedBoolean: true });
  const noIsPass = item({ id: 'i2', kind: 'boolean', expectedBoolean: false });

  it('compares against the expected answer', () => {
    expect(evaluateItem(yesIsPass, { itemId: 'i1', valueBool: true })).toBe(true);
    expect(evaluateItem(yesIsPass, { itemId: 'i1', valueBool: false })).toBe(false);
    // "Any leaks detected?" — the pass condition is *no*.
    expect(evaluateItem(noIsPass, { itemId: 'i2', valueBool: false })).toBe(true);
    expect(evaluateItem(noIsPass, { itemId: 'i2', valueBool: true })).toBe(false);
  });

  it('defaults to expecting true', () => {
    const noExpectation = item({ id: 'i3', kind: 'boolean', expectedBoolean: null });
    expect(evaluateItem(noExpectation, { itemId: 'i3', valueBool: true })).toBe(true);
    expect(evaluateItem(noExpectation, { itemId: 'i3', valueBool: false })).toBe(false);
  });

  it('treats a missing answer as a failure', () => {
    expect(evaluateItem(yesIsPass, { itemId: 'i1' })).toBe(false);
    expect(evaluateItem(yesIsPass, { itemId: 'i1', valueBool: null })).toBe(false);
  });
});

describe('evaluateItem — number', () => {
  const pressure = item({ id: 'p', kind: 'number', minValue: 1.5, maxValue: 2.5, unit: 'bar' });

  it('passes inside the tolerance band, inclusive', () => {
    expect(evaluateItem(pressure, { itemId: 'p', valueNum: 2 })).toBe(true);
    expect(evaluateItem(pressure, { itemId: 'p', valueNum: 1.5 })).toBe(true);
    expect(evaluateItem(pressure, { itemId: 'p', valueNum: 2.5 })).toBe(true);
  });

  it('fails outside the band', () => {
    expect(evaluateItem(pressure, { itemId: 'p', valueNum: 1.4 })).toBe(false);
    expect(evaluateItem(pressure, { itemId: 'p', valueNum: 2.6 })).toBe(false);
  });

  it('supports one-sided bounds', () => {
    const minOnly = item({ id: 'm', kind: 'number', minValue: 10, maxValue: null });
    expect(evaluateItem(minOnly, { itemId: 'm', valueNum: 1000 })).toBe(true);
    expect(evaluateItem(minOnly, { itemId: 'm', valueNum: 9 })).toBe(false);
  });

  it('rejects non-finite readings', () => {
    expect(evaluateItem(pressure, { itemId: 'p', valueNum: Number.NaN })).toBe(false);
    expect(evaluateItem(pressure, { itemId: 'p', valueNum: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
  });
});

describe('evaluateItem — text and select', () => {
  it('treats a non-blank string as a pass', () => {
    const note = item({ id: 't', kind: 'text' });
    expect(evaluateItem(note, { itemId: 't', valueText: 'Cleaned filter' })).toBe(true);
    expect(evaluateItem(note, { itemId: 't', valueText: '   ' })).toBe(false);
    expect(evaluateItem(note, { itemId: 't', valueText: null })).toBe(false);
  });

  it('requires a listed option', () => {
    const grade = item({ id: 's', kind: 'select', options: ['good', 'worn', 'replace'] });
    expect(evaluateItem(grade, { itemId: 's', valueText: 'worn' })).toBe(true);
    expect(evaluateItem(grade, { itemId: 's', valueText: 'destroyed' })).toBe(false);
  });
});

describe('validateChecklist', () => {
  const items: ChecklistItem[] = [
    item({ id: 'a', position: 1, label: 'Visual inspection', kind: 'boolean', required: true }),
    item({
      id: 'b',
      position: 2,
      label: 'Pressure',
      kind: 'number',
      required: true,
      minValue: 1.5,
      maxValue: 2.5,
    }),
    item({ id: 'c', position: 3, label: 'Comments', kind: 'text', required: false }),
  ];

  it('accepts a complete, passing run', () => {
    const answers: ChecklistAnswer[] = [
      { itemId: 'a', valueBool: true },
      { itemId: 'b', valueNum: 2.1 },
      { itemId: 'c', valueText: 'All good' },
    ];
    const result = validateChecklist(items, answers);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toHaveLength(3);
      expect(result.results.every((r) => r.passed)).toBe(true);
    }
  });

  it('reports every missing required item at once', () => {
    const result = validateChecklist(items, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors.map((e) => e.itemId).sort()).toEqual(['a', 'b']);
    }
  });

  it('demands an explanation for a failed check', () => {
    const result = validateChecklist(items, [
      { itemId: 'a', valueBool: false },
      { itemId: 'b', valueNum: 2.0 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toMatch(/note/i);
    }
  });

  it('accepts a failed check once it is explained', () => {
    const result = validateChecklist(items, [
      { itemId: 'a', valueBool: false, note: 'Corrosion on the flange' },
      { itemId: 'b', valueNum: 2.0 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const failed = result.results.find((r) => r.itemId === 'a');
      expect(failed?.passed).toBe(false);
      expect(failed?.note).toBe('Corrosion on the flange');
    }
  });

  it('snapshots the label and kind so template edits cannot rewrite history', () => {
    const result = validateChecklist(items, [
      { itemId: 'a', valueBool: true },
      { itemId: 'b', valueNum: 2.0 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results[0]).toMatchObject({
        labelSnapshot: 'Visual inspection',
        kindSnapshot: 'boolean',
        position: 1,
      });
    }
  });

  it('returns results ordered by template position, not answer order', () => {
    const result = validateChecklist(items, [
      { itemId: 'c', valueText: 'note last' },
      { itemId: 'b', valueNum: 2.0 },
      { itemId: 'a', valueBool: true },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.results.map((r) => r.itemId)).toEqual(['a', 'b', 'c']);
  });

  it('rejects a select answer outside the option list', () => {
    const selectItems = [
      item({ id: 's', kind: 'select', options: ['good', 'worn'], required: true }),
    ];
    const result = validateChecklist(selectItems, [{ itemId: 's', valueText: 'melted' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.message).toContain('good, worn');
  });

  it('rejects a non-numeric reading', () => {
    const result = validateChecklist(items, [
      { itemId: 'a', valueBool: true },
      { itemId: 'b', valueNum: Number.NaN },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.message).toMatch(/valid number/i);
  });

  it('skips optional items left blank', () => {
    const result = validateChecklist(items, [
      { itemId: 'a', valueBool: true },
      { itemId: 'b', valueNum: 2.0 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.results).toHaveLength(2);
  });
});

describe('scoreChecklist', () => {
  it('counts passes and failures', () => {
    const score = scoreChecklist([
      { passed: true },
      { passed: true },
      { passed: false },
      { passed: true },
    ]);
    expect(score).toMatchObject({ answered: 4, passed: 3, failed: 1, allPassed: false });
    expect(score.passRate).toBe(75);
  });

  it('treats an empty run as vacuously complete', () => {
    const score = scoreChecklist([]);
    expect(score.passRate).toBe(100);
    expect(score.allPassed).toBe(true);
  });

  it('reports the template total when supplied', () => {
    expect(scoreChecklist([{ passed: true }], 10).total).toBe(10);
  });
});

describe('describeScore', () => {
  it('phrases each outcome', () => {
    expect(describeScore(scoreChecklist([]))).toBe('No checks recorded');
    expect(describeScore(scoreChecklist([{ passed: true }, { passed: true }]))).toBe(
      'All 2 checks passed',
    );
    expect(describeScore(scoreChecklist([{ passed: true }, { passed: false }]))).toBe(
      '1 of 2 checks failed',
    );
  });
});

describe('validateTemplateItems', () => {
  it('accepts a well-formed template', () => {
    expect(
      validateTemplateItems([
        item({ id: 'a', position: 1 }),
        item({ id: 'b', position: 2, kind: 'select', options: ['x'] }),
      ]),
    ).toEqual([]);
  });

  it('catches blank labels, duplicate positions, empty options and inverted bounds', () => {
    const errors = validateTemplateItems([
      item({ id: 'a', position: 1, label: '  ' }),
      item({ id: 'b', position: 1 }),
      item({ id: 'c', position: 2, kind: 'select', options: [] }),
      item({ id: 'd', position: 3, kind: 'number', minValue: 10, maxValue: 1 }),
    ]);
    expect(errors.map((e) => e.itemId)).toEqual(['a', 'b', 'c', 'd']);
  });
});
