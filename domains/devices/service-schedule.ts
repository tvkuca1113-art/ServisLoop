import {
  addMonths,
  comparePlainDates,
  diffInDays,
  isAfter,
  isBefore,
  maxPlainDate,
  type PlainDate,
} from '@/domains/shared/plain-date'

/**
 * Računanje rokova servisa i statusa garancije.
 *
 * Sve je čista, deterministička funkcija. Isti ulaz uvijek daje isti izlaz.
 *
 * ★ Pravilo proizvoda: rok servisa NIKAD ne određuje AI model. ★
 * Datum je poslovna obaveza prema kupcu i mora biti provjerljiv, ponovljiv i
 * objašnjiv. Zato živi ovdje, u funkciji koja ima testove.
 */

export const DEFAULT_SERVICE_INTERVAL_MONTHS = 12
export const MIN_SERVICE_INTERVAL_MONTHS = 1
export const MAX_SERVICE_INTERVAL_MONTHS = 120

export class InvalidServiceIntervalError extends Error {
  constructor(months: number) {
    super(
      `Servisni interval mora biti cijeli broj između ${MIN_SERVICE_INTERVAL_MONTHS} i ` +
        `${MAX_SERVICE_INTERVAL_MONTHS} mjeseci. Dobiveno: ${months}.`,
    )
    this.name = 'InvalidServiceIntervalError'
  }
}

export function assertValidInterval(months: number): void {
  if (
    !Number.isInteger(months) ||
    months < MIN_SERVICE_INTERVAL_MONTHS ||
    months > MAX_SERVICE_INTERVAL_MONTHS
  ) {
    throw new InvalidServiceIntervalError(months)
  }
}

/**
 * Prvi rok servisa nakon ugradnje.
 *
 *   ugrađeno 15.04.2024. + 12 mjeseci → 15.04.2025.
 *
 * Ako je izračunati rok već prošao (npr. uvozi se oprema ugrađena prije tri
 * godine), rok se pomjera naprijed u koracima od jednog intervala dok ne
 * padne u budućnost. Time uvoz stare baze ne stvori stotine „zakašnjelih“
 * servisa od prije nekoliko godina, nego realan raspored unaprijed.
 */
export function firstServiceDateAfterInstall(
  installedAt: PlainDate,
  intervalMonths: number,
  today: PlainDate,
): PlainDate {
  assertValidInterval(intervalMonths)

  let candidate = addMonths(installedAt, intervalMonths)
  // Ograničenje petlje je zaštita od beskonačnog vrtnje kod apsurdnog ulaza.
  let guard = 0
  while (isBefore(candidate, today) && guard < 200) {
    candidate = addMonths(candidate, intervalMonths)
    guard += 1
  }
  return candidate
}

/**
 * Sljedeći rok nakon obavljenog servisa.
 *
 *   servisirano 20.03.2026. + 12 mjeseci → 20.03.2027.
 *
 * Računa se od datuma STVARNO obavljenog servisa, a ne od prethodno planiranog
 * roka. Ako je serviser došao mjesec dana kasnije, sljedeći rok se pomjera za
 * taj mjesec — inače bi kašnjenje trajno „ugrizlo“ u sljedeći ciklus.
 */
export function nextServiceDateAfterService(
  servicedOn: PlainDate,
  intervalMonths: number,
): PlainDate {
  assertValidInterval(intervalMonths)
  return addMonths(servicedOn, intervalMonths)
}

/**
 * Efektivni interval za uređaj.
 * Prioritet: plan uređaja → uređaj → vrsta opreme → postavke organizacije → 12.
 */
export function resolveServiceInterval(sources: {
  devicePlanMonths?: number | null
  deviceMonths?: number | null
  deviceTypeMonths?: number | null
  organizationDefaultMonths?: number | null
}): number {
  const candidates = [
    sources.devicePlanMonths,
    sources.deviceMonths,
    sources.deviceTypeMonths,
    sources.organizationDefaultMonths,
    DEFAULT_SERVICE_INTERVAL_MONTHS,
  ]

  for (const candidate of candidates) {
    if (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= MIN_SERVICE_INTERVAL_MONTHS &&
      candidate <= MAX_SERVICE_INTERVAL_MONTHS
    ) {
      return candidate
    }
  }
  return DEFAULT_SERVICE_INTERVAL_MONTHS
}

// ---------------------------------------------------------------------------
// Status roka
// ---------------------------------------------------------------------------

