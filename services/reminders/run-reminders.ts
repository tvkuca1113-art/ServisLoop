import 'server-only'
import { createServiceSupabase } from '@/lib/supabase/service'
import { sendEmail, loadOrganizationBranding } from '@/lib/email/send'
import { ServiceReminderEmail } from '@/components/emails/templates'
import { generateToken, hashToken } from '@/lib/security/tokens'
import { bookingTokenUrl, devicePageUrl, unsubscribeUrl } from '@/lib/security/public-links'
import { evaluateSubscription } from '@/domains/billing/entitlements'
import { isPlanCode } from '@/domains/billing/plans'
import {
  buildDedupeKey,
  dueDatesToScan,
  planRemindersForDay,
  type ReminderCandidate,
  type ReminderRule,
} from '@/domains/reminders/schedule'
import { diffInDays, todayInTimeZone, type PlainDate } from '@/domains/shared/plain-date'
import { formatDate } from '@/lib/format'

/**
 * Dnevni posao slanja servisnih podsjetnika.
 *
 * ★ Idempotentnost je zagarantovana na TRI nivoa: ★
 *
 *   1. `cron_runs` ima jedinstveni (job, run_date) — drugi pokušaj istog dana
 *      vidi da je posao već obavljen i odmah izlazi.
 *   2. `reminder_campaigns` ima jedinstveni (organization_id, run_date).
 *   3. `reminder_events` ima jedinstveni (device_id, rule_id, due_date) —
 *      ovo je konačna brana. Čak i da prva dva zakažu, baza fizički ne može
 *      primiti drugi zapis za isti podsjetnik.
 *
 * Zbog toga je bezopasno pokrenuti posao ručno, dva puta, ili pustiti Vercel
 * da ga ponovi nakon greške.
 */

export interface ReminderRunOptions {
  /** Trenutak pokretanja. Prosljeđuje se radi testabilnosti. */
  now?: Date
  /** Ograniči na jednu organizaciju (ručno pokretanje iz aplikacije). */
  organizationId?: string
  /**
   * Priprema sve, ali ne šalje ništa. Koristi se za dugme „Šta bi bilo
   * poslano danas?“ prije nego što firma uključi automatiku.
   */
  dryRun?: boolean
}

export interface OrganizationRunSummary {
  organizationId: string
  organizationName: string
  runDate: PlainDate
  devicesScanned: number
  created: number
  sent: number
  failed: number
  skipped: number
  skippedReasons: Record<string, number>
  error: string | null
}

export interface ReminderRunResult {
  ok: boolean
  runDate: string
  alreadyCompleted: boolean
  organizations: OrganizationRunSummary[]
  totals: { created: number; sent: number; failed: number; skipped: number }
  durationMs: number
  error: string | null
}

const JOB_NAME = 'reminders'

