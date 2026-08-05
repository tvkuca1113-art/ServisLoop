import { NextResponse, type NextRequest } from 'next/server';

import { submitIssue } from '@/server/actions/intake';
import { getRepository } from '@/server/data';

/**
 * `POST /api/public/issue` — the fault report form, as JSON.
 *
 * For building-management systems and monitoring kit that can raise a fault themselves:
 * a BMS that sees a boiler lock out at 03:00 can file the report before anyone walks into
 * the plant room. Same code path as the public form — the body becomes `FormData` and
 * goes to `submitIssue` — so the length caps, the required title and the audit entry are
 * identical whichever way the report arrives.
 *
 * Scoped solely by `publicToken` in the body: one token, one device, one organisation.
 * An unknown, malformed or missing token returns 404 with an identical body, never 403 —
 * see the note on the booking route for why that distinction matters.
 */

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

const NOT_FOUND = { ok: false as const, error: 'Not found.' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

  const repo = getRepository();
  const context = await repo.getDeviceContextByToken(token);
  if (!context) return json(NOT_FOUND, 404);

  const formData = new FormData();
  formData.set('publicToken', token);
  for (const field of [
    'severity',
    'title',
    'description',
    'reporterName',
    'reporterEmail',
    'reporterPhone',
  ]) {
    const value = scalar(body[field]);
    if (value !== null) formData.set(field, value);
  }

  const result = await submitIssue(formData);

  if (!result.ok) {
    return json({ ok: false, error: result.error, fieldErrors: result.fieldErrors ?? {} }, 400);
  }

  return json({ ok: true, data: result.data, message: result.message ?? 'Report received.' }, 201);
}
