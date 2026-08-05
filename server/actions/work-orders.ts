'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { tryCivilDate } from '@/domain/dates';
import {
  validateChecklist,
  type ChecklistAnswer,
  type ChecklistFieldError,
} from '@/domain/checklist';
import { PRIORITIES, type ChecklistItem, type UUID, type WorkOrder } from '@/domain/types';
import { checkTransition, isTerminal, STATUS_LABELS } from '@/domain/work-order';
import { requirePermission, requireSession, type SessionContext } from '@/server/auth/context';
import { getRepository } from '@/server/data';
import { serviceReportNumber } from '@/server/pdf/service-report';
import { createWorkOrderForDevice, recalculateDeviceSchedule } from '@/server/service/scheduling';

import { guard } from './errors';
import { fail, ok, type ActionResult } from './result';

/**
 * Work-order actions — the technician workflow, end to end.
 *
 * House rules, same as `org.ts` and `directory.ts`: permission first, Zod validation
 * returning field errors, an audit entry per change, `revalidatePath` after every write.
 *
 * Two rules are specific to this file, and both exist because a work order is the record
 * a customer is eventually shown:
 *
 * 1. **The status machine in `@/domain/work-order` is the only authority on state.** No
 *    action here writes `status` without `checkTransition` agreeing first, and every one
 *    of its errors is surfaced together rather than one at a time — a technician standing
 *    in a plant room wants the whole list of what is missing, not a guessing game.
 * 2. **Nothing here writes `devices.nextServiceDue` or touches a reminder.** Completion
 *    hands the completion date to `recalculateDeviceSchedule`, which is the only writer of
 *    both. See the ordering comment in {@link completeWorkOrder}.
 *
 * A technician is scoped to their own jobs. That is not enforced by a second rule here —
 * it is `requirePermission(..., { isAssignee })`, with the matrix in
 * `@/domain/permissions` deciding what `isAssignee` means for each action.
 */

/* ------------------------------------------------------------------ */
/* Form-data helpers                                                   */
/* ------------------------------------------------------------------ */

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** An empty box means "not provided", never the empty string. */
function optional(formData: FormData, key: string): string | undefined {
  const value = text(formData, key);
  return value === '' ? undefined : value;
}

const idField = z.uuid('Pick a job.');

/**
 * Combine a civil date and an `HH:MM` time into the ISO instant the row stores.
 *
 * Returns `null` when no date was given — an unscheduled job is a legitimate state, not a
 * validation failure.
 */
function toScheduledInstant(date: string | undefined, time: string | undefined): string | null {
  const day = date === undefined ? null : tryCivilDate(date);
  if (!day) return null;
  const at = time && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) ? time : '08:00';
  return `${day}T${at}:00.000Z`;
}

/**
 * The work order this request is about, with the actor's relationship to it.
 *
 * `isAssignee` is read here and handed to the permission matrix rather than being turned
 * into an `if` — the matrix is where "a technician may act on their own jobs, and only
 * those" is written down.
 */
async function loadWorkOrder(
  session: SessionContext,
  id: UUID,
): Promise<{ workOrder: WorkOrder; isAssignee: boolean } | null> {
  const workOrder = await getRepository().getWorkOrder(session.organization.id, id);
  if (!workOrder) return null;
  return { workOrder, isAssignee: workOrder.assignedTo === session.user.id };
}

const GONE = 'That job no longer exists, or belongs to another organisation.';

