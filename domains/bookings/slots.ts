import {
  addDays,
  diffInDays,
  isoWeekday,
  minutesToTimeOfDay,
  timeOfDayToMinutes,
  toPlainDateInTimeZone,
  zonedDateTimeToInstant,
  type PlainDate,
} from '@/domains/shared/plain-date'

/**
 * Generisanje i provjera slobodnih termina.
 *
 * Zašto sve ide preko servera, a ništa preko preglednika:
 * termin koji preglednik prikaže kao slobodan možda to više nije. Klijent
 * dobija listu samo kao prijedlog; konačna riječ je uvijek provjera na serveru
 * unutar transakcije, uz jedinstveni indeks u bazi kao zadnju branu.
 */

export interface BookingSettings {
  /** ISO dani: 1 = ponedjeljak … 7 = nedjelja. */
  businessDays: number[]
  /** 'HH:mm' */
  businessHoursStart: string
  businessHoursEnd: string
  breakStart: string | null
  breakEnd: string | null
  slotDurationMinutes: number
  bufferMinutes: number
  minNoticeHours: number
  maxHorizonDays: number
  maxConcurrentBookings: number
  holidays: PlainDate[]
  bookingEnabled: boolean
  timeZone: string
}

export const DEFAULT_BOOKING_SETTINGS: Omit<BookingSettings, 'timeZone'> = {
  businessDays: [1, 2, 3, 4, 5],
  businessHoursStart: '08:00',
  businessHoursEnd: '16:00',
  breakStart: null,
  breakEnd: null,
  slotDurationMinutes: 60,
  bufferMinutes: 15,
  minNoticeHours: 24,
  maxHorizonDays: 90,
  maxConcurrentBookings: 1,
  holidays: [],
  bookingEnabled: true,
}

export interface ExistingBooking {
  /** Početak termina kao ISO string (UTC). */
  startsAt: string
  slotIndex: number
  technicianId: string | null
}

export interface TimeSlot {
  /** Lokalno vrijeme početka, 'HH:mm'. */
  time: string
  /** Apsolutni trenutak početka. */
  startsAt: Date
  endsAt: Date
  available: boolean
  /** Koliko je mjesta zauzeto od `maxConcurrentBookings`. */
  taken: number
  capacity: number
}

export interface DayAvailability {
  date: PlainDate
  weekday: number
  isBusinessDay: boolean
  isHoliday: boolean
  slots: TimeSlot[]
  availableCount: number
}

export class BookingWindowError extends Error {
  readonly code: 'too_soon' | 'too_far' | 'closed_day' | 'outside_hours' | 'booking_disabled'
  constructor(code: BookingWindowError['code'], message: string) {
    super(message)
    this.name = 'BookingWindowError'
    this.code = code
  }
}

/** Je li dan radni (radni dan firme i nije praznik)? */
export function isBusinessDay(date: PlainDate, settings: BookingSettings): boolean {
  if (settings.holidays.includes(date)) return false
  return settings.businessDays.includes(isoWeekday(date))
}

/**
 * Sva vremena početka termina u jednom danu, po mreži koju definiše firma.
 *
 * Trajanje termina i razmak između posjeta zajedno određuju korak mreže:
 * termin od 60 min uz 15 min razmaka daje početke u 08:00, 09:15, 10:30…
 * Time raspored automatski ostavlja vrijeme za put između kupaca.
 */
export function generateSlotTimes(settings: BookingSettings): string[] {
  const start = timeOfDayToMinutes(settings.businessHoursStart)
  const end = timeOfDayToMinutes(settings.businessHoursEnd)
  const step = settings.slotDurationMinutes + settings.bufferMinutes

  if (step <= 0) throw new RangeError('Trajanje termina i razmak moraju dati pozitivan korak.')

  const breakStart = settings.breakStart ? timeOfDayToMinutes(settings.breakStart) : null
  const breakEnd = settings.breakEnd ? timeOfDayToMinutes(settings.breakEnd) : null

  const times: string[] = []
  for (let minute = start; minute + settings.slotDurationMinutes <= end; minute += step) {
    const slotEnd = minute + settings.slotDurationMinutes

    // Termin koji bi presjekao pauzu se preskače.
    if (breakStart !== null && breakEnd !== null) {
      const overlapsBreak = minute < breakEnd && slotEnd > breakStart
      if (overlapsBreak) continue
    }

    times.push(minutesToTimeOfDay(minute))
  }

  return times
}

/**
 * Dostupnost za jedan dan.
 *
 * `now` se prosljeđuje eksplicitno (nikad `new Date()` unutra) da bi funkcija
 * bila deterministička i testabilna.
 */
