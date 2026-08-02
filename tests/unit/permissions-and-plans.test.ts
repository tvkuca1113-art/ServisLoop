import { describe, expect, it } from 'vitest'
import {
  PermissionDeniedError,
  ROLES,
  assertCan,
  assignableRoles,
  can,
  canAll,
  canAny,
  canEditWorkOrder,
  canViewWorkOrder,
  isRole,
} from '@/domains/auth/permissions'
import {
  FeatureNotInPlanError,
  PlanLimitExceededError,
  assertFeature,
  assertWithinLimit,
  checkLimit,
  evaluateSubscription,
  hasFeature,
  usageOverview,
} from '@/domains/billing/entitlements'
import { PLANS, PUBLIC_PLANS, getPlan, isPlanCode } from '@/domains/billing/plans'
import {
  formatDocumentNumber,
  isDocumentNumber,
  normalizePrefix,
  parseDocumentNumber,
} from '@/domains/shared/document-number'
import {
  estimateRevenue,
  reminderConversionRate,
  calculateRevenueOpportunity,
} from '@/domains/analytics/revenue'

// ---------------------------------------------------------------------------
// Dozvole
// ---------------------------------------------------------------------------

describe('dozvole po ulogama', () => {
  it('vlasnik može sve', () => {
    expect(can('owner', 'organization.delete')).toBe(true)
    expect(can('owner', 'billing.manage')).toBe(true)
    expect(can('owner', 'data.export_all')).toBe(true)
  })

  it('dispečer vodi rad, ali ne dira naplatu ni tim', () => {
    expect(can('dispatcher', 'bookings.manage')).toBe(true)
    expect(can('dispatcher', 'work_orders.assign')).toBe(true)
    expect(can('dispatcher', 'customers.manage')).toBe(true)

    expect(can('dispatcher', 'billing.manage')).toBe(false)
    expect(can('dispatcher', 'organization.delete')).toBe(false)
    expect(can('dispatcher', 'organization.transfer_ownership')).toBe(false)
    expect(can('dispatcher', 'team.invite')).toBe(false)
  })

  it('tehničar vidi samo svoje naloge i ne dira finansije', () => {
    expect(can('technician', 'work_orders.view_assigned')).toBe(true)
    expect(can('technician', 'work_orders.complete')).toBe(true)
    expect(can('technician', 'devices.view_history')).toBe(true)

    expect(can('technician', 'work_orders.view_all')).toBe(false)
    expect(can('technician', 'billing.view')).toBe(false)
    expect(can('technician', 'customers.export')).toBe(false)
    expect(can('technician', 'reports.view_financial')).toBe(false)
    expect(can('technician', 'team.invite')).toBe(false)
  })

  it('canAny i canAll', () => {
    expect(canAny('technician', ['billing.view', 'work_orders.view_assigned'])).toBe(true)
    expect(canAny('technician', ['billing.view', 'billing.manage'])).toBe(false)
    expect(canAll('owner', ['billing.view', 'billing.manage'])).toBe(true)
    expect(canAll('dispatcher', ['bookings.manage', 'billing.manage'])).toBe(false)
  })

  it('assertCan baca jasnu grešku na bosanskom', () => {
    expect(() => assertCan('technician', 'billing.manage')).toThrow(PermissionDeniedError)
    expect(() => assertCan('technician', 'billing.manage')).toThrow(/Tehničar/)
  })

  it('isRole prepoznaje ispravne uloge', () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true)
    expect(isRole('admin')).toBe(false)
    expect(isRole(null)).toBe(false)
  })

  it('samo vlasnik može dodijeliti uloge', () => {
    expect(assignableRoles('owner')).toEqual(['owner', 'dispatcher', 'technician'])
    expect(assignableRoles('dispatcher')).toEqual([])
    expect(assignableRoles('technician')).toEqual([])
  })
})

