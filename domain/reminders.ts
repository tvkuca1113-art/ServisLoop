/**
 * Reminder planning.
 *
 * A device with a due date generates a fixed ladder of reminders: 30 days out, 7 days
 * out, on the day, and once more a week after it goes overdue. The ladder is *derived*,
 * never stored ad hoc, so regenerating it after a due-date change is idempotent.
 *
 * The idempotency key `(deviceId, dueDate, stage)` is enforced by a unique constraint in
 * Postgres and mirrored here by {@link reminderKey}. That pairing is what lets the cron
 * endpoint be retried, run twice, or overlap with itself without ever double-sending.
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

import { type CivilDate, addDays, compareCivil, diffDays } from './dates';
import { REMINDER_STAGES, type ReminderStage } from './types';

/** Offset in days from the due date at which each stage fires. */
export const STAGE_OFFSETS: Readonly<Record<ReminderStage, number>> = Object.freeze({
  T_30: -30,
  T_7: -7,
  T_0: 0,
  OVERDUE: 7,
});

export const STAGE_LABELS: Readonly<Record<ReminderStage, string>> = Object.freeze({
  T_30: '30 days before',
  T_7: '7 days before',
  T_0: 'On the due date',
  OVERDUE: '7 days overdue',
});

export interface ReminderPlanItem {
  deviceId: string;
  dueDate: CivilDate;
  stage: ReminderStage;
  scheduledFor: CivilDate;
  /** Stable idempotency key. */
  key: string;
}

/** The unique identity of a reminder. Mirrors the DB unique constraint. */
export function reminderKey(deviceId: string, dueDate: CivilDate, stage: ReminderStage): string {
  return `${deviceId}:${dueDate}:${stage}`;
}

export interface PlanRemindersInput {
  deviceId: string;
  dueDate: CivilDate | null;
  /** Restrict the ladder — e.g. an org that only wants T-7 and T-0. */
  stages?: readonly ReminderStage[];
  /**
   * Drop stages whose send date already passed. Used when a due date moves and we do not
   * want to fire a "30 days before" notice for a date that is nine days away.
   */
  today?: CivilDate;
}

/**
 * Build the reminder ladder for one device/due-date pair.
 *
 * Returns an empty array when there is no due date — an unscheduled device is not
 * chased. Output is ordered by send date, ascending.
 */
export function planReminders(input: PlanRemindersInput): ReminderPlanItem[] {
  const { deviceId, dueDate, stages = REMINDER_STAGES, today } = input;
  if (!dueDate) return [];

  const items: ReminderPlanItem[] = [];
  for (const stage of stages) {
    const scheduledFor = addDays(dueDate, STAGE_OFFSETS[stage]);
    if (today && compareCivil(scheduledFor, today) < 0) continue;
    items.push({
      deviceId,
      dueDate,
      stage,
      scheduledFor,
      key: reminderKey(deviceId, dueDate, stage),
    });
  }
  return items.sort((a, b) => compareCivil(a.scheduledFor, b.scheduledFor));
}

/** Minimal shape the dispatcher needs; matches `Reminder` but keeps this module decoupled. */
export interface DispatchableReminder {
  id: string;
  deviceId: string;
  dueDate: CivilDate;
  stage: ReminderStage;
  scheduledFor: CivilDate;
  status: 'pending' | 'sent' | 'skipped' | 'failed';
}

export interface SelectDueInput<T extends DispatchableReminder> {
  reminders: readonly T[];
  today: CivilDate;
  /**
   * How many days late a reminder may be and still be sent. Beyond this it is stale —
   * sending a "7 days before" notice three weeks late is worse than not sending it.
   */
  graceDays?: number;
  /** Safety valve for the dispatch job. */
  limit?: number;
}

/**
 * Pick the reminders that should go out now.
 *
 * A reminder qualifies when it is `pending`, its send date has arrived, and it is not
 * older than `graceDays`. Ordered oldest-first so a backlog drains in the right order.
 */
