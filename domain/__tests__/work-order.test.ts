import { describe, expect, it } from 'vitest';
import { civilDate } from '../dates';
import {
  InvalidTransitionError,
  TERMINAL_STATUSES,
  allowedTransitions,
  assertTransition,
  canTransition,
  checkTransition,
  compareWorkOrders,
  formatReportNumber,
  formatWorkOrderCode,
  isTerminal,
  parseWorkOrderCode,
  priorityForIssue,
  requirementsFor,
} from '../work-order';
import { WORK_ORDER_STATUSES } from '../types';

describe('status machine', () => {
  it('allows the normal forward path', () => {
    expect(canTransition('draft', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'completed')).toBe(true);
  });

  it('allows rescheduling and cancellation from any live state', () => {
    expect(canTransition('in_progress', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'scheduled')).toBe(true);
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('in_progress', 'cancelled')).toBe(true);
  });

  it('forbids skipping straight to completion', () => {
    expect(canTransition('draft', 'completed')).toBe(false);
    expect(canTransition('scheduled', 'completed')).toBe(false);
  });

  it('treats completed and cancelled as terminal', () => {
    for (const status of WORK_ORDER_STATUSES) {
      expect(canTransition('completed', status)).toBe(false);
      expect(canTransition('cancelled', status)).toBe(false);
    }
    expect(TERMINAL_STATUSES).toEqual(['completed', 'cancelled']);
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('scheduled')).toBe(false);
    expect(allowedTransitions('completed')).toEqual([]);
  });

  it('throws a typed error on an illegal edge', () => {
    expect(() => assertTransition('completed', 'in_progress')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('draft', 'scheduled')).not.toThrow();
  });
});

describe('requirementsFor', () => {
  it('demands the right data per target state', () => {
    expect(requirementsFor('scheduled')).toMatchObject({ requiresSchedule: true });
    expect(requirementsFor('in_progress')).toMatchObject({ requiresAssignee: true });
    expect(requirementsFor('completed')).toMatchObject({
      requiresAssignee: true,
      requiresChecklist: true,
      requiresCompletionDate: true,
    });
  });
});

describe('checkTransition', () => {
  const base = {
    assignedTo: 'user-1',
    scheduledFor: '2026-08-10T08:00:00.000Z',
    completedOn: civilDate('2026-08-10'),
    checklistComplete: true,
    today: civilDate('2026-08-12'),
  };

  it('passes a fully prepared completion', () => {
    expect(checkTransition({ ...base, from: 'in_progress', to: 'completed' })).toEqual({
      ok: true,
    });
  });

  it('blocks completion without a checklist', () => {
    const result = checkTransition({
      ...base,
      from: 'in_progress',
      to: 'completed',
      checklistComplete: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/checklist/i);
  });

  it('blocks completion without an assignee or a completion date', () => {
    const noAssignee = checkTransition({
      ...base,
      from: 'in_progress',
      to: 'completed',
      assignedTo: null,
    });
    expect(noAssignee.ok).toBe(false);

    const noDate = checkTransition({
      ...base,
      from: 'in_progress',
      to: 'completed',
      completedOn: null,
    });
    expect(noDate.ok).toBe(false);
    if (!noDate.ok) expect(noDate.errors.join(' ')).toMatch(/date the work was carried out/i);
  });

  it('rejects a completion date in the future', () => {
    const result = checkTransition({
      ...base,
      from: 'in_progress',
      to: 'completed',
      completedOn: civilDate('2026-09-01'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/cannot be in the future/i);
  });

  it('blocks scheduling without a date', () => {
    const result = checkTransition({
      ...base,
      from: 'draft',
      to: 'scheduled',
      scheduledFor: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/scheduled date/i);
  });

  it('reports the illegal edge before checking data requirements', () => {
    const result = checkTransition({ ...base, from: 'completed', to: 'in_progress' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/cannot move/i);
    }
  });

  it('collects several problems in one pass', () => {
    const result = checkTransition({
      from: 'in_progress',
      to: 'completed',
      assignedTo: null,
      scheduledFor: null,
      completedOn: null,
      checklistComplete: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBe(3);
  });
});

describe('codes', () => {
  it('formats a zero-padded, year-scoped code', () => {
    expect(formatWorkOrderCode(2026, 1)).toBe('WO-2026-0001');
    expect(formatWorkOrderCode(2026, 42)).toBe('WO-2026-0042');
    expect(formatWorkOrderCode(2026, 12345)).toBe('WO-2026-12345');
  });

  it('round-trips through the parser', () => {
    expect(parseWorkOrderCode('WO-2026-0042')).toEqual({ year: 2026, sequence: 42 });
    expect(parseWorkOrderCode('nonsense')).toBeNull();
    expect(parseWorkOrderCode('WO-26-1')).toBeNull();
  });

  it('rejects invalid inputs instead of emitting a broken code', () => {
    expect(() => formatWorkOrderCode(1999, 1)).toThrow(RangeError);
    expect(() => formatWorkOrderCode(2026, 0)).toThrow(RangeError);
    expect(() => formatWorkOrderCode(2026, 1.5)).toThrow(RangeError);
  });

  it('derives the report number from the same sequence', () => {
    expect(formatReportNumber(2026, 42)).toBe('SR-2026-0042');
  });
});

describe('priorityForIssue', () => {
  it('escalates a critical fault to urgent', () => {
    expect(priorityForIssue('critical')).toBe('urgent');
    expect(priorityForIssue('high')).toBe('high');
    expect(priorityForIssue('normal')).toBe('normal');
    expect(priorityForIssue('low')).toBe('low');
  });
});

describe('compareWorkOrders', () => {
  it('sorts by priority, then schedule, then code', () => {
    const orders = [
      { priority: 'normal' as const, scheduledFor: '2026-08-01T08:00:00Z', code: 'WO-2026-0003' },
      { priority: 'urgent' as const, scheduledFor: '2026-09-01T08:00:00Z', code: 'WO-2026-0001' },
      { priority: 'normal' as const, scheduledFor: '2026-07-01T08:00:00Z', code: 'WO-2026-0002' },
    ];
    expect([...orders].sort(compareWorkOrders).map((o) => o.code)).toEqual([
      'WO-2026-0001',
      'WO-2026-0002',
      'WO-2026-0003',
    ]);
  });

  it('places unscheduled orders after scheduled ones of equal priority', () => {
    const orders = [
      { priority: 'normal' as const, scheduledFor: null, code: 'WO-2026-0001' },
      { priority: 'normal' as const, scheduledFor: '2026-09-01T08:00:00Z', code: 'WO-2026-0002' },
    ];
    expect([...orders].sort(compareWorkOrders).map((o) => o.code)).toEqual([
      'WO-2026-0002',
      'WO-2026-0001',
    ]);
  });

  it('falls back to the code for otherwise identical orders', () => {
    const orders = [
      { priority: 'low' as const, scheduledFor: null, code: 'WO-2026-0009' },
      { priority: 'low' as const, scheduledFor: null, code: 'WO-2026-0002' },
    ];
    expect([...orders].sort(compareWorkOrders).map((o) => o.code)).toEqual([
      'WO-2026-0002',
      'WO-2026-0009',
    ]);
  });
});
