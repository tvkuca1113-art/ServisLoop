import { beforeEach, describe, expect, it } from 'vitest';

import { validateChecklist, type ChecklistAnswer } from '@/domain/checklist';
import { addDays, civilDate, type CivilDate } from '@/domain/dates';
import type { ChecklistItem, Device, Organization, WorkOrder } from '@/domain/types';
import { allowedTransitions, checkTransition } from '@/domain/work-order';
import { __setRepositoryForTests } from '@/server/data';
import { JsonRepository } from '@/server/data/json-repository';
import { createDemoStore, DEMO } from '@/server/data/seed';
import { recalculateDeviceSchedule } from '@/server/service/scheduling';

/**
 * The technician workflow, driven end to end against a real `JsonRepository`.
 *
 * The server actions themselves cannot be called here — they are `'use server'` modules
 * that reach for `cookies()` and `revalidatePath()`, neither of which exists outside a
 * request. What *can* be exercised, and is what actually matters, is the sequence those
 * actions perform: the domain guard at each step, the writes in the order the action makes
 * them, and the scheduling call that closes the loop.
 *
 * Two properties this suite exists to protect:
 *
 * - every step of `draft → scheduled → in_progress → completed` is refused until its
 *   preconditions hold, and no step can be skipped;
 * - completing a job advances the device's `nextServiceDue` **and** rebuilds its reminder
 *   ladder, both through `recalculateDeviceSchedule` and nowhere else.
 */

const TODAY = civilDate('2026-08-02');

let repo: JsonRepository;
let org: Organization;
let device: Device;
let items: ChecklistItem[];

async function seed(): Promise<void> {
  repo = new JsonRepository({ seed: () => createDemoStore(TODAY) });
  __setRepositoryForTests(repo);

  const found = await repo.getOrganization(DEMO.orgId);
  if (!found) throw new Error('demo organisation missing from seed');
  org = found;

  const devices = await repo.listDevices(org.id, { status: 'active' });
  // A device with a template, so the completion path runs a real checklist rather than
  // the trivial empty one.
  const types = await repo.listDeviceTypes(org.id);
  const withTemplate = devices.find((d) => {
    const type = types.find((t) => t.id === d.deviceTypeId);
    return type?.checklistTemplateId != null && d.nextServiceDue !== null;
  });
  if (!withTemplate) throw new Error('seed has no device with a checklist template');
  device = withTemplate;

  const type = types.find((t) => t.id === device.deviceTypeId);
  items = await repo.listChecklistItems(org.id, type?.checklistTemplateId as string);
  expect(items.length).toBeGreaterThan(0);
}

beforeEach(seed);

/** Open a draft the way `createWorkOrder` does, minus the request plumbing. */
async function openDraft(): Promise<WorkOrder> {
  const location = await repo.getLocation(org.id, device.locationId);
  if (!location) throw new Error('device has no location');
  const types = await repo.listDeviceTypes(org.id);
  const type = types.find((t) => t.id === device.deviceTypeId);

  const year = Number(TODAY.slice(0, 4));
  const sequence = await repo.nextWorkOrderSequence(org.id, year);

  return repo.createWorkOrder({
    orgId: org.id,
    code: `WO-${year}-${String(sequence).padStart(4, '0')}`,
    deviceId: device.id,
    locationId: location.id,
    customerId: location.customerId,
    kind: 'scheduled',
    status: 'draft',
    priority: 'normal',
    scheduledFor: null,
    scheduledMinutes: org.slotMinutes,
    assignedTo: null,
    checklistTemplateId: type?.checklistTemplateId ?? null,
    sourceBookingId: null,
    sourceIssueId: null,
    summary: null,
    internalNotes: null,
    openedAt: `${TODAY}T07:00:00.000Z`,
    startedAt: null,
    completedAt: null,
    completedOn: null,
  });
}

/** A run that passes every check, built from the template the same way the run UI does. */
function passingAnswers(): ChecklistAnswer[] {
  return items.map((item) => {
    switch (item.kind) {
      case 'boolean':
        return { itemId: item.id, valueBool: item.expectedBoolean ?? true };
      case 'number': {
        const min = item.minValue ?? 0;
        const max = item.maxValue ?? min + 10;
        return { itemId: item.id, valueNum: (min + max) / 2 };
      }
      case 'select':
        return { itemId: item.id, valueText: item.options?.[0] ?? '' };
      default:
        return { itemId: item.id, valueText: 'Nothing unusual found.' };
    }
  });
}

/**
 * The completion sequence from `completeWorkOrder`, in the order the action performs it.
 * Kept in one place so a change to the ordering has to be made here too.
 */
