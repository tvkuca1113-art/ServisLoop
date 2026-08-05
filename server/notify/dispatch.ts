import 'server-only';

import type { CivilDate } from '@/domain/dates';
import { renderReminderMessage, selectDueReminders } from '@/domain/reminders';
import type { Customer, Device, Location, Organization, Reminder, UUID } from '@/domain/types';
import { absoluteUrl } from '@/lib/env';
import { getRepository } from '@/server/data';
import type { Patch } from '@/server/data/repository';

import { getReminderTransport, type ReminderTransport } from './transport';

/**
 * Reminder dispatch.
 *
 * One function, shared by the cron endpoint (`POST /api/cron/reminders`) and the in-app
 * "Run dispatch now" button, so there is exactly one definition of what sending a batch
 * means. It is the only place a reminder's status moves to `sent`.
 *
 * ## Why it is safe to run twice
 *
 * Nothing here depends on the scheduler firing exactly once. Three facts do the work:
 *
 * 1. **`(deviceId, dueDate, stage)` is unique.** Enforced by a partial unique index in
 *    Postgres and mirrored by `createRemindersIgnoringDuplicates` in the JSON adapter. A
 *    logical reminder therefore has exactly one row, however many times the ladder is
 *    regenerated — so "send each reminder once" reduces to "send each row once".
 * 2. **Only `pending` rows are ever selected.** The sweep queries `status = 'pending'`,
 *    `selectDueReminders` re-asserts it, and the loop checks it a third time immediately
 *    before sending. A row that is `sent`, `failed` or `skipped` is invisible to this
 *    function; a failed send is retried only when a person asks for it.
 * 3. **The `pending → sent` transition happens right after handover.** Once a row is
 *    `sent` it can never be re-selected, so a second run — a retry, an overlapping cron,
 *    a human pressing the button while the scheduler fires — finds nothing left to do and
 *    returns `{ sent: 0 }`.
 *
 * The residual window is the usual one: the transport succeeds and the process dies before
 * the row is updated, in which case that single reminder is sent twice on the next run.
 * Closing it entirely needs a two-phase commit with the email provider, which no provider
 * offers; `reminderId` is handed to the transport as an idempotency key so a provider that
 * does support one can collapse the duplicate.
 *
 * ## Stale reminders are not sent, and not rewritten
 *
 * A reminder that is more than {@link REMINDER_GRACE_DAYS} days late is skipped: telling a
 * customer their service "is due in 7 days" three weeks after the fact is worse than
 * saying nothing. It is counted in `skipped` but deliberately **left `pending`**, because
 * `selectStaleReminders` — the warning list on the reminders page — is defined over
 * pending rows. Rewriting the status here would silently empty the operator's only signal
 * that the scheduler has stopped running.
 */

/** How late a reminder may be and still be worth sending. */
export const REMINDER_GRACE_DAYS = 14;

/** Safety valve: the most rows one dispatch run will touch. */
export const DEFAULT_DISPATCH_LIMIT = 200;

export interface DispatchSummary {
  /** Pending rows the sweep returned. */
  scanned: number;
  /** Handed to the transport successfully and moved to `sent`. */
  sent: number;
  /** The transport threw; moved to `failed` with the error text. */
  failed: number;
  /** Deliberately not sent — stale, or nothing left to chase. */
  skipped: number;
  /** Which transport ran, so the caller can say so in the log or the UI. */
  transport: string;
}

export interface DispatchOptions {
  /** Today, in the caller's reference frame. Never read from the clock in here. */
  today: CivilDate;
  /**
   * Restrict the sweep to one organisation. The cron job omits it and sweeps every
   * tenant; the in-app button passes the session's organisation so a demo run cannot
   * touch anyone else's reminders.
   */
  orgId?: UUID;
  limit?: number;
  graceDays?: number;
  /**
   * Dispatch exactly these rows instead of running the sweep. Used by the single-row
   * retry, which knows which reminder it is retrying. The rows still go through
   * `selectDueReminders`, so a retry cannot send something the sweep would refuse to.
   */
  reminders?: readonly Reminder[];
  /** Injected by the tests; production takes the configured transport. */
  transport?: ReminderTransport;
  /** Injected by the tests so `sentAt` is deterministic. */
  now?: () => string;
}

/** Why a row was passed over. Recorded on the row so the log explains itself. */
interface Skipped {
  skip: string;
}

