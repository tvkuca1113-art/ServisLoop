/**
 * PlainDate — kalendarski datum bez vremena i bez vremenske zone.
 *
 * ZAŠTO POSTOJI
 * -------------
 * "Sljedeći servis je 15.03.2026." je izjava o kalendaru, ne o trenutku u
 * vremenu. Ako bismo to čuvali kao `Date`/`timestamptz`, isti zapis bi u
 * Sarajevu bio 15. marta, a u Los Angelesu 14. marta. Servisni rok bi se
 * "pomjerio" ovisno o tome gdje server slučajno radi.
 *
 * Zato su svi rokovi servisa, datumi ugradnje i garancije tipa `date` u bazi
 * i `PlainDate` ('YYYY-MM-DD') u kodu. Vremenska zona ulazi u igru na tačno
 * jednom mjestu: kad pitamo "koji je danas datum u zoni ove organizacije"
 * (`todayInTimeZone`).
 *
 * Sve funkcije su čiste i determinističke — bez `Date.now()`, bez lokalne zone
 * procesa. To ih čini potpuno testabilnim.
 */

/** Kalendarski datum u ISO formatu 'YYYY-MM-DD'. */
export type PlainDate = string & { readonly __brand?: 'PlainDate' }

const PLAIN_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export class InvalidPlainDateError extends Error {
  constructor(value: string) {
    super(`Neispravan datum: "${value}". Očekivan format je YYYY-MM-DD.`)
    this.name = 'InvalidPlainDateError'
  }
}

/** Broj dana u mjesecu (mjesec je 1–12). */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) throw new RangeError(`Mjesec mora biti 1–12, dobiveno: ${month}`)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Provjerava da li je vrijednost ispravan kalendarski datum (uključujući prijestupne godine). */
export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== 'string') return false
  const match = PLAIN_DATE_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

/** Kao `isPlainDate`, ali baca grešku. Koristi se na granicama sistema. */
export function assertPlainDate(value: unknown): asserts value is PlainDate {
  if (!isPlainDate(value)) throw new InvalidPlainDateError(String(value))
}

