import { addDays, isBefore, type PlainDate } from '@/domains/shared/plain-date'

/**
 * Raspoređivanje servisnih podsjetnika.
 *
 * Ovo je logika koja odlučuje KOJA poruka ide KOJEM kupcu i KADA — bez ijednog
 * pristupa bazi ili mreži. Cron posao samo dovuče podatke, pozove ove funkcije
 * i upiše rezultat. Zato se cijelo ponašanje motora može testirati bez baze.
 *
 * Tri garancije koje ovdje nastaju:
 *   1. Poruka se šalje tačno na dan `rok + pomak`, ni prije ni poslije.
 *   2. Za isti uređaj, pravilo i rok postoji tačno jedan ključ deduplikacije.
 *   3. Kad kupac rezerviše, preostali podsjetnici za taj rok se otkazuju.
 */

export interface ReminderRule {
  id: string
  name: string
  /** Negativno = prije roka, 0 = na dan roka, pozitivno = nakon roka. */
  offsetDays: number
  channel: 'email' | 'sms' | 'viber' | 'whatsapp'
  templateKey: 'service_reminder' | 'service_reminder_final' | 'service_overdue'
  isActive: boolean
}

export interface ReminderCandidate {
  deviceId: string
  customerId: string
  /** Rok servisa uređaja. */
  dueDate: PlainDate
  /** Uređaj mora biti aktivan i imati uključene podsjetnike. */
  deviceActive: boolean
  remindersEnabled: boolean
  /** Kupac je pristao na servisne podsjetnike. */
  reminderConsent: boolean
  /** Adresa na koju se šalje. `null` znači da kontakt nedostaje. */
  recipientEmail: string | null
  /** Postoji li već potvrđena rezervacija za ovaj rok. */
  hasActiveBooking: boolean
}

export type SkipReason =
  | 'device_inactive'
  | 'reminders_disabled'
  | 'no_consent'
  | 'missing_contact'
  | 'already_booked'
  | 'not_due_today'
  | 'rule_inactive'
  | 'already_exists'

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  device_inactive: 'Uređaj nije aktivan',
  reminders_disabled: 'Podsjetnici su isključeni za ovaj uređaj',
  no_consent: 'Kupac nije pristao na servisne podsjetnike',
  missing_contact: 'Kupac nema ispravnu e-mail adresu',
  already_booked: 'Za ovaj rok već postoji rezervacija',
  not_due_today: 'Podsjetnik nije za današnji dan',
  rule_inactive: 'Pravilo podsjetnika nije aktivno',
  already_exists: 'Podsjetnik je već kreiran ranije',
}

export interface PlannedReminder {
  deviceId: string
  customerId: string
  ruleId: string
  dueDate: PlainDate
  offsetDays: number
  /** Dan kada poruka treba otići. Uvijek `dueDate + offsetDays`. */
  scheduledFor: PlainDate
  channel: ReminderRule['channel']
  templateKey: ReminderRule['templateKey']
  recipientEmail: string
  /** Ključ koji baza koristi za jedinstvenost. */
  dedupeKey: string
}

export interface SkippedReminder {
  deviceId: string
  ruleId: string
  dueDate: PlainDate
  reason: SkipReason
}

/**
 * Ključ deduplikacije.
 *
 * Mora biti stabilan kroz ponovna pokretanja: isti uređaj + isto pravilo +
 * isti rok uvijek daju isti ključ. Baza nad tim ima jedinstveni indeks, pa
 * drugi pokušaj upisa fizički ne može proći.
 */
export function buildDedupeKey(deviceId: string, ruleId: string, dueDate: PlainDate): string {
  return `${deviceId}:${ruleId}:${dueDate}`
}

/**
 * Datum slanja za zadani rok i pravilo.
 *   rok 15.04.2027., pomak −30 → 16.03.2027.
 */
export function reminderSendDate(dueDate: PlainDate, offsetDays: number): PlainDate {
  return addDays(dueDate, offsetDays)
}

