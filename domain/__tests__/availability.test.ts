import { describe, expect, it } from 'vitest';
import { civilDate, parseMinuteOfDay } from '../dates';
import {
  DEFAULT_AVAILABILITY,
  type AvailabilityConfig,
  type BusyInterval,
  defaultBusinessHours,
  findNextAvailableSlots,
  getDayAvailability,
  getRangeAvailability,
  intervalsOverlap,
  validateSlotSelection,
} from '../availability';

const HOURS = defaultBusinessHours();
const CONFIG: AvailabilityConfig = { ...DEFAULT_AVAILABILITY, slotMinutes: 120, leadHours: 24 };

// 2026-08-03 is a Monday; 2026-08-02 is a Sunday.
const MONDAY = civilDate('2026-08-03');
const SUNDAY = civilDate('2026-08-02');
const TODAY = civilDate('2026-08-02');
const NOW = parseMinuteOfDay('09:00');

const base = {
  businessHours: HOURS,
  blackoutDates: [] as ReturnType<typeof civilDate>[],
  busy: [] as BusyInterval[],
  config: CONFIG,
  today: TODAY,
  nowMinute: NOW,
};

describe('intervalsOverlap', () => {
  it('treats intervals as half-open', () => {
    expect(intervalsOverlap(0, 10, 10, 20)).toBe(false); // touching, not overlapping
    expect(intervalsOverlap(0, 10, 9, 20)).toBe(true);
    expect(intervalsOverlap(5, 8, 0, 20)).toBe(true); // fully contained
    expect(intervalsOverlap(0, 10, 20, 30)).toBe(false);
  });
});

describe('getDayAvailability — opening hours', () => {
  it('enumerates whole slots inside opening hours only', () => {
    const slots = getDayAvailability({ ...base, date: MONDAY });
    // 08:00–17:00 with 120-minute slots → 08, 10, 12, 14. 16:00 would end at 18:00.
    expect(slots.map((s) => s.label)).toEqual([
      '08:00–10:00',
      '10:00–12:00',
      '12:00–14:00',
      '14:00–16:00',
    ]);
  });

  it('returns no slots at all on a closed day', () => {
    expect(getDayAvailability({ ...base, date: SUNDAY })).toEqual([]);
  });

  it('returns no slots when opening and closing times are inverted', () => {
    const broken = HOURS.map((h) =>
      h.weekday === 1 ? { ...h, openMinute: 17 * 60, closeMinute: 8 * 60 } : h,
    );
    expect(getDayAvailability({ ...base, businessHours: broken, date: MONDAY })).toEqual([]);
  });
});

describe('getDayAvailability — lead time', () => {
  it('blocks slots inside the notice period', () => {
    // Today 09:00, 24h lead → nothing before tomorrow 09:00 is bookable.
    const slots = getDayAvailability({ ...base, date: MONDAY });
    expect(slots.find((s) => s.label === '08:00–10:00')?.reason).toBe('too_soon');
    expect(slots.find((s) => s.label === '10:00–12:00')?.available).toBe(true);
  });

  it('opens everything up when there is no lead requirement', () => {
    const slots = getDayAvailability({
      ...base,
      date: MONDAY,
      config: { ...CONFIG, leadHours: 0 },
    });
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('marks a slot earlier today as past, not merely too soon', () => {
    const slots = getDayAvailability({
      ...base,
      date: civilDate('2026-08-04'),
      today: civilDate('2026-08-04'),
      nowMinute: parseMinuteOfDay('13:00'),
      config: { ...CONFIG, leadHours: 0 },
    });
    expect(slots.find((s) => s.label === '08:00–10:00')?.reason).toBe('past');
    expect(slots.find((s) => s.label === '14:00–16:00')?.available).toBe(true);
  });
});

describe('getDayAvailability — conflicts', () => {
  it('blocks a slot that overlaps existing work', () => {
    const busy: BusyInterval[] = [
      { date: MONDAY, startMinute: parseMinuteOfDay('11:00'), endMinute: parseMinuteOfDay('12:30') },
    ];
    const slots = getDayAvailability({ ...base, date: MONDAY, busy });
    expect(slots.find((s) => s.label === '10:00–12:00')?.reason).toBe('booked');
    expect(slots.find((s) => s.label === '12:00–14:00')?.reason).toBe('booked');
    expect(slots.find((s) => s.label === '14:00–16:00')?.available).toBe(true);
  });

  it('ignores busy intervals belonging to a different day', () => {
    const busy: BusyInterval[] = [
      {
        date: civilDate('2026-08-04'),
        startMinute: parseMinuteOfDay('10:00'),
        endMinute: parseMinuteOfDay('12:00'),
      },
    ];
    const slots = getDayAvailability({ ...base, date: MONDAY, busy });
    expect(slots.find((s) => s.label === '10:00–12:00')?.available).toBe(true);
  });

  it('allows concurrent jobs up to the configured capacity', () => {
    const busy: BusyInterval[] = [
      { date: MONDAY, startMinute: parseMinuteOfDay('10:00'), endMinute: parseMinuteOfDay('12:00') },
    ];
    const withCapacity2 = getDayAvailability({
      ...base,
      date: MONDAY,
      busy,
      config: { ...CONFIG, capacity: 2 },
    });
    expect(withCapacity2.find((s) => s.label === '10:00–12:00')?.available).toBe(true);

    const twoBooked = [...busy, { ...busy[0]! }];
    const saturated = getDayAvailability({
      ...base,
      date: MONDAY,
      busy: twoBooked,
      config: { ...CONFIG, capacity: 2 },
    });
    expect(saturated.find((s) => s.label === '10:00–12:00')?.reason).toBe('booked');
  });
});

describe('getDayAvailability — calendar rules', () => {
  it('blocks blackout days but still shows the slots', () => {
    const slots = getDayAvailability({ ...base, date: MONDAY, blackoutDates: [MONDAY] });
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => s.reason === 'blackout')).toBe(true);
  });

  it('blocks days beyond the booking horizon', () => {
    const far = civilDate('2026-12-07'); // a Monday, > 60 days out
    const slots = getDayAvailability({ ...base, date: far });
    expect(slots.every((s) => s.reason === 'beyond_horizon')).toBe(true);
  });

  it('blocks days in the past', () => {
    const past = civilDate('2026-07-27'); // a Monday
    const slots = getDayAvailability({ ...base, date: past });
    expect(slots.every((s) => s.reason === 'past')).toBe(true);
  });
});

