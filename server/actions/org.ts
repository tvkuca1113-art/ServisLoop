'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { tryCivilDate } from '@/domain/dates';
import { ROLE_LABELS } from '@/domain/permissions';
import { INTERVAL_ANCHORS, ROLES, type UUID } from '@/domain/types';
import { absoluteUrl, isServiceRoleConfigured, isSupabaseConfigured } from '@/lib/env';
import { newId } from '@/lib/ids';
import { weekdayName } from '@/lib/weekdays';
import { ACTIVE_ORG_COOKIE, requirePermission, requireSession } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { guard } from './errors';
import { fail, ok, type ActionResult } from './result';

/**
 * Organisation and membership actions.
 *
 * House rules, applied without exception:
 *
 * 1. **`requirePermission()` first.** Before any input is trusted or any row is touched.
 *    The member actions pass `targetRole` and `isSelf` so the matrix — not this file —
 *    decides that an administrator cannot demote an owner or remove themselves.
 * 2. **Validate with Zod, return field errors.** Never throw to the client.
 * 3. **Audit every change.** `appendAuditLog` records who changed what, which is the only
 *    way to answer "who removed Marija?" three months later.
 * 4. **`revalidatePath` after every mutation**, so the settings page and the shell (which
 *    renders the organisation name) both reflect the change immediately.
 */

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function orgCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  } as const;
}

/** `Intl` is the only authority on whether a timezone name is real. */
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

/* ------------------------------------------------------------------ */
/* Active organisation                                                 */
/* ------------------------------------------------------------------ */

const switchOrgSchema = z.object({ orgId: z.uuid('Pick an organisation.') });

/**
 * Set the active organisation for this browser.
 *
 * Membership is re-checked here rather than trusted from the switcher: the cookie is
 * user-controlled input, and `getSession()` will happily honour any organisation id it
 * finds. Lands on `/app` afterwards because a deep link into the previous organisation
 * (a device, a work order) is meaningless in the new one.
 */
export async function switchOrganization(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not switch organisation.', async () => {
    const session = await requirePermission('org:read');

    const parsed = switchOrgSchema.safeParse({ orgId: formData.get('orgId') });
    if (!parsed.success) return fail('Pick an organisation.');

    const target = session.organizations.find((o) => o.id === parsed.data.orgId);
    if (!target) return fail('You are not a member of that organisation.');

    const store = await cookies();
    store.set(ACTIVE_ORG_COOKIE, target.id, orgCookieOptions());

    revalidatePath('/', 'layout');
    redirect('/app');
  });
}

/* ------------------------------------------------------------------ */
/* Organisation settings                                               */
/* ------------------------------------------------------------------ */

const orgSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Enter the organisation name.').max(120),
  timezone: z
    .string()
    .trim()
    .min(1, 'Choose a timezone.')
    .refine(isValidTimeZone, 'That is not a recognised IANA timezone name.'),
  reminderLeadDays: z.coerce
    .number()
    .int('Use a whole number of days.')
    .min(1, 'Reminders need at least one day of lead time.')
    .max(365, 'A year of lead time is the maximum.'),
  defaultIntervalAnchor: z.enum(INTERVAL_ANCHORS),
  slotMinutes: z.coerce
    .number()
    .int('Use a whole number of minutes.')
    .min(15, 'Slots shorter than 15 minutes are not practical.')
    .max(480, 'Slots longer than eight hours are not practical.'),
  bookingLeadHours: z.coerce
    .number()
    .int('Use a whole number of hours.')
    .min(0, 'Notice cannot be negative.')
    .max(720, 'A month of notice is the maximum.'),
  bookingHorizonDays: z.coerce
    .number()
    .int('Use a whole number of days.')
    .min(1, 'Customers need at least one day to book into.')
    .max(730, 'Two years ahead is the maximum.'),
});

