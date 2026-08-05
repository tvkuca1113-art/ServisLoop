import { NextResponse, type NextRequest } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { ACTIVE_ORG_COOKIE, DEMO_USER_COOKIE } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

/**
 * Sign out.
 *
 * A route handler rather than only a server action, so the control in the user menu can be
 * a plain `<form method="post">` that works with JavaScript disabled or still loading.
 *
 * POST only: a `GET /auth/sign-out` could be fired by any `<img src>` on any page and
 * would let a third-party site sign people out of ServisLoop for fun.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isSupabaseConfigured()) {
    try {
      const { createServerSupabaseClient } = await import('@/server/supabase/server');
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // A failed token revocation must not trap someone in a session they asked to leave.
      // The cookies below are cleared either way.
    }
  }

  // 303 so the browser follows with GET — a 307 would repeat the POST against `/`.
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.delete(DEMO_USER_COOKIE);
  response.cookies.delete(ACTIVE_ORG_COOKIE);
  return response;
}
