import { NextResponse, type NextRequest } from 'next/server';

import { submitBooking } from '@/server/actions/intake';
import { getRepository } from '@/server/data';

/**
 * `POST /api/public/booking` — the booking form, as JSON.
 *
 * Exists so an integration (a customer's facilities system, a kiosk, an IVR) can request
 * an appointment without driving a browser. It is the same code path as the form: the
 * body is turned into `FormData` and handed to `submitBooking`, so validation, the
 * server-side slot re-check and the audit entry cannot drift between the two entry
 * points. There is exactly one implementation of what a booking means.
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────────
 * The only scope is `publicToken` in the body. There is no organisation parameter and no
 * key: a caller can act on precisely the devices whose QR codes they hold, and nothing
 * else. Tenancy is derived from the device the token names.
 *
 * ── WHY 404 AND NEVER 403 ────────────────────────────────────────────────────
 * An unknown token, a malformed token and a missing token all return the same 404 with
 * the same body. A 403 would confirm that a token exists but is not permitted, which
 * turns this endpoint into an oracle: an attacker could grind tokens and learn which ones
 * are real without ever booking anything. Refusing to distinguish the cases is what makes
 * the token's entropy actually worth something.
 */

export const dynamic = 'force-dynamic';

/** Nothing legitimate comes close. Rejected before the body is parsed. */
const MAX_BODY_BYTES = 64 * 1024;

const NOT_FOUND = { ok: false as const, error: 'Not found.' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accept a string or a number for every field; anything else is treated as absent. */
function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'Request body is too large.' }, 413);
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return json({ ok: false, error: 'Send a JSON object.' }, 400);
  }

  const token = scalar(body.publicToken);
  if (token === null || token.length < 16 || token.length > 256) return json(NOT_FOUND, 404);

  // Resolve the token before anything else. This is the only thing that decides whether
  // the caller is talking to a real device, and it answers with a 404 either way.
  const repo = getRepository();
  const context = await repo.getDeviceContextByToken(token);
  if (!context) return json(NOT_FOUND, 404);

  const formData = new FormData();
  formData.set('publicToken', token);
  for (const field of ['date', 'startMinute', 'contactName', 'contactEmail', 'contactPhone', 'note']) {
    const value = scalar(body[field]);
    if (value !== null) formData.set(field, value);
  }

  const result = await submitBooking(formData);

  if (!result.ok) {
    return json(
      { ok: false, error: result.error, fieldErrors: result.fieldErrors ?? {} },
      // A valid token with a bad or now-unavailable slot is the caller's problem to fix,
      // so it gets a 400 with the same field errors the form would show.
      400,
    );
  }

  return json({ ok: true, data: result.data, message: result.message ?? 'Booking requested.' }, 201);
}
