import 'server-only'
import type * as React from 'react'
import { render } from '@react-email/render'
import { createServiceSupabase } from '@/lib/supabase/service'
import { getServerEnv } from '@/lib/env'
import { getMessageProvider } from './provider'
import type { EmailTemplateKey } from '@/components/emails/templates'

/**
 * Slanje e-poruke uz obavezan trag u bazi.
 *
 * Svaka poruka — poslana, neuspjela ili samo pripremljena u pregled načinu —
 * dobija red u `email_messages`. Zbog toga u aplikaciji uvijek postoji
 * odgovor na pitanje „je li kupac stvarno dobio poruku i kada“.
 *
 * ★ Poruka se NIKAD ne označava kao poslana ako slanje nije uspjelo. ★
 * Lažno „poslano“ je gore od vidljive greške: firma bi mislila da je kupac
 * obaviješten, a kupac ne bi znao da mu servis ističe.
 */

export interface SendEmailInput {
  /** `null` samo za poruke prije nego što organizacija postoji (pozivnice). */
  organizationId: string | null
  to: string
  subject: string
  templateKey: EmailTemplateKey
  /** React komponenta poruke. Renderuje se u HTML i u čisti tekst. */
  element: React.ReactElement
  replyTo?: string | null
  unsubscribeUrl?: string | null
  entityType?: string | null
  entityId?: string | null
  /**
   * Kad je `false`, poruka se pohranjuje ali se ne šalje. Koristi se za
   * demo organizacije i za istekle pretplate — logika pozivaoca time ostaje
   * ista, a odluka o slanju je na jednom mjestu.
   */
  allowSend?: boolean
}

export interface SendEmailResult {
  ok: boolean
  messageId: string | null
  providerMessageId: string | null
  error: string | null
  retryable: boolean
  /** Je li poruka stvarno otišla ili je samo pripremljena. */
  delivered: boolean
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const env = getServerEnv()
  const provider = getMessageProvider()
  const supabase = createServiceSupabase()

  const allowSend = input.allowSend ?? true

  // Renderovanje ide prvo: ako padne, ništa ne upisujemo i ništa ne šaljemo.
  let html: string
  let text: string
  try {
    html = await render(input.element)
    text = await render(input.element, { plainText: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      messageId: null,
      providerMessageId: null,
      error: `Neuspješno sastavljanje poruke: ${message}`,
      retryable: false,
      delivered: false,
    }
  }

  const willSend = allowSend && provider.isLive
  const initialStatus = willSend ? 'queued' : 'preview'

  const { data: record, error: insertError } = await supabase
    .from('email_messages')
    .insert({
      organization_id: input.organizationId,
      to_email: input.to,
      from_email: env.EMAIL_FROM,
      reply_to: input.replyTo ?? env.EMAIL_REPLY_TO ?? null,
      subject: input.subject,
      template_key: input.templateKey,
      status: initialStatus,
      provider: willSend ? 'resend' : 'preview',
      // Sadržaj se čuva samo u pregled načinu, da baza ne raste bez potrebe
      // i da se sadržaj poruka kupcima ne gomila nepotrebno.
      preview_html: willSend ? null : html,
      preview_text: willSend ? null : text,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
    })
    .select('id')
    .single()

  if (insertError || !record) {
    return {
      ok: false,
      messageId: null,
      providerMessageId: null,
      error: `Neuspješan upis poruke: ${insertError?.message ?? 'nepoznato'}`,
      retryable: true,
      delivered: false,
    }
  }

  if (!willSend) {
    return {
      ok: true,
      messageId: record.id,
      providerMessageId: null,
      error: null,
      retryable: false,
      delivered: false,
    }
  }

  const result = await provider.send({
    to: input.to,
    subject: input.subject,
    html,
    text,
    replyTo: input.replyTo ?? env.EMAIL_REPLY_TO ?? null,
    unsubscribeUrl: input.unsubscribeUrl ?? null,
  })

  await supabase
    .from('email_messages')
    .update({
      status: result.ok ? 'sent' : 'failed',
      provider_message_id: result.providerMessageId,
      error_text: result.error,
      sent_at: result.ok ? new Date().toISOString() : null,
    })
    .eq('id', record.id)

  if (result.ok && input.organizationId) {
    // Brojač potrošnje raste samo za stvarno poslane poruke.
    await supabase.rpc('bump_usage' as never, {
      target_org: input.organizationId,
      metric_name: 'emails_sent',
      amount: 1,
    } as never)
  }

  return {
    ok: result.ok,
    messageId: record.id,
    providerMessageId: result.providerMessageId,
    error: result.error,
    retryable: result.retryable,
    delivered: result.ok,
  }
}

/**
 * Podaci o brendiranju za poruke jedne organizacije.
 * Čita se jednom po pokretanju posla, ne po poruci.
 */
export interface OrganizationBranding {
  companyName: string
  logoUrl: string | null
  phone: string | null
  email: string | null
  address: string | null
  timeZone: string
  replyTo: string | null
}

export async function loadOrganizationBranding(
  organizationId: string,
): Promise<OrganizationBranding | null> {
  const supabase = createServiceSupabase()

  const { data, error } = await supabase
    .from('organizations')
    .select('name, logo_path, phone, email, address, city, timezone')
    .eq('id', organizationId)
    .maybeSingle()

  if (error || !data) return null

  const { data: settings } = await supabase
    .from('organization_settings')
    .select('reminder_from_name, reminder_reply_to')
    .eq('organization_id', organizationId)
    .maybeSingle()

  return {
    companyName: settings?.reminder_from_name || data.name,
    logoUrl: data.logo_path,
    phone: data.phone,
    email: data.email,
    address: [data.address, data.city].filter(Boolean).join(', ') || null,
    timeZone: data.timezone,
    replyTo: settings?.reminder_reply_to ?? data.email,
  }
}