/** Revalidate every surface a work-order change is visible on. */
function revalidateWorkOrder(id: UUID, deviceId?: UUID): void {
  revalidatePath('/app/work-orders');
  revalidatePath(`/app/work-orders/${id}`);
  revalidatePath('/app');
  if (deviceId) revalidatePath(`/app/devices/${deviceId}`);
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

const createSchema = z.object({
  deviceId: z.uuid('Pick the device this job is for.'),
  kind: z.enum(['scheduled', 'issue', 'booking']),
  priority: z.enum(PRIORITIES),
  scheduledDate: z
    .string()
    .refine((v) => tryCivilDate(v) !== null, 'Use a date in the form YYYY-MM-DD.')
    .optional(),
  scheduledTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use a time in the form HH:MM.')
    .optional(),
  assignedTo: z.uuid('Pick a technician.').optional(),
  summary: z.string().trim().max(280, 'Keep the summary under 280 characters.').optional(),
});

/**
 * Open a job by hand.
 *
 * The code, the location, the customer and the checklist template are all resolved by
 * `createWorkOrderForDevice` from the device, so a job cannot be filed against the wrong
 * customer by mistyping a form field.
 */
export async function createWorkOrder(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not open that job.', async () => {
    const session = await requirePermission('work_order:create');

    const parsed = createSchema.safeParse({
      deviceId: text(formData, 'deviceId'),
      kind: text(formData, 'kind') || 'scheduled',
      priority: text(formData, 'priority') || 'normal',
      scheduledDate: optional(formData, 'scheduledDate'),
      scheduledTime: optional(formData, 'scheduledTime'),
      assignedTo: optional(formData, 'assignedTo'),
      summary: optional(formData, 'summary'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const device = await repo.getDevice(orgId, parsed.data.deviceId);
    if (!device) {
      return fail('That device is not on your register.', {
        deviceId: ['Pick a device from the list.'],
      });
    }

    if (parsed.data.assignedTo) {
      const membership = await repo.getMembership(orgId, parsed.data.assignedTo);
      if (!membership) {
        return fail('That person is not a member of this organisation.', {
          assignedTo: ['Pick someone from your team.'],
        });
      }
    }

    const scheduledFor = toScheduledInstant(parsed.data.scheduledDate, parsed.data.scheduledTime);

    const workOrder = await createWorkOrderForDevice({
      org: session.organization,
      deviceId: device.id,
      kind: parsed.data.kind,
      priority: parsed.data.priority,
      scheduledFor,
      assignedTo: parsed.data.assignedTo ?? null,
      summary: parsed.data.summary ?? null,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'work_order.create',
      entity: 'work_order',
      entityId: workOrder.id,
      meta: { code: workOrder.code, deviceId: device.id, status: workOrder.status },
    });

    revalidateWorkOrder(workOrder.id, device.id);

    return ok({ id: workOrder.id }, `${workOrder.code} opened for ${device.name}.`);
  });
}

/* ------------------------------------------------------------------ */
/* Update — details and scheduling                                     */
/* ------------------------------------------------------------------ */

const updateSchema = z.object({
  id: idField,
  priority: z.enum(PRIORITIES),
  scheduledDate: z
    .string()
    .refine((v) => tryCivilDate(v) !== null, 'Use a date in the form YYYY-MM-DD.')
    .optional(),
  scheduledTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use a time in the form HH:MM.')
    .optional(),
  scheduledMinutes: z.coerce
    .number()
    .int('Use a whole number of minutes.')
    .min(15, 'Anything under 15 minutes is not a visit.')
    .max(600, 'Ten hours is the longest a single visit can be.')
    .optional(),
  summary: z.string().trim().max(280, 'Keep the summary under 280 characters.').optional(),
  internalNotes: z.string().trim().max(4000, 'Keep the notes under 4000 characters.').optional(),
});

/**
 * Edit the details of a live job — and, when a date is put on a draft, schedule it.
 *
 * `draft → scheduled` is a real transition, not a field edit, so it goes through
 * `checkTransition` like every other one. That is why this action does not simply write
 * `status`: the same code path that refuses `completed → scheduled` refuses a draft with
 * no date.
 */
export async function updateWorkOrder(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not save that job.', async () => {
    const session = await requireSession();

    const parsed = updateSchema.safeParse({
      id: text(formData, 'id'),
      priority: text(formData, 'priority') || 'normal',
      scheduledDate: optional(formData, 'scheduledDate'),
      scheduledTime: optional(formData, 'scheduledTime'),
      scheduledMinutes: optional(formData, 'scheduledMinutes'),
      summary: optional(formData, 'summary'),
      internalNotes: optional(formData, 'internalNotes'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const loaded = await loadWorkOrder(session, parsed.data.id);
    if (!loaded) return fail(GONE);
    const { workOrder, isAssignee } = loaded;

    await requirePermission('work_order:update', { isAssignee });

    if (isTerminal(workOrder.status)) {
      return fail(
        `${workOrder.code} is ${STATUS_LABELS[workOrder.status].toLowerCase()}, and a closed job is a record rather than a document. Open a new job instead.`,
      );
    }

    const scheduledFor = toScheduledInstant(parsed.data.scheduledDate, parsed.data.scheduledTime);

    // A job that is already on the calendar cannot have its date removed: `scheduled` and
    // `in_progress` both mean "someone is expecting us", and there is no legal edge back
    // to `draft` to fall into.
    if (!scheduledFor && workOrder.status !== 'draft') {
      return fail('A scheduled job needs a date.', {
        scheduledDate: ['Set a date, or cancel the job instead.'],
      });
    }

    // Putting a date on a draft schedules it. Everything else keeps the status it has —
    // starting and completing are deliberate acts with their own actions.
    const targetStatus = workOrder.status === 'draft' && scheduledFor ? 'scheduled' : workOrder.status;

    if (targetStatus !== workOrder.status) {
      const check = checkTransition({
        from: workOrder.status,
        to: targetStatus,
        assignedTo: workOrder.assignedTo,
        scheduledFor,
        completedOn: workOrder.completedOn,
        checklistComplete: false,
        today: session.today,
      });
      if (!check.ok) return fail(check.errors.join(' '));
    }

    const repo = getRepository();
    const orgId = session.organization.id;

    await repo.updateWorkOrder(orgId, workOrder.id, {
      status: targetStatus,
      priority: parsed.data.priority,
      scheduledFor,
      scheduledMinutes: parsed.data.scheduledMinutes ?? workOrder.scheduledMinutes,
      summary: parsed.data.summary ?? null,
      internalNotes: parsed.data.internalNotes ?? null,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'work_order.update',
      entity: 'work_order',
      entityId: workOrder.id,
      meta: {
        code: workOrder.code,
        scheduledFor,
        priority: parsed.data.priority,
        ...(targetStatus === workOrder.status ? {} : { from: workOrder.status, to: targetStatus }),
      },
    });

    revalidateWorkOrder(workOrder.id, workOrder.deviceId);

    return ok(
      null,
      targetStatus === workOrder.status
        ? `${workOrder.code} saved.`
        : `${workOrder.code} is now scheduled.`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Assign                                                              */
/* ------------------------------------------------------------------ */

const assignSchema = z.object({
  id: idField,
  /** Empty means "unassign", which is a legitimate thing to want. */
  assignedTo: z.uuid('Pick a technician.').optional(),
});

export async function assignWorkOrder(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not change who this job is assigned to.', async () => {
    const session = await requirePermission('work_order:assign');

    const parsed = assignSchema.safeParse({
      id: text(formData, 'id'),
      assignedTo: optional(formData, 'assignedTo'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const loaded = await loadWorkOrder(session, parsed.data.id);
    if (!loaded) return fail(GONE);
    const { workOrder } = loaded;

    if (isTerminal(workOrder.status)) {
      return fail(`${workOrder.code} is closed. Reassigning it would change a finished record.`);
    }

    const repo = getRepository();
    const orgId = session.organization.id;
    const assignedTo = parsed.data.assignedTo ?? null;

    // Membership is re-checked rather than trusted from the picker: the id arrives from
    // the browser, and assigning work to somebody outside the organisation would put a
    // job on a board they can never see.
    if (assignedTo) {
      const membership = await repo.getMembership(orgId, assignedTo);
      if (!membership) {
        return fail('That person is not a member of this organisation.', {
          assignedTo: ['Pick someone from your team.'],
        });
      }
    }

    if (assignedTo === workOrder.assignedTo) {
      return ok(null, 'No change — the job is already assigned that way.');
    }

    await repo.updateWorkOrder(orgId, workOrder.id, { assignedTo });

    const [profile] = assignedTo ? await repo.listProfiles([assignedTo]) : [];

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'work_order.assign',
      entity: 'work_order',
      entityId: workOrder.id,
      meta: { code: workOrder.code, from: workOrder.assignedTo, to: assignedTo },
    });

    revalidateWorkOrder(workOrder.id, workOrder.deviceId);

    return ok(
      null,
      assignedTo
        ? `${workOrder.code} assigned to ${profile?.fullName ?? profile?.email ?? 'that technician'}.`
        : `${workOrder.code} is now unassigned.`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

const idOnlySchema = z.object({ id: idField });

/** Mark a job as being worked on. Legal only from `scheduled`, and only with an assignee. */
export async function startWorkOrder(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not start that job.', async () => {
    const session = await requireSession();

    const parsed = idOnlySchema.safeParse({ id: text(formData, 'id') });
    if (!parsed.success) return fail('Pick a job to start.');

    const loaded = await loadWorkOrder(session, parsed.data.id);
    if (!loaded) return fail(GONE);
    const { workOrder, isAssignee } = loaded;

    await requirePermission('work_order:start', { isAssignee });

    const check = checkTransition({
      from: workOrder.status,
      to: 'in_progress',
      assignedTo: workOrder.assignedTo,
      scheduledFor: workOrder.scheduledFor,
      completedOn: workOrder.completedOn,
      checklistComplete: false,
      today: session.today,
    });
    if (!check.ok) return fail(check.errors.join(' '));

    const repo = getRepository();
    const orgId = session.organization.id;

    await repo.updateWorkOrder(orgId, workOrder.id, {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'work_order.start',
      entity: 'work_order',
      entityId: workOrder.id,
      meta: { code: workOrder.code, from: workOrder.status },
    });

    revalidateWorkOrder(workOrder.id, workOrder.deviceId);

    return ok(null, `${workOrder.code} started.`);
  });
}

/* ------------------------------------------------------------------ */
/* Complete                                                            */
/* ------------------------------------------------------------------ */

const completeSchema = z.object({
  id: idField,
  completedOn: z
    .string()
    .refine((v) => tryCivilDate(v) !== null, 'Record the date the work was carried out.'),
  signedByName: z.string().trim().max(120, 'Keep the name under 120 characters.').optional(),
  totalMinutes: z.coerce
    .number()
    .int('Use a whole number of minutes.')
    .min(0, 'Time on site cannot be negative.')
    .max(1440, 'A single visit cannot run longer than a day.')
    .optional(),
});

/**
 * Read one item's answer out of the form.
 *
 * The template drives the read, not the payload: the server iterates the items it loaded
 * and looks for each one's fields. A client cannot invent an answer for an item that is
 * not on the template, nor omit one and have it quietly skipped.
 */
function answerFor(formData: FormData, item: ChecklistItem): ChecklistAnswer {
  const note = optional(formData, `item-${item.id}-note`) ?? null;

  switch (item.kind) {
    case 'boolean': {
      const raw = text(formData, `item-${item.id}-bool`);
      return {
        itemId: item.id,
        valueBool: raw === 'yes' ? true : raw === 'no' ? false : null,
        note,
      };
    }
    case 'number': {
      const raw = text(formData, `item-${item.id}-num`);
      // `Number('')` is 0, which would silently record a reading nobody took.
      const parsed = raw === '' ? null : Number(raw);
      return {
        itemId: item.id,
        valueNum: parsed === null || Number.isNaN(parsed) ? null : parsed,
        note,
      };
    }
    default:
      return { itemId: item.id, valueText: optional(formData, `item-${item.id}-text`) ?? null, note };
  }
}

/**
 * Turn the domain's per-item errors into form field errors.
 *
 * Keyed by item id so the run UI can put each message against the check it belongs to,
 * rather than piling them into one banner at the top of a twenty-item list.
 */
function checklistFieldErrors(errors: readonly ChecklistFieldError[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const error of errors) {
    const existing = out[error.itemId];
    if (existing) existing.push(error.message);
    else out[error.itemId] = [error.message];
  }
  return out;
}

/**
 * Close a job.
 *
 * This is the one action in the product where the order of operations is load-bearing, so
 * it is spelled out:
 *
 * 1. **Permission, with `isAssignee`.** A technician may only close a job assigned to
 *    them. The matrix decides that; this action only supplies the fact.
 * 2. **Read the template and the answers, then `validateChecklist`.** Pure, no writes.
 *    Its result is also the honest value for `checklistComplete` below — the status
 *    machine asks whether the checklist is complete, and the checklist module is the only
 *    thing that can answer.
 * 3. **`checkTransition`.** The status machine is the authority on whether this edge is
 *    legal *and* whether the data the target state needs is present — assignee, schedule,
 *    a completion date that is not in the future. Every error it returns is surfaced
 *    together.
 * 4. **Refuse on a failed checklist**, with the per-item messages the technician can act
 *    on. Steps 2–4 write nothing: a job that cannot be closed leaves no trace of having
 *    been half-closed.
 * 5. **Persist the results** with `replaceChecklistResults`, then mark the work order
 *    completed. The results carry a snapshot of each item's label and kind, so editing
 *    the template next year cannot rewrite a report signed today.
 * 6. **Then, and only then, `recalculateDeviceSchedule`.** The next service date and the
 *    reminder ladder are derived from a *completed* job, so they are rebuilt after the
 *    completion is durable — never before, or a crash in between would leave a device
 *    advanced a year for work that was never recorded. Doing it through the scheduling
 *    service rather than here is what keeps `devices.nextServiceDue` single-writer.
 */
export async function completeWorkOrder(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not close that job.', async () => {
    const session = await requireSession();

    const parsed = completeSchema.safeParse({
      id: text(formData, 'id'),
      completedOn: text(formData, 'completedOn'),
      signedByName: optional(formData, 'signedByName'),
      totalMinutes: optional(formData, 'totalMinutes'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const loaded = await loadWorkOrder(session, parsed.data.id);
    if (!loaded) return fail(GONE);
    const { workOrder, isAssignee } = loaded;

    // (1) Permission, with the assignee fact the matrix needs.
    await requirePermission('work_order:complete', { isAssignee });

    const repo = getRepository();
    const orgId = session.organization.id;

    // Narrowed rather than cast: the schema already refuses a malformed date, and this
    // keeps `completedOn` a real `CivilDate` all the way into the scheduling call.
    const completedOn = tryCivilDate(parsed.data.completedOn);
    if (!completedOn) {
      return fail('Record the date the work was carried out.', {
        completedOn: ['Use a date in the form YYYY-MM-DD.'],
      });
    }

    // (2) Template and answers, then the checklist rules. Nothing is written yet.
    const items = workOrder.checklistTemplateId
      ? await repo.listChecklistItems(orgId, workOrder.checklistTemplateId)
      : [];
    const answers = items.map((item) => answerFor(formData, item));
    const validation = validateChecklist(items, answers);

    // (3) The status machine, asked with the honest checklist verdict. All errors at once.
    const check = checkTransition({
      from: workOrder.status,
      to: 'completed',
      assignedTo: workOrder.assignedTo,
      scheduledFor: workOrder.scheduledFor,
      completedOn,
      checklistComplete: validation.ok,
      today: session.today,
    });

    if (!check.ok) {
      // A failed checklist is reported against its own fields rather than only as the
      // machine's one-line summary, so the technician can see which check is blocking.
      return fail(
        check.errors.join(' '),
        validation.ok ? undefined : checklistFieldErrors(validation.errors),
      );
    }

    // (4) Belt and braces: `checkTransition` already refuses an incomplete checklist, but
    // this action must never reach the write below with an invalid run.
    if (!validation.ok) {
      return fail(
        'The checklist is not complete. Every failed check needs a note explaining it.',
        checklistFieldErrors(validation.errors),
      );
    }

    // (5) Results first, then the work order. The snapshot is the evidence behind the
    // report, so it lands before the job is declared finished.
    await repo.replaceChecklistResults(
      orgId,
      workOrder.id,
      validation.results.map((result) => ({
        orgId,
        workOrderId: workOrder.id,
        itemId: result.itemId,
        labelSnapshot: result.labelSnapshot,
        kindSnapshot: result.kindSnapshot,
        position: result.position,
        valueBool: result.valueBool,
        valueNum: result.valueNum,
        valueText: result.valueText,
        passed: result.passed,
        note: result.note,
      })),
    );

    await repo.updateWorkOrder(orgId, workOrder.id, {
      status: 'completed',
      completedOn,
      completedAt: new Date().toISOString(),
    });

    // The customer's signature belongs to the moment of completion, not to whenever
    // somebody later downloads the PDF, so the report row is opened here when there is a
    // signature to keep. The download route reuses this row — see the note there on why
    // the number has to stay stable across regenerations.
    const existingReport = await repo.getServiceReportByWorkOrder(orgId, workOrder.id);
    if (!existingReport && parsed.data.signedByName) {
      await repo.createServiceReport({
        orgId,
        workOrderId: workOrder.id,
        number: serviceReportNumber(workOrder.code),
        generatedAt: new Date().toISOString(),
        signedByName: parsed.data.signedByName,
        totalMinutes: parsed.data.totalMinutes ?? null,
      });
    }

    // (6) Only now: the derived schedule and the reminder ladder, rebuilt in one place.
    const schedule = await recalculateDeviceSchedule(
      session.organization,
      workOrder.deviceId,
      session.today,
      completedOn,
    );

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'work_order.complete',
      entity: 'work_order',
      entityId: workOrder.id,
      meta: {
        code: workOrder.code,
        completedOn,
        checks: validation.results.length,
        failed: validation.results.filter((r) => !r.passed).length,
        previousDue: schedule.previousDue,
        nextDue: schedule.nextDue,
      },
    });

    revalidateWorkOrder(workOrder.id, workOrder.deviceId);
    revalidatePath('/app/devices');

    return ok(
      null,
      schedule.nextDue
        ? `${workOrder.code} completed. Next service due ${schedule.nextDue}.`
        : `${workOrder.code} completed.`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

const cancelSchema = z.object({
  id: idField,
  reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').optional(),
});

/**
 * Call a job off.
 *
 * Cancelling is terminal and deliberately does *not* touch the device's schedule: nothing
 * was serviced, so the due date it was going to satisfy still stands.
 */
export async function cancelWorkOrder(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not cancel that job.', async () => {
    const session = await requirePermission('work_order:cancel');

    const parsed = cancelSchema.safeParse({
      id: text(formData, 'id'),
      reason: optional(formData, 'reason'),
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const loaded = await loadWorkOrder(session, parsed.data.id);
    if (!loaded) return fail(GONE);
    const { workOrder } = loaded;

    const check = checkTransition({
      from: workOrder.status,
      to: 'cancelled',
      assignedTo: workOrder.assignedTo,
      scheduledFor: workOrder.scheduledFor,
      completedOn: workOrder.completedOn,
      checklistComplete: false,
      today: session.today,
    });
    if (!check.ok) return fail(check.errors.join(' '));

    const repo = getRepository();
    const orgId = session.organization.id;

    // The reason is kept on the record rather than only in the audit log: whoever opens
    // this job in a year is reading the job, not the log.
    const note = parsed.data.reason
      ? [workOrder.internalNotes, `Cancelled: ${parsed.data.reason}`].filter(Boolean).join('\n\n')
      : workOrder.internalNotes;

    await repo.updateWorkOrder(orgId, workOrder.id, {
      status: 'cancelled',
      internalNotes: note,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'work_order.cancel',
      entity: 'work_order',
      entityId: workOrder.id,
      meta: { code: workOrder.code, from: workOrder.status, reason: parsed.data.reason ?? null },
    });

    revalidateWorkOrder(workOrder.id, workOrder.deviceId);

    return ok(null, `${workOrder.code} cancelled.`);
  });
}
