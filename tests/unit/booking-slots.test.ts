import { describe, expect, it } from 'vitest'
import {
  BookingWindowError,
  DEFAULT_BOOKING_SETTINGS,
  findFreeSlotIndex,
  firstAvailableDay,
  generateSlotTimes,
  getDayAvailability,
  getRangeAvailability,
  isBusinessDay,
  slotsOverlap,
  validateRequestedSlot,
  type BookingSettings,
} from '@/domains/bookings/slots'

function settings(overrides: Partial<BookingSettings> = {}): BookingSettings {
  return { ...DEFAULT_BOOKING_SETTINGS, timeZone: 'Europe/Sarajevo', ...overrides }
}

// Ponedjeljak, 16.03.2026. u 08:00 po sarajevskom vremenu.
const NOW = new Date('2026-03-16T07:00:00Z')

describe('generateSlotTimes', () => {
  it('koristi trajanje termina plus razmak kao korak', () => {
    const times = generateSlotTimes(settings({ slotDurationMinutes: 60, bufferMinutes: 15 }))
    expect(times).toEqual(['08:00', '09:15', '10:30', '11:45', '13:00', '14:15'])
  })

  it('bez razmaka daje pune sate', () => {
    const times = generateSlotTimes(settings({ slotDurationMinutes: 60, bufferMinutes: 0 }))
    expect(times).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'])
  })

  it('ne nudi termin koji bi prešao kraj radnog vremena', () => {
    const times = generateSlotTimes(
      settings({
        businessHoursStart: '08:00',
        businessHoursEnd: '12:00',
        slotDurationMinutes: 90,
        bufferMinutes: 0,
      }),
    )
    // 08:00–09:30, 09:30–11:00; sljedeći bi završio u 12:30 pa otpada.
    expect(times).toEqual(['08:00', '09:30'])
  })

  it('preskače termine koji presijecaju pauzu', () => {
    const times = generateSlotTimes(
      settings({
        slotDurationMinutes: 60,
        bufferMinutes: 0,
        breakStart: '12:00',
        breakEnd: '13:00',
      }),
    )
    expect(times).not.toContain('12:00')
    expect(times).toContain('11:00')
    expect(times).toContain('13:00')
  })
})

describe('isBusinessDay', () => {
  it('prepoznaje radne dane i vikend', () => {
    expect(isBusinessDay('2026-03-16', settings())).toBe(true) // ponedjeljak
    expect(isBusinessDay('2026-03-20', settings())).toBe(true) // petak
    expect(isBusinessDay('2026-03-21', settings())).toBe(false) // subota
    expect(isBusinessDay('2026-03-22', settings())).toBe(false) // nedjelja
  })

  it('poštuje praznike', () => {
    const withHoliday = settings({ holidays: ['2026-03-17'] })
    expect(isBusinessDay('2026-03-17', withHoliday)).toBe(false)
  })

  it('poštuje firmu koja radi subotom', () => {
    const sixDays = settings({ businessDays: [1, 2, 3, 4, 5, 6] })
    expect(isBusinessDay('2026-03-21', sixDays)).toBe(true)
  })
})

describe('getDayAvailability', () => {
  it('poštuje minimalnu najavu', () => {
    // Sutra u 08:00 je za 25 sati — s najavom od 24 sata to prolazi.
    const day = getDayAvailability({
      date: '2026-03-17',
      settings: settings({ minNoticeHours: 24 }),
      existingBookings: [],
      now: NOW,
    })
    expect(day.slots[0]?.available).toBe(true)

    // Danas u 08:00 je već prošlo.
    const today = getDayAvailability({
      date: '2026-03-16',
      settings: settings({ minNoticeHours: 24 }),
      existingBookings: [],
      now: NOW,
    })
    expect(today.availableCount).toBe(0)
  })

  it('zauzet termin nije dostupan kad je kapacitet 1', () => {
    const startsAt = new Date('2026-03-17T07:00:00Z').toISOString() // 08:00 lokalno

    const day = getDayAvailability({
      date: '2026-03-17',
      settings: settings({ maxConcurrentBookings: 1 }),
      existingBookings: [{ startsAt, slotIndex: 0, technicianId: null }],
      now: NOW,
    })

    expect(day.slots[0]?.available).toBe(false)
    expect(day.slots[0]?.taken).toBe(1)
    expect(day.slots[1]?.available).toBe(true)
  })

  it('kapacitet 2 dopušta dvije rezervacije u istom terminu', () => {
    const startsAt = new Date('2026-03-17T07:00:00Z').toISOString()

    const one = getDayAvailability({
      date: '2026-03-17',
      settings: settings({ maxConcurrentBookings: 2 }),
      existingBookings: [{ startsAt, slotIndex: 0, technicianId: null }],
      now: NOW,
    })
    expect(one.slots[0]?.available).toBe(true)

    const two = getDayAvailability({
      date: '2026-03-17',
      settings: settings({ maxConcurrentBookings: 2 }),
      existingBookings: [
        { startsAt, slotIndex: 0, technicianId: null },
        { startsAt, slotIndex: 1, technicianId: null },
      ],
      now: NOW,
    })
    expect(two.slots[0]?.available).toBe(false)
  })

  it('vikend nema termina', () => {
    const day = getDayAvailability({
      date: '2026-03-21',
      settings: settings(),
      existingBookings: [],
      now: NOW,
    })
    expect(day.slots).toHaveLength(0)
    expect(day.isBusinessDay).toBe(false)
  })

  it('poštuje najdalji dopušteni datum', () => {
    const day = getDayAvailability({
      date: '2026-07-16', // više od 90 dana unaprijed
      settings: settings({ maxHorizonDays: 30 }),
      existingBookings: [],
      now: NOW,
    })
    expect(day.availableCount).toBe(0)
  })

  it('isključena rezervacija ne nudi nijedan termin', () => {
    const day = getDayAvailability({
      date: '2026-03-17',
      settings: settings({ bookingEnabled: false }),
      existingBookings: [],
      now: NOW,
    })
    expect(day.slots).toHaveLength(0)
  })

  it('termini su ispravni i nakon prelaska na ljetno vrijeme', () => {
    // Prelaz je 29.03.2026. — 30.03. je ponedjeljak u ljetnom vremenu.
    const day = getDayAvailability({
      date: '2026-03-30',
      settings: settings(),
      existingBookings: [],
      now: NOW,
    })
    expect(day.slots[0]?.time).toBe('08:00')
    // 08:00 ljetnog vremena = 06:00 UTC.
    expect(day.slots[0]?.startsAt.toISOString()).toBe('2026-03-30T06:00:00.000Z')
  })
})

