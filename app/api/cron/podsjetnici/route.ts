import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronRequest } from '@/lib/security/cron-auth'
import { runReminderJob } from '@/services/reminders/run-reminders'

/**
 * Dnevni posao slanja servisnih podsjetnika.
 *
 * Pokreće ga Vercel Cron (vidi `vercel.json`) jednom dnevno.
 * Zaštita: `Authorization: Bearer <CRON_SECRET>` — bez toga ruta vraća 401.
 *
 * Ruta je IDEMPOTENTNA. Pokretanje dva puta istog dana neće poslati nijednu
 * poruku dvaput (vidi `services/reminders/run-reminders.ts`).
 *
 * Namjerno ne koristi Edge runtime: posao radi s bazom i e-poštom, ponekad
 * traje duže od nekoliko sekundi i treba mu puni Node.js.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  try {
    const result = await runReminderJob()

    if (result.alreadyCompleted) {
      return NextResponse.json({
        ok: true,
        message: 'Posao je za današnji dan već obavljen. Ništa nije poslano ponovo.',
        runDate: result.runDate,
      })
    }

    return NextResponse.json({
      ok: result.ok,
      runDate: result.runDate,
      durationMs: result.durationMs,
      totals: result.totals,
      organizations: result.organizations.map((summary) => ({
        id: summary.organizationId,
        name: summary.organizationName,
        runDate: summary.runDate,
        devicesScanned: summary.devicesScanned,
        created: summary.created,
        sent: summary.sent,
        failed: summary.failed,
        skipped: summary.skipped,
        skippedReasons: summary.skippedReasons,
        error: summary.error,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Detalj greške ide u log, a odgovor ostaje bez internih podataka.
    console.error('[cron:podsjetnici] Posao nije uspio:', message)
    return NextResponse.json(
      { ok: false, error: 'Posao slanja podsjetnika nije uspio. Provjerite /app/admin.' },
      { status: 500 },
    )
  }
}

/** POST radi isto — Vercel Cron koristi GET, ali ručno pokretanje je lakše POST-om. */
export const POST = GET
