'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { absoluteUrl, isSupabaseConfigured } from '@/lib/env';
import { ACTIVE_ORG_COOKIE, DEMO_USER_COOKIE } from '@/server/auth/context';
import { isDemoIdentity } from '@/server/auth/demo-identities';

import { guard } from './errors';
import { fail, ok, type ActionResult } from './result';

/**
 * Authentication actions.
 *
 * These are the only actions in the application that do **not** begin with
 * `requirePermission()`, for the obvious reason: they run before there is a session to
 * check. Their guard is different and stated explicitly at each call site — sign-in and
 * sign-up defer to Supabase Auth, and the demo identity switcher refuses to run at all
 * unless `isSupabaseConfigured()` is false.
 *
 * Every action returns an {@link ActionResult}; nothing throws to the client. The one
 * exception is `redirect()`, which is Next's control-flow mechanism and is re-thrown by
 * `guard` on purpose.
 */

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  } as const;
}

/**
 * Only same-origin relative paths are accepted as a post-sign-in destination.
 *
 * `//evil.example` is a protocol-relative URL that a browser treats as absolute, so
 * "starts with a slash" is not sufficient on its own.
 */
function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '/app';
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

/* ------------------------------------------------------------------ */
/* Email + password                                                    */
/* ------------------------------------------------------------------ */

const credentialsSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export async function signInWithPassword(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not sign you in. Please try again.', async () => {
    if (!isSupabaseConfigured()) {
      return fail(
        'No authentication backend is configured, so there is nothing to sign in to. Pick a demo identity instead.',
      );
    }

    const parsed = credentialsSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      return fail('Check the details below.', z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }

    const { createServerSupabaseClient } = await import('@/server/supabase/server');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    // Supabase deliberately does not say which of the two was wrong, and neither do we —
    // distinguishing them would confirm whether an address has an account.
    if (error) return fail('That email and password combination was not recognised.');

    revalidatePath('/', 'layout');
    redirect(safeNextPath(formData.get('next')));
  });
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: z.email('Enter a valid email address.'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters — length beats complexity.')
    .max(200, 'That password is too long.'),
});

export async function signUpWithPassword(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not create your account. Please try again.', async () => {
    if (!isSupabaseConfigured()) {
      return fail(
        'No authentication backend is configured, so accounts cannot be created. Explore the demo organisation instead.',
      );
    }

    const parsed = signUpSchema.safeParse({
      fullName: formData.get('fullName'),
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      return fail('Check the details below.', z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }

    const { createServerSupabaseClient } = await import('@/server/supabase/server');
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: absoluteUrl('/auth/callback'),
        data: { full_name: parsed.data.fullName },
      },
    });

    if (error) return fail(error.message);

    // With email confirmation on, Supabase returns a user but no session.
    if (data.session === null) {
      return ok(
        null,
        `Check ${parsed.data.email} for a confirmation link. It expires in one hour.`,
      );
    }

    revalidatePath('/', 'layout');
    redirect('/app');
  });
}

/* ------------------------------------------------------------------ */
/* Magic link                                                          */
/* ------------------------------------------------------------------ */

const magicLinkSchema = z.object({ email: z.email('Enter a valid email address.') });

export async function sendMagicLink(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not send the sign-in link. Please try again.', async () => {
    if (!isSupabaseConfigured()) {
      return fail('No authentication backend is configured, so no link can be sent.');
    }

    const parsed = magicLinkSchema.safeParse({ email: formData.get('email') });
    if (!parsed.success) {
      return fail('Check the details below.', z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }

    const { createServerSupabaseClient } = await import('@/server/supabase/server');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: absoluteUrl('/auth/callback'), shouldCreateUser: false },
    });

    if (error) return fail(error.message);

    return ok(
      null,
      `If ${parsed.data.email} has an account, a sign-in link is on its way. It is valid for one hour.`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Sign out                                                            */
/* ------------------------------------------------------------------ */

/**
 * End the session and return to the marketing site.
 *
 * Clears the offline identity and active-organisation cookies too, so signing out of a
 * demo genuinely resets it rather than leaving the next visitor as whoever was last
 * selected. Also reachable without JavaScript at `POST /auth/sign-out`.
 */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const { createServerSupabaseClient } = await import('@/server/supabase/server');
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // A failed revocation must not trap someone in a session they asked to leave; the
      // cookies are cleared below regardless.
    }
  }

  const store = await cookies();
  store.delete(DEMO_USER_COOKIE);
  store.delete(ACTIVE_ORG_COOKIE);

  revalidatePath('/', 'layout');
  redirect('/');
}

/* ------------------------------------------------------------------ */
/* Offline identity switcher                                           */
/* ------------------------------------------------------------------ */

const demoIdentitySchema = z.object({
  userId: z.uuid('Pick one of the demo identities.'),
});

/**
 * Become one of the seeded demo members.
 *
 * Refuses outright when Supabase is configured. This is the security boundary that keeps
 * an "impersonate anyone" control out of a real deployment — it is checked here, in the
 * action, not merely hidden in the UI.
 */
export async function switchDemoIdentity(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not switch identity.', async () => {
    if (isSupabaseConfigured()) {
      return fail('Identity switching is only available in offline demo mode.');
    }

    const parsed = demoIdentitySchema.safeParse({ userId: formData.get('userId') });
    if (!parsed.success) return fail('Pick one of the demo identities.');

    if (!(await isDemoIdentity(parsed.data.userId))) {
      return fail('That is not a member of the demo organisation.');
    }

    const store = await cookies();
    store.set(DEMO_USER_COOKIE, parsed.data.userId, sessionCookieOptions());
    // The new identity may not belong to the previously active organisation; dropping the
    // cookie lets `getSession()` fall back to their first membership.
    store.delete(ACTIVE_ORG_COOKIE);

    revalidatePath('/', 'layout');
    redirect(safeNextPath(formData.get('next')));
  });
}
