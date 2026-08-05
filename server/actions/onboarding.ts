'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { defaultBusinessHours } from '@/domain/availability';
import type { Organization } from '@/domain/types';
import { slugify } from '@/lib/utils';
import { getRepository } from '@/server/data';
import { ACTIVE_ORG_COOKIE, getSessionState } from '@/server/auth/context';

import { fail, type ActionResult } from './result';

/**
 * First-run organisation creation.
 *
 * This is the missing half of sign-up. Supabase's `handle_new_user` trigger gives a new
 * account a profile row, but a profile with no membership can see nothing — so without
 * this flow the very first user of a fresh deployment signs in successfully and is bounced
 * straight back to the sign-in page forever.
 *
 * Creating an organisation is deliberately *not* permission-gated: the person doing it has
 * no role anywhere yet, which is the whole point. What is gated is that they must be
 * authenticated, and they become its `owner`.
 */

/** Timezones offered at setup. Any IANA zone works; these are just the common ones here. */
export async function listCommonTimezones(): Promise<string[]> {
  return [
    'Europe/Sarajevo',
    'Europe/Zagreb',
    'Europe/Belgrade',
    'Europe/Ljubljana',
    'Europe/Vienna',
    'Europe/Berlin',
    'Europe/Zurich',
    'Europe/London',
    'UTC',
  ];
}

const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Give the organisation a name.').max(80, 'That name is too long.'),
  timezone: z
    .string()
    .trim()
    .min(1, 'Pick a timezone.')
    .refine((tz) => {
      // Validate against the platform rather than a hard-coded list: an unknown zone would
      // silently corrupt every civil-date projection the app makes.
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'That is not a recognised timezone.'),
});

/** Find a free slug, suffixing on collision rather than failing the whole signup. */
async function allocateSlug(base: string): Promise<string> {
  const repo = getRepository();
  const root = slugify(base) || 'organisation';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const existing = await repo.getOrganizationBySlug(candidate);
    if (!existing) return candidate;
  }
  // 50 collisions on one name means something is wrong, but a random tail still beats
  // refusing to create the account.
  return `${root}-${Math.floor(Date.now() % 100000)}`;
}

export async function createOrganizationForCurrentUser(
  formData: FormData,
): Promise<ActionResult<null>> {
  const state = await getSessionState();
  if (state.status === 'anonymous') return fail('Sign in first.');
  if (state.status === 'ready') return fail('You already belong to an organisation.');

  const parsed = createOrgSchema.safeParse({
    name: formData.get('name'),
    timezone: formData.get('timezone'),
  });
  if (!parsed.success) {
    return fail('Check the highlighted fields.', z.flattenError(parsed.error).fieldErrors);
  }

  const repo = getRepository();
  let organization: Organization;

  try {
    organization = await repo.createOrganization({
      name: parsed.data.name,
      slug: await allocateSlug(parsed.data.name),
      timezone: parsed.data.timezone,
      reminderLeadDays: 30,
      defaultIntervalAnchor: 'schedule',
      slotMinutes: 120,
      bookingLeadHours: 24,
      bookingHorizonDays: 60,
      isDemo: false,
    });

    await repo.createMembership({
      orgId: organization.id,
      userId: state.user.id,
      role: 'owner',
    });

    // Without opening hours the booking page would offer nothing at all, so a new
    // organisation starts on a sane Mon–Fri week it can edit in Settings.
    await repo.replaceBusinessHours(
      organization.id,
      defaultBusinessHours().map((h) => ({ ...h, orgId: organization.id })),
    );

    await repo.appendAuditLog({
      orgId: organization.id,
      actorId: state.user.id,
      action: 'organization.created',
      entity: 'organization',
      entityId: organization.id,
      meta: { name: organization.name },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not create the organisation.');
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organization.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  // Outside the try/catch on purpose: `redirect` signals by throwing, and catching it here
  // would turn a successful signup into an error message.
  redirect('/app');
}
