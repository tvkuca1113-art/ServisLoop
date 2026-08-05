import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, civilDate } from '@/domain/dates';
import type { CivilDate } from '@/domain/dates';
import type { Organization } from '@/domain/types';
import { JsonRepository } from '@/server/data/json-repository';
import { createDemoStore, DEMO } from '@/server/data/seed';
import { __setRepositoryForTests } from '@/server/data';
import {
  collectBusyIntervals,
  createWorkOrderForDevice,
  recalculateDeviceSchedule,
  syncDeviceReminders,
} from '../scheduling';

/**
 * Integration tests for the scheduling orchestration.
 *
 * These run against a real `JsonRepository` — not a mock — so they exercise the same
 * read/write paths the application does. The rules themselves are covered by the pure
 * domain suites; what is tested here is that this layer *asks* the domain the right
 * question and writes the answer back exactly once.
 */

const TODAY = civilDate('2026-08-02');

let repo: JsonRepository;
let org: Organization;

async function seed(): Promise<void> {
  repo = new JsonRepository({ seed: () => createDemoStore(TODAY) });
  __setRepositoryForTests(repo);
  const found = await repo.getOrganization(DEMO.orgId);
  if (!found) throw new Error('demo organisation missing from seed');
  org = found;
}

beforeEach(seed);

describe('recalculateDeviceSchedule — idempotence', () => {
  it('does not move the due date when nothing has changed', async () => {
    // The regression this guards: `previousDue` used to be fed back into the domain on
    // every recalculation, so under the `schedule` anchor a no-op call stepped the date
    // forward by one whole interval. A pause/unpause cycle moved a device two years out.
    const devices = await repo.listDevices(org.id, { status: 'active' });
    const device = devices.find((d) => d.nextServiceDue && d.lastServiceAt);
    expect(device).toBeDefined();
    if (!device) return;

    expect(org.defaultIntervalAnchor).toBe('schedule');
    const original = device.nextServiceDue;

    for (let i = 0; i < 5; i += 1) {
      const result = await recalculateDeviceSchedule(org, device.id, TODAY);
      expect(result.nextDue).toBe(original);
    }
  });

  it('still advances the date when a job is actually completed', async () => {
    const devices = await repo.listDevices(org.id, { status: 'active' });
    const device = devices.find((d) => d.nextServiceDue);
    expect(device).toBeDefined();
    if (!device) return;

    const before = device.nextServiceDue as CivilDate;
    const result = await recalculateDeviceSchedule(org, device.id, TODAY, TODAY);

    expect(result.previousDue).toBe(before);
    expect(result.nextDue).not.toBe(before);
    expect(result.device.lastServiceAt).toBe(TODAY);
    // `schedule` anchor: the cadence is preserved, so the new date is the old one plus
    // whole intervals — not "today + interval".
    const interval = device.serviceIntervalDays ?? 365;
    expect(result.nextDue).toBe(addDays(before, interval));
  });

  it('follows an interval change without drifting', async () => {
    const devices = await repo.listDevices(org.id, { status: 'active' });
    const device = devices.find((d) => d.lastServiceAt && d.nextServiceDue);
    if (!device) return;

    await repo.updateDevice(org.id, device.id, { serviceIntervalDays: 90 });
    const first = await recalculateDeviceSchedule(org, device.id, TODAY);
    const second = await recalculateDeviceSchedule(org, device.id, TODAY);

    expect(first.nextDue).toBe(addDays(device.lastServiceAt as CivilDate, 90));
    expect(second.nextDue).toBe(first.nextDue);
  });
});