describe('configuration validation', () => {
  it('rejects nonsense configuration rather than producing odd slots', () => {
    expect(() =>
      getDayAvailability({ ...base, date: MONDAY, config: { ...CONFIG, slotMinutes: 7 } }),
    ).toThrow(RangeError);
    expect(() =>
      getDayAvailability({ ...base, date: MONDAY, config: { ...CONFIG, capacity: 0 } }),
    ).toThrow(RangeError);
    expect(() =>
      getDayAvailability({ ...base, date: MONDAY, config: { ...CONFIG, horizonDays: 0 } }),
    ).toThrow(RangeError);
  });
});

describe('getRangeAvailability', () => {
  it('walks consecutive days and counts what is open', () => {
    const days = getRangeAvailability({ ...base, from: TODAY, days: 7 });
    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe('2026-08-02');
    expect(days[0]?.slots).toEqual([]); // Sunday
    expect(days[1]?.availableCount).toBe(3); // Monday, first slot too soon
  });

  it('bounds the window', () => {
    expect(() => getRangeAvailability({ ...base, from: TODAY, days: 0 })).toThrow(RangeError);
    expect(() => getRangeAvailability({ ...base, from: TODAY, days: 200 })).toThrow(RangeError);
  });
});

describe('findNextAvailableSlots', () => {
  it('returns the earliest bookable slots in order', () => {
    const slots = findNextAvailableSlots({ ...base, from: TODAY, days: 14 }, 3);
    expect(slots).toHaveLength(3);
    expect(slots[0]?.date).toBe('2026-08-03');
    expect(slots[0]?.label).toBe('10:00–12:00');
  });

  it('returns fewer than requested when the calendar is full', () => {
    const closed = HOURS.map((h) => ({ ...h, isOpen: false }));
    expect(
      findNextAvailableSlots({ ...base, businessHours: closed, from: TODAY, days: 14 }, 3),
    ).toEqual([]);
  });
});

describe('validateSlotSelection', () => {
  it('accepts a genuinely open slot', () => {
    const result = validateSlotSelection({
      ...base,
      date: MONDAY,
      startMinute: parseMinuteOfDay('10:00'),
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a start time that is not on the slot grid', () => {
    const result = validateSlotSelection({
      ...base,
      date: MONDAY,
      startMinute: parseMinuteOfDay('10:30'),
    });
    expect(result).toEqual({ ok: false, reason: 'not_a_slot' });
  });

  it('rejects a slot taken between page load and submission — the race guard', () => {
    const busy: BusyInterval[] = [
      { date: MONDAY, startMinute: parseMinuteOfDay('10:00'), endMinute: parseMinuteOfDay('12:00') },
    ];
    const result = validateSlotSelection({
      ...base,
      busy,
      date: MONDAY,
      startMinute: parseMinuteOfDay('10:00'),
    });
    expect(result).toEqual({ ok: false, reason: 'booked' });
  });

  it('rejects a closed day', () => {
    const result = validateSlotSelection({
      ...base,
      date: SUNDAY,
      startMinute: parseMinuteOfDay('10:00'),
    });
    expect(result).toEqual({ ok: false, reason: 'not_a_slot' });
  });
});

describe('defaultBusinessHours', () => {
  it('opens Monday to Friday, 08:00–17:00', () => {
    const hours = defaultBusinessHours();
    expect(hours).toHaveLength(7);
    expect(hours.filter((h) => h.isOpen).map((h) => h.weekday)).toEqual([1, 2, 3, 4, 5]);
    expect(hours[1]?.openMinute).toBe(480);
    expect(hours[1]?.closeMinute).toBe(1020);
  });
});
