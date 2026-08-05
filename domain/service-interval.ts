/**
 * Service-interval arithmetic — when is a device next due, and how late is it?
 *
 * This is the single source of truth for `devices.next_service_due`. Nothing else in the
 * codebase may compute that column; the value is always the output of
 * {@link computeNextServiceDue}.
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

import {
  type CivilDate,
  addDays,
  compareCivil,
  diffDays,
  isAfter,
} from './dates';
import type { Device, DeviceType, IntervalAnchor } from './types';

/** Fallback used when neither the device nor its type declares an interval. */
export const DEFAULT_INTERVAL_DAYS = 365;

export const MIN_INTERVAL_DAYS = 1;
export const MAX_INTERVAL_DAYS = 3650;

export const SERVICE_STATES = ['unscheduled', 'ok', 'due_soon', 'due', 'overdue'] as const;
export type ServiceState = (typeof SERVICE_STATES)[number];

export class InvalidIntervalError extends Error {
  constructor(days: number) {
    super(
      `Service interval must be an integer between ${MIN_INTERVAL_DAYS} and ${MAX_INTERVAL_DAYS} days, received ${days}.`,
    );
    this.name = 'InvalidIntervalError';
  }
}

export function assertValidInterval(days: number): number {
  if (
    !Number.isInteger(days) ||
    days < MIN_INTERVAL_DAYS ||
    days > MAX_INTERVAL_DAYS
  ) {
    throw new InvalidIntervalError(days);
  }
  return days;
}

/**
 * Resolve the interval that actually applies to a device.
 *
 * Precedence: device override → device-type default → {@link DEFAULT_INTERVAL_DAYS}.
 */
export function effectiveIntervalDays(
  device: Pick<Device, 'serviceIntervalDays'>,
  deviceType?: Pick<DeviceType, 'defaultIntervalDays'> | null,
): number {
  const candidate =
    device.serviceIntervalDays ?? deviceType?.defaultIntervalDays ?? DEFAULT_INTERVAL_DAYS;
  return assertValidInterval(candidate);
}

export function effectiveAnchor(
  device: Pick<Device, 'intervalAnchor'>,
  orgDefault: IntervalAnchor = 'completion',
): IntervalAnchor {
  return device.intervalAnchor ?? orgDefault;
}

export interface NextDueInput {
  /** Interval in days. Must pass {@link assertValidInterval}. */
  intervalDays: number;
  anchor: IntervalAnchor;
  /** The date the job was actually performed. */
  completedOn?: CivilDate | null;
  /** The due date that job was satisfying, if any. Only used by the `schedule` anchor. */
  previousDue?: CivilDate | null;
  /** Commissioning date. Seeds the very first due date when nothing has been serviced. */
  installedOn?: CivilDate | null;
}

/**
 * Compute the next service due date.
 *
 * Resolution order:
 *
 * 1. Nothing has been serviced yet → `installedOn + interval`.
 * 2. `anchor = 'completion'` → `completedOn + interval`. The cadence drifts with reality.
 * 3. `anchor = 'schedule'` → keep the original cadence: step forward from `previousDue`
 *    in whole intervals until the result is strictly after `completedOn`. An annual
 *    inspection due 1 March that is carried out on 20 March is next due 1 March the
 *    following year, not 20 March.
 *
 * Returns `null` when there is no basis to compute a date at all — an uninstalled,
 * never-serviced device is legitimately unscheduled rather than silently due today.
 */
export function computeNextServiceDue(input: NextDueInput): CivilDate | null {
  const interval = assertValidInterval(input.intervalDays);
  const { completedOn, previousDue, installedOn, anchor } = input;

  if (!completedOn) {
    return installedOn ? addDays(installedOn, interval) : null;
  }

  if (anchor === 'completion' || !previousDue) {
    return addDays(completedOn, interval);
  }

  // 'schedule': preserve the cadence, roll forward past the completion date.
  let next = addDays(previousDue, interval);
  // Bounded to keep a corrupt `previousDue` from spinning: at most 200 hops.
  for (let guard = 0; guard < 200 && !isAfter(next, completedOn); guard += 1) {
    next = addDays(next, interval);
  }
  return next;
}

