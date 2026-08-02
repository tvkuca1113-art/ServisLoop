import {
  addDays,
  diffInDays,
  isPlainDate,
  plainDateParts,
  type PlainDate,
} from '@/domains/shared/plain-date'

/**
 * Formatiranje za bosansko tržište.
 *
 * Pravila kroz cijelu aplikaciju:
 *   • datum        → DD.MM.YYYY
 *   • vrijeme      → HH:mm (24-satni sat)
 *   • valuta       → 1.250,00 KM  (tačka = hiljade, zarez = decimale)
 *   • brojevi      → 1.250,5
 *
 * Namjerno NE koristimo `toLocaleDateString('bs-BA')` jer se rezultat razlikuje
 * između Node verzija i preglednika (negdje "15. 3. 2026.", negdje "15.03.2026").
 * Nedosljedan datum u servisnom izvještaju izgleda neprofesionalno.
 */

export const DEFAULT_TIME_ZONE = 'Europe/Sarajevo'
export const DEFAULT_CURRENCY = 'BAM'
export const CURRENCY_SUFFIX = 'KM'

// ---------------------------------------------------------------------------
// Datumi
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' → '15.03.2026'. Prazan ulaz daje crticu. */
export function formatDate(date: PlainDate | null | undefined): string {
  if (!date || !isPlainDate(date)) return '—'
  const { year, month, day } = plainDateParts(date)
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`
}

/** '15.03.2026' → 'YYYY-MM-DD'. Vraća `null` ako format ne odgovara. */
export function parseBosnianDate(input: string): PlainDate | null {
  const match = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\.?$/.exec(input.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isPlainDate(candidate) ? candidate : null
}

const MONTHS_BS = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'juni',
  'juli',
  'august',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
] as const

const MONTHS_BS_GENITIVE = [
  'januara',
  'februara',
  'marta',
  'aprila',
  'maja',
  'juna',
  'jula',
  'augusta',
  'septembra',
  'oktobra',
  'novembra',
  'decembra',
] as const

const WEEKDAYS_BS = [
  'nedjelja',
  'ponedjeljak',
  'utorak',
  'srijeda',
  'četvrtak',
  'petak',
  'subota',
] as const

const WEEKDAYS_BS_SHORT = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'] as const

/** '15.03.2026' → '15. marta 2026.' — za e-poštu i izvještaje. */
export function formatDateLong(date: PlainDate | null | undefined): string {
  if (!date || !isPlainDate(date)) return '—'
  const { year, month, day } = plainDateParts(date)
  return `${day}. ${MONTHS_BS_GENITIVE[month - 1]} ${year}.`
}

/** 'mart 2026' — za zaglavlja izvještaja. */
export function formatMonthYear(date: PlainDate): string {
  const { year, month } = plainDateParts(date)
  return `${MONTHS_BS[month - 1]} ${year}`
}

/** 'srijeda' / 'sri' */
export function formatWeekday(date: PlainDate, style: 'long' | 'short' = 'long'): string {
  const dayIndex = new Date(`${date}T00:00:00Z`).getUTCDay()
  return style === 'long'
    ? (WEEKDAYS_BS[dayIndex] ?? '')
    : (WEEKDAYS_BS_SHORT[dayIndex] ?? '')
}

/** Trenutak → '15.03.2026 09:30' u zadanoj vremenskoj zoni. */
export function formatDateTime(
  instant: Date | string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (!instant) return '—'
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) return '—'

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '00'

  const hour = (Number(get('hour')) % 24).toString().padStart(2, '0')
  return `${get('day')}.${get('month')}.${get('year')} ${hour}:${get('minute')}`
}

/** Trenutak → '09:30' u zadanoj vremenskoj zoni. */
export function formatTime(
  instant: Date | string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (!instant) return '—'
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = (Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24)
    .toString()
    .padStart(2, '0')
  return `${hour}:${parts.find((p) => p.type === 'minute')?.value ?? '00'}`
}

// ---------------------------------------------------------------------------
// Množina u bosanskom jeziku
// ---------------------------------------------------------------------------

export interface PluralForms {
  /** 1, 21, 31 … */
  one: string
  /** 2–4, 22–24 … */
  few: string
  /** 0, 5–20, 25–30 … */
  many: string
}

/**
 * Bira ispravan oblik po bosanskim pravilima množine.
 *   1 uređaj · 2 uređaja · 5 uređaja · 21 uređaj · 22 uređaja
 */
export function plural(count: number, forms: PluralForms): string {
  const n = Math.abs(Math.trunc(count))
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms.one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few
  return forms.many
}

/** Broj + ispravan oblik riječi, npr. `pluralize(3, PLURALS.dan)` → '3 dana'. */
export function pluralize(count: number, forms: PluralForms): string {
  return `${formatNumber(count)} ${plural(count, forms)}`
}

export const PLURALS = {
  dan: { one: 'dan', few: 'dana', many: 'dana' },
  sedmica: { one: 'sedmica', few: 'sedmice', many: 'sedmica' },
  mjesec: { one: 'mjesec', few: 'mjeseca', many: 'mjeseci' },
  godina: { one: 'godina', few: 'godine', many: 'godina' },
  uredaj: { one: 'uređaj', few: 'uređaja', many: 'uređaja' },
  kupac: { one: 'kupac', few: 'kupca', many: 'kupaca' },
  lokacija: { one: 'lokacija', few: 'lokacije', many: 'lokacija' },
  servis: { one: 'servis', few: 'servisa', many: 'servisa' },
  podsjetnik: { one: 'podsjetnik', few: 'podsjetnika', many: 'podsjetnika' },
  rezervacija: { one: 'rezervacija', few: 'rezervacije', many: 'rezervacija' },
  radniNalog: { one: 'radni nalog', few: 'radna naloga', many: 'radnih naloga' },
  tehnicar: { one: 'tehničar', few: 'tehničara', many: 'tehničara' },
  red: { one: 'red', few: 'reda', many: 'redova' },
  greska: { one: 'greška', few: 'greške', many: 'grešaka' },
  zapis: { one: 'zapis', few: 'zapisa', many: 'zapisa' },
  termin: { one: 'termin', few: 'termina', many: 'termina' },
} as const satisfies Record<string, PluralForms>

// ---------------------------------------------------------------------------
// Relativni datumi
// ---------------------------------------------------------------------------

/**
 * Opisuje rok servisa u odnosu na današnji dan, npr.
 *   'danas' · 'sutra' · 'za 12 dana' · 'kasni 3 dana'
 */
export function formatRelativeDate(target: PlainDate, today: PlainDate): string {
  const days = diffInDays(today, target)
  if (days === 0) return 'danas'
  if (days === 1) return 'sutra'
  if (days === -1) return 'jučer'
  if (days > 0) return `za ${pluralize(days, PLURALS.dan)}`
  return `kasni ${pluralize(-days, PLURALS.dan)}`
}

/** Kratka oznaka za tabele: '+12 d' / '−3 d' / '0 d'. */
export function formatDayDelta(target: PlainDate, today: PlainDate): string {
  const days = diffInDays(today, target)
  if (days === 0) return '0 d'
  return days > 0 ? `+${days} d` : `−${Math.abs(days)} d`
}

/** 'prije 5 minuta' · 'prije 2 sata' · 'prije 3 dana' — za vremensku traku aktivnosti. */
export function formatRelativeTime(
  instant: Date | string,
  now: Date = new Date(),
): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) return '—'
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)

  if (seconds < 45) return 'upravo sada'
  if (seconds < 90) return 'prije minutu'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60)
    return `prije ${minutes} ${plural(minutes, { one: 'minutu', few: 'minute', many: 'minuta' })}`

  const hours = Math.round(minutes / 60)
  if (hours < 24)
    return `prije ${hours} ${plural(hours, { one: 'sat', few: 'sata', many: 'sati' })}`

  const days = Math.round(hours / 24)
  if (days < 30) return `prije ${pluralize(days, PLURALS.dan)}`

  const months = Math.round(days / 30)
  if (months < 12) return `prije ${pluralize(months, PLURALS.mjesec)}`

  const years = Math.round(months / 12)
  return `prije ${pluralize(years, PLURALS.godina)}`
}

// ---------------------------------------------------------------------------
// Brojevi i valuta
// ---------------------------------------------------------------------------

/** 1250.5 → '1.250,5' */
export function formatNumber(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value)
}

/** 1250.5 → '1.250,50 KM'. `compact` daje '1,3 hilj. KM' za dashboard kartice. */
export function formatCurrency(
  value: number | null | undefined,
  options: { compact?: boolean; withSuffix?: boolean; decimals?: number } = {},
): string {
  const { compact = false, withSuffix = true, decimals = 2 } = options
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'

  if (compact && Math.abs(value) >= 1000) {
    const thousands = value / 1000
    const formatted = new Intl.NumberFormat('de-DE', {
      maximumFractionDigits: Math.abs(thousands) >= 100 ? 0 : 1,
    }).format(thousands)
    return withSuffix ? `${formatted} hilj. ${CURRENCY_SUFFIX}` : `${formatted} hilj.`
  }

  const formatted = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
  return withSuffix ? `${formatted} ${CURRENCY_SUFFIX}` : formatted
}

/**
 * Pretvara korisnički unos cijene u broj.
 * Prihvata i '1.250,50' i '1,250.50' i '1250.5' i '1250,5'.
 * Vraća `null` ako unos nije broj.
 */
export function parseDecimalInput(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, '').replace(/KM$/i, '').trim()
  if (!trimmed) return null

  const lastComma = trimmed.lastIndexOf(',')
  const lastDot = trimmed.lastIndexOf('.')

  let normalized: string
  if (lastComma === -1 && lastDot === -1) {
    normalized = trimmed
  } else if (lastComma > lastDot) {
    // Zarez je decimalni separator: '1.250,50'
    normalized = trimmed.replace(/\./g, '').replace(',', '.')
  } else {
    // Tačka je decimalni separator: '1,250.50'
    normalized = trimmed.replace(/,/g, '')
  }

  if (!/^-?\d*\.?\d*$/.test(normalized) || normalized === '' || normalized === '-') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** 0.42 → '42 %' */
export function formatPercent(ratio: number, decimals = 0): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(ratio * 100)} %`
}

