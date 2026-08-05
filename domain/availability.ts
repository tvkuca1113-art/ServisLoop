/**
 * Booking availability engine.
 *
 * Given an organisation's business hours, its blackout days, and everything already on
 * the calendar, this decides which appointment slots a customer may pick. It is a pure
 * function of its inputs — the caller supplies `today` and `nowMinute`, so the same
 * arguments always produce the same slots. That is what makes availability testable and
 * keeps a customer-facing booking page from depending on any external service.
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

import {
  type CivilDate,
  type MinuteOfDay,
  addDays,
  diffDays,
  formatMinuteOfDay,
  weekdayOf,
} from './dates';

export interface BusinessHoursRule {
  /** `0` = Sunday … `6` = Saturday. */
  weekday: number;
  isOpen: boolean;
  openMinute: MinuteOfDay;
  closeMinute: MinuteOfDay;
}

/** A block of time that is already taken. Half-open: `[startMinute, endMinute)`. */
export interface BusyInterval {
  date: CivilDate;
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
}

export const SLOT_UNAVAILABLE_REASONS = [
  'closed',
  'blackout',
  'booked',
  'too_soon',
  'past',
  'beyond_horizon',
] as const;
export type SlotUnavailableReason = (typeof SLOT_UNAVAILABLE_REASONS)[number];

export interface Slot {
  date: CivilDate;
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
  available: boolean;
  reason: SlotUnavailableReason | null;
  /** `"08:30–10:30"`, for display. */
  label: string;
}

export interface AvailabilityConfig {
  /** Length of one appointment, in minutes. */
  slotMinutes: number;
  /** Minimum notice a customer must give, in hours. */
  leadHours: number;
  /** How far ahead bookings are accepted, in days. */
  horizonDays: number;
  /** How many concurrent jobs the organisation can run in one slot. */
  capacity: number;
}

export const DEFAULT_AVAILABILITY: AvailabilityConfig = Object.freeze({
  slotMinutes: 120,
  leadHours: 24,
  horizonDays: 60,
  capacity: 1,
});

export interface DayAvailabilityInput {
  date: CivilDate;
  businessHours: readonly BusinessHoursRule[];
  blackoutDates: readonly CivilDate[];
  busy: readonly BusyInterval[];
  config: AvailabilityConfig;
  /** Reference day — supplied by the caller, never read from the clock. */
  today: CivilDate;
  /** Minutes since local midnight on `today`. */
  nowMinute: MinuteOfDay;
}