/**
 * Rok servisa za koji bi se danas slao podsjetnik po zadanom pravilu.
 * Obrnuto od `reminderSendDate` — koristi ga cron da suzi pretragu baze
 * na tačno one uređaje čiji rok danas „pada“ pod neko pravilo.
 */
export function dueDateForRuleOnDay(today: PlainDate, offsetDays: number): PlainDate {
  return addDays(today, -offsetDays)
}

/** Svi rokovi koje treba provjeriti danas, po jednom za svako aktivno pravilo. */
export function dueDatesToScan(today: PlainDate, rules: readonly ReminderRule[]): PlainDate[] {
  const dates = new Set<PlainDate>()
  for (const rule of rules) {
    if (!rule.isActive) continue
    dates.add(dueDateForRuleOnDay(today, rule.offsetDays))
  }
  return [...dates].sort()
}

export interface PlanningResult {
  planned: PlannedReminder[]
  skipped: SkippedReminder[]
}

/**
 * Odlučuje šta se danas šalje.
 *
 * `existingKeys` sadrži ključeve podsjetnika koji su već kreirani. Njihova
 * prisutnost je druga linija odbrane — prva je jedinstveni indeks u bazi.
 * Provjeru radimo i ovdje da ne bismo bespotrebno gađali bazu upisima koji
 * će sigurno pasti.
 */
export function planRemindersForDay(input: {
  today: PlainDate
  rules: readonly ReminderRule[]
  candidates: readonly ReminderCandidate[]
  existingKeys: ReadonlySet<string>
}): PlanningResult {
  const planned: PlannedReminder[] = []
  const skipped: SkippedReminder[] = []

  for (const rule of input.rules) {
    if (!rule.isActive) continue

    // Rok koji danas „pada“ pod ovo pravilo.
    const targetDueDate = dueDateForRuleOnDay(input.today, rule.offsetDays)

    for (const candidate of input.candidates) {
      if (candidate.dueDate !== targetDueDate) continue

      const skip = (reason: SkipReason) => {
        skipped.push({
          deviceId: candidate.deviceId,
          ruleId: rule.id,
          dueDate: candidate.dueDate,
          reason,
        })
      }

      // Redoslijed provjera je namjeran: prvo ono što je najjeftinije i
      // najvažnije za kupca (pristanak), pa tek onda tehnički uslovi.
      if (!candidate.deviceActive) {
        skip('device_inactive')
        continue
      }
      if (!candidate.remindersEnabled) {
        skip('reminders_disabled')
        continue
      }
      if (!candidate.reminderConsent) {
        skip('no_consent')
        continue
      }
      if (candidate.hasActiveBooking) {
        // Kupac je već dogovorio termin — daljnje poruke bi bile smetnja.
        skip('already_booked')
        continue
      }
      if (!candidate.recipientEmail || !isPlausibleEmail(candidate.recipientEmail)) {
        skip('missing_contact')
        continue
      }

      const dedupeKey = buildDedupeKey(candidate.deviceId, rule.id, candidate.dueDate)
      if (input.existingKeys.has(dedupeKey)) {
        skip('already_exists')
        continue
      }

      planned.push({
        deviceId: candidate.deviceId,
        customerId: candidate.customerId,
        ruleId: rule.id,
        dueDate: candidate.dueDate,
        offsetDays: rule.offsetDays,
        scheduledFor: input.today,
        channel: rule.channel,
        templateKey: rule.templateKey,
        recipientEmail: candidate.recipientEmail,
        dedupeKey,
      })
    }
  }

  return { planned, skipped }
}

