import 'server-only'
import { Resend } from 'resend'
import { getServerEnv } from '@/lib/env'

/**
 * Sloj pružaoca usluge slanja poruka.
 *
 * Motor podsjetnika NE zna ništa o Resendu. Zna samo za `MessageProvider`.
 * Zbog toga se SMS, Viber ili WhatsApp mogu dodati kasnije tako da se napiše
 * nova implementacija ovog sučelja — bez ijedne izmjene u logici podsjetnika,
 * deduplikacije ili ponovnih pokušaja.
 *
 * U MVP-u postoje dvije implementacije:
 *   • `ResendProvider` — stvarno slanje e-pošte;
 *   • `PreviewProvider` — ništa se ne šalje, sadržaj se pohranjuje i vidi
 *     u aplikaciji. To znači da se cijeli motor podsjetnika može testirati
 *     bez ijednog plaćenog naloga i bez rizika da poruka ode stvarnom kupcu.
 */

export type MessageChannel = 'email' | 'sms' | 'viber' | 'whatsapp'

export interface OutgoingMessage {
  to: string
  subject: string
  html: string
  /** Čisti tekst — obavezan. Neki klijenti prikazuju samo njega. */
  text: string
  replyTo?: string | null
  /** Zaglavlje `List-Unsubscribe`, kad poruka ima link za odjavu. */
  unsubscribeUrl?: string | null
  tags?: Record<string, string>
}

export interface SendResult {
  ok: boolean
  /** ID poruke kod pružaoca — služi za praćenje isporuke. */
  providerMessageId: string | null
  error: string | null
  /** Je li greška privremena (vrijedi pokušati ponovo). */
  retryable: boolean
}

export interface MessageProvider {
  readonly name: string
  readonly channel: MessageChannel
  /** Šalje li stvarno, ili samo pravi pregled. */
  readonly isLive: boolean
  send(message: OutgoingMessage): Promise<SendResult>
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

/** Greške kod kojih ponovni pokušaj nema smisla. */
const PERMANENT_ERROR_PATTERNS = [
  'invalid',
  'not found',
  'unsubscribed',
  'suppressed',
  'blocked',
  'domain is not verified',
]

function classifyError(message: string): boolean {
  const normalized = message.toLowerCase()
  return !PERMANENT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))
}

class ResendProvider implements MessageProvider {
  readonly name = 'resend'
  readonly channel: MessageChannel = 'email'
  readonly isLive = true

  private client: Resend
  private from: string

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey)
    this.from = from
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    try {
      const headers: Record<string, string> = {}
      if (message.unsubscribeUrl) {
        headers['List-Unsubscribe'] = `<${message.unsubscribeUrl}>`
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
      }

      const { data, error } = await this.client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      })

      if (error) {
        const description = error.message || 'Nepoznata greška pružaoca usluge'
        return {
          ok: false,
          providerMessageId: null,
          error: description,
          retryable: classifyError(description),
        }
      }

      return { ok: true, providerMessageId: data?.id ?? null, error: null, retryable: false }
    } catch (error) {
      // Mrežni problem — gotovo uvijek vrijedi pokušati ponovo.
      const description = error instanceof Error ? error.message : String(error)
      return { ok: false, providerMessageId: null, error: description, retryable: true }
    }
  }
}

// ---------------------------------------------------------------------------
// Pregled (bez stvarnog slanja)
// ---------------------------------------------------------------------------

class PreviewProvider implements MessageProvider {
  readonly name = 'preview'
  readonly channel: MessageChannel = 'email'
  readonly isLive = false

  private reason: string

  constructor(reason: string) {
    this.reason = reason
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    // Namjerno bez `console.log` sadržaja poruke — sadržaj se čuva u bazi i
    // vidi u aplikaciji. Logovi ne trebaju sadržavati podatke kupaca.
    console.info(
      `[email:preview] Poruka NIJE poslana (${this.reason}). ` +
        `Primalac: ${message.to.replace(/(.{2}).*(@.*)/, '$1•••$2')}, predmet: "${message.subject}"`,
    )

    return {
      ok: true,
      providerMessageId: `preview_${Date.now().toString(36)}`,
      error: null,
      retryable: false,
    }
  }
}

// ---------------------------------------------------------------------------
// Izbor pružaoca
// ---------------------------------------------------------------------------

let cachedProvider: MessageProvider | null = null

/**
 * Bira pružaoca prema konfiguraciji.
 *
 * Pregled se koristi kad:
 *   • `RESEND_API_KEY` nije postavljen (lokalni razvoj, prvi dan rada);
 *   • `EMAIL_DRY_RUN=1` (testovi, demonstracija);
 * — dakle: nemoguće je slučajno poslati poruku stvarnom kupcu iz razvojnog
 * okruženja, jer za to treba svjesno postaviti ključ i ugasiti dry-run.
 */
export function getMessageProvider(): MessageProvider {
  if (cachedProvider) return cachedProvider

  const env = getServerEnv()

  if (env.EMAIL_DRY_RUN) {
    cachedProvider = new PreviewProvider('EMAIL_DRY_RUN=1')
  } else if (!env.RESEND_API_KEY) {
    cachedProvider = new PreviewProvider('RESEND_API_KEY nije postavljen')
  } else {
    cachedProvider = new ResendProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
  }

  return cachedProvider
}

/** Samo za testove. */
export function resetMessageProvider(): void {
  cachedProvider = null
}

/** Provider za buduće kanale — trenutno namjerno nije implementiran. */
export function getProviderForChannel(channel: MessageChannel): MessageProvider {
  if (channel === 'email') return getMessageProvider()

  throw new Error(
    `Kanal "${channel}" nije implementiran u ovoj verziji. ` +
      `Sučelje MessageProvider je pripremljeno — dodavanje traži samo novu ` +
      `implementaciju, bez izmjene logike podsjetnika. Vidi docs/EMAIL_SETUP.md.`,
  )
}