/** Half-open overlap test: `[aStart, aEnd)` vs `[bStart, bEnd)`. */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function validateConfig(config: AvailabilityConfig): void {
  if (!Number.isInteger(config.slotMinutes) || config.slotMinutes < 15 || config.slotMinutes > 480) {
    throw new RangeError(`slotMinutes must be an integer 15..480, received ${config.slotMinutes}`);
  }
  if (!Number.isInteger(config.horizonDays) || config.horizonDays < 1 || config.horizonDays > 365) {
    throw new RangeError(`horizonDays must be an integer 1..365, received ${config.horizonDays}`);
  }
  if (!Number.isInteger(config.capacity) || config.capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, received ${config.capacity}`);
  }
  if (config.leadHours < 0) {
    throw new RangeError(`leadHours must be >= 0, received ${config.leadHours}`);
  }
}

/**
 * Every slot on one day, each annotated with whether it can be booked and, if not, why.
 *
 * Unavailable slots are returned rather than filtered out on purpose: the booking UI
 * shows them greyed with the reason, which is far less confusing than a day that simply
 * appears empty.
 */
export function getDayAvailability(input: DayAvailabilityInput): Slot[] {
  const { date, businessHours, blackoutDates, busy, config, today, nowMinute } = input;
  validateConfig(config);

  const daysAhead = diffDays(today, date);
  const rule = businessHours.find((r) => r.weekday === weekdayOf(date));

  // A closed day has no slots to enumerate at all — return an empty day rather than a
  // list of greyed-out boxes. The UI renders "Closed" from the empty array.
  if (!rule || !rule.isOpen || rule.closeMinute <= rule.openMinute) return [];

  // Reasons that disqualify every slot on this day equally.
  const globalReason: SlotUnavailableReason | null =
    daysAhead < 0
      ? 'past'
      : daysAhead > config.horizonDays
        ? 'beyond_horizon'
        : blackoutDates.includes(date)
          ? 'blackout'
          : null;

  const dayBusy = busy.filter((b) => b.date === date);
  const leadMinutes = Math.round(config.leadHours * 60);
  const slots: Slot[] = [];

  for (
    let start = rule.openMinute;
    start + config.slotMinutes <= rule.closeMinute;
    start += config.slotMinutes
  ) {
    const end = start + config.slotMinutes;

    // Minutes between "now" and the start of this slot.
    const minutesUntilStart = daysAhead * 1440 + start - nowMinute;

    const overlapping = dayBusy.filter((b) =>
      intervalsOverlap(start, end, b.startMinute, b.endMinute),
    ).length;

    let reason: SlotUnavailableReason | null = globalReason;
    if (!reason) {
      if (minutesUntilStart < 0) reason = 'past';
      else if (minutesUntilStart < leadMinutes) reason = 'too_soon';
      else if (overlapping >= config.capacity) reason = 'booked';
    }

    slots.push({
      date,
      startMinute: start,
      endMinute: end,
      available: reason === null,
      reason,
      label: `${formatMinuteOfDay(start)}–${formatMinuteOfDay(end)}`,
    });
  }

  return slots;
}

export interface RangeAvailabilityInput extends Omit<DayAvailabilityInput, 'date'> {
  from: CivilDate;
  /** Number of days to enumerate, starting at `from`. */
  days: number;
}

export interface DayAvailability {
  date: CivilDate;
  slots: Slot[];
  availableCount: number;
}

/** Availability across a window of days. Capped at 90 days to bound the output. */
export function getRangeAvailability(input: RangeAvailabilityInput): DayAvailability[] {
  const { from, days, ...rest } = input;
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new RangeError(`days must be an integer 1..90, received ${days}`);
  }

  const out: DayAvailability[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(from, i);
    const slots = getDayAvailability({ ...rest, date });
    out.push({ date, slots, availableCount: slots.filter((s) => s.available).length });
  }
  return out;
}

/** The first `count` bookable slots on or after `from`. Powers the "earliest available" hint. */
export function findNextAvailableSlots(
  input: RangeAvailabilityInput,
  count = 3,
): Slot[] {
  const found: Slot[] = [];
  for (const day of getRangeAvailability(input)) {
    for (const slot of day.slots) {
      if (slot.available) {
        found.push(slot);
        if (found.length >= count) return found;
      }
    }
  }
  return found;
}

export interface SlotValidationInput {
  date: CivilDate;
  startMinute: MinuteOfDay;
  businessHours: readonly BusinessHoursRule[];
  blackoutDates: readonly CivilDate[];
  busy: readonly BusyInterval[];
  config: AvailabilityConfig;
  today: CivilDate;
  nowMinute: MinuteOfDay;
}

export type SlotValidation =
  | { ok: true; slot: Slot }
  | { ok: false; reason: SlotUnavailableReason | 'not_a_slot' };

/**
 * Re-check a slot at submission time.
 *
 * The booking form validates client-side for responsiveness, but this runs again on the
 * server against freshly-read busy intervals. Without it, two customers loading the page
 * at the same moment could both claim the last slot.
 */
export function validateSlotSelection(input: SlotValidationInput): SlotValidation {
  const slots = getDayAvailability({
    date: input.date,
    businessHours: input.businessHours,
    blackoutDates: input.blackoutDates,
    busy: input.busy,
    config: input.config,
    today: input.today,
    nowMinute: input.nowMinute,
  });

  const match = slots.find((s) => s.startMinute === input.startMinute);
  if (!match) return { ok: false, reason: 'not_a_slot' };
  if (!match.available) return { ok: false, reason: match.reason ?? 'booked' };
  return { ok: true, slot: match };
}

/** Standard Mon–Fri 08:00–17:00 week, used when an organisation is first created. */
export function defaultBusinessHours(): BusinessHoursRule[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    isOpen: weekday >= 1 && weekday <= 5,
    openMinute: 8 * 60,
    closeMinute: 17 * 60,
  }));
}
