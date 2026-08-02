import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  comparePlainDates,
  daysInMonth,
  diffInDays,
  eachDay,
  endOfMonth,
  instantToTimeOfDay,
  isPlainDate,
  isValidTimeZone,
  isWithin,
  isoWeekday,
  makePlainDate,
  maxPlainDate,
  minPlainDate,
  minutesToTimeOfDay,
  plainDateParts,
  timeOfDayToMinutes,
  todayInTimeZone,
  toPlainDateInTimeZone,
  zonedDateTimeToInstant,
  type PlainDate,
} from '@/domains/shared/plain-date'

/**
 * Napomena: `tests/setup.ts` postavlja TZ procesa na America/Los_Angeles.
 * Ako bilo koja funkcija ovdje koristi lokalnu zonu umjesto eksplicitne,
 * ovi testovi to odmah otkriju.
 */

describe('isPlainDate', () => {
  it('prihvata ispravne datume', () => {
    expect(isPlainDate('2026-03-15')).toBe(true)
    expect(isPlainDate('2024-02-29')).toBe(true) // prijestupna godina
    expect(isPlainDate('2026-12-31')).toBe(true)
  })

  it('odbija neispravne datume', () => {
    expect(isPlainDate('2025-02-29')).toBe(false) // nije prijestupna
    expect(isPlainDate('2026-13-01')).toBe(false)
    expect(isPlainDate('2026-00-10')).toBe(false)
    expect(isPlainDate('2026-04-31')).toBe(false) // april ima 30 dana
    expect(isPlainDate('15.03.2026')).toBe(false)
    expect(isPlainDate('2026-3-5')).toBe(false)
    expect(isPlainDate('')).toBe(false)
    expect(isPlainDate(null)).toBe(false)
    expect(isPlainDate(20260315)).toBe(false)
  })
})

describe('daysInMonth', () => {
  it('vraća tačan broj dana', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2000, 2)).toBe(29) // djeljiva sa 400
    expect(daysInMonth(1900, 2)).toBe(28) // djeljiva sa 100, nije sa 400
    expect(daysInMonth(2026, 4)).toBe(30)
  })
})

describe('addDays', () => {
  it('prelazi granicu mjeseca', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('prelazi granicu godine', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('radi s negativnim pomakom (podsjetnik 30 dana ranije)', () => {
    expect(addDays('2026-03-15', -30)).toBe('2026-02-13')
    expect(addDays('2026-03-15', -14)).toBe('2026-03-01')
    expect(addDays('2026-03-15', -3)).toBe('2026-03-12')
  })

  it('ne pomjera datum kroz prelaz na ljetno računanje vremena', () => {
    // U EU se sat pomjera 29.03.2026. Datum se NE smije preskočiti.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('odbija necijele brojeve', () => {
    expect(() => addDays('2026-03-15', 1.5)).toThrow()
  })
})

describe('addMonths — pravilo za kraj mjeseca', () => {
  it('skraćuje na zadnji dan ciljnog mjeseca', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30')
    expect(addMonths('2026-05-31', 1)).toBe('2026-06-30')
  })

  it('ne mijenja dan kad ciljni mjesec ima dovoljno dana', () => {
    expect(addMonths('2026-03-15', 6)).toBe('2026-09-15')
    expect(addMonths('2026-03-15', 12)).toBe('2027-03-15')
    expect(addMonths('2026-03-15', 24)).toBe('2028-03-15')
  })

  it('radi unazad', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15')
  })

  it('29. februar + 12 mjeseci daje 28. februar', () => {
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28')
    expect(addMonths('2024-02-29', 48)).toBe('2028-02-29')
  })

  it('pokriva tipične servisne intervale', () => {
    expect(addMonths('2026-03-15', 6)).toBe('2026-09-15') // klima: 6 mjeseci
    expect(addMonths('2026-03-15', 12)).toBe('2027-03-15') // kotao: 12 mjeseci
    expect(addMonths('2026-03-15', 3)).toBe('2026-06-15') // rashladna: 3 mjeseca
  })
})

