import 'server-only';

import type { CivilDate } from '@/domain/dates';
import { civilDateFromUTC } from '@/domain/dates';
import { planReminders, reconcileReminders } from '@/domain/reminders';
import {
  computeNextServiceDue,
  effectiveAnchor,
  effectiveIntervalDays,
} from '@/domain/service-interval';
import { formatWorkOrderCode, priorityForIssue } from '@/domain/work-order';
import type {
  Device,
  Issue,
  Organization,
  Priority,
  UUID,
  WorkOrder,
  WorkOrderKind,
} from '@/domain/types';
import { getRepository } from '@/server/data';
import type { NewRecord } from '@/server/data/repository';

/**
 * Scheduling orchestration.
 *
 * This module is the *only* writer of `devices.next_service_due` and the only place that
 * creates or reconciles a device's reminder ladder. Both values are derived, so letting
 * several call sites compute them independently is how they end up disagreeing.
 *
 * The rules themselves live in `src/domain` and are pure. This layer does the I/O:
 * read the current state, ask the domain what the answer should be, write it back.
 * Nothing here decides anything — which is why the interesting tests are the domain
 * tests, not these.
 */

/** Reconcile a device's reminder ladder against its current due date. */
export async function syncDeviceReminders(
  orgId: UUID,
  device: Pick<Device, 'id' | 'nextServiceDue' | 'status'>,
  today: CivilDate,
): Promise<{ created: number; cancelled: number }> {
  const repo = getRepository();
  const existing = await repo.listReminders(orgId, { deviceId: device.id });

  // A paused or retired device is not chased: its ladder collapses to nothing, and any
  // pending reminders are withdrawn.
  const desired =
    device.status === 'active'
      ? planReminders({ deviceId: device.id, dueDate: device.nextServiceDue, today })
      : [];

  const { toCreate, toCancel } = reconcileReminders({ desired, existing });

  if (toCancel.length > 0) {
    await repo.deleteReminders(
      orgId,
      toCancel.map((r) => r.id),
    );
  }

  if (toCreate.length > 0) {
    await repo.createRemindersIgnoringDuplicates(
      toCreate.map((item) => ({
        orgId,
        deviceId: item.deviceId,
        dueDate: item.dueDate,
        stage: item.stage,
        scheduledFor: item.scheduledFor,
        status: 'pending' as const,
        sentAt: null,
        error: null,
      })),
    );
  }

  return { created: toCreate.length, cancelled: toCancel.length };
}

export interface RecalculateResult {
  device: Device;
  previousDue: CivilDate | null;
  nextDue: CivilDate | null;
  remindersCreated: number;
  remindersCancelled: number;
}

/**
 * Recompute a device's next service date and rebuild its reminders.
 *
 * Called after a job is completed, after an interval or anchor is edited, and after an
 * import. `completedOn` is optional: without it this re-derives the schedule from the
 * device's existing history, which is what an interval change needs.
 */
export async function recalculateDeviceSchedule(
  org: Organization,
  deviceId: UUID,
  today: CivilDate,
  completedOn?: CivilDate | null,
): Promise<RecalculateResult> {
  const repo = getRepository();
  const device = await repo.getDevice(org.id, deviceId);
  if (!device) throw new Error(`Device ${deviceId} not found in organisation ${org.id}.`);

  const deviceTypes = await repo.listDeviceTypes(org.id);
  const deviceType = deviceTypes.find((t) => t.id === device.deviceTypeId) ?? null;

  const previousDue = device.nextServiceDue;
  const isNewCompletion = completedOn != null;
  const effectiveCompletion = completedOn ?? device.lastServiceAt ?? null;

  const nextDue = computeNextServiceDue({
    intervalDays: effectiveIntervalDays(device, deviceType),
    anchor: effectiveAnchor(device, org.defaultIntervalAnchor),
    completedOn: effectiveCompletion,
    // `previousDue` means "the due date this completion satisfied", and it is only
    // meaningful when a job has *just* been completed.
    //
    // When we are merely re-deriving the schedule — an interval edit, an anchor change,
    // an unpause — the device's current `nextServiceDue` is the very value being
    // recomputed. Feeding it back in makes the `schedule` anchor step forward from it,
    // so every no-op recalculation would silently push the due date out by a full
    // interval. Passing `null` here makes the domain fall back to
    // `lastServiceAt + interval`, which is idempotent: recalculating an unchanged device
    // any number of times yields the same date.
    previousDue: isNewCompletion ? previousDue : null,
    installedOn: device.installedOn,
  });

  const patch: Partial<Device> = { nextServiceDue: nextDue };
  if (completedOn) patch.lastServiceAt = completedOn;

  const updated = await repo.updateDevice(org.id, deviceId, patch);
  const { created, cancelled } = await syncDeviceReminders(org.id, updated, today);

  return {
    device: updated,
    previousDue,
    nextDue,
    remindersCreated: created,
    remindersCancelled: cancelled,
  };
}

