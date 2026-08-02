import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SERVICE_INTERVAL_MONTHS,
  InvalidOverrideError,
  InvalidServiceIntervalError,
  closeServiceCycle,
  compareByUrgency,
  deriveInitialServiceDate,
  evaluateServiceDue,
  evaluateWarranty,
  firstServiceDateAfterInstall,
  nextServiceDateAfterService,
  resolveServiceInterval,
} from '@/domains/devices/service-schedule'

const TODAY = '2026-03-15'

describe('firstServiceDateAfterInstall', () => {
  it('dodaje interval na datum ugradnje', () => {
    expect(firstServiceDateAfterInstall('2026-01-15', 12, '2026-01-20')).toBe('2027-01-15')
    expect(firstServiceDateAfterInstall('2026-01-15', 6, '2026-01-20')).toBe('2026-07-15')
  })

  it('pomjera rok u budućnost za staru opremu iz uvoza', () => {
    // Uređaj ugrađen 2020. s godišnjim intervalom ne smije napraviti
    // šest „zakašnjelih“ servisa unazad.
    const result = firstServiceDateAfterInstall('2020-04-10', 12, TODAY)
    expect(result).toBe('2026-04-10')
  })

  it('poštuje pravilo kraja mjeseca', () => {
    expect(firstServiceDateAfterInstall('2026-01-31', 1, '2026-02-01')).toBe('2026-02-28')
  })

  it('odbija neispravan interval', () => {
    expect(() => firstServiceDateAfterInstall('2026-01-15', 0, TODAY)).toThrow(
      InvalidServiceIntervalError,
    )
    expect(() => firstServiceDateAfterInstall('2026-01-15', 121, TODAY)).toThrow()
    expect(() => firstServiceDateAfterInstall('2026-01-15', 6.5, TODAY)).toThrow()
  })
})

describe('nextServiceDateAfterService', () => {
  it('računa od stvarnog datuma servisa, ne od planiranog roka', () => {
    // Rok je bio 01.03., serviser došao 20.03. — sljedeći rok se pomjera.
    expect(nextServiceDateAfterService('2026-03-20', 12)).toBe('2027-03-20')
  })

  it('poštuje pravilo kraja mjeseca', () => {
    expect(nextServiceDateAfterService('2026-08-31', 6)).toBe('2027-02-28')
  })
})

describe('resolveServiceInterval', () => {
  it('poštuje redoslijed prioriteta', () => {
    expect(
      resolveServiceInterval({
        devicePlanMonths: 3,
        deviceMonths: 6,
        deviceTypeMonths: 12,
        organizationDefaultMonths: 24,
      }),
    ).toBe(3)

    expect(
      resolveServiceInterval({
        devicePlanMonths: null,
        deviceMonths: 6,
        deviceTypeMonths: 12,
      }),
    ).toBe(6)

    expect(resolveServiceInterval({ deviceTypeMonths: 12 })).toBe(12)
    expect(resolveServiceInterval({})).toBe(DEFAULT_SERVICE_INTERVAL_MONTHS)
  })

  it('preskače neispravne vrijednosti umjesto da padne', () => {
    expect(resolveServiceInterval({ devicePlanMonths: 0, deviceMonths: 12 })).toBe(12)
    expect(resolveServiceInterval({ devicePlanMonths: 999, deviceMonths: 6 })).toBe(6)
    expect(resolveServiceInterval({ devicePlanMonths: 4.5, deviceMonths: 6 })).toBe(6)
  })
})

describe('evaluateServiceDue', () => {
  it('prepoznaje uređaj bez roka', () => {
    const result = evaluateServiceDue(null, TODAY)
    expect(result.status).toBe('no_schedule')
    expect(result.daysUntilDue).toBeNull()
    expect(result.isOverdue).toBe(false)
  })

  it('klasifikuje po blizini roka', () => {
    expect(evaluateServiceDue('2026-03-15', TODAY).status).toBe('due_today')
    expect(evaluateServiceDue('2026-03-18', TODAY).status).toBe('due_soon')
    expect(evaluateServiceDue('2026-03-22', TODAY).status).toBe('due_soon')
    expect(evaluateServiceDue('2026-03-23', TODAY).status).toBe('upcoming')
    expect(evaluateServiceDue('2026-04-14', TODAY).status).toBe('upcoming')
    expect(evaluateServiceDue('2026-04-16', TODAY).status).toBe('scheduled')
  })

  it('računa kašnjenje', () => {
    const result = evaluateServiceDue('2026-03-01', TODAY)
    expect(result.status).toBe('overdue')
    expect(result.isOverdue).toBe(true)
    expect(result.overdueDays).toBe(14)
    expect(result.daysUntilDue).toBe(-14)
  })
})

