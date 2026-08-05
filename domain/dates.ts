/**
 * Civil-date arithmetic.
 *
 * Everything scheduling-related in ServisLoop (service intervals, reminder stages,
 * booking days) is expressed as a *civil date* — a calendar day with no time and no
 * timezone, serialised as `YYYY-MM-DD`.
 *
 * This is deliberate. Doing interval maths on `Date` instants means a service due on
 * 1 March can silently become 28 February for a technician in UTC−5, and DST
 * transitions make "+30 days" ambiguous. Civil dates have neither problem: adding 30
 * days to 2026-03-01 is always 2026-03-31, everywhere, forever.
 *
 * The only place a timezone appears is at the boundary, in {@link civilDateInTimeZone},
 * where a real instant is projected into an organisation's local calendar.
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

/** A calendar day in `YYYY-MM-DD` form. */
export type CivilDate = string & { readonly __brand: 'CivilDate' };

/** Minutes elapsed since local midnight, `0..1440`. */
export type MinuteOfDay = number;

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export class InvalidCivilDateError extends Error {
  constructor(value: string) {
    super(`Invalid civil date: "${value}". Expected YYYY-MM-DD.`);
    this.name = 'InvalidCivilDateError';
  }
}

/** Type guard: is this string a structurally and calendrically valid `YYYY-MM-DD`? */
export function isCivilDate(value: unknown): value is CivilDate {
  if (typeof value !== 'string') return false;
  const m = CIVIL_DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

/** Assert and brand a string as a {@link CivilDate}. Throws on malformed input. */
export function civilDate(value: string): CivilDate {
  if (!isCivilDate(value)) throw new InvalidCivilDateError(value);
  return value;
}

/** Non-throwing variant of {@link civilDate}. */
export function tryCivilDate(value: unknown): CivilDate | null {
  return isCivilDate(value) ? value : null;
}

/** Number of days in a given month. `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Split a civil date into its numeric parts. `month` is 1-based. */
export function civilParts(d: CivilDate): { year: number; month: number; day: number } {
  const m = CIVIL_DATE_RE.exec(d);
  if (!m) throw new InvalidCivilDateError(d);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Build a civil date from numeric parts. `month` is 1-based. */
export function fromParts(year: number, month: number, day: number): CivilDate {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return civilDate(`${pad(year, 4)}-${pad(month)}-${pad(day)}`);
}

/**
 * Project a real instant into the calendar day observed in `timeZone`.
 *
 * Uses `Intl.DateTimeFormat` with the `en-CA` locale, which formats as `YYYY-MM-DD`.
 * Deterministic for a given (instant, timeZone) pair.
 */
export function civilDateInTimeZone(instant: Date, timeZone: string): CivilDate {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return civilDate(formatted);
}

/** Project an instant into its UTC calendar day. */
export function civilDateFromUTC(instant: Date): CivilDate {
  return fromParts(instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate());
}

/** Midnight UTC of a civil date, as a real instant. Useful for storage and sorting. */
export function toUTCDate(d: CivilDate): Date {
  const { year, month, day } = civilParts(d);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Whole days since the Unix epoch. The canonical integer form of a civil date. */
export function toEpochDay(d: CivilDate): number {
  return Math.round(toUTCDate(d).getTime() / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): CivilDate {
  return civilDateFromUTC(new Date(epochDay * MS_PER_DAY));
}

/** Add (or subtract, with a negative `days`) calendar days. */
export function addDays(d: CivilDate, days: number): CivilDate {
  if (!Number.isInteger(days)) {
    throw new TypeError(`addDays expects an integer day count, received ${days}`);
  }
  return fromEpochDay(toEpochDay(d) + days);
}

/**
 * Add calendar months, clamping the day to the end of the target month.
 *
 * `2026-01-31 + 1 month` → `2026-02-28`, which is what a maintenance contract means by
 * "monthly". Note this is intentionally *not* reversible: subtracting a month from the
 * result does not return the original date.
 */
export function addMonths(d: CivilDate, months: number): CivilDate {
  if (!Number.isInteger(months)) {
    throw new TypeError(`addMonths expects an integer month count, received ${months}`);
  }
  const { year, month, day } = civilParts(d);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return fromParts(targetYear, targetMonth, clampedDay);
}

/** Signed difference `b − a` in whole days. */
export function diffDays(a: CivilDate, b: CivilDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** `-1` if `a < b`, `0` if equal, `1` if `a > b`. Safe as an `Array#sort` comparator. */
export function compareCivil(a: CivilDate, b: CivilDate): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export const isBefore = (a: CivilDate, b: CivilDate): boolean => a < b;
export const isAfter = (a: CivilDate, b: CivilDate): boolean => a > b;
export const isSameDay = (a: CivilDate, b: CivilDate): boolean => a === b;

/** Inclusive on both ends. */
export function isWithin(d: CivilDate, start: CivilDate, end: CivilDate): boolean {
  return d >= start && d <= end;
}

export function minCivil(...dates: CivilDate[]): CivilDate {
  if (dates.length === 0) throw new RangeError('minCivil requires at least one date');
  return dates.reduce((acc, d) => (d < acc ? d : acc));
}

export function maxCivil(...dates: CivilDate[]): CivilDate {
  if (dates.length === 0) throw new RangeError('maxCivil requires at least one date');
  return dates.reduce((acc, d) => (d > acc ? d : acc));
}

export function clampCivil(d: CivilDate, lower: CivilDate, upper: CivilDate): CivilDate {
  if (lower > upper) throw new RangeError('clampCivil: lower bound is after upper bound');
  if (d < lower) return lower;
  if (d > upper) return upper;
  return d;
}

/** Day of week, `0` = Sunday … `6` = Saturday, matching `Date#getUTCDay`. */
export function weekdayOf(d: CivilDate): number {
  return toUTCDate(d).getUTCDay();
}

/** ISO day of week, `1` = Monday … `7` = Sunday. */
export function isoWeekdayOf(d: CivilDate): number {
  const day = weekdayOf(d);
  return day === 0 ? 7 : day;
}

export const isWeekend = (d: CivilDate): boolean => {
  const day = weekdayOf(d);
  return day === 0 || day === 6;
};

export function startOfMonth(d: CivilDate): CivilDate {
  const { year, month } = civilParts(d);
  return fromParts(year, month, 1);
}

export function endOfMonth(d: CivilDate): CivilDate {
  const { year, month } = civilParts(d);
  return fromParts(year, month, daysInMonth(year, month));
}

/** Monday-anchored week start. */
export function startOfWeek(d: CivilDate): CivilDate {
  return addDays(d, -(isoWeekdayOf(d) - 1));
}

/** Inclusive range. Guards against unbounded output. */
export function eachDay(start: CivilDate, end: CivilDate, maxDays = 366): CivilDate[] {
  if (start > end) return [];
  const span = diffDays(start, end);
  if (span + 1 > maxDays) {
    throw new RangeError(`eachDay range of ${span + 1} days exceeds maxDays=${maxDays}`);
  }
  const out: CivilDate[] = [];
  for (let i = 0; i <= span; i += 1) out.push(addDays(start, i));
  return out;
}

/* ------------------------------------------------------------------ */
/* Minute-of-day helpers — used by the booking availability engine      */
/* ------------------------------------------------------------------ */

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** `"08:30"` → `510`. Accepts `"24:00"` as end-of-day. */
export function parseMinuteOfDay(value: string): MinuteOfDay {
  const m = TIME_RE.exec(value);
  if (!m) throw new RangeError(`Invalid time "${value}". Expected HH:MM.`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (minutes > 59) throw new RangeError(`Invalid minutes in "${value}".`);
  const total = hours * 60 + minutes;
  if (total > 1440) throw new RangeError(`Time "${value}" is beyond end of day.`);
  return total;
}

/** `510` → `"08:30"`. */
export function formatMinuteOfDay(minute: MinuteOfDay): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440) {
    throw new RangeError(`Minute of day out of range: ${minute}`);
  }
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Combine a civil date and a local minute-of-day into a UTC instant. */
export function toInstant(d: CivilDate, minute: MinuteOfDay): Date {
  return new Date(toUTCDate(d).getTime() + minute * 60_000);
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Locale-aware long form, e.g. `2 August 2026`. Never used for storage. */
export function formatCivilLong(d: CivilDate, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(toUTCDate(d));
}

/** Compact form, e.g. `2 Aug 2026`. */
export function formatCivilShort(d: CivilDate, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(toUTCDate(d));
}

/**
 * Relative phrasing against a reference day — `today`, `in 4 days`, `12 days ago`.
 * Deterministic: the caller supplies `today`, nothing reads the clock.
 */
export function formatRelativeDays(target: CivilDate, today: CivilDate): string {
  const delta = diffDays(today, target);
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  if (delta === -1) return 'yesterday';
  if (delta > 0) return `in ${delta} days`;
  return `${Math.abs(delta)} days ago`;
}