/**
 * Provjera oblika e-mail adrese.
 *
 * Namjerno labava: cilj je uhvatiti očite greške iz uvoza („nema“, „-“,
 * „amir@“) prije nego što potroše pokušaj slanja. Potpuna provjera adrese
 * moguća je jedino slanjem.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 6 || trimmed.length > 254) return false
  if (/\s/.test(trimmed)) return false
  const match = /^[^@]+@([^@.]+\.)+[A-Za-z]{2,}$/.exec(trimmed)
  return match !== null
}

// ---------------------------------------------------------------------------
// Ponovni pokušaj slanja
// ---------------------------------------------------------------------------

export const MAX_REMINDER_ATTEMPTS = 3

/**
 * Da li podsjetnik ide u novi pokušaj.
 *
 * Ključno: neuspješan podsjetnik NIKAD se ne označava kao poslan. Ostaje
 * `failed` s razlogom i brojem pokušaja, vidljiv u aplikaciji, dok ga
 * čovjek ne riješi ili dok ne uspije ponovni pokušaj.
 */
export function shouldRetry(attemptCount: number, lastError: string | null): boolean {
  if (attemptCount >= MAX_REMINDER_ATTEMPTS) return false
  if (!lastError) return true

  // Trajne greške nema smisla ponavljati — samo troše kvotu i vrijeme.
  const permanent = [
    'invalid recipient',
    'invalid email',
    'does not exist',
    'blocked',
    'unsubscribed',
    'suppressed',
    'bounced',
  ]
  const normalized = lastError.toLowerCase()
  return !permanent.some((phrase) => normalized.includes(phrase))
}

/** Razmak do sljedećeg pokušaja: 5 min, 30 min, 2 h. */
export function retryDelayMinutes(attemptCount: number): number {
  const schedule = [5, 30, 120]
  return schedule[Math.min(attemptCount, schedule.length - 1)] ?? 120
}

// ---------------------------------------------------------------------------
// Otkazivanje nakon rezervacije
// ---------------------------------------------------------------------------

export interface CancellableReminder {
  id: string
  deviceId: string
  dueDate: PlainDate
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'cancelled'
}

/**
 * Koje podsjetnike treba otkazati kad kupac rezerviše termin.
 *
 * Otkazuju se samo oni koji JOŠ NISU otišli. Već poslana poruka se ne dira —
 * njen zapis je historijska činjenica, ne plan.
 */
export function remindersToCancelAfterBooking(
  reminders: readonly CancellableReminder[],
  deviceId: string,
  dueDate: PlainDate,
): string[] {
  return reminders
    .filter(
      (reminder) =>
        reminder.deviceId === deviceId &&
        reminder.dueDate === dueDate &&
        reminder.status === 'pending',
    )
    .map((reminder) => reminder.id)
}

// ---------------------------------------------------------------------------
// Pregled rasporeda za korisnika
// ---------------------------------------------------------------------------

export interface ScheduledReminderPreview {
  ruleName: string
  offsetDays: number
  sendDate: PlainDate
  isPast: boolean
  templateKey: ReminderRule['templateKey']
}

/**
 * Kad će koji podsjetnik otići za zadani rok.
 * Prikazuje se na stranici uređaja da korisnik tačno vidi šta ga čeka.
 */
export function previewSchedule(
  dueDate: PlainDate,
  rules: readonly ReminderRule[],
  today: PlainDate,
): ScheduledReminderPreview[] {
  return rules
    .filter((rule) => rule.isActive)
    .map((rule) => {
      const sendDate = reminderSendDate(dueDate, rule.offsetDays)
      return {
        ruleName: rule.name,
        offsetDays: rule.offsetDays,
        sendDate,
        isPast: isBefore(sendDate, today),
        templateKey: rule.templateKey,
      }
    })
    .sort((a, b) => a.sendDate.localeCompare(b.sendDate))
}

/** Čitljiv opis pomaka: „30 dana prije roka“, „na dan roka“, „14 dana nakon roka“. */
export function describeOffset(offsetDays: number): string {
  if (offsetDays === 0) return 'na dan roka'
  const days = Math.abs(offsetDays)
  const suffix = days === 1 ? 'dan' : days >= 2 && days <= 4 ? 'dana' : 'dana'
  return offsetDays < 0 ? `${days} ${suffix} prije roka` : `${days} ${suffix} nakon roka`
}
