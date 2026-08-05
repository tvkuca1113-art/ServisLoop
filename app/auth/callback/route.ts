import { NextResponse, type NextRequest } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { getRepository } from '@/server/data';

export const dynamic = 'force-dynamic';

/**
 * Where every Supabase email link lands: confirmation, magic link, invitation, recovery.
 *
 * Two flows arrive here and both are supported, because which one Supabase uses depends on
 * the project's email templates rather than on anything this application controls:
 *
 * - `?code=…`                    — PKCE. Exchanged for a session.
 * - `?token_hash=…&type=…`       — the older one-time-token links.
 *
 * The session cookies are written by the Supabase client through the cookie adapter in
 * `@/server/supabase/server`, so there is nothing to set by hand here.
 */

/** Link types we accept. Anything else is a malformed or tampered URL. */
const OTP_TYPES = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email', 'email_change']);

/** Only same-origin relative paths, so the link cannot be used as an open redirect. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));

  const failure = (reason: string): NextResponse =>
    NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(reason)}`, url.origin));

  if (!isSupabaseConfigured()) {
    // Nothing issued this link, so nothing can honour it.
    return NextResponse.redirect(new URL('/sign-in', url.origin));
  }

  // Supabase reports failures by appending them to the redirect, before we ever get a code.
  const providerError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (providerError) return failure(providerError);

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const { createServerSupabaseClient } = await import('@/server/supabase/server');
  const supabase = await createServerSupabaseClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failure(error.message);
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return failure(error.message);
  } else {
    return failure('missing_code');
  }

  const { data, error: userError } = await supabase.auth.getUser();
  const user = data.user;
  if (userError || !user) return failure(userError?.message ?? 'no_user');

  // `handle_new_user()` mirrors auth.users into public.profiles, but a link can arrive
  // against a database where that trigger has not been applied. Backfilling here — best
  // effort — is what stops that from becoming a silent redirect loop.
  const repo = getRepository();
  try {
    const profile = await repo.getProfile(user.id);
    if (!profile) {
      const metadata = user.user_metadata as { full_name?: unknown };
      await repo.upsertProfile({
        id: user.id,
        email: user.email ?? '',
        fullName: typeof metadata.full_name === 'string' ? metadata.full_name : null,
        createdAt: user.created_at ?? new Date().toISOString(),
      });
    }

    // Signed in, but nobody has added them to an organisation. Say so, rather than
    // bouncing them between `/app` and `/sign-in` forever.
    const organizations = await repo.listOrganizationsForUser(user.id);
    if (organizations.length === 0) {
      return NextResponse.redirect(new URL('/sign-in?state=no-organisation', url.origin));
    }
  } catch {
    // A read failure here is not a reason to reject a valid session — `requireSession()`
    // will make the same decision on the next request, with a page to show for it.
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
