/**
 * Work-order lifecycle.
 *
 * The status machine here is the only place a work order is allowed to change state.
 * Encoding it as an explicit transition table — rather than scattering `if (status ===
 * ...)` through server actions — means an illegal transition is a single, testable
 * failure instead of a data-integrity bug discovered months later in a signed report.
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

import { type CivilDate, compareCivil } from './dates';
import type {
  Priority,
  WorkOrderKind,
  WorkOrderStatus,
  IssueSeverity,
} from './types';

/** Allowed target states from each state. Terminal states have no outgoing edges. */
const TRANSITIONS: Readonly<Record<WorkOrderStatus, readonly WorkOrderStatus[]>> = Object.freeze({
  draft: ['scheduled', 'cancelled'],
  scheduled: ['in_progress', 'scheduled', 'cancelled'],
  in_progress: ['completed', 'scheduled', 'cancelled'],
  completed: [],
  cancelled: [],
});

export const TERMINAL_STATUSES: readonly WorkOrderStatus[] = ['completed', 'cancelled'];

export function isTerminal(status: WorkOrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: WorkOrderStatus): readonly WorkOrderStatus[] {
  return TRANSITIONS[from];
}

export class InvalidTransitionError extends Error {
  constructor(from: WorkOrderStatus, to: WorkOrderStatus) {
    super(`A work order cannot move from "${from}" to "${to}".`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export interface TransitionRequirements {
  requiresAssignee: boolean;
  requiresSchedule: boolean;
  requiresChecklist: boolean;
  requiresCompletionDate: boolean;
}

/** What must be present before a transition is accepted. */
export function requirementsFor(to: WorkOrderStatus): TransitionRequirements {
  return {
    requiresAssignee: to === 'in_progress' || to === 'completed',
    requiresSchedule: to === 'scheduled',
    requiresChecklist: to === 'completed',
    requiresCompletionDate: to === 'completed',
  };
}

export interface TransitionCheckInput {
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  assignedTo: string | null;
  scheduledFor: string | null;
  completedOn: CivilDate | null;
  checklistComplete: boolean;
  /** Guards against a completion date typed in the future. */
  today?: CivilDate;
}

export type TransitionCheck = { ok: true } | { ok: false; errors: string[] };

/**
 * Full pre-flight check for a status change: the edge is legal *and* the data needed by
 * the target state is present.
 */
export function checkTransition(input: TransitionCheckInput): TransitionCheck {
  const errors: string[] = [];

  if (!canTransition(input.from, input.to)) {
    return { ok: false, errors: [`Cannot move from "${input.from}" to "${input.to}".`] };
  }

  const req = requirementsFor(input.to);

  if (req.requiresAssignee && !input.assignedTo) {
    errors.push('Assign a technician first.');
  }
  if (req.requiresSchedule && !input.scheduledFor) {
    errors.push('Set a scheduled date and time.');
  }
  if (req.requiresChecklist && !input.checklistComplete) {
    errors.push('Complete the service checklist before closing the job.');
  }
  if (req.requiresCompletionDate) {
    if (!input.completedOn) {
      errors.push('Record the date the work was carried out.');
    } else if (input.today && compareCivil(input.completedOn, input.today) > 0) {
      errors.push('The completion date cannot be in the future.');
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/* ------------------------------------------------------------------ */
/* Codes                                                               */
/* ------------------------------------------------------------------ */

/**
 * Human-readable work-order code, e.g. `WO-2026-0042`.
 *
 * Sequence is per organisation per year. Deterministic and collision-free given a
 * correctly allocated sequence number — the repository allocates it inside the same
 * transaction that inserts the row.
 */
export function formatWorkOrderCode(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`Invalid year for work-order code: ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`Work-order sequence must be a positive integer, received ${sequence}`);
  }
  return `WO-${year}-${String(sequence).padStart(4, '0')}`;
}

const CODE_RE = /^WO-(\d{4})-(\d{4,})$/;

export function parseWorkOrderCode(code: string): { year: number; sequence: number } | null {
  const m = CODE_RE.exec(code);
  if (!m) return null;
  return { year: Number(m[1]), sequence: Number(m[2]) };
}

/** Service-report number, e.g. `SR-2026-0042`. Shares the work order's sequence. */
export function formatReportNumber(year: number, sequence: number): string {
  return formatWorkOrderCode(year, sequence).replace('WO-', 'SR-');
}

/* ------------------------------------------------------------------ */
/* Priority                                                            */
/* ------------------------------------------------------------------ */

const SEVERITY_TO_PRIORITY: Readonly<Record<IssueSeverity, Priority>> = Object.freeze({
  low: 'low',
  normal: 'normal',
  high: 'high',
  critical: 'urgent',
});

/** A customer-reported issue carries its severity straight into the job's priority. */
export function priorityForIssue(severity: IssueSeverity): Priority {
  return SEVERITY_TO_PRIORITY[severity];
}

const PRIORITY_RANK: Readonly<Record<Priority, number>> = Object.freeze({
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
});

/** Sort comparator: urgent first, then by scheduled date, then by code. */
export function compareWorkOrders(
  a: { priority: Priority; scheduledFor: string | null; code: string },
  b: { priority: Priority; scheduledFor: string | null; code: string },
): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;

  if (a.scheduledFor && b.scheduledFor) {
    if (a.scheduledFor !== b.scheduledFor) return a.scheduledFor < b.scheduledFor ? -1 : 1;
  } else if (a.scheduledFor) {
    return -1;
  } else if (b.scheduledFor) {
    return 1;
  }

  return a.code.localeCompare(b.code);
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const STATUS_LABELS: Readonly<Record<WorkOrderStatus, string>> = Object.freeze({
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
});

export const KIND_LABELS: Readonly<Record<WorkOrderKind, string>> = Object.freeze({
  scheduled: 'Planned maintenance',
  issue: 'Reported fault',
  booking: 'Customer booking',
});

export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = Object.freeze({
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
});