/** 2456 → '2.456' bez decimala — za brojače na dashboardu. */
export function formatCount(value: number): string {
  return formatNumber(value, 0)
}

// ---------------------------------------------------------------------------
// Telefon, serijski broj, veličina fajla
// ---------------------------------------------------------------------------

/**
 * Prikaz bh. telefonskog broja u čitljivom obliku.
 * '+38761123456' → '+387 61 123 456'
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/[^\d+]/g, '')
  const bihMatch = /^\+387(\d{2})(\d{3})(\d{3,4})$/.exec(digits)
  if (bihMatch) return `+387 ${bihMatch[1]} ${bihMatch[2]} ${bihMatch[3]}`
  const localMatch = /^0(\d{2})(\d{3})(\d{3,4})$/.exec(digits)
  if (localMatch) return `0${localMatch[1]} ${localMatch[2]} ${localMatch[3]}`
  return phone
}

/**
 * Maskira serijski broj za javni prikaz: 'A1B2C3D4E5' → 'A1B2••••E5'.
 * Kupac prepozna svoj uređaj, a broj nije upotrebljiv za zloupotrebu garancije.
 */
export function maskSerial(serial: string | null | undefined): string {
  if (!serial) return '—'
  const value = serial.trim()
  if (value.length <= 4) return '••••'
  if (value.length <= 8) return `${value.slice(0, 2)}••••${value.slice(-2)}`
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(6, value.length - 6))}${value.slice(-2)}`
}

/** Maskira e-mail za javni prikaz: 'amir.h@primjer.ba' → 'am•••@primjer.ba'. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const [local, domain] = email.split('@')
  if (!local || !domain) return '—'
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'•'.repeat(3)}@${domain}`
}

/** 1536000 → '1,5 MB' */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB'] as const
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${formatNumber(value, 1)} ${units[unitIndex]}`
}

/** Trajanje u minutama → '1 h 30 min' */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  const total = Math.round(minutes)
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

// ---------------------------------------------------------------------------
// Rasponi
// ---------------------------------------------------------------------------

/** '01.03.2026 – 31.03.2026' */
export function formatDateRange(from: PlainDate, to: PlainDate): string {
  return `${formatDate(from)} – ${formatDate(to)}`
}

/** Raspon termina: '09:00 – 10:30' */
export function formatSlotRange(
  start: Date | string,
  durationMinutes: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const startDate = typeof start === 'string' ? new Date(start) : start
  if (Number.isNaN(startDate.getTime())) return '—'
  const end = new Date(startDate.getTime() + durationMinutes * 60_000)
  return `${formatTime(startDate, timeZone)} – ${formatTime(end, timeZone)}`
}

/** Raspon posljednjih N dana koji završava danas — za filtere izvještaja. */
export function lastNDays(today: PlainDate, days: number): { from: PlainDate; to: PlainDate } {
  return { from: addDays(today, -(days - 1)), to: today }
}
