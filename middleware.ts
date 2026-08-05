import { NextResponse, type NextRequest } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { updateSession } from '@/server/supabase/middleware';

/**
 * Root middleware — Supabase token refresh, and nothing else.
 *
 * Authorisation deliberately does not live here. Route guards run in
 * `@/server/auth/context`, where the organisation and role are already resolved; a
 * second, cookie-shaped copy of that logic in the Edge runtime would be the copy that
 * drifts. This layer only keeps the session alive.
 *
 * In offline mode there is no session at all, so the middleware is a pass-through and a
 * clean checkout never pays for it.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except the paths that can never carry a session worth refreshing:
     * immutable build output, the favicon, and image requests. Each of those would
     * otherwise cost a token-refresh round trip per asset on a cold page load.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