export function selectDueReminders<T extends DispatchableReminder>(
  input: SelectDueInput<T>,
): T[] {
  const { reminders, today, graceDays = 14, limit = 500 } = input;

  return reminders
    .filter((r) => {
      if (r.status !== 'pending') return false;
      const lateness = diffDays(r.scheduledFor, today);
      return lateness >= 0 && lateness <= graceDays;
    })
    .sort(
      (a, b) => compareCivil(a.scheduledFor, b.scheduledFor) || a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

/** Reminders that were never sent and are now past the grace window. */
export function selectStaleReminders<T extends DispatchableReminder>(
  reminders: readonly T[],
  today: CivilDate,
  graceDays = 14,
): T[] {
  return reminders.filter(
    (r) => r.status === 'pending' && diffDays(r.scheduledFor, today) > graceDays,
  );
}

export interface ReconcileInput {
  /** The ladder the current due date implies. */
  desired: readonly ReminderPlanItem[];
  /** What is already persisted for this device. */
  existing: readonly DispatchableReminder[];
}

export interface ReconcileResult {
  /** Not yet persisted — insert these. */
  toCreate: ReminderPlanItem[];
  /** Persisted but no longer implied (the due date moved) and not yet sent — cancel these. */
  toCancel: DispatchableReminder[];
  /** Already correct; leave alone. */
  unchanged: DispatchableReminder[];
}

/**
 * Diff the desired ladder against what exists.
 *
 * Called after every due-date change. Already-sent reminders are never cancelled — the
 * customer received them, and rewriting that history would make the log lie.
 */
export function reconcileReminders(input: ReconcileInput): ReconcileResult {
  const desiredKeys = new Map(input.desired.map((d) => [d.key, d]));
  const existingKeys = new Set(
    input.existing.map((e) => reminderKey(e.deviceId, e.dueDate, e.stage)),
  );

  const toCreate = input.desired.filter((d) => !existingKeys.has(d.key));

  const toCancel: DispatchableReminder[] = [];
  const unchanged: DispatchableReminder[] = [];

  for (const e of input.existing) {
    const key = reminderKey(e.deviceId, e.dueDate, e.stage);
    if (desiredKeys.has(key)) {
      unchanged.push(e);
    } else if (e.status === 'pending') {
      toCancel.push(e);
    } else {
      unchanged.push(e);
    }
  }

  return { toCreate, toCancel, unchanged };
}

export interface ReminderMessage {
  subject: string;
  body: string;
}

/**
 * Render the reminder text.
 *
 * Deliberately a deterministic template, not a language-model call: the customer-facing
 * message must be identical on every run, reviewable, and unaffected by an AI outage.
 */
export function renderReminderMessage(params: {
  stage: ReminderStage;
  deviceName: string;
  locationName: string;
  organizationName: string;
  dueDate: CivilDate;
  today: CivilDate;
  bookingUrl: string;
}): ReminderMessage {
  const { stage, deviceName, locationName, organizationName, dueDate, today, bookingUrl } =
    params;
  const days = diffDays(today, dueDate);

  const timing =
    stage === 'OVERDUE'
      ? `was due on ${dueDate} and is now ${Math.abs(days)} day(s) overdue`
      : stage === 'T_0'
        ? `is due today, ${dueDate}`
        : `is due on ${dueDate}, in ${days} day(s)`;

  const subject =
    stage === 'OVERDUE'
      ? `Overdue service: ${deviceName} at ${locationName}`
      : `Service reminder: ${deviceName} at ${locationName}`;

  const body = [
    `Hello,`,
    ``,
    `Scheduled maintenance for ${deviceName} at ${locationName} ${timing}.`,
    ``,
    `You can pick an appointment slot here:`,
    bookingUrl,
    ``,
    `If the device has already been serviced or is out of use, reply to this message and`,
    `we will update our records.`,
    ``,
    `— ${organizationName}`,
  ].join('\n');

  return { subject, body };
}
