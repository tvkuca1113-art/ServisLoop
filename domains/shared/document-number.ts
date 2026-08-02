import { plainDateParts, type PlainDate } from './plain-date'

/**
 * Brojevi dokumenata: servisni izvještaji, radni nalozi, rezervacije, prijave.
 *
 * Zahtjevi:
 *   • jedinstven unutar organizacije;
 *   • rastući, da se vidi redoslijed;
 *   • čitljiv naglas preko telefona („es-el dvadeset sedam, četiri stotine dvanaest“);
 *   • ne otkriva ukupan broj korisnika sistema (brojač je po organizaciji).
 *
 * Redni broj dolazi iz baze (`app.next_document_number`) koja ga povećava
 * atomarno, pa dva istovremena zahtjeva ne mogu dobiti isti broj.
 */

export type DocumentKind = 'service_report' | 'work_order' | 'booking' | 'issue_report'

const PREFIXES: Record<DocumentKind, string> = {
  service_report: 'SL',
  work_order: 'RN',
  booking: 'RZ',
  issue_report: 'PK',
}

const PADDING: Record<DocumentKind, number> = {
  service_report: 6,
  work_order: 5,
  booking: 5,
  issue_report: 5,
}

/** Ključ brojača u bazi. */
export function counterKeyFor(kind: DocumentKind): string {
  return kind
}

/**
 * Sastavlja broj dokumenta.
 *
 *   formatDocumentNumber('service_report', 2027, 412)      → 'SL-2027-000412'
 *   formatDocumentNumber('work_order', 2027, 2211)         → 'RN-2027-02211'
 *   formatDocumentNumber('service_report', 2027, 412, 'TP') → 'TP-2027-000412'
 */
export function formatDocumentNumber(
  kind: DocumentKind,
  year: number,
  sequence: number,
  prefixOverride?: string,
): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2999) {
    throw new RangeError(`Godina mora biti između 2000 i 2999. Dobiveno: ${year}`)
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`Redni broj mora biti pozitivan cijeli broj. Dobiveno: ${sequence}`)
  }

  const prefix = normalizePrefix(prefixOverride ?? PREFIXES[kind])
  return `${prefix}-${year}-${String(sequence).padStart(PADDING[kind], '0')}`
}

/**
 * Prefiks organizacije: velika slova i cifre, 1–5 znakova.
 * Neispravan unos se svodi na siguran oblik umjesto da obori upis dokumenta.
 */
export function normalizePrefix(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5)
  return cleaned.length > 0 ? cleaned : 'SL'
}

/** Godina koja ulazi u broj — iz kalendarskog datuma, ne iz vremena servera. */
export function documentYear(date: PlainDate): number {
  return plainDateParts(date).year
}

export interface ParsedDocumentNumber {
  prefix: string
  year: number
  sequence: number
}

/** Rastavlja broj dokumenta. Vraća `null` ako oblik ne odgovara. */
export function parseDocumentNumber(value: string): ParsedDocumentNumber | null {
  const match = /^([A-Z0-9]{1,5})-(\d{4})-(\d{4,8})$/.exec(value.trim().toUpperCase())
  if (!match) return null
  return {
    prefix: match[1] ?? '',
    year: Number(match[2]),
    sequence: Number(match[3]),
  }
}

/** Provjera oblika — koristi se pri pretrazi i uvozu. */
export function isDocumentNumber(value: string): boolean {
  return parseDocumentNumber(value) !== null
}