describe('pristup radnom nalogu', () => {
  it('tehničar vidi samo nalog koji mu je dodijeljen', () => {
    expect(
      canViewWorkOrder('technician', {
        assignedTechnicianId: 'tech-1',
        currentTechnicianId: 'tech-1',
      }),
    ).toBe(true)

    expect(
      canViewWorkOrder('technician', {
        assignedTechnicianId: 'tech-2',
        currentTechnicianId: 'tech-1',
      }),
    ).toBe(false)

    expect(
      canViewWorkOrder('technician', {
        assignedTechnicianId: null,
        currentTechnicianId: 'tech-1',
      }),
    ).toBe(false)
  })

  it('dispečer vidi sve naloge', () => {
    expect(
      canViewWorkOrder('dispatcher', {
        assignedTechnicianId: 'tech-2',
        currentTechnicianId: null,
      }),
    ).toBe(true)
  })

  it('★ zatvoren nalog ne mijenja niko — ni vlasnik', () => {
    for (const role of ROLES) {
      expect(
        canEditWorkOrder(role, {
          assignedTechnicianId: 'tech-1',
          currentTechnicianId: 'tech-1',
          status: 'completed',
        }),
      ).toBe(false)

      expect(
        canEditWorkOrder(role, {
          assignedTechnicianId: 'tech-1',
          currentTechnicianId: 'tech-1',
          status: 'cancelled',
        }),
      ).toBe(false)
    }
  })

  it('tehničar mijenja otvoreni nalog koji je njegov', () => {
    expect(
      canEditWorkOrder('technician', {
        assignedTechnicianId: 'tech-1',
        currentTechnicianId: 'tech-1',
        status: 'in_progress',
      }),
    ).toBe(true)

    expect(
      canEditWorkOrder('technician', {
        assignedTechnicianId: 'tech-2',
        currentTechnicianId: 'tech-1',
        status: 'in_progress',
      }),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Planovi i ograničenja
// ---------------------------------------------------------------------------

describe('definicije planova', () => {
  it('cjenovnik prikazuje samo javne planove, poredane po cijeni', () => {
    expect(PUBLIC_PLANS.map((plan) => plan.code)).toEqual(['trial', 'start', 'growth', 'pro'])
    expect(PUBLIC_PLANS.every((plan) => plan.publiclyListed)).toBe(true)
  })

  it('demo plan nikad ne šalje poruke', () => {
    expect(PLANS.demo.limits.maxMonthlyEmails).toBe(0)
    expect(PLANS.demo.features.emailReminders).toBe(false)
  })

  it('limiti rastu kroz planove', () => {
    const devices = PUBLIC_PLANS.map((plan) => plan.limits.maxActiveDevices ?? Infinity)
    for (let i = 1; i < devices.length; i++) {
      expect(devices[i]!).toBeGreaterThan(devices[i - 1]!)
    }
  })

  it('cijene odgovaraju specifikaciji', () => {
    expect(PLANS.start.monthlyPriceKm).toBe(59)
    expect(PLANS.growth.monthlyPriceKm).toBe(149)
    expect(PLANS.pro.monthlyPriceKm).toBe(299)
    expect(PLANS.trial.trialDays).toBe(30)
  })

  it('getPlan baca za nepoznat plan', () => {
    expect(() => getPlan('enterprise')).toThrow()
    expect(isPlanCode('growth')).toBe(true)
    expect(isPlanCode('enterprise')).toBe(false)
  })
})

describe('provjera limita', () => {
  it('dopušta dok ima mjesta', () => {
    const check = checkLimit({ planCode: 'start', key: 'activeDevices', current: 299 })
    expect(check.allowed).toBe(true)
    expect(check.remaining).toBe(1)
  })

  it('★ blokira prekoračenje i objašnjava zašto', () => {
    const check = checkLimit({ planCode: 'start', key: 'activeDevices', current: 300 })
    expect(check.allowed).toBe(false)
    expect(check.message).toContain('300')
    expect(check.message).toContain('Start')
  })

  it('uzima u obzir veličinu koraka (npr. uvoz 50 uređaja)', () => {
    expect(
      checkLimit({ planCode: 'trial', key: 'activeDevices', current: 10, increment: 40 }).allowed,
    ).toBe(true)
    expect(
      checkLimit({ planCode: 'trial', key: 'activeDevices', current: 10, increment: 41 }).allowed,
    ).toBe(false)
  })

  it('assertWithinLimit baca tipiziranu grešku', () => {
    expect(() => assertWithinLimit({ planCode: 'trial', key: 'technicians', current: 1 })).toThrow(
      PlanLimitExceededError,
    )
  })

  it('računa udio iskorištenosti za prikaz trake', () => {
    const check = checkLimit({
      planCode: 'start',
      key: 'activeDevices',
      current: 150,
      increment: 0,
    })
    expect(check.ratio).toBeCloseTo(0.5)
  })
})

describe('funkcije plana', () => {
  it('napredni izvještaji tek od Growth plana', () => {
    expect(hasFeature('trial', 'advancedReports')).toBe(false)
    expect(hasFeature('start', 'advancedReports')).toBe(false)
    expect(hasFeature('growth', 'advancedReports')).toBe(true)
    expect(hasFeature('pro', 'advancedReports')).toBe(true)
  })

  it('više dispečera samo u Pro planu', () => {
    expect(hasFeature('growth', 'multipleDispatchers')).toBe(false)
    expect(hasFeature('pro', 'multipleDispatchers')).toBe(true)
  })

  it('assertFeature objašnjava šta nedostaje', () => {
    expect(() => assertFeature('start', 'advancedReports')).toThrow(FeatureNotInPlanError)
    expect(() => assertFeature('start', 'advancedReports')).toThrow(/Napredni izvještaji/)
  })
})

describe('stanje pretplate', () => {
  const TODAY = '2026-03-15'

  it('aktivna pretplata radi bez upozorenja', () => {
    const state = evaluateSubscription(
      { planCode: 'growth', status: 'active', trialEndsOn: null, currentPeriodEnd: '2026-04-15' },
      TODAY,
    )
    expect(state.isUsable).toBe(true)
    expect(state.canSendEmails).toBe(true)
    expect(state.banner).toBeNull()
  })

  it('probni period upozorava zadnjih 7 dana', () => {
    const state = evaluateSubscription(
      { planCode: 'trial', status: 'trialing', trialEndsOn: '2026-03-20', currentPeriodEnd: null },
      TODAY,
    )
    expect(state.trialDaysRemaining).toBe(5)
    expect(state.banner?.tone).toBe('warning')
  })

  it('★ istek probnog perioda ne zaključava podatke, samo slanje', () => {
    const state = evaluateSubscription(
      { planCode: 'trial', status: 'trialing', trialEndsOn: '2026-03-01', currentPeriodEnd: null },
      TODAY,
    )
    expect(state.isUsable).toBe(true) // podaci ostaju dostupni
    expect(state.canSendEmails).toBe(false)
    expect(state.banner?.tone).toBe('critical')
  })

  it('★ demo organizacija nikad ne šalje stvarne poruke', () => {
    const state = evaluateSubscription(
      { planCode: 'demo', status: 'active', trialEndsOn: null, currentPeriodEnd: null },
      TODAY,
      true,
    )
    expect(state.canSendEmails).toBe(false)
    expect(state.isUsable).toBe(true)
  })

  it('otkazana pretplata čuva podatke', () => {
    const state = evaluateSubscription(
      { planCode: 'start', status: 'cancelled', trialEndsOn: null, currentPeriodEnd: null },
      TODAY,
    )
    expect(state.isUsable).toBe(true)
    expect(state.canSendEmails).toBe(false)
  })
})

describe('usageOverview', () => {
  it('daje pregled svih limita', () => {
    const overview = usageOverview('start', {
      activeDevices: 120,
      technicians: 2,
      teamMembers: 3,
      emailsSentThisMonth: 400,
    })
    expect(overview).toHaveLength(4)
    expect(overview.find((item) => item.key === 'technicians')?.check.remaining).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Brojevi dokumenata
// ---------------------------------------------------------------------------

describe('brojevi dokumenata', () => {
  it('sastavlja broj s prefiksom, godinom i rednim brojem', () => {
    expect(formatDocumentNumber('service_report', 2027, 412)).toBe('SL-2027-000412')
    expect(formatDocumentNumber('work_order', 2027, 2211)).toBe('RN-2027-02211')
    expect(formatDocumentNumber('booking', 2027, 1)).toBe('RZ-2027-00001')
    expect(formatDocumentNumber('issue_report', 2027, 88)).toBe('PK-2027-00088')
  })

  it('poštuje prefiks organizacije', () => {
    expect(formatDocumentNumber('service_report', 2027, 412, 'TP')).toBe('TP-2027-000412')
  })

  it('normalizuje neispravan prefiks umjesto da padne', () => {
    expect(normalizePrefix('termo plus!')).toBe('TERMO')
    expect(normalizePrefix('---')).toBe('SL')
    expect(normalizePrefix('č')).toBe('SL')
  })

  it('odbija besmislen ulaz', () => {
    expect(() => formatDocumentNumber('service_report', 1999, 1)).toThrow()
    expect(() => formatDocumentNumber('service_report', 2027, 0)).toThrow()
    expect(() => formatDocumentNumber('service_report', 2027, -5)).toThrow()
  })

  it('rastavlja broj natrag', () => {
    expect(parseDocumentNumber('SL-2027-000412')).toEqual({
      prefix: 'SL',
      year: 2027,
      sequence: 412,
    })
    expect(parseDocumentNumber('sl-2027-000412')?.prefix).toBe('SL')
    expect(parseDocumentNumber('neispravno')).toBeNull()
    expect(isDocumentNumber('RN-2027-02211')).toBe(true)
    expect(isDocumentNumber('RN/2027/02211')).toBe(false)
  })

  it('brojevi rastu leksikografski unutar godine', () => {
    const numbers = [1, 2, 10, 99, 100, 412].map((n) =>
      formatDocumentNumber('service_report', 2027, n),
    )
    expect([...numbers].sort()).toEqual(numbers)
  })
})

// ---------------------------------------------------------------------------
// Procjena prihoda
// ---------------------------------------------------------------------------

describe('procjena prihoda', () => {
  it('množi po objavljenoj formuli', () => {
    const result = estimateRevenue({
      deviceCount: 400,
      averageServicePriceKm: 80,
      bookingRate: 0.35,
      servicesPerYear: 1,
    })
    // 400 × 1 × 0,35 = 140 termina; 140 × 80 = 11.200 KM
    expect(result.yearlyAppointments).toBe(140)
    expect(result.yearlyRevenueKm).toBe(11_200)
    expect(result.monthlyRevenueKm).toBe(933)
    expect(result.revenuePerDeviceKm).toBe(28)
  })

  it('zaokružuje broj termina naniže — pola servisa ne postoji', () => {
    const result = estimateRevenue({
      deviceCount: 10,
      averageServicePriceKm: 100,
      bookingRate: 0.35,
      servicesPerYear: 1,
    })
    expect(result.yearlyAppointments).toBe(3)
  })

  it('svodi unos na dopušteni raspon', () => {
    const result = estimateRevenue({
      deviceCount: -50,
      averageServicePriceKm: 99_999,
      bookingRate: 5,
      servicesPerYear: 100,
    })
    expect(result.yearlyAppointments).toBeGreaterThan(0)
    expect(Number.isFinite(result.yearlyRevenueKm)).toBe(true)
  })
})

describe('razlaganje prihoda u aplikaciji', () => {
  it('odvaja potencijalni, rezervisani i završeni prihod', () => {
    const result = calculateRevenueOpportunity({
      dueDevices: [{ servicePriceKm: 70 }, { servicePriceKm: 180 }, { servicePriceKm: null }],
      scheduledServices: [{ priceKm: 140 }],
      completedServices: [{ priceKm: 95 }, { priceKm: 70 }],
      fallbackPriceKm: 80,
    })

    expect(result.potentialKm).toBe(330) // 70 + 180 + 80 (zamjenska)
    expect(result.bookedKm).toBe(140)
    expect(result.completedKm).toBe(165)
    expect(result.devicesWithoutPrice).toBe(1)
    expect(result.counts).toEqual({ due: 3, scheduled: 1, completed: 2 })
  })
})

describe('reminderConversionRate', () => {
  it('vraća null bez poslanih podsjetnika, ne 0 %', () => {
    expect(reminderConversionRate(0, 0)).toBeNull()
  })

  it('računa udio i ograničava ga na 1', () => {
    expect(reminderConversionRate(100, 35)).toBeCloseTo(0.35)
    expect(reminderConversionRate(10, 15)).toBe(1)
  })
})
