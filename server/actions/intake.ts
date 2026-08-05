'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  intervalsOverlap,
  validateSlotSelection,
  type AvailabilityConfig,
  type SlotUnavailableReason,
} from '@/domain/availability';
import { civilDateInTimeZone, toInstant, tryCivilDate, type CivilDate } from '@/domain/dates';
import { ISSUE_SEVERITIES, type Organization, type UUID } from '@/domain/types';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';
import {
  collectBusyIntervals,
  createWorkOrderForDevice,
  createWorkOrderFromIssue,
} from '@/server/service/scheduling';

import { guard } from './errors';
import { fail, ok, type ActionResult } from './result';

/**
 * Customer intake — the public half of ServisLoop, and the triage that follows it.
 *
 * Two kinds of action live here, and the difference between them is the whole point of
 * the file:
 *
 * - `submitBooking` / `submitIssue` are reachable by **anyone holding a device's public
 *   token**. There is no session, no role, no `requirePermission`. The token *is* the
 *   authorisation, and the organisation is derived from the device it names — never from
 *   the request. A caller cannot address an organisation it does not already have a
 *   token for, and cannot see anything it did not send.
 * - `confirmBooking`, `declineBooking`, `convertIssueToWorkOrder` and `closeIssue` are
 *   staff actions, gated on the permission matrix exactly like every other write.
 *
 * Rules for the public pair, none of them optional:
 *
 * 1. **Nothing from the client is trusted.** The submitted slot is re-validated on the
 *    server against freshly-read business hours, blackout days and busy intervals. The
 *    browser's view of availability is a courtesy, not a reservation — see the note on
 *    `submitBooking`.
 * 2. **Every field is length-capped.** These endpoints are unauthenticated, so a payload
 *    is rejected on size before it is ever stored.
 * 3. **An unknown token is indistinguishable from a malformed one.** Both produce the
 *    same sentence, so the form cannot be used to test whether a token exists.
 */

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Length caps. Unauthenticated input, so absurd payloads die at the schema. */
const MAX = {
  token: 256,
  name: 120,
  email: 200,
  phone: 40,
  title: 140,
  description: 4000,
  note: 1000,
  reason: 500,
} as const;

/** Same sentence for a malformed token, an unknown one and a deleted device. */
const UNKNOWN_DEVICE =
  'This device page is no longer active. Re-scan the code on the machine, or call the service company.';

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

