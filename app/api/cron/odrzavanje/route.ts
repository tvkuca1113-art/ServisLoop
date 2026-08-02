import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronRequest } from '@/lib/security/cron-auth'
import { createServiceSupabase } from '@/lib/supabase/service'
import { addDays, todayInTimeZone } from '@/domains/shared/plain-date'

/**
 * Noćno održavanje.
 *
 * Poslovi koji nisu hitni, ali bez kojih baza polako raste i usporava:
 *   • brisanje isteklih brojača ograničenja pristupa;
 *   • označavanje isteklih pozivnica;
 *   • označavanje isteklih linkova za rezervaciju;
 *   • obavijest o probnom periodu koji ističe;
 *   • brisanje stare interne analitike.
 *
 * Idempotentno: `cron_runs (job, run_date)` sprječava dvostruko pokretanje.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const supabase = createServiceSupabase()
  const runDate = new Date().toISOString().slice(0, 10)
  const summary: Record<string, number> = {}

  const { data: existing } = await supabase
    .from('cron_runs')
    .select('id, status')
    .eq('job', 'maintenance')
    .eq('run_date', runDate)
    .maybeSingle()

  if (existing?.status === 'completed') {
    return NextResponse.json({ ok: true, message: 'Održavanje je već obavljeno danas.' })
  }

  const { data: run } = await supabase
    .from('cron_runs')
    .upsert(
      { job: 'maintenance', run_date: runDate, status: 'running' },
      { onConflict: 'job,run_date' },
    )
    .select('id')
    .maybeSingle()

  try {
    const now = new Date().toISOString()

    // 1. Istekli brojači ograničenja pristupa.
    const { count: rateLimits } = await supabase
      .from('rate_limits')
      .delete({ count: 'exact' })
      .lt('expires_at', now)
    summary.obrisaniBrojaci = rateLimits ?? 0

    // 2. Istekle pozivnice.
    const { count: invitations } = await supabase
      .from('invitations')
      .update({ status: 'expired' }, { count: 'exact' })
      .eq('status', 'pending')
      .lt('expires_at', now)
    summary.isteklePozivnice = invitations ?? 0

    // 3. Stara interna analitika (starija od 400 dana).
    const cutoff = addDays(todayInTimeZone('UTC'), -400)
    const { count: analytics } = await supabase
      .from('analytics_events')
      .delete({ count: 'exact' })
      .lt('occurred_at', `${cutoff}T00:00:00Z`)
    summary.obrisaniDogadjaji = analytics ?? 0

    // 4. Obavijest firmama kojima probni period ističe za 3 dana.
    const trialWarningDate = addDays(todayInTimeZone('UTC'), 3)
    const { data: expiring } = await supabase
      .from('organization_subscriptions')
      .select('organization_id')
      .eq('status', 'trialing')
      .eq('trial_ends_on', trialWarningDate)

    for (const subscription of expiring ?? []) {
      await supabase.from('notification_events').insert({
        organization_id: subscription.organization_id,
        type: 'trial_ending',
        severity: 'warning',
        title: 'Probni period ističe za 3 dana',
        body: 'Podaci ostaju sačuvani, ali automatsko slanje podsjetnika će biti zaustavljeno.',
        link_path: '/app/postavke/pretplata',
      })
    }
    summary.obavijestiOProbnomPeriodu = (expiring ?? []).length

    if (run?.id) {
      await supabase
        .from('cron_runs')
        .update({ status: 'completed', finished_at: new Date().toISOString(), summary })
        .eq('id', run.id)
    }

    return NextResponse.json({ ok: true, runDate, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (run?.id) {
      await supabase
        .from('cron_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error_text: message })
        .eq('id', run.id)
    }
    console.error('[cron:odrzavanje] Posao nije uspio:', message)
    return NextResponse.json({ ok: false, error: 'Održavanje nije uspjelo.' }, { status: 500 })
  }
}

export const POST = GET
