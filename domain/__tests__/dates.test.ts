import { describe, expect, it } from 'vitest';
import {
  InvalidCivilDateError,
  addDays,
  addMonths,
  civilDate,
  civilDateFromUTC,
  civilDateInTimeZone,
  clampCivil,
  compareCivil,
  daysInMonth,
  diffDays,
  eachDay,
  endOfMonth,
  formatCivilLong,
  formatMinuteOfDay,
  formatRelativeDays,
  fromEpochDay,
  isCivilDate,
  isLeapYear,
  isWithin,
  isoWeekdayOf,
  maxCivil,
  minCivil,
  parseMinuteOfDay,
  startOfMonth,
  startOfWeek,
  toEpochDay,
  weekdayOf,
} from '../dates';

describe('isCivilDate', () => {
  it('accepts well-formed calendar dates', () => {
    expect(isCivilDate('2026-08-02')).toBe(true);
    expect(isCivilDate('2024-02-29')).toBe(true); // leap year
  });

  it('rejects malformed and impossible dates', () => {
    expect(isCivilDate('2026-8-2')).toBe(false);
    expect(isCivilDate('2026-13-01')).toBe(false);
    expect(isCivilDate('2026-00-10')).toBe(false);
    expect(isCivilDate('2026-02-30')).toBe(false);
    expect(isCivilDate('2025-02-29')).toBe(false); // not a leap year
    expect(isCivilDate('not-a-date')).toBe(false);
    expect(isCivilDate(20260802)).toBe(false);
    expect(isCivilDate(null)).toBe(false);
  });
});

describe('civilDate', () => {
  it('throws a typed error on invalid input', () => {
    expect(() => civilDate('2026-02-30')).toThrow(InvalidCivilDateError);
  });
});

describe('calendar helpers', () => {
  it('knows month lengths including February in leap years', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('applies the full leap-year rule', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false); // divisible by 100
    expect(isLeapYear(2000)).toBe(true); // divisible by 400
  });
});