export type ServiceDueStatus =
  | 'no_schedule' // uređaj nema rok
  | 'scheduled' // rok je daleko
  | 'upcoming' // rok je unutar 30 dana
  | 'due_soon' // rok je unutar 7 dana
  | 'due_today'
  | 'overdue'

export interface ServiceDueInfo {
  status: ServiceDueStatus
  /** Broj dana do roka. Negativno znači kašnjenje. `null` kad roka nema. */
  daysUntilDue: number | null
  isOverdue: boolean
  /** Koliko dana kasni. 0 ako ne kasni. */
  overdueDays: number
}

export const UPCOMING_WINDOW_DAYS = 30
export const DUE_SOON_WINDOW_DAYS = 7

/** Klasifikuje uređaj prema roku servisa. Koristi se u listama i na dashboardu. */
export function evaluateServiceDue(
  nextServiceDate: PlainDate | null | undefined,
  today: PlainDate,
): ServiceDueInfo {
  if (!nextServiceDate) {
    return { status: 'no_schedule', daysUntilDue: null, isOverdue: false, overdueDays: 0 }
  }

  const daysUntilDue = diffInDays(today, nextServiceDate)

  if (daysUntilDue < 0) {
    return {
      status: 'overdue',
      daysUntilDue,
      isOverdue: true,
      overdueDays: Math.abs(daysUntilDue),
    }
  }
  if (daysUntilDue === 0) {
    return { status: 'due_today', daysUntilDue, isOverdue: false, overdueDays: 0 }
  }
  if (daysUntilDue <= DUE_SOON_WINDOW_DAYS) {
    return { status: 'due_soon', daysUntilDue, isOverdue: false, overdueDays: 0 }
  }
  if (daysUntilDue <= UPCOMING_WINDOW_DAYS) {
    return { status: 'upcoming', daysUntilDue, isOverdue: false, overdueDays: 0 }
  }
  return { status: 'scheduled', daysUntilDue, isOverdue: false, overdueDays: 0 }
}

/** Bosanski naziv statusa — koristi se u tabelama i izvještajima. */
export const SERVICE_DUE_LABELS: Record<ServiceDueStatus, string> = {
  no_schedule: 'Bez roka',
  scheduled: 'Zakazano',
  upcoming: 'Uskoro',
  due_soon: 'Uskoro dospijeva',
  due_today: 'Dospijeva danas',
  overdue: 'Kasni',
}

// ---------------------------------------------------------------------------
// Garancija
// ---------------------------------------------------------------------------

export type WarrantyStatus = 'unknown' | 'active' | 'expiring' | 'expired' | 'not_started'

export interface WarrantyInfo {
  status: WarrantyStatus
  daysRemaining: number | null
  isActive: boolean
}

export const WARRANTY_EXPIRING_WINDOW_DAYS = 60

/**
 * Status garancije na zadani dan.
 *
 * Garancija je pravna obaveza prema kupcu — status se računa strogo iz datuma,
 * bez ikakve procjene. Kad datum nije poznat, status je `unknown`, nikad
 * pretpostavljeno „aktivna“.
 */
export function evaluateWarranty(
  warrantyStart: PlainDate | null | undefined,
  warrantyEnd: PlainDate | null | undefined,
  today: PlainDate,
): WarrantyInfo {
  if (!warrantyEnd) {
    return { status: 'unknown', daysRemaining: null, isActive: false }
  }

  if (warrantyStart && isBefore(today, warrantyStart)) {
    return {
      status: 'not_started',
      daysRemaining: diffInDays(today, warrantyEnd),
      isActive: false,
    }
  }

  const daysRemaining = diffInDays(today, warrantyEnd)

  if (daysRemaining < 0) {
    return { status: 'expired', daysRemaining, isActive: false }
  }
  if (daysRemaining <= WARRANTY_EXPIRING_WINDOW_DAYS) {
    return { status: 'expiring', daysRemaining, isActive: true }
  }
  return { status: 'active', daysRemaining, isActive: true }
}

export const WARRANTY_LABELS: Record<WarrantyStatus, string> = {
  unknown: 'Nepoznato',
  active: 'Garancija aktivna',
  expiring: 'Garancija uskoro ističe',
  expired: 'Garancija istekla',
  not_started: 'Garancija još nije počela',
}

// ---------------------------------------------------------------------------
// Zatvaranje servisnog kruga
// ---------------------------------------------------------------------------