/** Convenience wrapper that reads the interval and anchor straight off a device. */
export function computeNextServiceDueForDevice(
  device: Pick<Device, 'serviceIntervalDays' | 'intervalAnchor' | 'installedOn' | 'nextServiceDue'>,
  deviceType: Pick<DeviceType, 'defaultIntervalDays'> | null,
  completedOn: CivilDate | null,
  orgDefaultAnchor: IntervalAnchor = 'completion',
): CivilDate | null {
  return computeNextServiceDue({
    intervalDays: effectiveIntervalDays(device, deviceType),
    anchor: effectiveAnchor(device, orgDefaultAnchor),
    completedOn,
    previousDue: device.nextServiceDue,
    installedOn: device.installedOn,
  });
}

export interface ServiceStatusInput {
  nextServiceDue: CivilDate | null;
  today: CivilDate;
  /** Window before the due date that counts as "due soon". */
  leadDays?: number;
  /** Retired or paused devices are never chased. */
  deviceStatus?: Device['status'];
}

export interface ServiceStatus {
  state: ServiceState;
  /** Positive = days remaining, negative = days overdue, `null` = unscheduled. */
  daysUntilDue: number | null;
  isActionable: boolean;
}

/**
 * Classify a device against a reference day.
 *
 * `due` is the exact due date; `overdue` is anything past it. Paused and retired devices
 * always report `unscheduled` and are never actionable, which is what keeps decommissioned
 * kit out of the reminder queue and the compliance denominator.
 */
export function serviceStatus(input: ServiceStatusInput): ServiceStatus {
  const { nextServiceDue, today, leadDays = 30, deviceStatus = 'active' } = input;

  if (deviceStatus !== 'active' || !nextServiceDue) {
    return { state: 'unscheduled', daysUntilDue: null, isActionable: false };
  }

  const days = diffDays(today, nextServiceDue);

  if (days < 0) return { state: 'overdue', daysUntilDue: days, isActionable: true };
  if (days === 0) return { state: 'due', daysUntilDue: 0, isActionable: true };
  if (days <= leadDays) return { state: 'due_soon', daysUntilDue: days, isActionable: true };
  return { state: 'ok', daysUntilDue: days, isActionable: false };
}

/** Sort helper: most urgent first, unscheduled last. */
export function compareByUrgency(
  a: Pick<Device, 'nextServiceDue'>,
  b: Pick<Device, 'nextServiceDue'>,
): number {
  if (!a.nextServiceDue && !b.nextServiceDue) return 0;
  if (!a.nextServiceDue) return 1;
  if (!b.nextServiceDue) return -1;
  return compareCivil(a.nextServiceDue, b.nextServiceDue);
}

/**
 * Project the next `count` service dates from a starting point.
 * Used by the device timeline UI and by capacity planning in the reports page.
 */
export function projectSchedule(
  from: CivilDate,
  intervalDays: number,
  count: number,
): CivilDate[] {
  const interval = assertValidInterval(intervalDays);
  if (!Number.isInteger(count) || count < 0 || count > 120) {
    throw new RangeError(`projectSchedule count must be an integer 0..120, received ${count}`);
  }
  const out: CivilDate[] = [];
  let cursor = from;
  for (let i = 0; i < count; i += 1) {
    cursor = addDays(cursor, interval);
    out.push(cursor);
  }
  return out;
}

/** Human phrasing for an interval, used in tables and PDF reports. */
export function describeInterval(days: number): string {
  assertValidInterval(days);
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? 'Annually' : `Every ${years} years`;
  }
  if (days === 30 || days === 31) return 'Monthly';
  if (days === 90 || days === 91) return 'Quarterly';
  if (days === 180 || days === 182 || days === 183) return 'Every 6 months';
  if (days === 7) return 'Weekly';
  if (days === 14) return 'Every 2 weeks';
  if (days % 30 === 0) return `Every ${days / 30} months`;
  return `Every ${days} days`;
}
