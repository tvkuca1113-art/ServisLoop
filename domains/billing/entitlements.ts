import { diffInDays, type PlainDate } from '@/domains/shared/plain-date'
import { getPlan, type PlanCode, type PlanDefinition, type PlanFeatures } from './plans'

/**
 * Provjera prava korištenja i ograničenja plana.
 *
 * Provjera se radi na SERVERU prije svake radnje koja troši kvotu (novi uređaj,
 * novi tehničar, uvoz, slanje poruke). Sučelje limit prikazuje unaprijed, ali
 * odluka je uvijek serverska.
 *
 * Ton poruka je namjerno prijateljski: korisnik koji je udario u limit je
 * korisnik koji proizvod koristi. Poruka mu kaže šta je limit, gdje je sada i
 * šta može uraditi.
 */

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended'

export interface Subscription {
  planCode: PlanCode
  status: SubscriptionStatus
  trialEndsOn: PlainDate | null
  currentPeriodEnd: PlainDate | null
}

export interface UsageSnapshot {
  activeDevices: number
  technicians: number
  teamMembers: number
  emailsSentThisMonth: number
}

export type LimitKey = 'activeDevices' | 'technicians' | 'teamMembers' | 'importRows' | 'monthlyEmails'

export interface LimitCheck {
  allowed: boolean
  limit: number | null
  current: number
  remaining: number | null
  /** Udio iskorištenosti 0–1. `null` kad limita nema. */
  ratio: number | null
  message: string | null
}

const LIMIT_LABELS: Record<LimitKey, { singular: string; plural: string }> = {
  activeDevices: { singular: 'aktivan uređaj', plural: 'aktivnih uređaja' },
  technicians: { singular: 'tehničar', plural: 'tehničara' },
  teamMembers: { singular: 'član tima', plural: 'članova tima' },
  importRows: { singular: 'red po uvozu', plural: 'redova po uvozu' },
  monthlyEmails: { singular: 'poruka mjesečno', plural: 'poruka mjesečno' },
}

function limitValue(plan: PlanDefinition, key: LimitKey): number | null {
  switch (key) {
    case 'activeDevices':
      return plan.limits.maxActiveDevices
    case 'technicians':
      return plan.limits.maxTechnicians
    case 'teamMembers':
      return plan.limits.maxTeamMembers
    case 'importRows':
      return plan.limits.maxImportRows
    case 'monthlyEmails':
      return plan.limits.maxMonthlyEmails
  }
}

/**
 * Provjerava smije li se dodati `increment` novih jedinica.
 *
 * Vraća objekat umjesto da baca grešku, jer isti rezultat treba i sučelju
 * (za prikaz trake iskorištenosti) i serveru (za odluku).
 */
export function checkLimit(input: {
  planCode: PlanCode
  key: LimitKey
  current: number
  increment?: number
}): LimitCheck {
  const plan = getPlan(input.planCode)
  const limit = limitValue(plan, input.key)
  const increment = input.increment ?? 1
  const label = LIMIT_LABELS[input.key]

  if (limit === null) {
    return {
      allowed: true,
      limit: null,
      current: input.current,
      remaining: null,
      ratio: null,
      message: null,
    }
  }

  const wouldBe = input.current + increment
  const remaining = Math.max(0, limit - input.current)
  const ratio = limit > 0 ? Math.min(1, input.current / limit) : 1

  if (wouldBe > limit) {
    return {
      allowed: false,
      limit,
      current: input.current,
      remaining,
      ratio,
      message:
        `Plan ${plan.name} dopušta ${limit} ${label.plural}. ` +
        `Trenutno ih imate ${input.current}. ` +
        `Za nastavak povećajte plan ili oslobodite mjesto.`,
    }
  }

  return {
    allowed: true,
    limit,
    current: input.current,
    remaining,
    ratio,
    message: null,
  }
}

export class PlanLimitExceededError extends Error {
  readonly check: LimitCheck
  readonly key: LimitKey

  constructor(key: LimitKey, check: LimitCheck) {
    super(check.message ?? 'Dosegnut je limit plana.')
    this.name = 'PlanLimitExceededError'
    this.key = key
    this.check = check
  }
}

export function assertWithinLimit(input: {
  planCode: PlanCode
  key: LimitKey
  current: number
  increment?: number
}): void {
  const check = checkLimit(input)
  if (!check.allowed) throw new PlanLimitExceededError(input.key, check)
}

// ---------------------------------------------------------------------------
// Funkcije plana
// ---------------------------------------------------------------------------

export function hasFeature(planCode: PlanCode, feature: keyof PlanFeatures): boolean {
  return getPlan(planCode).features[feature]
}

export class FeatureNotInPlanError extends Error {
  constructor(planCode: PlanCode, feature: keyof PlanFeatures, featureLabel: string) {
    super(
      `Funkcija „${featureLabel}“ nije dostupna u planu ${getPlan(planCode).name}. ` +
        `Nadogradite plan da biste je koristili.`,
    )
    this.name = 'FeatureNotInPlanError'
  }
}