export interface ServiceCycleInput {
  /** Datum kada je servis stvarno obavljen. */
  servicedOn: PlainDate
  intervalMonths: number
  /** Prethodni rok — koristi se samo za zapis, ne za računanje. */
  previousNextServiceDate?: PlainDate | null
  /** Ručno postavljen rok koji ima prednost nad izračunatim. */
  manualOverride?: { date: PlainDate; reason: string } | null
}

export interface ServiceCycleResult {
  nextServiceDate: PlainDate
  lastServiceDate: PlainDate
  intervalMonths: number
  /** Je li rok postavljen ručno umjesto izračunat. */
  wasOverridden: boolean
  overrideReason: string | null
  /** Objašnjenje računa, za revizijski dnevnik i za korisnika. */
  explanation: string
}

export class InvalidOverrideError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidOverrideError'
  }
}

/**
 * Zatvara servisni krug: iz obavljenog servisa pravi sljedeći rok.
 *
 * Ovo je tačka u kojoj se petlja zatvara i sama pokreće iznova — poslovna
 * srž cijelog proizvoda.
 */
export function closeServiceCycle(input: ServiceCycleInput): ServiceCycleResult {
  assertValidInterval(input.intervalMonths)

  const computed = nextServiceDateAfterService(input.servicedOn, input.intervalMonths)

  if (input.manualOverride) {
    const { date, reason } = input.manualOverride

    if (reason.trim().length < 3) {
      throw new InvalidOverrideError(
        'Ručna izmjena roka servisa zahtijeva razlog od najmanje 3 znaka. ' +
          'Razlog se upisuje u revizijski dnevnik.',
      )
    }
    if (!isAfter(date, input.servicedOn)) {
      throw new InvalidOverrideError(
        'Sljedeći servis mora biti nakon datuma obavljenog servisa.',
      )
    }

    return {
      nextServiceDate: date,
      lastServiceDate: input.servicedOn,
      intervalMonths: input.intervalMonths,
      wasOverridden: true,
      overrideReason: reason.trim(),
      explanation:
        `Rok je postavljen ručno na ${date} (izračunato bi bilo ${computed}). ` +
        `Razlog: ${reason.trim()}`,
    }
  }

  return {
    nextServiceDate: computed,
    lastServiceDate: input.servicedOn,
    intervalMonths: input.intervalMonths,
    wasOverridden: false,
    overrideReason: null,
    explanation:
      `${input.servicedOn} + ${input.intervalMonths} mjeseci = ${computed} ` +
      `(interval uređaja).`,
  }
}

/**
 * Rok za uređaj koji ga još nema — koristi se pri uvozu i pri ručnom unosu.
 *
 * Redoslijed pokušaja:
 *   1. zadnji servis + interval;
 *   2. datum ugradnje + interval (pomjeren u budućnost ako je prošao);
 *   3. danas + interval, kad nema nijednog datuma.
 */
export function deriveInitialServiceDate(input: {
  lastServiceDate?: PlainDate | null
  installedAt?: PlainDate | null
  intervalMonths: number
  today: PlainDate
}): { nextServiceDate: PlainDate; basis: 'last_service' | 'installation' | 'today' } {
  assertValidInterval(input.intervalMonths)

  if (input.lastServiceDate) {
    const fromLast = addMonths(input.lastServiceDate, input.intervalMonths)
    return {
      nextServiceDate: maxPlainDate(fromLast, input.today),
      basis: 'last_service',
    }
  }

  if (input.installedAt) {
    return {
      nextServiceDate: firstServiceDateAfterInstall(
        input.installedAt,
        input.intervalMonths,
        input.today,
      ),
      basis: 'installation',
    }
  }

  return {
    nextServiceDate: addMonths(input.today, input.intervalMonths),
    basis: 'today',
  }
}

/** Sortiranje uređaja po hitnosti: prvo oni koji kasne, pa oni koji dospijevaju. */
export function compareByUrgency(
  a: { nextServiceDate: PlainDate | null },
  b: { nextServiceDate: PlainDate | null },
): number {
  if (!a.nextServiceDate && !b.nextServiceDate) return 0
  // Uređaji bez roka idu na kraj — nisu hitni, ali traže pažnju drugdje.
  if (!a.nextServiceDate) return 1
  if (!b.nextServiceDate) return -1
  return comparePlainDates(a.nextServiceDate, b.nextServiceDate)
}