describe('addDays', () => {
  it('adds and subtracts across month and year boundaries', () => {
    expect(addDays(civilDate('2026-08-02'), 30)).toBe('2026-09-01');
    expect(addDays(civilDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(civilDate('2027-01-01'), -1)).toBe('2026-12-31');
    expect(addDays(civilDate('2026-08-02'), 0)).toBe('2026-08-02');
  });

  it('handles the leap day correctly', () => {
    expect(addDays(civilDate('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(civilDate('2025-02-28'), 1)).toBe('2025-03-01');
  });

  it('is unaffected by DST — 30 days is always 30 calendar days', () => {
    // Europe/Sarajevo springs forward on 2026-03-29.
    expect(addDays(civilDate('2026-03-15'), 30)).toBe('2026-04-14');
    expect(diffDays(civilDate('2026-03-15'), civilDate('2026-04-14'))).toBe(30);
  });

  it('rejects non-integer day counts', () => {
    expect(() => addDays(civilDate('2026-08-02'), 1.5)).toThrow(TypeError);
  });
});

describe('addMonths', () => {
  it('clamps to the end of a shorter target month', () => {
    expect(addMonths(civilDate('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(civilDate('2024-01-31'), 1)).toBe('2024-02-29');
    expect(addMonths(civilDate('2026-03-31'), -1)).toBe('2026-02-28');
  });

  it('crosses year boundaries in both directions', () => {
    expect(addMonths(civilDate('2026-11-15'), 3)).toBe('2027-02-15');
    expect(addMonths(civilDate('2026-02-15'), -3)).toBe('2025-11-15');
  });
});

describe('diffDays and comparison', () => {
  it('returns a signed day difference', () => {
    expect(diffDays(civilDate('2026-08-02'), civilDate('2026-08-12'))).toBe(10);
    expect(diffDays(civilDate('2026-08-12'), civilDate('2026-08-02'))).toBe(-10);
    expect(diffDays(civilDate('2026-08-02'), civilDate('2026-08-02'))).toBe(0);
  });

  it('sorts correctly as a comparator', () => {
    const dates = ['2026-12-01', '2026-01-05', '2026-06-30'].map(civilDate);
    expect([...dates].sort(compareCivil)).toEqual(['2026-01-05', '2026-06-30', '2026-12-01']);
  });

  it('computes bounds and clamps', () => {
    const a = civilDate('2026-01-01');
    const b = civilDate('2026-06-01');
    const c = civilDate('2026-12-01');
    expect(minCivil(c, a, b)).toBe('2026-01-01');
    expect(maxCivil(a, c, b)).toBe('2026-12-01');
    expect(clampCivil(civilDate('2025-01-01'), a, c)).toBe('2026-01-01');
    expect(clampCivil(civilDate('2027-01-01'), a, c)).toBe('2026-12-01');
    expect(clampCivil(b, a, c)).toBe('2026-06-01');
    expect(() => clampCivil(b, c, a)).toThrow(RangeError);
  });

  it('tests inclusive containment', () => {
    const from = civilDate('2026-08-01');
    const to = civilDate('2026-08-31');
    expect(isWithin(civilDate('2026-08-01'), from, to)).toBe(true);
    expect(isWithin(civilDate('2026-08-31'), from, to)).toBe(true);
    expect(isWithin(civilDate('2026-09-01'), from, to)).toBe(false);
  });
});

describe('epoch-day round trip', () => {
  it('round-trips every date in a sample range', () => {
    let d = civilDate('2025-12-20');
    for (let i = 0; i < 120; i += 1) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
      d = addDays(d, 1);
    }
  });

  it('anchors the Unix epoch at day 0', () => {
    expect(toEpochDay(civilDate('1970-01-01'))).toBe(0);
    expect(fromEpochDay(0)).toBe('1970-01-01');
  });
});

describe('weekday helpers', () => {
  it('agrees with the known weekday of a fixed date', () => {
    // 2026-08-02 is a Sunday.
    expect(weekdayOf(civilDate('2026-08-02'))).toBe(0);
    expect(isoWeekdayOf(civilDate('2026-08-02'))).toBe(7);
    expect(weekdayOf(civilDate('2026-08-03'))).toBe(1);
    expect(isoWeekdayOf(civilDate('2026-08-03'))).toBe(1);
  });

  it('anchors the week on Monday', () => {
    expect(startOfWeek(civilDate('2026-08-02'))).toBe('2026-07-27'); // Sunday → prior Monday
    expect(startOfWeek(civilDate('2026-08-03'))).toBe('2026-08-03');
  });
});

describe('month boundaries', () => {
  it('finds the first and last day', () => {
    expect(startOfMonth(civilDate('2026-08-17'))).toBe('2026-08-01');
    expect(endOfMonth(civilDate('2026-08-17'))).toBe('2026-08-31');
    expect(endOfMonth(civilDate('2026-02-05'))).toBe('2026-02-28');
    expect(endOfMonth(civilDate('2024-02-05'))).toBe('2024-02-29');
  });
});

describe('eachDay', () => {
  it('produces an inclusive range', () => {
    expect(eachDay(civilDate('2026-08-01'), civilDate('2026-08-04'))).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ]);
  });

  it('returns nothing for an inverted range', () => {
    expect(eachDay(civilDate('2026-08-04'), civilDate('2026-08-01'))).toEqual([]);
  });

  it('refuses unbounded output', () => {
    expect(() => eachDay(civilDate('2020-01-01'), civilDate('2030-01-01'))).toThrow(RangeError);
  });
});

describe('timezone projection', () => {
  it('projects an instant into the calendar day of a zone', () => {
    // 22:30 UTC on 1 Aug is already 2 Aug in Sarajevo (UTC+2).
    const instant = new Date('2026-08-01T22:30:00.000Z');
    expect(civilDateFromUTC(instant)).toBe('2026-08-01');
    expect(civilDateInTimeZone(instant, 'Europe/Sarajevo')).toBe('2026-08-02');
    expect(civilDateInTimeZone(instant, 'UTC')).toBe('2026-08-01');
    expect(civilDateInTimeZone(instant, 'America/New_York')).toBe('2026-08-01');
  });
});

describe('minute-of-day', () => {
  it('parses and formats', () => {
    expect(parseMinuteOfDay('08:30')).toBe(510);
    expect(parseMinuteOfDay('0:00')).toBe(0);
    expect(parseMinuteOfDay('24:00')).toBe(1440);
    expect(formatMinuteOfDay(510)).toBe('08:30');
    expect(formatMinuteOfDay(0)).toBe('00:00');
  });

  it('rejects nonsense', () => {
    expect(() => parseMinuteOfDay('8.30')).toThrow(RangeError);
    expect(() => parseMinuteOfDay('08:75')).toThrow(RangeError);
    expect(() => parseMinuteOfDay('25:00')).toThrow(RangeError);
    expect(() => formatMinuteOfDay(-1)).toThrow(RangeError);
  });
});

describe('formatting', () => {
  it('formats a long date without timezone drift', () => {
    expect(formatCivilLong(civilDate('2026-08-02'))).toBe('2 August 2026');
  });

  it('phrases relative days against an explicit reference', () => {
    const today = civilDate('2026-08-02');
    expect(formatRelativeDays(civilDate('2026-08-02'), today)).toBe('today');
    expect(formatRelativeDays(civilDate('2026-08-03'), today)).toBe('tomorrow');
    expect(formatRelativeDays(civilDate('2026-08-01'), today)).toBe('yesterday');
    expect(formatRelativeDays(civilDate('2026-08-06'), today)).toBe('in 4 days');
    expect(formatRelativeDays(civilDate('2026-07-21'), today)).toBe('12 days ago');
  });
});