export interface CreateWorkOrderInput {
  org: Organization;
  deviceId: UUID;
  kind: WorkOrderKind;
  priority?: Priority;
  /** ISO instant. */
  scheduledFor?: string | null;
  scheduledMinutes?: number | null;
  assignedTo?: UUID | null;
  sourceBookingId?: UUID | null;
  sourceIssueId?: UUID | null;
  summary?: string | null;
  status?: WorkOrder['status'];
}

/**
 * Create a work order for a device, allocating its code atomically.
 *
 * The code is formatted here by the domain helper rather than by the caller so
 * `WO-YYYY-NNNN` has exactly one definition. The location, customer and checklist
 * template are all resolved from the device, so a caller cannot accidentally file a job
 * against the wrong customer.
 */
export async function createWorkOrderForDevice(
  input: CreateWorkOrderInput,
): Promise<WorkOrder> {
  const repo = getRepository();
  const { org } = input;

  const device = await repo.getDevice(org.id, input.deviceId);
  if (!device) throw new Error(`Device ${input.deviceId} not found.`);

  const location = await repo.getLocation(org.id, device.locationId);
  if (!location) throw new Error(`Location ${device.locationId} not found.`);

  const deviceTypes = await repo.listDeviceTypes(org.id);
  const deviceType = deviceTypes.find((t) => t.id === device.deviceTypeId) ?? null;

  const year = Number(civilDateFromUTC(new Date()).slice(0, 4));
  const sequence = await repo.nextWorkOrderSequence(org.id, year);

  const now = new Date().toISOString();
  const record: NewRecord<WorkOrder> = {
    orgId: org.id,
    code: formatWorkOrderCode(year, sequence),
    deviceId: device.id,
    locationId: location.id,
    customerId: location.customerId,
    kind: input.kind,
    status: input.status ?? (input.scheduledFor ? 'scheduled' : 'draft'),
    priority: input.priority ?? 'normal',
    scheduledFor: input.scheduledFor ?? null,
    scheduledMinutes: input.scheduledMinutes ?? org.slotMinutes,
    assignedTo: input.assignedTo ?? null,
    checklistTemplateId: deviceType?.checklistTemplateId ?? null,
    sourceBookingId: input.sourceBookingId ?? null,
    sourceIssueId: input.sourceIssueId ?? null,
    summary: input.summary ?? null,
    internalNotes: null,
    openedAt: now,
    startedAt: null,
    completedAt: null,
    completedOn: null,
  };

  return repo.createWorkOrder(record);
}

/** Turn a customer-reported fault into a job, carrying severity through to priority. */
export async function createWorkOrderFromIssue(
  org: Organization,
  issue: Issue,
  assignedTo?: UUID | null,
): Promise<WorkOrder> {
  const repo = getRepository();

  const workOrder = await createWorkOrderForDevice({
    org,
    deviceId: issue.deviceId,
    kind: 'issue',
    priority: priorityForIssue(issue.severity),
    assignedTo: assignedTo ?? null,
    sourceIssueId: issue.id,
    summary: issue.title,
    status: 'draft',
  });

  await repo.updateIssue(org.id, issue.id, {
    status: 'converted',
    workOrderId: workOrder.id,
  });

  return workOrder;
}

/**
 * Busy intervals for the availability engine.
 *
 * Everything already on the calendar blocks a slot: scheduled and in-progress work
 * orders, plus bookings a customer has requested but nobody has actioned yet. Leaving
 * pending bookings out would let two customers claim the same slot while the first
 * request sat in the queue.
 */
export async function collectBusyIntervals(
  orgId: UUID,
  org: Organization,
  from: CivilDate,
  to: CivilDate,
): Promise<Array<{ date: CivilDate; startMinute: number; endMinute: number }>> {
  const repo = getRepository();
  const [workOrders, bookings] = await Promise.all([
    repo.listWorkOrders(orgId, { status: ['scheduled', 'in_progress'], from, to }),
    repo.listBookings(orgId),
  ]);

  const busy: Array<{ date: CivilDate; startMinute: number; endMinute: number }> = [];

  for (const wo of workOrders) {
    if (!wo.scheduledFor) continue;
    const date = wo.scheduledFor.slice(0, 10) as CivilDate;
    const time = wo.scheduledFor.slice(11, 16);
    const [h, m] = time.split(':');
    const startMinute = Number(h) * 60 + Number(m);
    busy.push({
      date,
      startMinute,
      endMinute: startMinute + (wo.scheduledMinutes ?? org.slotMinutes),
    });
  }

  for (const b of bookings) {
    if (b.status !== 'pending' && b.status !== 'confirmed') continue;
    if (b.requestedDate < from || b.requestedDate > to) continue;
    busy.push({
      date: b.requestedDate,
      startMinute: b.requestedStartMinute,
      endMinute: b.requestedEndMinute,
    });
  }

  return busy;
}