/** Trim, and treat an empty box the same as an absent one. */
function optionalText(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Minutes since local midnight in `timeZone`.
 *
 * The availability engine takes `today` and `nowMinute` as inputs so it never reads a
 * clock itself. This is the boundary that supplies them, and it must use the
 * *organisation's* timezone: a customer in another country booking a slot must be judged
 * against the workshop's opening hours, not their own.
 *
 * `hourCycle: 'h23'` so midnight is `00`, not `24`.
 */
function nowMinuteInTimeZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/**
 * The organisation's booking rules, in the shape the availability engine wants.
 *
 * `horizonDays` is clamped: organisation settings allow up to two years ahead, while the
 * engine refuses anything past 365 days as a guard against unbounded slot enumeration.
 * Clamping here means a generous setting quietly books a year out instead of throwing.
 *
 * `capacity` is 1 — one job at a time. When ServisLoop learns about crews this becomes a
 * column on the organisation; until then, one is the honest number.
 */
function availabilityConfigFor(org: Organization): AvailabilityConfig {
  return {
    slotMinutes: org.slotMinutes,
    leadHours: org.bookingLeadHours,
    horizonDays: Math.min(org.bookingHorizonDays, 365),
    capacity: 1,
  };
}

/** Why a slot was refused, said in words a customer can act on. */
function explainRejection(
  reason: SlotUnavailableReason | 'not_a_slot',
  org: Organization,
): string {
  switch (reason) {
    case 'booked':
      return 'Someone else took that slot while you were filling in the form. Pick another time.';
    case 'too_soon':
      return `We need at least ${org.bookingLeadHours} hours' notice. Pick a later time.`;
    case 'past':
      return 'That time has already passed. Pick a later time.';
    case 'closed':
    case 'blackout':
      return 'We are closed that day. Pick another day.';
    case 'beyond_horizon':
      return `We only take bookings up to ${org.bookingHorizonDays} days ahead. Pick an earlier date.`;
    case 'not_a_slot':
      return 'That is not one of our appointment times. Pick a slot from the list.';
  }
}

/* ------------------------------------------------------------------ */
/* Public: request an appointment                                      */
/* ------------------------------------------------------------------ */

const bookingSchema = z
  .object({
    publicToken: z
      .string({ error: 'Invalid device.' })
      .trim()
      .min(16, 'Invalid device.')
      .max(MAX.token, 'Invalid device.'),
    // The type-level message matters as much as the rule: a JSON caller that omits the
    // field entirely must be told what to send, not "Invalid input".
    date: z.string({ error: 'Pick a day.' }).refine((v) => tryCivilDate(v) !== null, 'Pick a day.'),
    startMinute: z.coerce
      .number({ error: 'Pick a time from the list.' })
      .int('Pick a time from the list.')
      .min(0, 'Pick a time from the list.')
      .max(1439, 'Pick a time from the list.'),
    contactName: z
      .string({ error: 'Tell us who to ask for on site.' })
      .trim()
      .min(2, 'Tell us who to ask for on site.')
      .max(MAX.name, 'That name is too long.'),
    contactEmail: z.email('Enter a valid email address.').max(MAX.email).optional(),
    contactPhone: z.string().trim().max(MAX.phone, 'That phone number is too long.').optional(),
    note: z.string().trim().max(MAX.note, 'Keep the note under 1000 characters.').optional(),
  })
  // An appointment nobody can confirm is worse than no appointment at all.
  .refine((v) => v.contactEmail !== undefined || v.contactPhone !== undefined, {
    message: 'Leave an email address or a phone number so we can confirm.',
    path: ['contactEmail'],
  });

/**
 * Request an appointment from a device's public page. No account, no session.
 *
 * **How the double-booking race is closed.** The booking page renders the slot grid from
 * availability computed at page load. Two people can hold that page open at the same
 * moment and both see 09:00 free. So the client's view is never trusted: this action
 * re-reads business hours, blackout days and *current* busy intervals — which include
 * every pending booking, not just confirmed ones — and re-runs `validateSlotSelection`
 * immediately before the insert. The loser of the race gets `booked` back and a sentence
 * telling them to pick another time, instead of a silent second claim on the same hour.
 *
 * That leaves the window between the re-check and the insert. It is microseconds rather
 * than minutes, and it is bounded on both adapters: `JsonRepository` serialises writes
 * through a mutex, and Postgres holds the row lock. The check is what makes the window
 * small; the store is what makes it safe.
 */
export async function submitBooking(
  formData: FormData,
): Promise<ActionResult<{ date: CivilDate; time: string }>> {
  return guard('Could not send your booking request. Please try again.', async () => {
    const parsed = bookingSchema.safeParse({
      publicToken: formData.get('publicToken'),
      date: formData.get('date'),
      startMinute: formData.get('startMinute'),
      contactName: formData.get('contactName'),
      contactEmail: optionalText(formData.get('contactEmail')),
      contactPhone: optionalText(formData.get('contactPhone')),
      note: optionalText(formData.get('note')),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const context = await repo.getDeviceContextByToken(parsed.data.publicToken);
    if (!context) return fail(UNKNOWN_DEVICE);

    const { device, organization } = context;
    if (device.status === 'retired') {
      return fail(
        'This device is marked as out of service, so it cannot be booked. Report a problem instead, or call the service company.',
      );
    }

    const date = tryCivilDate(parsed.data.date);
    if (!date) return fail('Pick a day.', { date: ['Pick a day.'] });

    const now = new Date();
    const today = civilDateInTimeZone(now, organization.timezone);

    // Everything below is read fresh, at submission time. This is the re-check.
    const [businessHours, blackouts, busy] = await Promise.all([
      repo.listBusinessHours(organization.id),
      repo.listBlackoutDates(organization.id),
      collectBusyIntervals(organization.id, organization, date, date),
    ]);

    const check = validateSlotSelection({
      date,
      startMinute: parsed.data.startMinute,
      businessHours,
      blackoutDates: blackouts.map((b) => b.date),
      busy,
      config: availabilityConfigFor(organization),
      today,
      nowMinute: nowMinuteInTimeZone(now, organization.timezone),
    });

    if (!check.ok) {
      return fail(explainRejection(check.reason, organization), {
        startMinute: [explainRejection(check.reason, organization)],
      });
    }

    const booking = await repo.createBooking({
      orgId: organization.id,
      deviceId: device.id,
      requestedDate: check.slot.date,
      requestedStartMinute: check.slot.startMinute,
      requestedEndMinute: check.slot.endMinute,
      status: 'pending',
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail ?? null,
      contactPhone: parsed.data.contactPhone ?? null,
      note: parsed.data.note ?? null,
      workOrderId: null,
    });

    // `actorId` is null: the person who filled this in has no account, by design.
    await repo.appendAuditLog({
      orgId: organization.id,
      actorId: null,
      action: 'booking.request',
      entity: 'booking',
      entityId: booking.id,
      meta: { deviceId: device.id, date: check.slot.date, slot: check.slot.label },
    });

    revalidatePath('/app/bookings');
    revalidatePath(`/d/${device.publicToken}/book`);

    return ok(
      { date: check.slot.date, time: check.slot.label },
      'Booking requested. We will confirm it shortly.',
    );
  });
}

/* ------------------------------------------------------------------ */
/* Public: report a fault                                              */
/* ------------------------------------------------------------------ */

const issueSchema = z.object({
  publicToken: z
    .string({ error: 'Invalid device.' })
    .trim()
    .min(16, 'Invalid device.')
    .max(MAX.token, 'Invalid device.'),
  severity: z.enum(ISSUE_SEVERITIES, { error: 'Choose how bad it is.' }),
  title: z
    .string({ error: 'Say in a few words what is wrong.' })
    .trim()
    .min(4, 'Say in a few words what is wrong.')
    .max(MAX.title, 'Keep the summary under 140 characters — the detail goes below.'),
  description: z
    .string()
    .trim()
    .max(MAX.description, 'Keep the description under 4000 characters.')
    .optional(),
  reporterName: z
    .string({ error: 'Tell us who reported it.' })
    .trim()
    .min(2, 'Tell us who reported it.')
    .max(MAX.name, 'That name is too long.'),
  reporterEmail: z.email('Enter a valid email address.').max(MAX.email).optional(),
  reporterPhone: z.string().trim().max(MAX.phone, 'That phone number is too long.').optional(),
});

/**
 * Report a fault from a device's public page. No account, no session.
 *
 * Contact details are optional here, unlike a booking: a caretaker who has just found a
 * leaking boiler at 6am should be able to say so in fifteen seconds, and the device page
 * already tells the service company exactly which machine and which site it is. A title
 * is not optional — an untitled fault cannot be triaged, and a queue of them cannot be
 * read at a glance.
 */
export async function submitIssue(formData: FormData): Promise<ActionResult<{ title: string }>> {
  return guard('Could not send your report. Please try again.', async () => {
    const parsed = issueSchema.safeParse({
      publicToken: formData.get('publicToken'),
      severity: formData.get('severity'),
      title: formData.get('title'),
      description: optionalText(formData.get('description')),
      reporterName: formData.get('reporterName'),
      reporterEmail: optionalText(formData.get('reporterEmail')),
      reporterPhone: optionalText(formData.get('reporterPhone')),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const context = await repo.getDeviceContextByToken(parsed.data.publicToken);
    if (!context) return fail(UNKNOWN_DEVICE);

    const { device, organization } = context;

    const issue = await repo.createIssue({
      orgId: organization.id,
      deviceId: device.id,
      severity: parsed.data.severity,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      reporterName: parsed.data.reporterName,
      reporterEmail: parsed.data.reporterEmail ?? null,
      reporterPhone: parsed.data.reporterPhone ?? null,
      status: 'open',
      workOrderId: null,
    });

    await repo.appendAuditLog({
      orgId: organization.id,
      actorId: null,
      action: 'issue.report',
      entity: 'issue',
      entityId: issue.id,
      meta: { deviceId: device.id, severity: parsed.data.severity },
    });

    revalidatePath('/app/issues');

    return ok({ title: issue.title }, 'Report sent.');
  });
}

/* ------------------------------------------------------------------ */
/* Staff: booking triage                                               */
/* ------------------------------------------------------------------ */

const bookingIdSchema = z.object({ id: z.uuid('Pick a booking.') });

const declineSchema = z.object({
  id: z.uuid('Pick a booking.'),
  reason: z
    .string()
    .trim()
    .min(4, 'Say why, so the customer can be told something useful.')
    .max(MAX.reason, 'Keep the reason under 500 characters.'),
});

/**
 * Accept a requested appointment and put it on the calendar.
 *
 * Confirmation is the moment a customer request becomes work: a `booking`-kind work
 * order is created at the requested time and linked both ways, so the job carries its
 * origin and the booking carries its outcome.
 *
 * The clash check is deliberate. A pending booking already blocks its slot for other
 * customers, but nothing stops a dispatcher from scheduling a job over it by hand in the
 * meantime. Confirming into an occupied slot would double-book a technician, so it is
 * refused with the code of the job that is in the way.
 */
export async function confirmBooking(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not confirm that booking.', async () => {
    const session = await requirePermission('booking:confirm');

    const parsed = bookingIdSchema.safeParse({ id: formData.get('id') });
    if (!parsed.success) return fail('Pick a booking to confirm.');

    const repo = getRepository();
    const orgId = session.organization.id;

    const booking = await repo.getBooking(orgId, parsed.data.id);
    if (!booking) return fail('That booking no longer exists.');
    if (booking.status !== 'pending') {
      return fail(`That booking has already been ${booking.status}.`);
    }

    const clashes = await repo.listWorkOrders(orgId, {
      status: ['scheduled', 'in_progress'],
      from: booking.requestedDate,
      to: booking.requestedDate,
    });

    const clash = clashes.find((wo) => {
      if (!wo.scheduledFor) return false;
      if (wo.scheduledFor.slice(0, 10) !== booking.requestedDate) return false;
      const start =
        Number(wo.scheduledFor.slice(11, 13)) * 60 + Number(wo.scheduledFor.slice(14, 16));
      const end = start + (wo.scheduledMinutes ?? session.organization.slotMinutes);
      return intervalsOverlap(
        booking.requestedStartMinute,
        booking.requestedEndMinute,
        start,
        end,
      );
    });

    if (clash) {
      return fail(
        `${clash.code} is already scheduled over that time. Reschedule it first, or decline this request.`,
      );
    }

    const workOrder = await createWorkOrderForDevice({
      org: session.organization,
      deviceId: booking.deviceId,
      kind: 'booking',
      // Stored as the wall-clock time in the organisation's own calendar — the same
      // convention `collectBusyIntervals` reads back, so a confirmed booking blocks
      // exactly the slot it occupies.
      scheduledFor: toInstant(booking.requestedDate, booking.requestedStartMinute).toISOString(),
      scheduledMinutes: booking.requestedEndMinute - booking.requestedStartMinute,
      sourceBookingId: booking.id,
      summary: `Customer booking — ${booking.contactName}`,
      status: 'scheduled',
    });

    await repo.updateBooking(orgId, booking.id, {
      status: 'confirmed',
      workOrderId: workOrder.id,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'booking.confirm',
      entity: 'booking',
      entityId: booking.id,
      meta: { workOrderId: workOrder.id, code: workOrder.code },
    });

    revalidatePath('/app/bookings');
    revalidatePath('/app/work-orders');

    return ok(null, `Confirmed. ${workOrder.code} is on the calendar.`);
  });
}

/**
 * Turn an appointment request down, with a reason.
 *
 * The reason is required and is appended to the request's own note rather than discarded,
 * because the person who has to ring the customer back needs to know what they were told
 * — and `bookings` has nowhere else to put it. The audit log keeps the authoritative copy.
 */
export async function declineBooking(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not decline that booking.', async () => {
    const session = await requirePermission('booking:decline');

    const parsed = declineSchema.safeParse({
      id: formData.get('id'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const booking = await repo.getBooking(orgId, parsed.data.id);
    if (!booking) return fail('That booking no longer exists.');
    if (booking.status !== 'pending') {
      return fail(`That booking has already been ${booking.status}.`);
    }

    const note = [booking.note, `Declined: ${parsed.data.reason}`]
      .filter((part): part is string => Boolean(part))
      .join('\n\n');

    await repo.updateBooking(orgId, booking.id, { status: 'declined', note });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'booking.decline',
      entity: 'booking',
      entityId: booking.id,
      meta: { reason: parsed.data.reason },
    });

    revalidatePath('/app/bookings');

    return ok(null, `Declined. ${booking.contactName} still needs to be told.`);
  });
}

/* ------------------------------------------------------------------ */
/* Staff: issue triage                                                 */
/* ------------------------------------------------------------------ */

const issueIdSchema = z.object({ id: z.uuid('Pick a report.') });

const closeIssueSchema = z.object({
  id: z.uuid('Pick a report.'),
  note: z
    .string()
    .trim()
    .min(4, 'Say what was done, so the next person reading this knows.')
    .max(MAX.reason, 'Keep the note under 500 characters.'),
});

/**
 * Promote a reported fault into a job.
 *
 * The severity the reporter chose carries straight through to the work order's priority
 * (`priorityForIssue` in the domain layer), which is why the public form asks for it in
 * plain language rather than asking for a priority nobody outside the trade can judge.
 */
export async function convertIssueToWorkOrder(
  formData: FormData,
): Promise<ActionResult<{ workOrderId: UUID }>> {
  return guard('Could not turn that report into a job.', async () => {
    const session = await requirePermission('issue:triage');

    const parsed = issueIdSchema.safeParse({ id: formData.get('id') });
    if (!parsed.success) return fail('Pick a report to convert.');

    const repo = getRepository();
    const orgId = session.organization.id;

    const issue = await repo.getIssue(orgId, parsed.data.id);
    if (!issue) return fail('That report no longer exists.');
    if (issue.workOrderId) return fail('That report already has a job against it.');
    if (issue.status === 'closed') {
      return fail('That report is closed. Re-open it before creating a job.');
    }

    const workOrder = await createWorkOrderFromIssue(session.organization, issue);

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'issue.convert',
      entity: 'issue',
      entityId: issue.id,
      meta: { workOrderId: workOrder.id, code: workOrder.code, severity: issue.severity },
    });

    revalidatePath('/app/issues');
    revalidatePath('/app/work-orders');

    return ok({ workOrderId: workOrder.id }, `${workOrder.code} created from this report.`);
  });
}

/**
 * Close a report without a job — advice given, false alarm, already fixed on site.
 *
 * The closing note is appended to the description for the same reason a decline reason is
 * appended to the booking note: `issues` has no dedicated column, and a resolution nobody
 * can read is not a resolution. The audit log keeps the clean copy.
 */
export async function closeIssue(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not close that report.', async () => {
    const session = await requirePermission('issue:close');

    const parsed = closeIssueSchema.safeParse({
      id: formData.get('id'),
      note: formData.get('note'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const issue = await repo.getIssue(orgId, parsed.data.id);
    if (!issue) return fail('That report no longer exists.');
    if (issue.status === 'closed') return fail('That report is already closed.');

    const description = [issue.description, `Closed: ${parsed.data.note}`]
      .filter((part): part is string => Boolean(part))
      .join('\n\n');

    await repo.updateIssue(orgId, issue.id, { status: 'closed', description });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'issue.close',
      entity: 'issue',
      entityId: issue.id,
      meta: { note: parsed.data.note, hadWorkOrder: issue.workOrderId !== null },
    });

    revalidatePath('/app/issues');

    return ok(null, 'Report closed.');
  });
}