async function complete(
  workOrder: WorkOrder,
  answers: readonly ChecklistAnswer[],
  completedOn: CivilDate,
): Promise<{ ok: boolean; errors: string[] }> {
  const templateItems = workOrder.checklistTemplateId
    ? await repo.listChecklistItems(org.id, workOrder.checklistTemplateId)
    : [];

  const validation = validateChecklist(templateItems, answers);

  const check = checkTransition({
    from: workOrder.status,
    to: 'completed',
    assignedTo: workOrder.assignedTo,
    scheduledFor: workOrder.scheduledFor,
    completedOn,
    checklistComplete: validation.ok,
    today: TODAY,
  });

  if (!check.ok) return { ok: false, errors: check.errors };
  if (!validation.ok) return { ok: false, errors: validation.errors.map((e) => e.message) };

  await repo.replaceChecklistResults(
    org.id,
    workOrder.id,
    validation.results.map((result) => ({
      orgId: org.id,
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

  await repo.updateWorkOrder(org.id, workOrder.id, {
    status: 'completed',
    completedOn,
    completedAt: `${completedOn}T12:00:00.000Z`,
  });

  // Only now, and only here: the derived schedule and the reminder ladder.
  await recalculateDeviceSchedule(org, workOrder.deviceId, TODAY, completedOn);

  return { ok: true, errors: [] };
}

describe('work-order lifecycle', () => {
  it('refuses to skip a step', async () => {
    const draft = await openDraft();

    // `draft` may only become `scheduled` or `cancelled`.
    expect(allowedTransitions('draft')).toEqual(['scheduled', 'cancelled']);

    const straightToProgress = checkTransition({
      from: 'draft',
      to: 'in_progress',
      assignedTo: DEMO.tech1Id,
      scheduledFor: `${TODAY}T08:00:00.000Z`,
      completedOn: null,
      checklistComplete: true,
      today: TODAY,
    });
    expect(straightToProgress.ok).toBe(false);

    const straightToComplete = await complete(draft, passingAnswers(), TODAY);
    expect(straightToComplete.ok).toBe(false);
    expect(straightToComplete.errors.join(' ')).toContain('Cannot move from "draft" to "completed"');
  });

  it('walks draft → scheduled → in_progress → completed', async () => {
    const draft = await openDraft();
    expect(draft.status).toBe('draft');

    /* -- draft → scheduled -------------------------------------------- */

    // Scheduling needs a date; without one the machine refuses.
    const withoutDate = checkTransition({
      from: 'draft',
      to: 'scheduled',
      assignedTo: null,
      scheduledFor: null,
      completedOn: null,
      checklistComplete: false,
      today: TODAY,
    });
    expect(withoutDate.ok).toBe(false);
    if (!withoutDate.ok) expect(withoutDate.errors).toContain('Set a scheduled date and time.');

    const scheduledFor = `${TODAY}T08:00:00.000Z`;
    expect(
      checkTransition({
        from: 'draft',
        to: 'scheduled',
        assignedTo: null,
        scheduledFor,
        completedOn: null,
        checklistComplete: false,
        today: TODAY,
      }).ok,
    ).toBe(true);

    const scheduled = await repo.updateWorkOrder(org.id, draft.id, {
      status: 'scheduled',
      scheduledFor,
    });
    expect(scheduled.status).toBe('scheduled');

    /* -- scheduled → in_progress -------------------------------------- */

    // Starting needs an assignee. This is the check that keeps an unassigned job from
    // being "in progress" with nobody on site.
    const unassigned = checkTransition({
      from: 'scheduled',
      to: 'in_progress',
      assignedTo: null,
      scheduledFor,
      completedOn: null,
      checklistComplete: false,
      today: TODAY,
    });
    expect(unassigned.ok).toBe(false);
    if (!unassigned.ok) expect(unassigned.errors).toContain('Assign a technician first.');

    const assigned = await repo.updateWorkOrder(org.id, draft.id, { assignedTo: DEMO.tech1Id });
    expect(
      checkTransition({
        from: 'scheduled',
        to: 'in_progress',
        assignedTo: assigned.assignedTo,
        scheduledFor,
        completedOn: null,
        checklistComplete: false,
        today: TODAY,
      }).ok,
    ).toBe(true);

    const started = await repo.updateWorkOrder(org.id, draft.id, {
      status: 'in_progress',
      startedAt: `${TODAY}T08:05:00.000Z`,
    });
    expect(started.status).toBe('in_progress');

    /* -- in_progress → completed -------------------------------------- */

    const before = await repo.getDevice(org.id, device.id);
    const previousDue = before?.nextServiceDue ?? null;
    expect(previousDue).not.toBeNull();

    const result = await complete(started, passingAnswers(), TODAY);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);

    const closed = await repo.getWorkOrder(org.id, draft.id);
    expect(closed?.status).toBe('completed');
    expect(closed?.completedOn).toBe(TODAY);

    /* -- the effect on the device ------------------------------------- */

    const after = await repo.getDevice(org.id, device.id);
    expect(after?.lastServiceAt).toBe(TODAY);
    expect(after?.nextServiceDue).not.toBe(previousDue);
    // Forward, never backward: a completed service always moves the date out.
    expect(after?.nextServiceDue).not.toBeNull();
    expect((after?.nextServiceDue as CivilDate) > (previousDue as CivilDate)).toBe(true);

    /* -- and on the reminders ----------------------------------------- */

    const reminders = await repo.listReminders(org.id, { deviceId: device.id });
    const pending = reminders.filter((r) => r.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    // Every queued reminder is for the *new* due date. A ladder still pointing at the old
    // one would chase a customer for a service that has just been carried out.
    for (const reminder of pending) {
      expect(reminder.dueDate).toBe(after?.nextServiceDue);
      expect(reminder.scheduledFor >= TODAY).toBe(true);
    }
    expect(reminders.some((r) => r.status === 'pending' && r.dueDate === previousDue)).toBe(false);

    /* -- and the evidence --------------------------------------------- */

    const results = await repo.listChecklistResults(org.id, draft.id);
    expect(results).toHaveLength(items.length);
    expect(results.every((r) => r.passed)).toBe(true);
    // Snapshots, not references: a template edited next year cannot rewrite this run.
    expect(results.map((r) => r.labelSnapshot)).toEqual(
      [...items].sort((a, b) => a.position - b.position).map((i) => i.label),
    );
  });

  it('refuses to close a job whose checklist is incomplete', async () => {
    const draft = await openDraft();
    const scheduledFor = `${TODAY}T08:00:00.000Z`;
    const live = await repo.updateWorkOrder(org.id, draft.id, {
      status: 'in_progress',
      scheduledFor,
      assignedTo: DEMO.tech1Id,
      startedAt: `${TODAY}T08:05:00.000Z`,
    });

    const dueBefore = (await repo.getDevice(org.id, device.id))?.nextServiceDue ?? null;

    // Drop the required answers.
    const partial = passingAnswers().slice(0, 1);
    const attempt = await complete(live, partial, TODAY);

    expect(attempt.ok).toBe(false);
    expect(attempt.errors.join(' ')).toContain('Complete the service checklist');

    // Nothing was written: not the results, not the status, not the device schedule.
    expect(await repo.listChecklistResults(org.id, draft.id)).toEqual([]);
    expect((await repo.getWorkOrder(org.id, draft.id))?.status).toBe('in_progress');
    expect((await repo.getDevice(org.id, device.id))?.nextServiceDue).toBe(dueBefore);
  });

  it('refuses to close a job when a failed check has no note', async () => {
    const draft = await openDraft();
    const live = await repo.updateWorkOrder(org.id, draft.id, {
      status: 'in_progress',
      scheduledFor: `${TODAY}T08:00:00.000Z`,
      assignedTo: DEMO.tech1Id,
    });

    const booleanItem = items.find((i) => i.kind === 'boolean' && i.required);
    expect(booleanItem).toBeDefined();
    if (!booleanItem) return;

    const answers = passingAnswers().map((answer) =>
      answer.itemId === booleanItem.id
        ? { itemId: answer.itemId, valueBool: !(booleanItem.expectedBoolean ?? true) }
        : answer,
    );

    const attempt = await complete(live, answers, TODAY);
    expect(attempt.ok).toBe(false);

    // With a note, the same failed check is acceptable — a report that documents a fault
    // is the point of the exercise.
    const explained = answers.map((answer) =>
      answer.itemId === booleanItem.id
        ? { ...answer, note: 'Valve seized. Isolated and quoted for replacement.' }
        : answer,
    );
    const second = await complete(live, explained, TODAY);
    expect(second.errors).toEqual([]);
    expect(second.ok).toBe(true);

    const results = await repo.listChecklistResults(org.id, draft.id);
    const failed = results.filter((r) => !r.passed);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.note).toContain('Valve seized');
  });

  it('refuses a completion date in the future', async () => {
    const draft = await openDraft();
    const live = await repo.updateWorkOrder(org.id, draft.id, {
      status: 'in_progress',
      scheduledFor: `${TODAY}T08:00:00.000Z`,
      assignedTo: DEMO.tech1Id,
    });

    const attempt = await complete(live, passingAnswers(), addDays(TODAY, 1));
    expect(attempt.ok).toBe(false);
    expect(attempt.errors).toContain('The completion date cannot be in the future.');
  });

  it('leaves a completed job terminal', async () => {
    expect(allowedTransitions('completed')).toEqual([]);
    expect(allowedTransitions('cancelled')).toEqual([]);
  });
});
