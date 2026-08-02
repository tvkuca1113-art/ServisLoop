import { NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { checkServerEnv, isSupabaseConfigured, publicEnv } from '@/lib/env'

/**
 * Provjera zdravlja sistema.
 *
 * Namijenjena osnivaču i vanjskom nadzoru. Odgovara na jedno pitanje:
 * „Radi li sve što treba da bi podsjetnici otišli?“
 *
 * Namjerno NE otkriva vrijednosti tajni — samo je li svaka postavljena.
 * Ruta je javna jer mora biti dostupna alatu za nadzor, ali iz odgovora se
 * ne može ništa iskoristiti za napad.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CheckResult {
  ok: boolean
  detail: string
}

export async function GET() {
  const startedAt = Date.now()
  const checks: Record<string, CheckResult> = {}

  // --- Konfiguracija --------------------------------------------------------
  const envCheck = checkServerEnv()
  checks.konfiguracija = {
    ok: envCheck.ok,
    detail: envCheck.ok
      ? 'Sve obavezne varijable su postavljene.'
      : `Nedostaje: ${envCheck.issues.join('; ')}`,
  }

  checks.supabase_javni_kljucevi = {
    ok: isSupabaseConfigured(),
    detail: isSupabaseConfigured()
      ? 'Postavljeni.'
      : 'Nedostaje NEXT_PUBLIC_SUPABASE_URL ili NEXT_PUBLIC_SUPABASE_ANON_KEY.',
  }

  // --- Baza ------------------------------------------------------------------
  if (isSupabaseConfigured() && envCheck.ok) {
    try {
      const supabase = createServiceSupabase()
      const { error } = await supabase
        .from('plan_definitions')
        .select('code', { count: 'exact', head: true })

      checks.baza = error
        ? { ok: false, detail: `Upit nije uspio: ${error.message}` }
        : { ok: true, detail: 'Veza radi.' }
    } catch (error) {
      checks.baza = {
        ok: false,
        detail: error instanceof Error ? error.message : 'Nepoznata greška.',
      }
    }
  } else {
    checks.baza = { ok: false, detail: 'Preskočeno — konfiguracija nije potpuna.' }
  }

  // --- Dnevni posao ----------------------------------------------------------
  if (checks.baza.ok) {
    try {
      const supabase = createServiceSupabase()
      const { data } = await supabase
        .from('cron_runs')
        .select('run_date, status, finished_at')
        .eq('job', 'reminders')
        .order('run_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!data) {
        checks.podsjetnici = {
          ok: true,
          detail: 'Posao još nije pokrenut (očekivano kod novog sistema).',
        }
      } else {
        // Posao stariji od 48 sati znači da cron ne radi.
        const ageMs = Date.now() - new Date(`${data.run_date}T00:00:00Z`).getTime()
        const stale = ageMs > 48 * 3_600_000
        checks.podsjetnici = {
          ok: !stale && data.status !== 'failed',
          detail: stale
            ? `Zadnje pokretanje: ${data.run_date} — starije od 48 sati. Provjerite Vercel Cron.`
            : `Zadnje pokretanje: ${data.run_date}, status: ${data.status}.`,
        }
      }
    } catch {
      checks.podsjetnici = { ok: false, detail: 'Nije moguće pročitati historiju poslova.' }
    }
  } else {
    checks.podsjetnici = { ok: false, detail: 'Preskočeno — baza nije dostupna.' }
  }

  // --- E-pošta ---------------------------------------------------------------
  const emailConfigured = Boolean(process.env.RESEND_API_KEY)
  const dryRun = process.env.EMAIL_DRY_RUN === '1'
  checks.epošta = {
    // Pregled način nije greška — to je namjeran izbor.
    ok: true,
    detail: dryRun
      ? 'Pregled način (EMAIL_DRY_RUN=1) — poruke se pripremaju, ali se ne šalju.'
      : emailConfigured
        ? 'Slanje je aktivno.'
        : 'Pregled način — RESEND_API_KEY nije postavljen.',
  }

  const allOk = Object.values(checks).every((check) => check.ok)

  return NextResponse.json(
    {
      ok: allOk,
      aplikacija: 'ServisLoop',
      url: publicEnv.NEXT_PUBLIC_APP_URL,
      vrijeme: new Date().toISOString(),
      trajanjeMs: Date.now() - startedAt,
      provjere: checks,
    },
    {
      status: allOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}
