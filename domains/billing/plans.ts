/**
 * Definicije planova i prava korištenja.
 *
 * Ovo je JEDAN izvor istine — koriste ga i marketing stranica s cjenovnikom i
 * provjera ograničenja u aplikaciji. Time je nemoguće da cjenovnik obećava
 * 300 uređaja, a sistem dopušta 200.
 *
 * Cijene su u KM (BAM) mjesečno, bez PDV-a. Naplata karticom NIJE implementirana
 * u MVP-u — pretplata se u ovoj fazi postavlja ručno (vidi `docs/KNOWN_LIMITATIONS.md`).
 */

export const PLAN_CODES = ['demo', 'trial', 'start', 'growth', 'pro'] as const
export type PlanCode = (typeof PLAN_CODES)[number]

export interface PlanLimits {
  /** Maksimalan broj aktivnih uređaja. `null` = bez ograničenja. */
  maxActiveDevices: number | null
  /** Maksimalan broj tehničara. */
  maxTechnicians: number | null
  /** Maksimalan broj članova tima (svih uloga). */
  maxTeamMembers: number | null
  /** Maksimalan broj redova po jednom uvozu. */
  maxImportRows: number
  /** Maksimalan broj e-poruka mjesečno. */
  maxMonthlyEmails: number | null
}

export interface PlanFeatures {
  emailReminders: boolean
  qrPages: boolean
  qrLabelSheets: boolean
  workOrders: boolean
  pdfReports: boolean
  /** Napredni izvještaji: konverzija podsjetnik → rezervacija, aktivnost tehničara. */
  advancedReports: boolean
  /** Vlastiti tekstovi podsjetnika umjesto zadanih. */
  customReminderTemplates: boolean
  /** Izvoz svih podataka u CSV. */
  dataExport: boolean
  /** Više dispečera istovremeno. */
  multipleDispatchers: boolean
  /** Opcione AI pomoćne funkcije (rade samo ako je ključ postavljen). */
  aiAssist: boolean
}

export interface PlanDefinition {
  code: PlanCode
  name: string
  /** Kratak opis za koga je plan. */
  tagline: string
  /** Mjesečna cijena u KM. `null` znači da se ne prodaje javno. */
  monthlyPriceKm: number | null
  /** Trajanje probnog perioda u danima (0 = nema). */
  trialDays: number
  limits: PlanLimits
  features: PlanFeatures
  /** Stavke koje se prikazuju na cjenovniku. */
  highlights: string[]
  /** Da li se plan prikazuje na javnom cjenovniku. */
  publiclyListed: boolean
  /** Vizuelno istaknut plan. */
  recommended: boolean
}

