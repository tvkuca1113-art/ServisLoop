/**
 * Weekday names, indexed the way the rest of the system counts days.
 *
 * `0` = Sunday … `6` = Saturday, matching `BusinessHours.weekday`, `weekdayOf()` in
 * `@/domain/dates` and `Date.prototype.getUTCDay()`. Kept in `lib` rather than `domain`
 * because these are presentation strings, and shared rather than inlined so the settings
 * form and the server action that validates it can never disagree about which day is
 * which.
 */

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Every weekday index, in display order (Monday first — the working week). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`;
}

export function weekdayShortName(weekday: number): string {
  return WEEKDAY_SHORT_NAMES[weekday] ?? `${weekday}`;
}
