import { timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { civilDateFromUTC, tryCivilDate } from '@/domain/dates';
import { env } from '@/lib/env';
import { DEFAULT_DISPATCH_LIMIT, dispatchDueReminders } from '@/server/notify/dispatch';

/**
 * The reminder dispatch job.
 *
 * `POST /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET`.
 *
 * Point any scheduler at it — Vercel Cron, GitHub Actions, systemd, a cron line running
 * `curl`. Once a day is the intended cadence; running it hourly, or twice in the same
 * minute, is harmless. See `src/server/notify/dispatch.ts` for why: the reminder ladder is
 * keyed on `(deviceId, dueDate, stage)`, only `pending` rows are ever selected, and the
 * `pending → sent` transition happens immediately after handover, so a second run finds
 * nothing left to send and reports `{ sent: 0 }`.
 *
 * **POST only.** There is no `GET`, so Next answers other methods with 405 automatically.
 * A job that changes state and sends email to customers must not be reachable from a link,
 * a prefetch or a crawler.
 *
 * **Authentication is a timing-safe comparison of the whole header.** `===` on a secret
 * leaks its prefix through response timing; `timingSafeEqual` does not. It throws when the
 * two buffers differ in length, so the length is checked first — which does leak the
 * secret's length, an accepted and unavoidable trade for a fixed-length shared token.
 *
 * The job runs with no session: it is cross-tenant by design, sweeping every organisation
 * in one pass. The bearer token is the entire authorisation, which is why it is compared
 * this carefully and why a missing secret disables the endpoint outright.
 */

export const dynamic = 'force-dynamic';
/** `node:crypto` and the file-backed repository both need the Node.js runtime. */
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Constant-time string comparison, guarded on length. */
function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = env.cronSecret;

  if (!expected) {
    // Not 401: nothing is wrong with the request. The deployment has no secret to
    // authenticate anyone against, and an endpoint that dispatches customer email must
    // refuse rather than default to open. Saying so plainly is what gets it fixed.
    return NextResponse.json(
      {
        error:
          'CRON_SECRET is not set on this deployment, so reminder dispatch is disabled. Set it and redeploy.',
      },
      { status: 503, headers: NO_STORE },
    );
  }

  const presented = request.headers.get('authorization') ?? '';
  if (!secretsMatch(presented, `Bearer ${expected}`)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });
  }

  // `today` may be pinned for a backfill or a test run; otherwise it is the UTC calendar
  // day. UTC rather than an organisation's zone because this pass spans every tenant, and
  // the grace window in `selectDueReminders` absorbs the one-day edge either way.
  const requestedToday = tryCivilDate(request.nextUrl.searchParams.get('today'));
  const today = requestedToday ?? civilDateFromUTC(new Date());

  const requestedLimit = Number(request.nextUrl.searchParams.get('limit'));
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 1000)
      : DEFAULT_DISPATCH_LIMIT;

  try {
    const summary = await dispatchDueReminders({ today, limit });

    return NextResponse.json(
      {
        ok: true,
        today,
        ...summary,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    // A failure here is infrastructure — the store is unreachable, not one bad address.
    // Individual send failures never reach this handler; they are recorded on the row and
    // counted in `failed`.
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Reminder dispatch failed.',
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
