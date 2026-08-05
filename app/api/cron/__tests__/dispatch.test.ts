import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, civilDate } from '@/domain/dates';
import type { CivilDate } from '@/domain/dates';
import type { Device, Reminder, ReminderStage } from '@/domain/types';
import { __setRepositoryForTests } from '@/server/data';
import { JsonRepository } from '@/server/data/json-repository';
import { DEMO, createDemoStore } from '@/server/data/seed';
import {
  REMINDER_GRACE_DAYS,
  dispatchDueReminders,
} from '@/server/notify/dispatch';
import {
  ConsoleTransport,
  getReminderTransport,
  type ReminderEnvelope,
  type ReminderTransport,
} from '@/server/notify/transport';

/**
 * Integration tests for reminder dispatch.
 *
 * Run against a real `JsonRepository` seeded with the demo organisation — not a mock — so
 * the same read/write paths execute that the cron endpoint and the in-app button use. Only
 * the transport is substituted, because "did we email a customer?" is the one thing a test
 * must not actually do.
 *
 * What is being proven here is the safety property the whole feature rests on: the job can
 * be retried, run twice, or overlap with itself without a customer ever receiving the same
 * notice twice. The rules it applies — which reminders are due, which are stale — are
 * covered by the pure domain suite; this file checks that the orchestration honours them
 * and writes the outcome back exactly once.
 */

const TODAY = civilDate('2026-08-02');

/** Records what it was asked to send, and can be told to fail for specific devices. */
class RecordingTransport implements ReminderTransport {
  readonly name = 'recording';
  readonly sent: ReminderEnvelope[] = [];
  failFor: ReadonlySet<string> = new Set();

  send(envelope: ReminderEnvelope): Promise<void> {
    if (this.failFor.has(envelope.deviceName)) {
      return Promise.reject(new Error(`Mailbox for ${envelope.deviceName} does not exist`));
    }
    this.sent.push(envelope);
    return Promise.resolve();
  }
}

let repo: JsonRepository;
let transport: RecordingTransport;

beforeEach(async () => {
  // In-memory: no `filePath`, so nothing touches the developer's own `.data/store.json`.
  repo = new JsonRepository({ seed: () => createDemoStore(TODAY) });
  __setRepositoryForTests(repo);
  transport = new RecordingTransport();

  // The seed marks every reminder whose send date has already passed as `sent`, so on the
  // anchor day nothing is outstanding. Each test then arranges exactly the rows it needs,
  // which keeps the arrangement visible in the test rather than buried in the fixture.
  const outstanding = await repo.listDueRemindersAcrossOrgs(TODAY, 500);
  expect(outstanding).toHaveLength(0);
});

/**
 * Devices that a reminder could legitimately be sent for: active, on a schedule, and
 * belonging to a customer with an address on file.
 */