describe('syncDeviceReminders', () => {
  it('builds a ladder for an active device and withdraws it when paused', async () => {
    const devices = await repo.listDevices(org.id, { status: 'active' });
    // Must be due in the future: `planReminders` drops stages whose send date has already
    // passed, so an overdue device correctly yields an empty ladder and would prove
    // nothing here.
    const device = devices.find((d) => d.nextServiceDue && d.nextServiceDue > TODAY);
    expect(device).toBeDefined();
    if (!device) return;

    await repo.deleteReminders(
      org.id,
      (await repo.listReminders(org.id, { deviceId: device.id })).map((r) => r.id),
    );

    const created = await syncDeviceReminders(org.id, device, TODAY);
    expect(created.created).toBeGreaterThan(0);

    const paused = await repo.updateDevice(org.id, device.id, { status: 'paused' });
    const withdrawn = await syncDeviceReminders(org.id, paused, TODAY);
    expect(withdrawn.cancelled).toBeGreaterThan(0);

    const remaining = await repo.listReminders(org.id, {
      deviceId: device.id,
      status: 'pending',
    });
    expect(remaining).toEqual([]);
  });

  it('is idempotent — running twice creates nothing the second time', async () => {
    const devices = await repo.listDevices(org.id, { status: 'active' });
    const device = devices.find((d) => d.nextServiceDue);
    if (!device) return;

    await syncDeviceReminders(org.id, device, TODAY);
    const second = await syncDeviceReminders(org.id, device, TODAY);
    expect(second.created).toBe(0);
    expect(second.cancelled).toBe(0);
  });

  it('never withdraws a reminder that has already been sent', async () => {
    const devices = await repo.listDevices(org.id, { status: 'active' });
    const device = devices.find(
      (d) => d.nextServiceDue && d.nextServiceDue < TODAY, // overdue → has sent reminders
    );
    if (!device) return;

    const sentBefore = (await repo.listReminders(org.id, { deviceId: device.id })).filter(
      (r) => r.status === 'sent',
    );
    expect(sentBefore.length).toBeGreaterThan(0);

    const moved = await repo.updateDevice(org.id, device.id, {
      nextServiceDue: addDays(TODAY, 200),
    });
    await syncDeviceReminders(org.id, moved, TODAY);

    const sentAfter = (await repo.listReminders(org.id, { deviceId: device.id })).filter(
      (r) => r.status === 'sent',
    );
    expect(sentAfter.map((r) => r.id).sort()).toEqual(sentBefore.map((r) => r.id).sort());
  });
});

describe('createWorkOrderForDevice', () => {
  it('allocates sequential codes and inherits the device context', async () => {
    const devices = await repo.listDevices(org.id);
    const device = devices[0];
    if (!device) return;

    const first = await createWorkOrderForDevice({ org, deviceId: device.id, kind: 'scheduled' });
    const second = await createWorkOrderForDevice({ org, deviceId: device.id, kind: 'scheduled' });

    expect(first.code).toMatch(/^WO-\d{4}-\d{4}$/);
    expect(first.code).not.toBe(second.code);

    const location = await repo.getLocation(org.id, device.locationId);
    expect(first.locationId).toBe(device.locationId);
    expect(first.customerId).toBe(location?.customerId);
  });

  it('attaches the checklist template that belongs to the device type', async () => {
    const devices = await repo.listDevices(org.id);
    const withType = devices.find((d) => d.deviceTypeId);
    if (!withType) return;

    const types = await repo.listDeviceTypes(org.id);
    const type = types.find((t) => t.id === withType.deviceTypeId);

    const wo = await createWorkOrderForDevice({
      org,
      deviceId: withType.id,
      kind: 'scheduled',
    });
    expect(wo.checklistTemplateId).toBe(type?.checklistTemplateId ?? null);
  });

  it('opens as a draft with no schedule, and as scheduled with one', async () => {
    const devices = await repo.listDevices(org.id);
    const device = devices[0];
    if (!device) return;

    const draft = await createWorkOrderForDevice({ org, deviceId: device.id, kind: 'issue' });
    expect(draft.status).toBe('draft');

    const scheduled = await createWorkOrderForDevice({
      org,
      deviceId: device.id,
      kind: 'booking',
      scheduledFor: `${addDays(TODAY, 3)}T09:00:00.000Z`,
    });
    expect(scheduled.status).toBe('scheduled');
  });
});

describe('collectBusyIntervals', () => {
  it('blocks time for live work orders and for bookings awaiting a decision', async () => {
    const from = TODAY;
    const to = addDays(TODAY, 30);
    const busy = await collectBusyIntervals(org.id, org, from, to);

    expect(busy.length).toBeGreaterThan(0);
    for (const b of busy) {
      expect(b.endMinute).toBeGreaterThan(b.startMinute);
      expect(b.date >= from && b.date <= to).toBe(true);
    }

    // A pending booking must occupy its slot; otherwise two customers could claim it
    // while the first request sat unactioned in the queue.
    const pending = (await repo.listBookings(org.id, 'pending'))[0];
    if (pending && pending.requestedDate <= to) {
      expect(
        busy.some(
          (b) => b.date === pending.requestedDate && b.startMinute === pending.requestedStartMinute,
        ),
      ).toBe(true);
    }
  });
});
