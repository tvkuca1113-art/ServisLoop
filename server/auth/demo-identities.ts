import 'server-only';

import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/domain/permissions';
import { ROLE_RANK, type Role, type UUID } from '@/domain/types';
import { isSupabaseConfigured } from '@/lib/env';
import { getRepository } from '@/server/data';
import { DEMO } from '@/server/data/seed';

/**
 * The four people in the demo organisation, for the offline identity switcher.
 *
 * With no auth backend there is nobody to sign in as, so the sign-in page and the demo
 * banner let you *become* one of the seeded members instead. That is what makes the role
 * gates testable on a clean checkout: pick the technician and watch the member-management
 * controls disappear.
 *
 * Read from the repository rather than hard-coded, so the roles shown are the roles the
 * permission checks will actually use — including any change made through the members UI.
 */

export interface DemoIdentity {
  id: UUID;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  roleDescription: string;
}

/** Empty when Supabase is configured — the switcher must never exist in production. */
export async function listDemoIdentities(): Promise<DemoIdentity[]> {
  if (isSupabaseConfigured()) return [];

  const repo = getRepository();
  const memberships = await repo.listMemberships(DEMO.orgId);
  if (memberships.length === 0) return [];

  const profiles = await repo.listProfiles(memberships.map((m) => m.userId));
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return memberships
    .flatMap((membership) => {
      const profile = byId.get(membership.userId);
      if (!profile) return [];
      return [
        {
          id: profile.id,
          name: profile.fullName ?? profile.email,
          email: profile.email,
          role: membership.role,
          roleLabel: ROLE_LABELS[membership.role],
          roleDescription: ROLE_DESCRIPTIONS[membership.role],
        },
      ];
    })
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name));
}

/** Is this id one of the demo members? Guards the identity-switch action. */
export async function isDemoIdentity(userId: string): Promise<boolean> {
  const identities = await listDemoIdentities();
  return identities.some((identity) => identity.id === userId);
}