async function mailableDevices(): Promise<Device[]> {
  const [devices, locations, customers] = await Promise.all([
    repo.listDevices(DEMO.orgId, { status: 'active' }),
    repo.listLocations(DEMO.orgId),
    repo.listCustomers(DEMO.orgId),
  ]);

  const locationById = new Map(locations.map((l) => [l.id, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  return devices.filter((device) => {
    if (!device.nextServiceDue) return false;
    const location = locationById.get(device.locationId);
    if (!location) return false;
    return Boolean(customerById.get(location.customerId)?.email);
  });
}

/**
 * Move an existing ladder row to a chosen send date and status.
 *
 * Existing rows are edited rather than new ones inserted, because `(deviceId, dueDate,
 * stage)` is unique — a second row for the same stage would simply be dropped, which is
 * exactly the guarantee under test and would make the arrangement silently empty.
 */
async function arrange(
  device: Device,
  stage: ReminderStage,
  scheduledFor: CivilDate,
  status: Reminder['status'] = 'pending',
): Promise<Reminder> {
  const rows = await repo.listReminders(DEMO.orgId, { deviceId: device.id });
  const row = rows.find((r) => r.stage === stage);
  if (!row) throw new Error(`No ${stage} reminder seeded for ${device.name}`);

  return repo.updateReminder(DEMO.orgId, row.id, {
    scheduledFor,
    status,
    sentAt: null,
    error: null,
  });
}

async function reload(id: string): Promise<Reminder> {
  const rows = await repo.listReminders(DEMO.orgId);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`Reminder ${id} disappeared`);
  return row;
}

describe('dispatchDueReminders — idempotence', () => {
  it('sends each due reminder exactly once, however many times it runs', async () => {
    const devices = (await mailableDevices()).slice(0, 3);
    expect(devices).toHaveLength(3);

    const arranged = await Promise.all(devices.map((d) => arrange(d, 'T_0', TODAY)));

    const first = await dispatchDueReminders({ today: TODAY, transport });
    expect(first).toMatchObject({ scanned: 3, sent: 3, failed: 0, skipped: 0 });
    expect(transport.sent).toHaveLength(3);

    // The second run is the point of the test: the same job, same day, nothing new.
    const second = await dispatchDueReminders({ today: TODAY, transport });
    expect(second).toMatchObject({ scanned: 0, sent: 0, failed: 0, skipped: 0 });
    expect(transport.sent).toHaveLength(3);

    // A third, to rule out an every-other-run bug.
    await dispatchDueReminders({ today: TODAY, transport });
    expect(transport.sent).toHaveLength(3);

    for (const reminder of arranged) {
      const after = await reload(reminder.id);
      expect(after.status).toBe('sent');
      expect(after.sentAt).not.toBeNull();
      expect(after.error).toBeNull();
    }

    // One message per reminder — not one per device, not one per customer.
    const ids = new Set(transport.sent.map((e) => e.reminderId));
    expect(ids.size).toBe(3);
  });

  it('is idempotent for the org-scoped run the in-app button uses', async () => {
    const devices = (await mailableDevices()).slice(0, 2);
    await Promise.all(devices.map((d) => arrange(d, 'T_0', TODAY)));

    const first = await dispatchDueReminders({ today: TODAY, orgId: DEMO.orgId, transport });
    const second = await dispatchDueReminders({ today: TODAY, orgId: DEMO.orgId, transport });

    expect(first.sent).toBe(2);
    expect(second.sent).toBe(0);
    expect(transport.sent).toHaveLength(2);
  });
});

describe('dispatchDueReminders — a row that is not pending is never sent', () => {
  it('ignores an already-sent reminder even when its send date is today', async () => {
    const devices = await mailableDevices();
    const device = devices[0];
    expect(device).toBeDefined();
    if (!device) return;

    const alreadySent = await arrange(device, 'T_0', TODAY, 'sent');

    const summary = await dispatchDueReminders({ today: TODAY, transport });

    expect(summary.scanned).toBe(0);
    expect(transport.sent).toHaveLength(0);
    expect((await reload(alreadySent.id)).status).toBe('sent');
  });

  it('refuses a non-pending row even when it is handed to the dispatcher directly', async () => {
    // The sweep already filters on `status = 'pending'`, so this exercises the guard inside
    // the loop — the one that protects the single-row retry path, where the caller chooses
    // the row rather than the query.
    const devices = await mailableDevices();
    const device = devices[0];
    expect(device).toBeDefined();
    if (!device) return;

    const failedRow = await arrange(device, 'T_0', TODAY, 'failed');

    const summary = await dispatchDueReminders({
      today: TODAY,
      transport,
      reminders: [failedRow],
    });

    expect(summary).toMatchObject({ scanned: 1, sent: 0, failed: 0, skipped: 1 });
    expect(transport.sent).toHaveLength(0);
    expect((await reload(failedRow.id)).status).toBe('failed');
  });
});

describe('dispatchDueReminders — stale reminders', () => {
  it('skips a reminder past the grace window instead of sending it late', async () => {
    const devices = (await mailableDevices()).slice(0, 2);
    const [fresh, stale] = devices;
    expect(fresh).toBeDefined();
    expect(stale).toBeDefined();
    if (!fresh || !stale) return;

    const freshRow = await arrange(fresh, 'T_0', TODAY);
    const staleRow = await arrange(stale, 'T_0', addDays(TODAY, -(REMINDER_GRACE_DAYS + 1)));

    const summary = await dispatchDueReminders({ today: TODAY, transport });

    expect(summary).toMatchObject({ scanned: 2, sent: 1, failed: 0, skipped: 1 });
    expect(transport.sent.map((e) => e.reminderId)).toEqual([freshRow.id]);

    // Deliberately still `pending`: `selectStaleReminders` — the warning list on the
    // reminders page — is defined over pending rows, so closing it here would erase the
    // only signal that the scheduler stopped running.
    const after = await reload(staleRow.id);
    expect(after.status).toBe('pending');
    expect(after.sentAt).toBeNull();
  });

  it('still sends a reminder that is late but inside the grace window', async () => {
    const devices = await mailableDevices();
    const device = devices[0];
    expect(device).toBeDefined();
    if (!device) return;

    await arrange(device, 'T_0', addDays(TODAY, -REMINDER_GRACE_DAYS));

    const summary = await dispatchDueReminders({ today: TODAY, transport });

    expect(summary).toMatchObject({ scanned: 1, sent: 1, skipped: 0 });
  });
});

describe('dispatchDueReminders — failures', () => {
  it('marks the failing row and finishes the rest of the batch', async () => {
    const devices = (await mailableDevices()).slice(0, 3);
    expect(devices).toHaveLength(3);
    const [first, broken, last] = devices;
    if (!first || !broken || !last) return;

    const rows = await Promise.all([
      arrange(first, 'T_0', TODAY),
      arrange(broken, 'T_0', TODAY),
      arrange(last, 'T_0', TODAY),
    ]);
    const [firstRow, brokenRow, lastRow] = rows;
    if (!firstRow || !brokenRow || !lastRow) return;

    transport.failFor = new Set([broken.name]);

    const summary = await dispatchDueReminders({ today: TODAY, transport });

    expect(summary).toMatchObject({ scanned: 3, sent: 2, failed: 1, skipped: 0 });

    const brokenAfter = await reload(brokenRow.id);
    expect(brokenAfter.status).toBe('failed');
    expect(brokenAfter.error).toContain('does not exist');
    expect(brokenAfter.sentAt).toBeNull();

    // The two either side of it went out — one bad address must not stop the batch.
    expect((await reload(firstRow.id)).status).toBe('sent');
    expect((await reload(lastRow.id)).status).toBe('sent');
  });

  it('does not retry a failed row on the next scheduled run', async () => {
    const devices = await mailableDevices();
    const device = devices[0];
    expect(device).toBeDefined();
    if (!device) return;

    const row = await arrange(device, 'T_0', TODAY);
    transport.failFor = new Set([device.name]);
    await dispatchDueReminders({ today: TODAY, transport });
    expect((await reload(row.id)).status).toBe('failed');

    // An address that does not exist fails identically every time; automatic retries would
    // turn one bad record into a permanent error loop. Retrying is a deliberate act.
    transport.failFor = new Set();
    const second = await dispatchDueReminders({ today: TODAY, transport });

    expect(second.scanned).toBe(0);
    expect(transport.sent).toHaveLength(0);
  });
});

describe('dispatchDueReminders — nothing to chase', () => {
  it('skips a reminder whose device is no longer active, and records why', async () => {
    const devices = await mailableDevices();
    const device = devices[0];
    expect(device).toBeDefined();
    if (!device) return;

    const row = await arrange(device, 'T_0', TODAY);
    await repo.updateDevice(DEMO.orgId, device.id, { status: 'paused' });

    const summary = await dispatchDueReminders({ today: TODAY, transport });

    expect(summary).toMatchObject({ scanned: 1, sent: 0, failed: 0, skipped: 1 });
    expect(transport.sent).toHaveLength(0);

    const after = await reload(row.id);
    expect(after.status).toBe('skipped');
    expect(after.error).toContain('paused');
  });

  it('skips a reminder whose due date the device has since moved past', async () => {
    const devices = await mailableDevices();
    const device = devices[0];
    expect(device).toBeDefined();
    if (!device?.nextServiceDue) return;

    const row = await arrange(device, 'T_0', TODAY);
    await repo.updateDevice(DEMO.orgId, device.id, {
      nextServiceDue: addDays(device.nextServiceDue, 365),
    });

    const summary = await dispatchDueReminders({ today: TODAY, transport });

    expect(summary).toMatchObject({ sent: 0, skipped: 1 });
    expect((await reload(row.id)).status).toBe('skipped');
  });
});

describe('the default transport', () => {
  it('is the console transport, so a clean checkout needs no provider', () => {
    const configured = getReminderTransport();
    expect(configured).toBeInstanceOf(ConsoleTransport);
    expect(configured.name).toBe('console');
  });
});