describe('getRangeAvailability i firstAvailableDay', () => {
  it('vraća raspon i pronalazi prvi slobodan dan', () => {
    const days = getRangeAvailability({
      from: '2026-03-21', // subota
      days: 5,
      settings: settings(),
      existingBookings: [],
      now: NOW,
    })

    expect(days).toHaveLength(5)
    expect(days[0]?.availableCount).toBe(0) // subota
    expect(days[1]?.availableCount).toBe(0) // nedjelja

    const first = firstAvailableDay(days)
    expect(first?.date).toBe('2026-03-23') // ponedjeljak
  })

  it('odbija besmislen raspon', () => {
    expect(() =>
      getRangeAvailability({
        from: '2026-03-21',
        days: 0,
        settings: settings(),
        existingBookings: [],
        now: NOW,
      }),
    ).toThrow()
  })
})

describe('findFreeSlotIndex', () => {
  it('vraća prvi slobodan indeks', () => {
    expect(findFreeSlotIndex([], 3)).toBe(0)
    expect(findFreeSlotIndex([0], 3)).toBe(1)
    expect(findFreeSlotIndex([0, 1], 3)).toBe(2)
    expect(findFreeSlotIndex([1], 3)).toBe(0)
  })

  it('vraća null kad je termin pun', () => {
    expect(findFreeSlotIndex([0], 1)).toBeNull()
    expect(findFreeSlotIndex([0, 1, 2], 3)).toBeNull()
  })
})

describe('validateRequestedSlot', () => {
  it('prihvata ispravan termin', () => {
    const result = validateRequestedSlot({
      date: '2026-03-18',
      time: '09:15',
      settings: settings(),
      now: NOW,
    })
    expect(result.startsAt.toISOString()).toBe('2026-03-18T08:15:00.000Z')
    expect(result.endsAt.getTime() - result.startsAt.getTime()).toBe(60 * 60_000)
  })

  it('★ odbija vrijeme koje nije u ponuđenoj mreži', () => {
    // Klijent može poslati bilo šta — server to odbija.
    expect(() =>
      validateRequestedSlot({
        date: '2026-03-18',
        time: '09:07',
        settings: settings(),
        now: NOW,
      }),
    ).toThrow(BookingWindowError)
  })

  it('odbija termin izvan radnog vremena', () => {
    expect(() =>
      validateRequestedSlot({ date: '2026-03-18', time: '22:00', settings: settings(), now: NOW }),
    ).toThrow(/radnom vremenu/)
  })

  it('odbija neradni dan', () => {
    expect(() =>
      validateRequestedSlot({ date: '2026-03-21', time: '09:15', settings: settings(), now: NOW }),
    ).toThrow(/nije radni dan/)
  })

  it('odbija termin koji je prekasno najavljen', () => {
    expect(() =>
      validateRequestedSlot({
        date: '2026-03-16',
        time: '14:15',
        settings: settings({ minNoticeHours: 24 }),
        now: NOW,
      }),
    ).toThrow(/24 sati unaprijed/)
  })

  it('odbija termin predaleko u budućnosti', () => {
    expect(() =>
      validateRequestedSlot({
        date: '2026-09-16',
        time: '09:15',
        settings: settings({ maxHorizonDays: 90 }),
        now: NOW,
      }),
    ).toThrow(/90 dana unaprijed/)
  })

  it('odbija sve kad je rezervacija isključena', () => {
    expect(() =>
      validateRequestedSlot({
        date: '2026-03-18',
        time: '09:15',
        settings: settings({ bookingEnabled: false }),
        now: NOW,
      }),
    ).toThrow(/nije dostupna/)
  })
})

describe('slotsOverlap', () => {
  const slotA = {
    startsAt: new Date('2026-03-18T08:00:00Z'),
    endsAt: new Date('2026-03-18T09:00:00Z'),
  }

  it('prepoznaje preklapanje', () => {
    expect(
      slotsOverlap(slotA, {
        startsAt: new Date('2026-03-18T08:30:00Z'),
        endsAt: new Date('2026-03-18T09:30:00Z'),
      }),
    ).toBe(true)
  })

  it('susjedni termini se ne preklapaju bez razmaka', () => {
    expect(
      slotsOverlap(slotA, {
        startsAt: new Date('2026-03-18T09:00:00Z'),
        endsAt: new Date('2026-03-18T10:00:00Z'),
      }),
    ).toBe(false)
  })

  it('razmak između posjeta stvara preklapanje', () => {
    expect(
      slotsOverlap(
        slotA,
        {
          startsAt: new Date('2026-03-18T09:00:00Z'),
          endsAt: new Date('2026-03-18T10:00:00Z'),
        },
        15,
      ),
    ).toBe(true)
  })
})