const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  emailReminders: 'Podsjetnici e-poštom',
  qrPages: 'Javne stranice uređaja',
  qrLabelSheets: 'QR naljepnice za štampu',
  workOrders: 'Radni nalozi',
  pdfReports: 'PDF servisni izvještaji',
  advancedReports: 'Napredni izvještaji',
  customReminderTemplates: 'Vlastiti tekstovi podsjetnika',
  dataExport: 'Izvoz podataka',
  multipleDispatchers: 'Više dispečera',
  aiAssist: 'AI pomoć pri pisanju',
}

export function assertFeature(planCode: PlanCode, feature: keyof PlanFeatures): void {
  if (!hasFeature(planCode, feature)) {
    throw new FeatureNotInPlanError(planCode, feature, FEATURE_LABELS[feature])
  }
}

// ---------------------------------------------------------------------------
// Stanje pretplate
// ---------------------------------------------------------------------------

export interface SubscriptionState {
  /** Smije li organizacija uopšte koristiti aplikaciju. */
  isUsable: boolean
  /** Smiju li se slati stvarne poruke kupcima. */
  canSendEmails: boolean
  isTrial: boolean
  trialDaysRemaining: number | null
  /** Poruka koja se prikazuje kao traka na vrhu aplikacije. */
  banner: { tone: 'info' | 'warning' | 'critical'; text: string } | null
}

/**
 * Ocjenjuje stanje pretplate na zadani dan.
 *
 * Važna odluka proizvoda: istek probnog perioda NE briše podatke i NE zaključava
 * čitanje. Firma i dalje vidi svoje kupce i uređaje. Prestaje samo automatsko
 * slanje poruka. Podaci o kupcima nikad nisu talac naplate.
 */
export function evaluateSubscription(
  subscription: Subscription,
  today: PlainDate,
  isDemo = false,
): SubscriptionState {
  if (isDemo) {
    return {
      isUsable: true,
      // Demo organizacija NIKAD ne šalje stvarne poruke.
      canSendEmails: false,
      isTrial: false,
      trialDaysRemaining: null,
      banner: {
        tone: 'info',
        text: 'Demo okruženje. Podsjetnici se prikazuju, ali se ne šalju stvarnim primaocima.',
      },
    }
  }

  switch (subscription.status) {
    case 'active':
      return {
        isUsable: true,
        canSendEmails: true,
        isTrial: false,
        trialDaysRemaining: null,
        banner: null,
      }

    case 'trialing': {
      const daysRemaining = subscription.trialEndsOn
        ? diffInDays(today, subscription.trialEndsOn)
        : null

      if (daysRemaining !== null && daysRemaining < 0) {
        return {
          isUsable: true,
          canSendEmails: false,
          isTrial: true,
          trialDaysRemaining: 0,
          banner: {
            tone: 'critical',
            text:
              'Probni period je istekao. Vaši podaci su sačuvani i dostupni, ' +
              'ali automatsko slanje podsjetnika je zaustavljeno.',
          },
        }
      }

      return {
        isUsable: true,
        canSendEmails: true,
        isTrial: true,
        trialDaysRemaining: daysRemaining,
        banner:
          daysRemaining !== null && daysRemaining <= 7
            ? {
                tone: 'warning',
                text:
                  daysRemaining === 0
                    ? 'Probni period ističe danas.'
                    : `Probni period ističe za ${daysRemaining} ${
                        daysRemaining === 1 ? 'dan' : 'dana'
                      }.`,
              }
            : null,
      }
    }

    case 'past_due':
      return {
        isUsable: true,
        canSendEmails: true,
        isTrial: false,
        trialDaysRemaining: null,
        banner: {
          tone: 'warning',
          text: 'Pretplata nije podmirena. Molimo kontaktirajte nas da nastavimo bez prekida.',
        },
      }

    case 'cancelled':
    case 'suspended':
      return {
        isUsable: true,
        canSendEmails: false,
        isTrial: false,
        trialDaysRemaining: null,
        banner: {
          tone: 'critical',
          text:
            'Pretplata je neaktivna. Podaci su sačuvani i možete ih izvesti, ' +
            'ali slanje podsjetnika je zaustavljeno.',
        },
      }
  }
}

/** Pregled iskorištenosti svih limita — za stranicu pretplate. */
export function usageOverview(
  planCode: PlanCode,
  usage: UsageSnapshot,
): Array<{ key: LimitKey; label: string; check: LimitCheck }> {
  const entries: Array<[LimitKey, string, number]> = [
    ['activeDevices', 'Aktivni uređaji', usage.activeDevices],
    ['technicians', 'Tehničari', usage.technicians],
    ['teamMembers', 'Članovi tima', usage.teamMembers],
    ['monthlyEmails', 'Poruke ovaj mjesec', usage.emailsSentThisMonth],
  ]

  return entries.map(([key, label, current]) => ({
    key,
    label,
    check: checkLimit({ planCode, key, current, increment: 0 }),
  }))
}