const NO_FEATURES: PlanFeatures = {
  emailReminders: false,
  qrPages: false,
  qrLabelSheets: false,
  workOrders: false,
  pdfReports: false,
  advancedReports: false,
  customReminderTemplates: false,
  dataExport: false,
  multipleDispatchers: false,
  aiAssist: false,
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  demo: {
    code: 'demo',
    name: 'Demo',
    tagline: 'Pogledajte kako sistem radi na pripremljenim podacima.',
    monthlyPriceKm: null,
    trialDays: 0,
    limits: {
      maxActiveDevices: 200,
      maxTechnicians: 4,
      maxTeamMembers: 6,
      maxImportRows: 200,
      maxMonthlyEmails: 0, // Demo NIKAD ne šalje stvarne poruke.
    },
    features: {
      ...NO_FEATURES,
      qrPages: true,
      workOrders: true,
      pdfReports: true,
      advancedReports: true,
    },
    highlights: [
      'Popunjena demo firma s uređajima i servisima',
      'Podsjetnici se prikazuju, ali se ne šalju',
      'Podaci se mogu vratiti na početno stanje',
    ],
    publiclyListed: false,
    recommended: false,
  },

  trial: {
    code: 'trial',
    name: 'Probni period',
    tagline: '30 dana da provjerite vraća li vam se servis sam.',
    monthlyPriceKm: 0,
    trialDays: 30,
    limits: {
      maxActiveDevices: 50,
      maxTechnicians: 1,
      maxTeamMembers: 3,
      maxImportRows: 500,
      maxMonthlyEmails: 300,
    },
    features: {
      ...NO_FEATURES,
      emailReminders: true,
      qrPages: true,
      workOrders: true,
      pdfReports: true,
    },
    highlights: [
      '50 aktivnih uređaja',
      '1 tehničar',
      'Podsjetnici e-poštom',
      'Javne stranice uređaja i QR kodovi',
      'Osnovni radni nalozi',
    ],
    publiclyListed: true,
    recommended: false,
  },

  start: {
    code: 'start',
    name: 'Start',
    tagline: 'Za firmu koja vodi servis za nekoliko stotina uređaja.',
    monthlyPriceKm: 59,
    trialDays: 0,
    limits: {
      maxActiveDevices: 300,
      maxTechnicians: 2,
      maxTeamMembers: 5,
      maxImportRows: 2000,
      maxMonthlyEmails: 2000,
    },
    features: {
      ...NO_FEATURES,
      emailReminders: true,
      qrPages: true,
      qrLabelSheets: true,
      workOrders: true,
      pdfReports: true,
      dataExport: true,
    },
    highlights: [
      'Do 300 aktivnih uređaja',
      '2 tehničara',
      'Podsjetnici e-poštom',
      'QR naljepnice za štampu',
      'PDF servisni izvještaji',
      'Izvoz podataka u CSV',
    ],
    publiclyListed: true,
    recommended: false,
  },

  growth: {
    code: 'growth',
    name: 'Growth',
    tagline: 'Za firmu s više tehničara i redovnim ugovorima o održavanju.',
    monthlyPriceKm: 149,
    trialDays: 0,
    limits: {
      maxActiveDevices: 1500,
      maxTechnicians: 5,
      maxTeamMembers: 12,
      maxImportRows: 10_000,
      maxMonthlyEmails: 10_000,
    },
    features: {
      ...NO_FEATURES,
      emailReminders: true,
      qrPages: true,
      qrLabelSheets: true,
      workOrders: true,
      pdfReports: true,
      advancedReports: true,
      customReminderTemplates: true,
      dataExport: true,
      aiAssist: true,
    },
    highlights: [
      'Do 1.500 aktivnih uređaja',
      '5 tehničara',
      'Napredni izvještaji i konverzija podsjetnika',
      'Vlastiti tekstovi podsjetnika',
      'Sve iz plana Start',
    ],
    publiclyListed: true,
    recommended: true,
  },

  pro: {
    code: 'pro',
    name: 'Pro',
    tagline: 'Za servisne kuće s velikom instaliranom bazom.',
    monthlyPriceKm: 299,
    trialDays: 0,
    limits: {
      maxActiveDevices: 5000,
      maxTechnicians: 15,
      maxTeamMembers: 30,
      maxImportRows: 25_000,
      maxMonthlyEmails: 40_000,
    },
    features: {
      emailReminders: true,
      qrPages: true,
      qrLabelSheets: true,
      workOrders: true,
      pdfReports: true,
      advancedReports: true,
      customReminderTemplates: true,
      dataExport: true,
      multipleDispatchers: true,
      aiAssist: true,
    },
    highlights: [
      'Do 5.000 aktivnih uređaja',
      '15 tehničara',
      'Više dispečera istovremeno',
      'Napredni izvoz podataka',
      'Sve iz plana Growth',
    ],
    publiclyListed: true,
    recommended: false,
  },
}

/** Planovi koji se prikazuju na javnom cjenovniku, poredani po cijeni. */
export const PUBLIC_PLANS: PlanDefinition[] = PLAN_CODES.map((code) => PLANS[code])
  .filter((plan) => plan.publiclyListed)
  .sort((a, b) => (a.monthlyPriceKm ?? 0) - (b.monthlyPriceKm ?? 0))

export function getPlan(code: string): PlanDefinition {
  const plan = PLANS[code as PlanCode]
  if (!plan) throw new Error(`Nepoznat plan: "${code}"`)
  return plan
}

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value)
}