export async function dispatchDueReminders(
  options: DispatchOptions,
): Promise<DispatchSummary> {
  const {
    today,
    orgId,
    limit = DEFAULT_DISPATCH_LIMIT,
    graceDays = REMINDER_GRACE_DAYS,
    transport = getReminderTransport(),
    now = () => new Date().toISOString(),
  } = options;

  const repo = getRepository();

  // Both sweeps return `pending` rows scheduled on or before today, oldest first, so a
  // backlog drains in the order the customers were promised.
  const scannedRows: readonly Reminder[] =
    options.reminders ??
    (orgId
      ? await repo.listReminders(orgId, {
          status: 'pending',
          scheduledOnOrBefore: today,
          limit,
        })
      : await repo.listDueRemindersAcrossOrgs(today, limit));

  // The domain decides what is actually due. Anything the sweep returned that this drops
  // is stale — past the grace window — and is left alone.
  const due = selectDueReminders({ reminders: scannedRows, today, graceDays, limit });
  const dueIds = new Set(due.map((r) => r.id));

  let sent = 0;
  let failed = 0;
  let skipped = scannedRows.filter((r) => !dueIds.has(r.id)).length;

  const organizations = new Map<UUID, Organization | null>();
  const devices = new Map<UUID, Device | null>();
  const locations = new Map<UUID, Location | null>();
  const customers = new Map<UUID, Customer | null>();

  /** Persist a status change, tolerating a row that vanished mid-run. */
  const mark = async (reminder: Reminder, patch: Patch<Reminder>): Promise<void> => {
    try {
      await repo.updateReminder(reminder.orgId, reminder.id, patch);
    } catch {
      // The only way this happens is a concurrent delete — the due date moved and
      // `syncDeviceReminders` withdrew the ladder while this batch was in flight. There is
      // nothing left to record against, and failing the whole batch over it would be worse.
    }
  };

  for (const reminder of due) {
    // Third assertion of the same invariant. The sweep filters on it and the domain
    // re-checks it; this one costs nothing and makes the rule impossible to miss when
    // reading the loop.
    if (reminder.status !== 'pending') {
      skipped += 1;
      continue;
    }

    const resolved = await resolveContext(reminder, {
      organizations,
      devices,
      locations,
      customers,
    });

    if ('skip' in resolved) {
      await mark(reminder, { status: 'skipped', error: resolved.skip });
      skipped += 1;
      continue;
    }

    const { organization, device, location, customer } = resolved;

    const message = renderReminderMessage({
      stage: reminder.stage,
      deviceName: device.name,
      locationName: location.name,
      organizationName: organization.name,
      dueDate: reminder.dueDate,
      today,
      bookingUrl: absoluteUrl(`/d/${device.publicToken}/book`),
    });

    try {
      await transport.send({
        to: customer.email,
        subject: message.subject,
        body: message.body,
        reminderId: reminder.id,
        organizationName: organization.name,
        deviceName: device.name,
        locationName: location.name,
        stage: reminder.stage,
        dueDate: reminder.dueDate,
      });
    } catch (error) {
      // One bad address must not stop the rest of the batch. The row keeps its error text
      // so the reminders page can show what went wrong and offer a retry.
      await mark(reminder, {
        status: 'failed',
        error: describeError(error),
      });
      failed += 1;
      continue;
    }

    // The transition that makes a second run a no-op.
    await mark(reminder, { status: 'sent', sentAt: now(), error: null });
    sent += 1;
  }

  return { scanned: scannedRows.length, sent, failed, skipped, transport: transport.name };
}

/* ------------------------------------------------------------------ */
/* Context resolution                                                  */
/* ------------------------------------------------------------------ */

interface ResolvedContext {
  organization: Organization;
  device: Device;
  location: Location;
  customer: Customer;
}

interface Caches {
  organizations: Map<UUID, Organization | null>;
  devices: Map<UUID, Device | null>;
  locations: Map<UUID, Location | null>;
  customers: Map<UUID, Customer | null>;
}

/**
 * Everything the message needs, or the reason there is nothing to send.
 *
 * Each lookup is memoised across the batch: a hotel with forty devices due the same week
 * is one customer read, not forty.
 */
async function resolveContext(
  reminder: Reminder,
  caches: Caches,
): Promise<ResolvedContext | Skipped> {
  const repo = getRepository();
  const orgId = reminder.orgId;

  const organization = await memo(caches.organizations, orgId, () =>
    repo.getOrganization(orgId),
  );
  if (!organization) return { skip: 'The organisation this reminder belongs to no longer exists.' };

  const device = await memo(caches.devices, reminder.deviceId, () =>
    repo.getDevice(orgId, reminder.deviceId),
  );
  if (!device) return { skip: 'The device this reminder was raised for no longer exists.' };

  // A paused or retired device is not chased. `syncDeviceReminders` normally withdraws the
  // ladder when the status changes, so reaching here means the two got out of step — the
  // customer must not be emailed either way.
  if (device.status !== 'active') {
    return { skip: `The device is ${device.status}, so no reminder was sent.` };
  }

  // The due date moved and the ladder was not reconciled. Sending would quote a date the
  // schedule no longer believes in, which is worse than sending nothing.
  if (device.nextServiceDue !== reminder.dueDate) {
    return {
      skip: `The device is now due ${device.nextServiceDue ?? 'never'}, not ${reminder.dueDate}.`,
    };
  }

  const location = await memo(caches.locations, device.locationId, () =>
    repo.getLocation(orgId, device.locationId),
  );
  if (!location) return { skip: 'The site this device belongs to no longer exists.' };

  const customer = await memo(caches.customers, location.customerId, () =>
    repo.getCustomer(orgId, location.customerId),
  );
  if (!customer) return { skip: 'The customer this site belongs to no longer exists.' };

  // No address is a data problem, not a delivery failure: marking it `failed` would put it
  // in the retry queue forever, where every retry would fail the same way.
  if (!customer.email) {
    return { skip: `${customer.name} has no contact email address on file.` };
  }

  return { organization, device, location, customer };
}

async function memo<T>(
  cache: Map<UUID, T | null>,
  key: UUID,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await load();
  cache.set(key, value);
  return value;
}

/** Provider errors can be enormous; the column stores a sentence, not a stack trace. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 497)}…` : message;
}