export async function updateOrganizationSettings(
  formData: FormData,
): Promise<ActionResult<null>> {
  return guard('Could not save the organisation settings.', async () => {
    const session = await requirePermission('org:update');

    const parsed = orgSettingsSchema.safeParse({
      name: formData.get('name'),
      timezone: formData.get('timezone'),
      reminderLeadDays: formData.get('reminderLeadDays'),
      defaultIntervalAnchor: formData.get('defaultIntervalAnchor'),
      slotMinutes: formData.get('slotMinutes'),
      bookingLeadHours: formData.get('bookingLeadHours'),
      bookingHorizonDays: formData.get('bookingHorizonDays'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const before = session.organization;
    await repo.updateOrganization(session.organization.id, parsed.data);

    // Record only what actually changed — an audit trail full of no-op entries is noise.
    const changed = Object.entries(parsed.data).filter(
      ([key, value]) => before[key as keyof typeof before] !== value,
    );

    if (changed.length > 0) {
      await repo.appendAuditLog({
        orgId: session.organization.id,
        actorId: session.user.id,
        action: 'org.update',
        entity: 'organization',
        entityId: session.organization.id,
        meta: { changed: Object.fromEntries(changed) },
      });
    }

    revalidatePath('/', 'layout');
    return ok(null, 'Organisation settings saved.');
  });
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  fullName: z.string().trim().max(120).optional(),
  role: z.enum(ROLES),
});

/**
 * Find or create the user record an invitation should attach a membership to.
 *
 * Offline there is no auth backend, so a profile row is created directly and the person
 * appears immediately — that is what makes the role gates explorable in the demo. With
 * Supabase, the invitation goes through `auth.admin`, which owns user identity; that path
 * needs the service-role key and says so plainly when it is missing.
 */
async function resolveInviteeId(email: string, fullName: string | null): Promise<UUID> {
  const repo = getRepository();

  if (!isSupabaseConfigured()) {
    const id = newId();
    await repo.upsertProfile({
      id,
      email,
      fullName,
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  if (!isServiceRoleConfigured()) {
    throw new Error(
      'Inviting members needs SUPABASE_SERVICE_ROLE_KEY, which is not set on this deployment.',
    );
  }

  const { createAdminClient } = await import('@/server/supabase/admin');
  const admin = createAdminClient();

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: absoluteUrl('/auth/callback'),
    data: fullName === null ? undefined : { full_name: fullName },
  });

  let userId = invited.data.user?.id ?? null;

  // Already has an account — invite them to this organisation rather than refusing.
  if (userId === null) {
    const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId =
      existing.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
  }

  if (userId === null) {
    throw new Error(invited.error?.message ?? 'Supabase did not return a user for that address.');
  }

  await repo.upsertProfile({
    id: userId,
    email,
    fullName,
    createdAt: new Date().toISOString(),
  });

  return userId;
}

export async function inviteMember(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not send the invitation.', async () => {
    const parsedRole = z.enum(ROLES).safeParse(formData.get('role'));
    if (!parsedRole.success) return fail('Choose a role for the new member.');

    // Two checks, both from the matrix. `member:invite` says whether this person may add
    // anyone at all; `member:update_role` with the requested role as `targetRole` says
    // whether they may hand out *that* role — which is what stops an administrator from
    // creating an owner through the invite form.
    await requirePermission('member:invite', { targetRole: parsedRole.data });
    const session = await requirePermission('member:update_role', {
      targetRole: parsedRole.data,
    });

    const rawName = formData.get('fullName');
    const parsed = inviteSchema.safeParse({
      email: formData.get('email'),
      fullName: typeof rawName === 'string' && rawName.trim() !== '' ? rawName : undefined,
      role: parsedRole.data,
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const memberships = await repo.listMemberships(orgId);
    const profiles = await repo.listProfiles(memberships.map((m) => m.userId));
    const alreadyHere = profiles.some(
      (p) => p.email.toLowerCase() === parsed.data.email.toLowerCase(),
    );
    if (alreadyHere) {
      return fail(`${parsed.data.email} is already a member of this organisation.`);
    }

    const userId = await resolveInviteeId(parsed.data.email, parsed.data.fullName ?? null);

    await repo.createMembership({ orgId, userId, role: parsed.data.role });
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'member.invite',
      entity: 'membership',
      entityId: userId,
      meta: { email: parsed.data.email, role: parsed.data.role },
    });

    revalidatePath('/app/settings');
    revalidatePath('/app/settings/members');

    return ok(
      null,
      isSupabaseConfigured()
        ? `Invitation sent to ${parsed.data.email} as ${ROLE_LABELS[parsed.data.role]}.`
        : `${parsed.data.email} added as ${ROLE_LABELS[parsed.data.role]}. In offline mode there is no email to send.`,
    );
  });
}

const memberRoleSchema = z.object({
  userId: z.uuid('Pick a member.'),
  role: z.enum(ROLES),
});

export async function updateMemberRole(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not change that role.', async () => {
    const parsed = memberRoleSchema.safeParse({
      userId: formData.get('userId'),
      role: formData.get('role'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    // The target's *current* role has to be read before the check, because "may not touch
    // an owner" is a fact about who they are now, not about the role being assigned.
    const session = await requireSession();
    const repo = getRepository();
    const orgId = session.organization.id;

    const target = await repo.getMembership(orgId, parsed.data.userId);
    if (!target) return fail('That person is no longer a member of this organisation.');

    const isSelf = target.userId === session.user.id;

    // Current role: may this actor act on this person at all?
    await requirePermission('member:update_role', { targetRole: target.role, isSelf });
    // Requested role: may this actor hand out that level of access?
    await requirePermission('member:update_role', { targetRole: parsed.data.role, isSelf });

    if (target.role === parsed.data.role) {
      return ok(null, `No change — they are already ${ROLE_LABELS[target.role]}.`);
    }

    await repo.updateMembershipRole(orgId, parsed.data.userId, parsed.data.role);
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'member.update_role',
      entity: 'membership',
      entityId: parsed.data.userId,
      meta: { from: target.role, to: parsed.data.role },
    });

    revalidatePath('/app/settings');
    revalidatePath('/app/settings/members');
    revalidatePath('/', 'layout');

    return ok(null, `Role changed to ${ROLE_LABELS[parsed.data.role]}.`);
  });
}

const removeMemberSchema = z.object({ userId: z.uuid('Pick a member.') });