export function getDayAvailability(input: {
  date: PlainDate
  settings: BookingSettings
  existingBookings: readonly ExistingBooking[]
  now: Date
}): DayAvailability {
  const { date, settings, existingBookings, now } = input
  const weekday = isoWeekday(date)
  const isHoliday = settings.holidays.includes(date)
  const businessDay = isBusinessDay(date, settings)

  if (!businessDay || !settings.bookingEnabled) {
    return {
      date,
      weekday,
      isBusinessDay: businessDay,
      isHoliday,
      slots: [],
      availableCount: 0,
    }
  }

  const earliestAllowed = new Date(now.getTime() + settings.minNoticeHours * 3_600_000)
  const today = toPlainDateInTimeZone(now, settings.timeZone)
  const horizonEnd = addDays(today, settings.maxHorizonDays)

  const beyondHorizon = diffInDays(date, horizonEnd) < 0

  // Koliko je mjesta zauzeto po vremenu početka.
  const takenByTime = new Map<string, number>()
  for (const booking of existingBookings) {
    const key = new Date(booking.startsAt).toISOString()
    takenByTime.set(key, (takenByTime.get(key) ?? 0) + 1)
  }

  const slots: TimeSlot[] = generateSlotTimes(settings).map((time) => {
    const startsAt = zonedDateTimeToInstant(date, time, settings.timeZone)
    const endsAt = new Date(startsAt.getTime() + settings.slotDurationMinutes * 60_000)
    const taken = takenByTime.get(startsAt.toISOString()) ?? 0

    const available =
      !beyondHorizon &&
      startsAt.getTime() >= earliestAllowed.getTime() &&
      taken < settings.maxConcurrentBookings

    return {
      time,
      startsAt,
      endsAt,
      available,
      taken,
      capacity: settings.maxConcurrentBookings,
    }
  })

  return {
    date,
    weekday,
    isBusinessDay: businessDay,
    isHoliday,
    slots,
    availableCount: slots.filter((slot) => slot.available).length,
  }
}

/** Dostupnost za raspon dana — koristi se za kalendar u obrascu rezervacije. */
export function getRangeAvailability(input: {
  from: PlainDate
  days: number
  settings: BookingSettings
  existingBookings: readonly ExistingBooking[]
  now: Date
}): DayAvailability[] {
  const { from, days, settings, existingBookings, now } = input
  if (days < 1 || days > 120) {
    throw new RangeError('Raspon dostupnosti mora biti između 1 i 120 dana.')
  }

  const result: DayAvailability[] = []
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(from, offset)
    result.push(getDayAvailability({ date, settings, existingBookings, now }))
  }
  return result
}

/**
 * Prvi slobodan indeks unutar termina.
 *
 * Vraća `null` kad je termin pun. Servis ovo poziva UNUTAR transakcije, a
 * jedinstveni indeks `uq_bookings_slot` garantuje ispravnost i kad dva
 * zahtjeva stignu u istoj milisekundi — drugi tada dobije grešku i pokuša
 * sljedeći indeks ili javi da je termin zauzet.
 */
export function findFreeSlotIndex(
  takenIndexes: readonly number[],
  maxConcurrent: number,
): number | null {
  const taken = new Set(takenIndexes)
  for (let index = 0; index < maxConcurrent; index++) {
    if (!taken.has(index)) return index
  }
  return null
}

/**
 * Provjera da traženi termin uopšte smije postojati.
 *
 * Ovo je serverska provjera koja se izvršava prije upisa, bez obzira šta je
 * klijent poslao. Klijent može poslati bilo koje vrijeme — ovdje pada.
 */
export function validateRequestedSlot(input: {
  date: PlainDate
  time: string
  settings: BookingSettings
  now: Date
}): { startsAt: Date; endsAt: Date } {
  const { date, time, settings, now } = input

  if (!settings.bookingEnabled) {
    throw new BookingWindowError(
      'booking_disabled',
      'Online rezervacija trenutno nije dostupna. Molimo kontaktirajte nas telefonom.',
    )
  }

  if (!isBusinessDay(date, settings)) {
    throw new BookingWindowError(
      'closed_day',
      'Odabrani dan nije radni dan. Molimo odaberite drugi termin.',
    )
  }

  const validTimes = generateSlotTimes(settings)
  if (!validTimes.includes(time)) {
    throw new BookingWindowError(
      'outside_hours',
      'Odabrano vrijeme nije u radnom vremenu. Molimo odaberite ponuđeni termin.',
    )
  }

  const startsAt = zonedDateTimeToInstant(date, time, settings.timeZone)
  const endsAt = new Date(startsAt.getTime() + settings.slotDurationMinutes * 60_000)

  const earliestAllowed = new Date(now.getTime() + settings.minNoticeHours * 3_600_000)
  if (startsAt.getTime() < earliestAllowed.getTime()) {
    throw new BookingWindowError(
      'too_soon',
      `Termin se mora rezervisati najmanje ${settings.minNoticeHours} sati unaprijed.`,
    )
  }

  const today = toPlainDateInTimeZone(now, settings.timeZone)
  const daysAhead = diffInDays(today, date)
  if (daysAhead > settings.maxHorizonDays) {
    throw new BookingWindowError(
      'too_far',
      `Termin se može rezervisati najviše ${settings.maxHorizonDays} dana unaprijed.`,
    )
  }

  return { startsAt, endsAt }
}

/**
 * Da li se dva termina preklapaju, uzimajući u obzir razmak između posjeta.
 * Koristi se pri dodjeli tehničara da isti čovjek ne dobije dva bliska posla.
 */
export function slotsOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
  bufferMinutes = 0,
): boolean {
  const buffer = bufferMinutes * 60_000
  return (
    a.startsAt.getTime() < b.endsAt.getTime() + buffer &&
    b.startsAt.getTime() < a.endsAt.getTime() + buffer
  )
}

/** Prvi dan s barem jednim slobodnim terminom — za prijedlog kupcu. */
export function firstAvailableDay(days: readonly DayAvailability[]): DayAvailability | null {
  return days.find((day) => day.availableCount > 0) ?? null
}
