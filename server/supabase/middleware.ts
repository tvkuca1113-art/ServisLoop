import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@/lib/database.types';
import { env } from '@/lib/env';

/**
 * Session refresh for the Next middleware.
 *
 * Supabase access tokens are short-lived. A Server Component cannot write cookies, so a
 * token that expires mid-render cannot be rotated where it is used — the refresh has to
 * happen somewhere that still owns the response. That somewhere is here: this runs
 * before every matched request, calls `auth.getUser()` to trigger a refresh if one is
 * due, and writes the rotated cookies onto the response.
 *
 * Without this, the app would work until the first token expiry and then log people out
 * apparently at random.
 *
 * No `server-only` import: middleware runs in the Edge runtime, and this module must
 * stay importable from the root `middleware.ts`.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { supabaseUrl, supabaseAnonKey } = env;

  // Offline mode has no session to refresh. The root middleware already checks this;
  // repeating it here keeps the helper safe to call directly and narrows the types.
  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        // The request cookies are updated first so that anything downstream in this
        // same pass reads the refreshed token, then the response is rebuilt from the
        // updated request and the rotated cookies are attached to it.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // `no-store` and friends. A cached response carrying auth cookies would serve
        // one user's session to the next visitor through a CDN.
        for (const [key, headerValue] of Object.entries(headers)) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });

  // Do not remove: this is the call that performs the refresh. Anything that only reads
  // the cookie (`getSession`) would leave an expired token in place.
  await supabase.auth.getUser();

  return response;
}