describe('diffInDays', () => {
  it('računa razliku u oba smjera', () => {
    expect(diffInDays('2026-03-01', '2026-03-15')).toBe(14)
    expect(diffInDays('2026-03-15', '2026-03-01')).toBe(-14)
    expect(diffInDays('2026-03-15', '2026-03-15')).toBe(0)
  })

  it('tačan je preko prelaza na ljetno računanje vremena', () => {
    // Bez UTC aritmetike ovo bi dalo 30 ili 32 zbog pomjeranja sata.
    expect(diffInDays('2026-03-15', '2026-04-15')).toBe(31)
    expect(diffInDays('2026-10-15', '2026-11-15')).toBe(31)
  })

  it('tačan je preko prijestupnog dana', () => {
    expect(diffInDays('2024-02-28', '2024-03-01')).toBe(2)
    expect(diffInDays('2025-02-28', '2025-03-01')).toBe(1)
  })
})

describe('poređenja', () => {
  it('comparePlainDates', () => {
    expect(comparePlainDates('2026-03-01', '2026-03-15')).toBe(-1)
    expect(comparePlainDates('2026-03-15', '2026-03-01')).toBe(1)
    expect(comparePlainDates('2026-03-15', '2026-03-15')).toBe(0)
  })

  it('isWithin je zatvoreni interval', () => {
    expect(isWithin('2026-03-15', '2026-03-01', '2026-03-31')).toBe(true)
    expect(isWithin('2026-03-01', '2026-03-01', '2026-03-31')).toBe(true)
    expect(isWithin('2026-03-31', '2026-03-01', '2026-03-31')).toBe(true)
    expect(isWithin('2026-04-01', '2026-03-01', '2026-03-31')).toBe(false)
  })

  it('min i max', () => {
    expect(minPlainDate('2026-03-15', '2026-01-01', '2026-12-31')).toBe('2026-01-01')
    expect(maxPlainDate('2026-03-15', '2026-01-01', '2026-12-31')).toBe('2026-12-31')
  })
})

describe('isoWeekday', () => {
  it('ponedjeljak je 1, nedjelja je 7', () => {
    expect(isoWeekday('2026-03-16')).toBe(1) // ponedjeljak
    expect(isoWeekday('2026-03-20')).toBe(5) // petak
    expect(isoWeekday('2026-03-21')).toBe(6) // subota
    expect(isoWeekday('2026-03-22')).toBe(7) // nedjelja
  })
})

describe('endOfMonth / eachDay / makePlainDate', () => {
  it('endOfMonth', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(endOfMonth('2026-12-01')).toBe('2026-12-31')
  })

  it('eachDay uključuje oba kraja', () => {
    expect(eachDay('2026-03-01', '2026-03-04')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ])
    expect(eachDay('2026-03-04', '2026-03-01')).toEqual([])
  })

  it('makePlainDate odbija nepostojeći datum', () => {
    expect(() => makePlainDate(2025, 2, 29)).toThrow()
    expect(makePlainDate(2026, 3, 5)).toBe('2026-03-05')
  })

  it('plainDateParts', () => {
    expect(plainDateParts('2026-03-15')).toEqual({ year: 2026, month: 3, day: 15 })
  })
})

