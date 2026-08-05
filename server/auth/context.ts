import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { civilDateInTimeZone } from '@/domain/dates';
import type { CivilDate } from '@/domain/dates';
import { assertCan, can, type Action, type PermissionContext } from '@/domain/permissions';
import type { Membership, Organization, Profile, Role, UUID } from '@/domain/types';
import { isSupabaseConfigured } from '@/lib/env';
import { getRepository } from '@/server/data';
import { DEMO } from '@/server/data/seed';

/**
 * Session and organisation context.
 *
 * Everything that needs to know "who is asking, on behalf of which organisation, and
 * what may they do" goes through here. Route handlers, server actions and pages all call
 * `requireSession()`; nothing reconstructs this from cookies itself.
 *
 * In offline mode there is no Supabase Auth, so the demo owner is signed in
 * automatically. That is what makes a clean checkout immediately usable — and it is
 * gated on `isSupabaseConfigured()` being false, so it can never apply in production.
 */

export const ACTIVE_ORG_COOKIE = 'servisloop_org';
export const DEMO_USER_COOKIE = 'servisloop_demo_user';

export interface SessionContext {
  user: Profile;
  organization: Organization;
  membership: Membership;
  role: Role;
  /** Today in the organisation's timezone. Pass this into every domain call. */
  today: CivilDate;
  /** All organisations this user belongs to, for the switcher. */
  organizations: Organization[];
  isOffline: boolean;
}

/** Resolve the signed-in user id, or `null` when nobody is signed in. */
async function resolveUserId(): Promise<UUID | null> {
  if (!isSupabaseConfigured()) {
    // Offline demo mode: allow switching identity to test the role gates.
    const store = await cookies();
    return store.get(DEMO_USER_COOKIE)?.value ?? DEMO.ownerId;
  }

  const { createServerSupabaseClient } = await import('@/server/supabase/server');
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Only used to heal a missing profile row; never on the hot path. */
async function resolveUserEmail(userId: UUID): Promise<string> {
  if (!isSupabaseConfigured()) return `${userId}@demo.servisloop.app`;
  const { createServerSupabaseClient } = await import('@/server/supabase/server');
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? `${userId}@unknown.invalid`;
}

/**
 * Why this is a three-state machine rather than `SessionContext | null`.
 *
 * "Not signed in" and "signed in but belongs to no organisation" need opposite responses.
 * Collapsing them into `null` sends a brand-new account back to `/sign-in`, where it signs
 * in successfully and is bounced straight back — an infinite loop with no way out, which
 * is exactly what a fresh Supabase deployment hits on its very first signup.
 */
export type SessionState =
  | { status: 'anonymous' }
  | { status: 'no_organization'; user: Profile }
  | { status: 'ready'; session: SessionContext };

export const getSessionState = cache(async (): Promise<SessionState> => {
  const userId = await resolveUserId();
  if (!userId) return { status: 'anonymous' };

  const repo = getRepository();
  const [existingProfile, organizations] = await Promise.all([
    repo.getProfile(userId),
    repo.listOrganizationsForUser(userId),
  ]);

  // A profile is normally created by the `handle_new_user` trigger. If that has not run
  // — a user created before the trigger existed, or seeded directly — heal it here rather
  // than locking the account out of its own application.
  const user =
    existingProfile ??
    (await repo.upsertProfile({
      id: userId,
      email: await resolveUserEmail(userId),
      fullName: null,
      createdAt: new Date().toISOString(),
    }));

  if (organizations.length === 0) return { status: 'no_organization', user };

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const organization =
    organizations.find((o) => o.id === requestedOrgId) ?? (organizations[0] as Organization);

  const membership = await repo.getMembership(organization.id, userId);
  if (!membership) return { status: 'no_organization', user };

  return {
    status: 'ready',
    session: {
      user,
      organization,
      membership,
      role: membership.role,
      today: civilDateInTimeZone(new Date(), organization.timezone),
      organizations,
      isOffline: !isSupabaseConfigured(),
    },
  };
});

/**
 * The current context, or `null` when there isn't one for any reason.
 *
 * Kept for callers that only need "is there a usable session?" — guards that must react
 * differently to the two failure modes should use {@link getSessionState}.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const state = await getSessionState();
  return state.status === 'ready' ? state.session : null;
});

/** Context, or a redirect to the right place to fix whatever is missing. */
export async function requireSession(): Promise<SessionContext> {
  const state = await getSessionState();
  if (state.status === 'anonymous') redirect('/sign-in');
  if (state.status === 'no_organization') redirect('/onboarding');
  return state.session;
}

/**
 * Context plus an authorisation check.
 *
 * Throws `ForbiddenError` when the role is insufficient. Pair this with the RLS policies
 * rather than instead of them: the application check produces a good error message, the
 * database check is the one that cannot be bypassed.
 */
export async function requirePermission(
  action: Action,
  ctx: PermissionContext = {},
): Promise<SessionContext> {
  const session = await requireSession();
  assertCan(session.role, action, ctx);
  return session;
}

/** Non-throwing check, for hiding UI a user cannot use. */
export async function sessionCan(
  action: Action,
  ctx: PermissionContext = {},
): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return can(session.role, action, ctx);
}