export async function removeMember(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not remove that member.', async () => {
    const parsed = removeMemberSchema.safeParse({ userId: formData.get('userId') });
    if (!parsed.success) return fail('Pick a member to remove.');

    const session = await requireSession();
    const repo = getRepository();
    const orgId = session.organization.id;

    const target = await repo.getMembership(orgId, parsed.data.userId);
    if (!target) return fail('That person is no longer a member of this organisation.');

    const isSelf = target.userId === session.user.id;
    await requirePermission('member:remove', { targetRole: target.role, isSelf });

    const [profile] = await repo.listProfiles([parsed.data.userId]);

    await repo.deleteMembership(orgId, parsed.data.userId);
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'member.remove',
      entity: 'membership',
      entityId: parsed.data.userId,
      meta: { email: profile?.email ?? null, role: target.role },
    });

    revalidatePath('/app/settings');
    revalidatePath('/app/settings/members');

    return ok(
      null,
      `${profile?.fullName ?? profile?.email ?? 'That member'} no longer has access.`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Business hours and blackout dates                                   */
/* ------------------------------------------------------------------ */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTime(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string') return null;
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Replace the whole week in one call.
 *
 * Whole-week replacement rather than per-day patches, because the availability engine
 * reads all seven rules together: a half-applied update would generate slots for a week
 * that never existed.
 */
export async function replaceBusinessHours(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not save the business hours.', async () => {
    const session = await requirePermission('org:update');
    const orgId = session.organization.id;

    const fieldErrors: Record<string, string[]> = {};
    const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const isOpen = formData.get(`open-${weekday}`) !== null;
      const openMinute = parseTime(formData.get(`from-${weekday}`));
      const closeMinute = parseTime(formData.get(`to-${weekday}`));
      const dayName = weekdayName(weekday);

      if (openMinute === null || closeMinute === null) {
        fieldErrors[`from-${weekday}`] = [`Enter ${dayName}'s hours as HH:MM.`];
        return { orgId, weekday, isOpen: false, openMinute: 8 * 60, closeMinute: 17 * 60 };
      }
      if (isOpen && closeMinute <= openMinute) {
        fieldErrors[`to-${weekday}`] = [`${dayName} must close after it opens.`];
      }
      return { orgId, weekday, isOpen, openMinute, closeMinute };
    });

    if (Object.keys(fieldErrors).length > 0) {
      return fail('Check the highlighted days.', fieldErrors);
    }

    const repo = getRepository();
    await repo.replaceBusinessHours(orgId, hours);
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'org.business_hours',
      entity: 'business_hours',
      entityId: null,
      meta: { openDays: hours.filter((h) => h.isOpen).length },
    });

    revalidatePath('/app/settings');
    revalidatePath('/app/bookings');

    return ok(null, 'Business hours saved.');
  });
}

const blackoutSchema = z.object({
  date: z.string().refine((v) => tryCivilDate(v) !== null, 'Pick a date.'),
  reason: z.string().trim().max(120, 'Keep the reason under 120 characters.').optional(),
});

export async function addBlackoutDate(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not add that closed day.', async () => {
    const session = await requirePermission('org:update');

    const rawReason = formData.get('reason');
    const parsed = blackoutSchema.safeParse({
      date: formData.get('date'),
      reason: typeof rawReason === 'string' && rawReason.trim() !== '' ? rawReason : undefined,
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const date = tryCivilDate(parsed.data.date);
    if (!date) return fail('Pick a date.', { date: ['Pick a date.'] });

    const repo = getRepository();
    const orgId = session.organization.id;

    const existing = await repo.listBlackoutDates(orgId);
    if (existing.some((b) => b.date === date)) {
      return fail('That day is already marked as closed.', { date: ['Already closed.'] });
    }

    await repo.createBlackoutDate({ orgId, date, reason: parsed.data.reason ?? null });
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'org.blackout_add',
      entity: 'blackout_date',
      entityId: null,
      meta: { date, reason: parsed.data.reason ?? null },
    });

    revalidatePath('/app/settings');
    revalidatePath('/app/bookings');

    return ok(null, `${date} marked as closed.`);
  });
}

const removeBlackoutSchema = z.object({ id: z.uuid('Pick a closed day.') });

export async function removeBlackoutDate(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not remove that closed day.', async () => {
    const session = await requirePermission('org:update');

    const parsed = removeBlackoutSchema.safeParse({ id: formData.get('id') });
    if (!parsed.success) return fail('Pick a closed day to remove.');

    const repo = getRepository();
    const orgId = session.organization.id;

    const existing = await repo.listBlackoutDates(orgId);
    const target = existing.find((b) => b.id === parsed.data.id);
    if (!target) return fail('That day is no longer marked as closed.');

    await repo.deleteBlackoutDate(orgId, parsed.data.id);
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'org.blackout_remove',
      entity: 'blackout_date',
      entityId: parsed.data.id,
      meta: { date: target.date },
    });

    revalidatePath('/app/settings');
    revalidatePath('/app/bookings');

    return ok(null, `${target.date} is open for bookings again.`);
  });
}