describe('evaluateWarranty', () => {
  it('bez datuma isteka status je nepoznat, nikad "aktivna"', () => {
    const result = evaluateWarranty(null, null, TODAY)
    expect(result.status).toBe('unknown')
    expect(result.isActive).toBe(false)
  })

  it('prepoznaje aktivnu, isteklu i onu koja uskoro ističe', () => {
    expect(evaluateWarranty('2024-01-01', '2029-01-01', TODAY).status).toBe('active')
    expect(evaluateWarranty('2024-01-01', '2026-01-01', TODAY).status).toBe('expired')
    expect(evaluateWarranty('2024-01-01', '2026-04-20', TODAY).status).toBe('expiring')
  })

  it('prepoznaje garanciju koja još nije počela', () => {
    const result = evaluateWarranty('2026-06-01', '2031-06-01', TODAY)
    expect(result.status).toBe('not_started')
    expect(result.isActive).toBe(false)
  })

  it('na sam dan isteka garancija je još aktivna', () => {
    const result = evaluateWarranty('2024-01-01', TODAY, TODAY)
    expect(result.isActive).toBe(true)
    expect(result.daysRemaining).toBe(0)
  })
})

describe('closeServiceCycle', () => {
  it('zatvara krug i otvara sljedeći', () => {
    const result = closeServiceCycle({ servicedOn: '2026-03-20', intervalMonths: 12 })

    expect(result.nextServiceDate).toBe('2027-03-20')
    expect(result.lastServiceDate).toBe('2026-03-20')
    expect(result.wasOverridden).toBe(false)
    expect(result.overrideReason).toBeNull()
    expect(result.explanation).toContain('12 mjeseci')
  })

  it('prihvata ručnu izmjenu uz razlog', () => {
    const result = closeServiceCycle({
      servicedOn: '2026-03-20',
      intervalMonths: 12,
      manualOverride: { date: '2026-09-20', reason: 'Kupac traži servis dva puta godišnje' },
    })

    expect(result.nextServiceDate).toBe('2026-09-20')
    expect(result.wasOverridden).toBe(true)
    expect(result.overrideReason).toBe('Kupac traži servis dva puta godišnje')
    // Objašnjenje mora sadržati i izračunatu vrijednost, za revizijski dnevnik.
    expect(result.explanation).toContain('2027-03-20')
  })

  it('odbija ručnu izmjenu bez razloga', () => {
    expect(() =>
      closeServiceCycle({
        servicedOn: '2026-03-20',
        intervalMonths: 12,
        manualOverride: { date: '2026-09-20', reason: 'x' },
      }),
    ).toThrow(InvalidOverrideError)
  })

  it('odbija rok koji nije nakon datuma servisa', () => {
    expect(() =>
      closeServiceCycle({
        servicedOn: '2026-03-20',
        intervalMonths: 12,
        manualOverride: { date: '2026-03-10', reason: 'Pogrešan unos' },
      }),
    ).toThrow(InvalidOverrideError)

    expect(() =>
      closeServiceCycle({
        servicedOn: '2026-03-20',
        intervalMonths: 12,
        manualOverride: { date: '2026-03-20', reason: 'Isti dan' },
      }),
    ).toThrow(InvalidOverrideError)
  })
})

describe('deriveInitialServiceDate', () => {
  it('najprije koristi zadnji servis', () => {
    const result = deriveInitialServiceDate({
      lastServiceDate: '2025-06-10',
      installedAt: '2020-01-01',
      intervalMonths: 12,
      today: TODAY,
    })
    expect(result.basis).toBe('last_service')
    expect(result.nextServiceDate).toBe('2026-06-10')
  })

  it('rok iz zadnjeg servisa nikad ne pada u prošlost', () => {
    const result = deriveInitialServiceDate({
      lastServiceDate: '2020-06-10',
      intervalMonths: 12,
      today: TODAY,
    })
    expect(result.nextServiceDate).toBe(TODAY)
  })

  it('pada natrag na datum ugradnje', () => {
    const result = deriveInitialServiceDate({
      installedAt: '2024-05-20',
      intervalMonths: 12,
      today: TODAY,
    })
    expect(result.basis).toBe('installation')
    expect(result.nextServiceDate).toBe('2026-05-20')
  })

  it('kad nema nijednog datuma, računa od danas', () => {
    const result = deriveInitialServiceDate({ intervalMonths: 6, today: TODAY })
    expect(result.basis).toBe('today')
    expect(result.nextServiceDate).toBe('2026-09-15')
  })
})

describe('compareByUrgency', () => {
  it('najhitniji su prvi, uređaji bez roka na kraju', () => {
    const devices = [
      { nextServiceDate: '2026-05-01' },
      { nextServiceDate: null },
      { nextServiceDate: '2026-02-01' },
      { nextServiceDate: '2026-03-20' },
    ]
    const sorted = [...devices].sort(compareByUrgency)
    expect(sorted.map((device) => device.nextServiceDate)).toEqual([
      '2026-02-01',
      '2026-03-20',
      '2026-05-01',
      null,
    ])
  })
})