/** Sastavlja `PlainDate` iz komponenti, uz provjeru ispravnosti. */
export function makePlainDate(year: number, month: number, day: number): PlainDate {
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`
  assertPlainDate(value)
  return value
}

export interface PlainDateParts {
  year: number
  month: number // 1–12
  day: number // 1–31
}

/** Rastavlja `PlainDate` na komponente. */
export function plainDateParts(date: PlainDate): PlainDateParts {
  assertPlainDate(date)
  const match = PLAIN_DATE_RE.exec(date)
  if (!match) throw new InvalidPlainDateError(date)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

/**
 * Pretvara u `Date` postavljen na ponoć UTC.
 * Koristi se ISKLJUČIVO za aritmetiku i interop s bibliotekama — nikad za
 * prikaz korisniku, jer bi lokalna zona preglednika pomjerila dan.
 */
export function plainDateToUtcDate(date: PlainDate): Date {
  const { year, month, day } = plainDateParts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

/** Uzima kalendarski dan iz `Date` objekta, čitajući UTC komponente. */
export function utcDateToPlainDate(date: Date): PlainDate {
  if (Number.isNaN(date.getTime())) throw new InvalidPlainDateError('Invalid Date')
  return makePlainDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

const MS_PER_DAY = 86_400_000

/** Dodaje (ili oduzima, za negativan broj) dane. */
export function addDays(date: PlainDate, days: number): PlainDate {
  if (!Number.isInteger(days)) throw new RangeError('addDays(): broj dana mora biti cijeli broj')
  return utcDateToPlainDate(new Date(plainDateToUtcDate(date).getTime() + days * MS_PER_DAY))
}

/**
 * Dodaje mjesece uz "clamping" na zadnji dan mjeseca.
 *
 *   2026-01-31 + 1 mjesec → 2026-02-28   (ne 2026-03-03)
 *   2026-01-31 + 3 mjeseca → 2026-04-30
 *   2024-02-29 + 12 mjeseci → 2025-02-28
 *
 * Ovo je pravilo koje očekuje serviser: "svakih 6 mjeseci od 31. januara"
 * znači kraj jula, ne 1. avgust.
 */
export function addMonths(date: PlainDate, months: number): PlainDate {
  if (!Number.isInteger(months))
    throw new RangeError('addMonths(): broj mjeseci mora biti cijeli broj')
  const { year, month, day } = plainDateParts(date)

  const totalMonths = year * 12 + (month - 1) + months
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = (totalMonths % 12) + 1

  const maxDay = daysInMonth(targetYear, targetMonth)
  return makePlainDate(targetYear, targetMonth, Math.min(day, maxDay))
}

/** Razlika u danima: `b - a`. Pozitivno znači da je `b` kasnije. */
export function diffInDays(a: PlainDate, b: PlainDate): number {
  return Math.round(
    (plainDateToUtcDate(b).getTime() - plainDateToUtcDate(a).getTime()) / MS_PER_DAY,
  )
}

/** Poređenje: -1 ako je `a` prije `b`, 0 ako su isti, 1 ako je `a` poslije. */
export function comparePlainDates(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  assertPlainDate(a)
  assertPlainDate(b)
  return a < b ? -1 : a > b ? 1 : 0
}

export function isBefore(a: PlainDate, b: PlainDate): boolean {
  return comparePlainDates(a, b) === -1
}

export function isAfter(a: PlainDate, b: PlainDate): boolean {
  return comparePlainDates(a, b) === 1
}

export function isSameDate(a: PlainDate, b: PlainDate): boolean {
  return comparePlainDates(a, b) === 0
}

/** Da li je `date` unutar zatvorenog intervala [from, to]. */
export function isWithin(date: PlainDate, from: PlainDate, to: PlainDate): boolean {
  return !isBefore(date, from) && !isAfter(date, to)
}

export function minPlainDate(...dates: PlainDate[]): PlainDate {
  if (dates.length === 0) throw new RangeError('minPlainDate(): potreban je barem jedan datum')
  return dates.reduce((acc, d) => (isBefore(d, acc) ? d : acc))
}

export function maxPlainDate(...dates: PlainDate[]): PlainDate {
  if (dates.length === 0) throw new RangeError('maxPlainDate(): potreban je barem jedan datum')
  return dates.reduce((acc, d) => (isAfter(d, acc) ? d : acc))
}

/** Dan u sedmici: 0 = nedjelja … 6 = subota (ISO tjedan počinje ponedjeljkom, vidi `isoWeekday`). */
export function dayOfWeek(date: PlainDate): number {
  return plainDateToUtcDate(date).getUTCDay()
}

/** ISO dan u sedmici: 1 = ponedjeljak … 7 = nedjelja. */
export function isoWeekday(date: PlainDate): number {
  const day = dayOfWeek(date)
  return day === 0 ? 7 : day
}

/** Zadnji dan mjeseca u kojem se datum nalazi. */
export function endOfMonth(date: PlainDate): PlainDate {
  const { year, month } = plainDateParts(date)
  return makePlainDate(year, month, daysInMonth(year, month))
}

/** Prvi dan mjeseca u kojem se datum nalazi. */
export function startOfMonth(date: PlainDate): PlainDate {
  const { year, month } = plainDateParts(date)
  return makePlainDate(year, month, 1)
}

/** Niz datuma od `from` do `to` (uključivo). Ograničen na 1000 dana radi sigurnosti. */
export function eachDay(from: PlainDate, to: PlainDate): PlainDate[] {
  const total = diffInDays(from, to)
  if (total < 0) return []
  if (total > 1000) throw new RangeError('eachDay(): raspon veći od 1000 dana nije dopušten')
  const out: PlainDate[] = []
  for (let i = 0; i <= total; i++) out.push(addDays(from, i))
  return out
}

// ---------------------------------------------------------------------------
// Vremenska zona — jedina tačka gdje zona utiče na kalendar
// ---------------------------------------------------------------------------

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateFormatterCache.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  dateFormatterCache.set(timeZone, formatter)
  return formatter
}

/** Provjerava da li runtime poznaje zadanu IANA vremensku zonu. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Koji je kalendarski datum u zadanoj vremenskoj zoni u trenutku `instant`.
 *
 * Ovo je jedina funkcija u domenu koja spaja "trenutak u vremenu" i "kalendar".
 * Cron je poziva jednom po organizaciji, a rezultat prosljeđuje svim
 * proračunima podsjetnika.
 */
export function toPlainDateInTimeZone(instant: Date, timeZone: string): PlainDate {
  if (Number.isNaN(instant.getTime())) throw new InvalidPlainDateError('Invalid Date')
  const parts = getDateFormatter(timeZone).formatToParts(instant)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error(`Neuspješno čitanje datuma za zonu "${timeZone}"`)
  }
  const value = `${year}-${month}-${day}`
  assertPlainDate(value)
  return value
}

/** Današnji datum u zoni organizacije. `now` se prosljeđuje radi testabilnosti. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): PlainDate {
  return toPlainDateInTimeZone(now, timeZone)
}

/**
 * Pomak zone u minutama u odnosu na UTC za zadani trenutak.
 * Pozitivno znači istočno od Greenwicha (Sarajevo ljeti = +120).
 */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = formatter.formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type)?.value
    return found ? Number(found) : 0
  }
  // `hour` može biti 24 za ponoć u nekim runtime-ima — normalizujemo na 0.
  const hour = get('hour') % 24
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  )
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

/**
 * Pretvara kalendarski datum + lokalno vrijeme (HH:mm) u zoni organizacije
 * u apsolutni trenutak (UTC `Date`).
 *
 * Koristi se za rezervacije: "15.03.2026. u 09:00 po sarajevskom vremenu".
 * Radi u dva koraka jer pomak zone ovisi o samom trenutku (ljetno računanje).
 */
export function zonedDateTimeToInstant(date: PlainDate, timeOfDay: string, timeZone: string): Date {
  const { hours, minutes } = parseTimeOfDay(timeOfDay)
  const { year, month, day } = plainDateParts(date)

  // Prva procjena: tretiraj lokalno vrijeme kao da je UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
  const offset1 = timeZoneOffsetMinutes(guess, timeZone)
  let instant = new Date(guess.getTime() - offset1 * 60_000)

  // Druga iteracija hvata prelaz na ljetno/zimsko računanje vremena.
  const offset2 = timeZoneOffsetMinutes(instant, timeZone)
  if (offset2 !== offset1) {
    instant = new Date(guess.getTime() - offset2 * 60_000)
  }
  return instant
}

/** Lokalno vrijeme (HH:mm) u zadanoj zoni za dati trenutak. */
export function instantToTimeOfDay(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = formatter.formatToParts(instant)
  const hour = (Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24)
    .toString()
    .padStart(2, '0')
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

// ---------------------------------------------------------------------------
// Vrijeme u danu (HH:mm)
// ---------------------------------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}

export function parseTimeOfDay(value: string): { hours: number; minutes: number } {
  const match = TIME_RE.exec(value)
  if (!match) throw new RangeError(`Neispravno vrijeme: "${value}". Očekivan format je HH:mm.`)
  return { hours: Number(match[1]), minutes: Number(match[2]) }
}

/** Minute od ponoći — pogodno za poređenje i generisanje termina. */
export function timeOfDayToMinutes(value: string): number {
  const { hours, minutes } = parseTimeOfDay(value)
  return hours * 60 + minutes
}

/** Suprotno od `timeOfDayToMinutes`. Vrijednosti izvan dana se odbijaju. */
export function minutesToTimeOfDay(totalMinutes: number): string {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 1440) {
    throw new RangeError(`Minute moraju biti cijeli broj 0–1439, dobiveno: ${totalMinutes}`)
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