export async function runReminderJob(
  options: ReminderRunOptions = {},
): Promise<ReminderRunResult> {
  const now = options.now ?? new Date()
  const startedAt = Date.now()
  const supabase = createServiceSupabase()

  // Datum pokretanja posla vodimo u UTC-u; svaka organizacija zatim računa
  // SVOJ kalendarski dan iz vlastite vremenske zone.
  const jobRunDate = now.toISOString().slice(0, 10)

  const emptyResult = (
    overrides: Partial<ReminderRunResult> = {},
  ): ReminderRunResult => ({
    ok: true,
    runDate: jobRunDate,
    alreadyCompleted: false,
    organizations: [],
    totals: { created: 0, sent: 0, failed: 0, skipped: 0 },
    durationMs: Date.now() - startedAt,
    error: null,
    ...overrides,
  })

  // --- 1. Zapis pokretanja (prva brana idempotentnosti) --------------------
  let cronRunId: string | null = null

  if (!options.organizationId && !options.dryRun) {
    const { data: existing } = await supabase
      .from('cron_runs')
      .select('id, status')
      .eq('job', JOB_NAME)
      .eq('run_date', jobRunDate)
      .maybeSingle()

    if (existing?.status === 'completed') {
      return emptyResult({ alreadyCompleted: true })
    }

    if (existing) {
      cronRunId = existing.id
    } else {
      const { data: created, error } = await supabase
        .from('cron_runs')
        .insert({ job: JOB_NAME, run_date: jobRunDate, status: 'running' })
        .select('id')
        .single()

      if (error) {
        // Utrka s drugim istovremenim pokretanjem — jedinstveni indeks je
        // odbio drugi upis. To znači da posao već radi; izlazimo mirno.
        return emptyResult({ alreadyCompleted: true })
      }
      cronRunId = created.id
    }
  }

  // --- 2. Organizacije -----------------------------------------------------
  let organizationQuery = supabase
    .from('organizations')
    .select('id, name, timezone, is_demo')
    .is('deleted_at', null)

  if (options.organizationId) {
    organizationQuery = organizationQuery.eq('id', options.organizationId)
  }

  const { data: organizations, error: orgError } = await organizationQuery

  if (orgError) {
    await finishCronRun(cronRunId, 'failed', {}, orgError.message)
    return emptyResult({ ok: false, error: orgError.message })
  }

  const summaries: OrganizationRunSummary[] = []

  for (const organization of organizations ?? []) {
    try {
      summaries.push(
        await runForOrganization({
          organizationId: organization.id,
          organizationName: organization.name,
          timeZone: organization.timezone,
          isDemo: organization.is_demo,
          now,
          dryRun: options.dryRun ?? false,
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      summaries.push({
        organizationId: organization.id,
        organizationName: organization.name,
        runDate: todayInTimeZone(organization.timezone, now),
        devicesScanned: 0,
        created: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        skippedReasons: {},
        error: message,
      })
    }
  }

  const totals = summaries.reduce(
    (accumulator, summary) => ({
      created: accumulator.created + summary.created,
      sent: accumulator.sent + summary.sent,
      failed: accumulator.failed + summary.failed,
      skipped: accumulator.skipped + summary.skipped,
    }),
    { created: 0, sent: 0, failed: 0, skipped: 0 },
  )

  const hadErrors = summaries.some((summary) => summary.error !== null)
  await finishCronRun(
    cronRunId,
    hadErrors ? 'partial' : 'completed',
    { organizations: summaries.length, ...totals },
    null,
  )

  return {
    ok: true,
    runDate: jobRunDate,
    alreadyCompleted: false,
    organizations: summaries,
    totals,
    durationMs: Date.now() - startedAt,
    error: null,
  }
}

async function finishCronRun(
  cronRunId: string | null,
  status: 'completed' | 'failed' | 'partial',
  summary: Record<string, number>,
  errorText: string | null,
): Promise<void> {
  if (!cronRunId) return
  const supabase = createServiceSupabase()
  await supabase
    .from('cron_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      summary,
      error_text: errorText,
    })
    .eq('id', cronRunId)
}

// ---------------------------------------------------------------------------
// Obrada jedne organizacije
// ---------------------------------------------------------------------------

interface OrganizationRunInput {
  organizationId: string
  organizationName: string
  timeZone: string
  isDemo: boolean
  now: Date
  dryRun: boolean
}

async function runForOrganization(input: OrganizationRunInput): Promise<OrganizationRunSummary> {
  const supabase = createServiceSupabase()

  // Kalendarski dan u zoni OVE organizacije — nikad zona servera.
  const today = todayInTimeZone(input.timeZone, input.now)

  const summary: OrganizationRunSummary = {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    runDate: today,
    devicesScanned: 0,
    created: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    skippedReasons: {},
    error: null,
  }

  // --- Smije li organizacija uopšte slati? ---------------------------------
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('reminders_paused')
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (settings?.reminders_paused) {
    summary.error = null
    return summary
  }

  const { data: subscription } = await supabase
    .from('organization_subscriptions')
    .select('plan_code, status, trial_ends_on, current_period_end')
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  const planCode = subscription && isPlanCode(subscription.plan_code) ? subscription.plan_code : 'trial'
  const subscriptionState = evaluateSubscription(
    {
      planCode,
      status: (subscription?.status ?? 'trialing') as 'trialing',
      trialEndsOn: subscription?.trial_ends_on ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
    },
    today,
    input.isDemo,
  )

  // --- Pravila --------------------------------------------------------------
  const { data: ruleRows } = await supabase
    .from('reminder_rules')
    .select('id, name, offset_days, channel, template_key, is_active')
    .eq('organization_id', input.organizationId)
    .eq('is_active', true)

  const rules: ReminderRule[] = (ruleRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    offsetDays: row.offset_days,
    channel: row.channel as ReminderRule['channel'],
    templateKey: row.template_key as ReminderRule['templateKey'],
    isActive: row.is_active,
  }))

  if (rules.length === 0) return summary

  // --- Uređaji čiji rok danas pada pod neko pravilo ------------------------
  const targetDueDates = dueDatesToScan(today, rules)

  const { data: deviceRows, error: deviceError } = await supabase
    .from('devices')
    .select(
      `id, customer_id, next_service_date, status, reminders_enabled, manufacturer, model,
       installed_at, default_service_price, device_type_id,
       customers!inner(id, name, email, reminder_consent, is_active),
       locations(label, city),
       device_types(name),
       qr_tokens(token_hash, is_active)`,
    )
    .eq('organization_id', input.organizationId)
    .is('deleted_at', null)
    .eq('status', 'active')
    .eq('reminders_enabled', true)
    .in('next_service_date', targetDueDates)

  if (deviceError) {
    summary.error = deviceError.message
    return summary
  }

  const devices = deviceRows ?? []
  summary.devicesScanned = devices.length
  if (devices.length === 0) return summary

  // --- Postojeće rezervacije za te uređaje ---------------------------------
  const deviceIds = devices.map((device) => device.id)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('device_id')
    .eq('organization_id', input.organizationId)
    .in('device_id', deviceIds)
    .in('status', ['pending', 'confirmed', 'rescheduled'])
    .gte('starts_at', input.now.toISOString())

  const bookedDeviceIds = new Set((bookings ?? []).map((booking) => booking.device_id))

  // --- Već kreirani podsjetnici (druga linija odbrane) --------------------
  const { data: existingEvents } = await supabase
    .from('reminder_events')
    .select('device_id, rule_id, due_date')
    .eq('organization_id', input.organizationId)
    .in('device_id', deviceIds)

  const existingKeys = new Set(
    (existingEvents ?? []).map((event) =>
      buildDedupeKey(event.device_id, event.rule_id, event.due_date),
    ),
  )

  // --- Odluka: šta danas ide -----------------------------------------------
  const candidates: ReminderCandidate[] = devices.map((device) => {
    const customer = device.customers as unknown as {
      id: string
      name: string
      email: string | null
      reminder_consent: boolean
      is_active: boolean
    }

    return {
      deviceId: device.id,
      customerId: device.customer_id,
      dueDate: device.next_service_date as PlainDate,
      deviceActive: device.status === 'active' && customer.is_active,
      remindersEnabled: device.reminders_enabled,
      reminderConsent: customer.reminder_consent,
      recipientEmail: customer.email,
      hasActiveBooking: bookedDeviceIds.has(device.id),
    }
  })

  const plan = planRemindersForDay({ today, rules, candidates, existingKeys })

  summary.skipped = plan.skipped.length
  for (const skipped of plan.skipped) {
    summary.skippedReasons[skipped.reason] = (summary.skippedReasons[skipped.reason] ?? 0) + 1
  }

  if (plan.planned.length === 0) return summary
  if (input.dryRun) {
    summary.created = plan.planned.length
    return summary
  }

  // --- Kampanja (druga brana idempotentnosti) ------------------------------
  const { data: campaign } = await supabase
    .from('reminder_campaigns')
    .upsert(
      { organization_id: input.organizationId, run_date: today, status: 'running' },
      { onConflict: 'organization_id,run_date', ignoreDuplicates: false },
    )
    .select('id')
    .maybeSingle()

  const branding = await loadOrganizationBranding(input.organizationId)
  const deviceById = new Map(devices.map((device) => [device.id, device]))

  // --- Slanje ---------------------------------------------------------------
  for (const planned of plan.planned) {
    const device = deviceById.get(planned.deviceId)
    if (!device || !branding) continue

    const rule = rules.find((item) => item.id === planned.ruleId)
    if (!rule) continue

    // Zapis se kreira PRIJE slanja. Ako upis padne zbog jedinstvenog indeksa,
    // znači da je poruka već obrađena — preskačemo bez slanja.
    const { data: event, error: eventError } = await supabase
      .from('reminder_events')
      .insert({
        organization_id: input.organizationId,
        campaign_id: campaign?.id ?? null,
        device_id: planned.deviceId,
        customer_id: planned.customerId,
        rule_id: planned.ruleId,
        due_date: planned.dueDate,
        offset_days: planned.offsetDays,
        scheduled_for: planned.scheduledFor,
        channel: planned.channel,
        template_key: planned.templateKey,
        status: 'pending',
        recipient_email: planned.recipientEmail,
      })
      .select('id')
      .single()

    if (eventError || !event) {
      // Jedinstveni indeks je odbio duplikat — to je ispravno ponašanje.
      summary.skipped += 1
      summary.skippedReasons.already_exists = (summary.skippedReasons.already_exists ?? 0) + 1
      continue
    }

    summary.created += 1

    // Siguran, vremenski ograničen link za rezervaciju.
    const rawBookingToken = generateToken('booking')
    const bookingExpiry = new Date(input.now.getTime() + 120 * 24 * 3_600_000)

    const { data: tokenRow } = await supabase
      .from('booking_tokens')
      .insert({
        organization_id: input.organizationId,
        device_id: planned.deviceId,
        token_hash: hashToken(rawBookingToken),
        purpose: 'book',
        expires_at: bookingExpiry.toISOString(),
      })
      .select('id')
      .single()

    const customer = device.customers as unknown as { name: string }
    const deviceType = device.device_types as unknown as { name: string } | null
    const location = device.locations as unknown as { label: string; city: string | null } | null
    const qrToken = (device.qr_tokens as unknown as Array<{ token_hash: string; is_active: boolean }> | null)?.find(
      (token) => token.is_active,
    )

    const daysUntilDue = diffInDays(today, planned.dueDate)
    const variant =
      rule.templateKey === 'service_overdue'
        ? 'overdue'
        : rule.templateKey === 'service_reminder_final'
          ? 'final'
          : 'standard'

    const subject =
      variant === 'overdue'
        ? `Servis je istekao — ${deviceType?.name ?? 'vaš uređaj'}`
        : `Servis dospijeva ${formatDate(planned.dueDate)} — ${deviceType?.name ?? 'vaš uređaj'}`

    const result = await sendEmail({
      organizationId: input.organizationId,
      to: planned.recipientEmail,
      subject,
      templateKey: rule.templateKey,
      entityType: 'reminder_event',
      entityId: event.id,
      // Demo organizacija i istekla pretplata pripremaju poruku, ali je ne šalju.
      allowSend: subscriptionState.canSendEmails,
      element: ServiceReminderEmail({
        branding: {
          companyName: branding.companyName,
          logoUrl: branding.logoUrl,
          phone: branding.phone,
          email: branding.email,
          address: branding.address,
        },
        customerName: customer.name,
        device: {
          typeName: deviceType?.name ?? 'Uređaj',
          manufacturer: device.manufacturer,
          model: device.model,
          installedAt: device.installed_at as PlainDate | null,
          locationLabel: location ? [location.label, location.city].filter(Boolean).join(', ') : null,
        },
        dueDate: planned.dueDate,
        daysUntilDue,
        bookingUrl: bookingTokenUrl(rawBookingToken),
        devicePageUrl: qrToken ? devicePageUrl(rawBookingToken) : null,
        unsubscribeUrl: qrToken ? unsubscribeUrl(rawBookingToken) : null,
        servicePriceKm: device.default_service_price,
        variant,
      }),
    })

    if (result.ok) {
      await supabase
        .from('reminder_events')
        .update({
          status: result.delivered ? 'sent' : 'skipped',
          sent_at: result.delivered ? new Date().toISOString() : null,
          provider_message_id: result.providerMessageId,
          subject,
          booking_token_id: tokenRow?.id ?? null,
          attempt_count: 1,
          cancel_reason: result.delivered ? null : 'Slanje je onemogućeno za ovu organizaciju',
        })
        .eq('id', event.id)

      if (result.delivered) summary.sent += 1
      else summary.skipped += 1
    } else {
      // ★ Neuspjeh se NIKAD ne prikazuje kao uspjeh. ★
      await supabase
        .from('reminder_events')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          last_error: result.error ?? 'Nepoznata greška',
          attempt_count: 1,
        })
        .eq('id', event.id)

      summary.failed += 1

      await supabase.from('notification_events').insert({
        organization_id: input.organizationId,
        type: 'reminder_failed',
        severity: 'critical',
        title: 'Podsjetnik nije poslan',
        body: `Slanje na ${planned.recipientEmail} nije uspjelo: ${result.error ?? 'nepoznata greška'}`,
        link_path: '/app/podsjetnici',
        entity_type: 'reminder_event',
        entity_id: event.id,
      })
    }
  }

  // --- Zaključivanje kampanje ---------------------------------------------
  if (campaign?.id) {
    await supabase
      .from('reminder_campaigns')
      .update({
        status: summary.failed > 0 ? 'partial' : 'completed',
        finished_at: new Date().toISOString(),
        devices_scanned: summary.devicesScanned,
        events_created: summary.created,
        events_sent: summary.sent,
        events_failed: summary.failed,
        events_skipped: summary.skipped,
      })
      .eq('id', campaign.id)
  }

  if (summary.sent > 0) {
    await supabase.rpc('bump_usage' as never, {
      target_org: input.organizationId,
      metric_name: 'reminders_sent',
      amount: summary.sent,
    } as never)
  }

  return summary
}