describe('vremenske zone', () => {
  it('prepoznaje ispravne zone', () => {
    expect(isValidTimeZone('Europe/Sarajevo')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Nepostojeca/Zona')).toBe(false)
  })

  it('kalendarski dan ovisi o zoni, ne o zoni servera', () => {
    // 31.12.2026. u 23:30 po sarajevskom = 22:30 UTC.
    const instant = new Date('2026-12-31T22:30:00Z')
    expect(toPlainDateInTimeZone(instant, 'Europe/Sarajevo')).toBe('2026-12-31')
    expect(toPlainDateInTimeZone(instant, 'UTC')).toBe('2026-12-31')
    // U Los Angelesu je tada još 31.12. popodne.
    expect(toPlainDateInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-12-31')
  })

  it('hvata prelazak dana u Sarajevu prije UTC-a', () => {
    // 01.01.2027. u 00:30 po sarajevskom = 23:30 UTC 31.12.2026.
    const instant = new Date('2026-12-31T23:30:00Z')
    expect(toPlainDateInTimeZone(instant, 'Europe/Sarajevo')).toBe('2027-01-01')
    expect(toPlainDateInTimeZone(instant, 'UTC')).toBe('2026-12-31')
  })

  it('todayInTimeZone koristi proslijeđeni trenutak', () => {
    const instant = new Date('2026-06-15T01:00:00Z')
    expect(todayInTimeZone('Europe/Sarajevo', instant)).toBe('2026-06-15')
    expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-06-14')
  })
})

describe('zonedDateTimeToInstant', () => {
  it('zimsko vrijeme: Sarajevo je UTC+1', () => {
    const instant = zonedDateTimeToInstant('2026-01-15', '09:00', 'Europe/Sarajevo')
    expect(instant.toISOString()).toBe('2026-01-15T08:00:00.000Z')
  })

  it('ljetno vrijeme: Sarajevo je UTC+2', () => {
    const instant = zonedDateTimeToInstant('2026-07-15', '09:00', 'Europe/Sarajevo')
    expect(instant.toISOString()).toBe('2026-07-15T07:00:00.000Z')
  })

  it('tačan je na sam dan prelaska na ljetno vrijeme', () => {
    // 29.03.2026. u 02:00 sat preskače na 03:00.
    const before = zonedDateTimeToInstant('2026-03-29', '01:00', 'Europe/Sarajevo')
    expect(before.toISOString()).toBe('2026-03-29T00:00:00.000Z')
    const after = zonedDateTimeToInstant('2026-03-29', '09:00', 'Europe/Sarajevo')
    expect(after.toISOString()).toBe('2026-03-29T07:00:00.000Z')
  })

  it('povratak kroz instantToTimeOfDay daje isto vrijeme', () => {
    for (const date of ['2026-01-15', '2026-07-15', '2026-03-29', '2026-10-25'] as PlainDate[]) {
      for (const time of ['08:00', '12:30', '17:45']) {
        const instant = zonedDateTimeToInstant(date, time, 'Europe/Sarajevo')
        expect(instantToTimeOfDay(instant, 'Europe/Sarajevo')).toBe(time)
        expect(toPlainDateInTimeZone(instant, 'Europe/Sarajevo')).toBe(date)
      }
    }
  })

  it('radi i za ponoć', () => {
    const instant = zonedDateTimeToInstant('2026-05-10', '00:00', 'Europe/Sarajevo')
    expect(instantToTimeOfDay(instant, 'Europe/Sarajevo')).toBe('00:00')
    expect(toPlainDateInTimeZone(instant, 'Europe/Sarajevo')).toBe('2026-05-10')
  })
})

describe('vrijeme u danu', () => {
  it('pretvara u minute i nazad', () => {
    expect(timeOfDayToMinutes('00:00')).toBe(0)
    expect(timeOfDayToMinutes('09:30')).toBe(570)
    expect(timeOfDayToMinutes('23:59')).toBe(1439)
    expect(minutesToTimeOfDay(0)).toBe('00:00')
    expect(minutesToTimeOfDay(570)).toBe('09:30')
    expect(minutesToTimeOfDay(1439)).toBe('23:59')
  })

  it('odbija neispravne vrijednosti', () => {
    expect(() => timeOfDayToMinutes('24:00')).toThrow()
    expect(() => timeOfDayToMinutes('9:30')).toThrow()
    expect(() => timeOfDayToMinutes('09:60')).toThrow()
    expect(() => minutesToTimeOfDay(1440)).toThrow()
    expect(() => minutesToTimeOfDay(-1)).toThrow()
  })
})
