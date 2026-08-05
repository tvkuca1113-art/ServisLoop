'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { tryCivilDate } from '@/domain/dates';
import {
  DEFAULT_INTERVAL_DAYS,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
} from '@/domain/service-interval';
import { DEVICE_STATUSES, INTERVAL_ANCHORS, type UUID } from '@/domain/types';
import { newPublicToken } from '@/lib/ids';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';
import { recalculateDeviceSchedule, syncDeviceReminders } from '@/server/service/scheduling';

import { guard } from './errors';
import { fail, ok, type ActionResult } from './result';

/**
 * Directory actions — customers, locations, device types and devices.
 *
 * Same house rules as `org.ts`: permission check before anything is trusted, Zod
 * validation returning field errors, an audit entry per change, `revalidatePath` after
 * every write.
 *
 * One rule is specific to this file and matters more than the rest: **nothing here writes
 * `devices.nextServiceDue` or creates a reminder.** Those are derived values. When an
 * edit changes something the schedule depends on — the interval, the anchor, the
 * installation date, the last service date, or whether the device is still active —
 * the action writes the *inputs* and then calls `recalculateDeviceSchedule`, which is the
 * only writer of the derived ones. A device whose interval was just changed therefore has
 * a correct due date and a correct reminder ladder before the response is sent, without
 * this file knowing how either is computed.
 */

/* ------------------------------------------------------------------ */
/* Form-data helpers                                                   */
/* ------------------------------------------------------------------ */

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

/** Trimmed string value, or `''` when the field is absent. */
function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Optional field: an empty input is "not provided", not the empty string.
 *
 * Browsers submit every enabled control, so a cleared optional field arrives as `''`.
 * Storing that would put empty strings in columns whose "unknown" value is `null`, and
 * `coalesce`-style reads everywhere else would have to defend against both.
 */
function optional(formData: FormData, key: string): string | undefined {
  const value = text(formData, key);
  return value === '' ? undefined : value;
}

const optionalTrimmed = (max: number) => z.string().trim().max(max).optional();

const civilDateField = z
  .string()
  .refine((v) => tryCivilDate(v) !== null, 'Use a date in the form YYYY-MM-DD.')
  .optional();

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the customer’s name.').max(200),
  contactName: optionalTrimmed(120),
  email: z.email('Enter a valid email address, or leave it blank.').optional(),
  phone: optionalTrimmed(40),
  externalRef: optionalTrimmed(80),
  notes: optionalTrimmed(2000),
});

function customerFieldsFrom(formData: FormData) {
  return {
    name: text(formData, 'name'),
    contactName: optional(formData, 'contactName'),
    email: optional(formData, 'email'),
    phone: optional(formData, 'phone'),
    externalRef: optional(formData, 'externalRef'),
    notes: optional(formData, 'notes'),
  };
}

export async function createCustomer(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not add that customer.', async () => {
    const session = await requirePermission('customer:create');

    const parsed = customerSchema.safeParse(customerFieldsFrom(formData));
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    // Same name, same organisation is almost always a duplicate rather than two real
    // companies — surface it instead of quietly creating the second one.
    const existing = await repo.listCustomers(orgId);
    if (existing.some((c) => c.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return fail(`${parsed.data.name} is already on your customer list.`, {
        name: ['A customer with this name already exists.'],
      });
    }

    const customer = await repo.createCustomer({
      orgId,
      name: parsed.data.name,
      contactName: parsed.data.contactName ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      externalRef: parsed.data.externalRef ?? null,
      notes: parsed.data.notes ?? null,
      archivedAt: null,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'customer.create',
      entity: 'customer',
      entityId: customer.id,
      meta: { name: customer.name },
    });

    revalidatePath('/app/customers');
    revalidatePath('/app/locations');
    revalidatePath('/app');

    return ok({ id: customer.id }, `${customer.name} added.`);
  });
}

export async function updateCustomer(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not save that customer.', async () => {
    const session = await requirePermission('customer:update');

    const id = text(formData, 'id');
    if (!z.uuid().safeParse(id).success) return fail('That customer could not be identified.');

    const parsed = customerSchema.safeParse(customerFieldsFrom(formData));
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const before = await repo.getCustomer(orgId, id);
    if (!before) return fail('That customer no longer exists.');

    await repo.updateCustomer(orgId, id, {
      name: parsed.data.name,
      contactName: parsed.data.contactName ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      externalRef: parsed.data.externalRef ?? null,
      notes: parsed.data.notes ?? null,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'customer.update',
      entity: 'customer',
      entityId: id,
      meta: { from: before.name, to: parsed.data.name },
    });

    revalidatePath('/app/customers');
    revalidatePath(`/app/customers/${id}`);
    revalidatePath('/app/locations');
    revalidatePath('/app/devices');

    return ok({ id }, `${parsed.data.name} saved.`);
  });
}

export async function deleteCustomer(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not delete that customer.', async () => {
    const session = await requirePermission('customer:delete');

    const id = text(formData, 'id');
    if (!z.uuid().safeParse(id).success) return fail('That customer could not be identified.');

    const repo = getRepository();
    const orgId = session.organization.id;

    const customer = await repo.getCustomer(orgId, id);
    if (!customer) return fail('That customer no longer exists.');

    // The repository refuses to orphan locations and surfaces its own copy for that; this
    // check exists so the message names the count instead of being abstract about it.
    const locations = await repo.listLocations(orgId, id);
    if (locations.length > 0) {
      return fail(
        `${customer.name} still has ${locations.length} ${locations.length === 1 ? 'location' : 'locations'}. Delete or move those first.`,
      );
    }

    await repo.deleteCustomer(orgId, id);
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'customer.delete',
      entity: 'customer',
      entityId: id,
      meta: { name: customer.name },
    });

    revalidatePath('/app/customers');
    revalidatePath('/app/locations');
    revalidatePath('/app');

    return ok(null, `${customer.name} deleted.`);
  });
}

/* ------------------------------------------------------------------ */
/* Locations                                                           */
/* ------------------------------------------------------------------ */

const locationSchema = z.object({
  customerId: z.uuid('Choose which customer this site belongs to.'),
  name: z.string().trim().min(2, 'Give the site a name people will recognise.').max(200),
  addressLine: optionalTrimmed(300),
  city: optionalTrimmed(120),
  postalCode: optionalTrimmed(20),
  country: optionalTrimmed(80),
  notes: optionalTrimmed(2000),
});

function locationFieldsFrom(formData: FormData) {
  return {
    customerId: text(formData, 'customerId'),
    name: text(formData, 'name'),
    addressLine: optional(formData, 'addressLine'),
    city: optional(formData, 'city'),
    postalCode: optional(formData, 'postalCode'),
    country: optional(formData, 'country'),
    notes: optional(formData, 'notes'),
  };
}

export async function createLocation(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not add that location.', async () => {
    const session = await requirePermission('location:create');

    const parsed = locationSchema.safeParse(locationFieldsFrom(formData));
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const customer = await repo.getCustomer(orgId, parsed.data.customerId);
    if (!customer) {
      return fail('That customer no longer exists.', {
        customerId: ['Pick a customer that still exists.'],
      });
    }

    const location = await repo.createLocation({
      orgId,
      customerId: parsed.data.customerId,
      name: parsed.data.name,
      addressLine: parsed.data.addressLine ?? null,
      city: parsed.data.city ?? null,
      postalCode: parsed.data.postalCode ?? null,
      country: parsed.data.country ?? null,
      notes: parsed.data.notes ?? null,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'location.create',
      entity: 'location',
      entityId: location.id,
      meta: { name: location.name, customer: customer.name },
    });

    revalidatePath('/app/locations');
    revalidatePath('/app/customers');
    revalidatePath(`/app/customers/${parsed.data.customerId}`);

    return ok({ id: location.id }, `${location.name} added to ${customer.name}.`);
  });
}

export async function updateLocation(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not save that location.', async () => {
    const session = await requirePermission('location:update');

    const id = text(formData, 'id');
    if (!z.uuid().safeParse(id).success) return fail('That location could not be identified.');

    const parsed = locationSchema.safeParse(locationFieldsFrom(formData));
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const before = await repo.getLocation(orgId, id);
    if (!before) return fail('That location no longer exists.');

    const customer = await repo.getCustomer(orgId, parsed.data.customerId);
    if (!customer) {
      return fail('That customer no longer exists.', {
        customerId: ['Pick a customer that still exists.'],
      });
    }

    await repo.updateLocation(orgId, id, {
      customerId: parsed.data.customerId,
      name: parsed.data.name,
      addressLine: parsed.data.addressLine ?? null,
      city: parsed.data.city ?? null,
      postalCode: parsed.data.postalCode ?? null,
      country: parsed.data.country ?? null,
      notes: parsed.data.notes ?? null,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'location.update',
      entity: 'location',
      entityId: id,
      // Moving a site between customers also moves every device on it, so record it.
      meta: {
        name: parsed.data.name,
        customerChanged: before.customerId !== parsed.data.customerId,
      },
    });

    revalidatePath('/app/locations');
    revalidatePath(`/app/locations/${id}`);
    revalidatePath('/app/customers');
    revalidatePath(`/app/customers/${parsed.data.customerId}`);
    revalidatePath(`/app/customers/${before.customerId}`);
    revalidatePath('/app/devices');

    return ok({ id }, `${parsed.data.name} saved.`);
  });
}

export async function deleteLocation(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not delete that location.', async () => {
    const session = await requirePermission('location:delete');

    const id = text(formData, 'id');
    if (!z.uuid().safeParse(id).success) return fail('That location could not be identified.');

    const repo = getRepository();
    const orgId = session.organization.id;

    const location = await repo.getLocation(orgId, id);
    if (!location) return fail('That location no longer exists.');

    const devices = await repo.listDevices(orgId, { locationId: id });
    if (devices.length > 0) {
      return fail(
        `${location.name} still has ${devices.length} ${devices.length === 1 ? 'device' : 'devices'} on it. Move or delete those first — deleting a device also deletes its service history.`,
      );
    }

    await repo.deleteLocation(orgId, id);
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'location.delete',
      entity: 'location',
      entityId: id,
      meta: { name: location.name, customerId: location.customerId },
    });

    revalidatePath('/app/locations');
    revalidatePath('/app/customers');
    revalidatePath(`/app/customers/${location.customerId}`);

    return ok(null, `${location.name} deleted.`);
  });
}

/* ------------------------------------------------------------------ */
/* Device types                                                        */
/* ------------------------------------------------------------------ */

const deviceTypeSchema = z.object({
  name: z.string().trim().min(2, 'Name the device type, e.g. “Passenger lift”.').max(120),
  defaultIntervalDays: z.coerce
    .number()
    .int('Use a whole number of days.')
    .min(MIN_INTERVAL_DAYS, `The shortest interval is ${MIN_INTERVAL_DAYS} day.`)
    .max(MAX_INTERVAL_DAYS, `The longest interval is ${MAX_INTERVAL_DAYS} days.`),
});

/**
 * Add a device type.
 *
 * Gated on `device:create` rather than a type-specific action: a device type is only ever
 * created in service of adding devices, and the permission matrix has no finer grain for
 * it. There is deliberately no update or delete counterpart — `Repository` exposes neither,
 * because a type's `defaultIntervalDays` is an input to every due date already computed
 * from it, and rewriting it in place would silently invalidate them.
 */
export async function createDeviceType(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not add that device type.', async () => {
    const session = await requirePermission('device:create');

    const parsed = deviceTypeSchema.safeParse({
      name: text(formData, 'name'),
      defaultIntervalDays: text(formData, 'defaultIntervalDays') || DEFAULT_INTERVAL_DAYS,
    });
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const existing = await repo.listDeviceTypes(orgId);
    const clash = existing.find((t) => t.name.toLowerCase() === parsed.data.name.toLowerCase());
    if (clash) {
      return fail(`“${clash.name}” is already a device type.`, {
        name: ['That device type already exists.'],
      });
    }

    const deviceType = await repo.createDeviceType({
      orgId,
      name: parsed.data.name,
      defaultIntervalDays: parsed.data.defaultIntervalDays,
      checklistTemplateId: null,
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'device_type.create',
      entity: 'device_type',
      entityId: deviceType.id,
      meta: { name: deviceType.name, defaultIntervalDays: deviceType.defaultIntervalDays },
    });

    revalidatePath('/app/devices');

    return ok(
      { id: deviceType.id },
      `“${deviceType.name}” added, serviced every ${deviceType.defaultIntervalDays} days by default.`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

const deviceSchema = z.object({
  locationId: z.uuid('Choose where this device is installed.'),
  deviceTypeId: z.uuid('Pick a device type, or leave it unset.').optional(),
  name: z.string().trim().min(2, 'Give the device a name technicians will recognise.').max(200),
  manufacturer: optionalTrimmed(120),
  model: optionalTrimmed(120),
  serialNumber: optionalTrimmed(120),
  installedOn: civilDateField,
  lastServiceAt: civilDateField,
  serviceIntervalDays: z.coerce
    .number()
    .int('Use a whole number of days.')
    .min(MIN_INTERVAL_DAYS, `The shortest interval is ${MIN_INTERVAL_DAYS} day.`)
    .max(MAX_INTERVAL_DAYS, `The longest interval is ${MAX_INTERVAL_DAYS} days.`)
    .optional(),
  intervalAnchor: z.enum(INTERVAL_ANCHORS).optional(),
  status: z.enum(DEVICE_STATUSES),
  notes: optionalTrimmed(2000),
});

function deviceFieldsFrom(formData: FormData) {
  return {
    locationId: text(formData, 'locationId'),
    deviceTypeId: optional(formData, 'deviceTypeId'),
    name: text(formData, 'name'),
    manufacturer: optional(formData, 'manufacturer'),
    model: optional(formData, 'model'),
    serialNumber: optional(formData, 'serialNumber'),
    installedOn: optional(formData, 'installedOn'),
    lastServiceAt: optional(formData, 'lastServiceAt'),
    serviceIntervalDays: optional(formData, 'serviceIntervalDays'),
    intervalAnchor: optional(formData, 'intervalAnchor'),
    status: text(formData, 'status') || 'active',
    notes: optional(formData, 'notes'),
  };
}

export async function createDevice(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not add that device.', async () => {
    const session = await requirePermission('device:create');

    const parsed = deviceSchema.safeParse(deviceFieldsFrom(formData));
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const location = await repo.getLocation(orgId, parsed.data.locationId);
    if (!location) {
      return fail('That location no longer exists.', {
        locationId: ['Pick a location that still exists.'],
      });
    }

    if (parsed.data.deviceTypeId) {
      const types = await repo.listDeviceTypes(orgId);
      if (!types.some((t) => t.id === parsed.data.deviceTypeId)) {
        return fail('That device type no longer exists.', {
          deviceTypeId: ['Pick a device type that still exists.'],
        });
      }
    }

    const device = await repo.createDevice({
      orgId,
      locationId: parsed.data.locationId,
      deviceTypeId: parsed.data.deviceTypeId ?? null,
      name: parsed.data.name,
      manufacturer: parsed.data.manufacturer ?? null,
      model: parsed.data.model ?? null,
      serialNumber: parsed.data.serialNumber ?? null,
      installedOn: tryCivilDate(parsed.data.installedOn),
      serviceIntervalDays: parsed.data.serviceIntervalDays ?? null,
      intervalAnchor: parsed.data.intervalAnchor ?? null,
      lastServiceAt: tryCivilDate(parsed.data.lastServiceAt),
      // Derived, and left empty on purpose — `recalculateDeviceSchedule` fills it in below.
      nextServiceDue: null,
      status: parsed.data.status,
      publicToken: newPublicToken(),
      notes: parsed.data.notes ?? null,
    });

    const { nextDue } = await recalculateDeviceSchedule(
      session.organization,
      device.id,
      session.today,
    );

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'device.create',
      entity: 'device',
      entityId: device.id,
      meta: { name: device.name, locationId: device.locationId, nextServiceDue: nextDue },
    });

    revalidatePath('/app/devices');
    revalidatePath('/app/locations');
    revalidatePath(`/app/locations/${device.locationId}`);
    revalidatePath(`/app/customers/${location.customerId}`);
    revalidatePath('/app');

    return ok(
      { id: device.id },
      nextDue
        ? `${device.name} added. Next service due ${nextDue}.`
        : `${device.name} added. It has no due date yet — set an installation or last service date to start the schedule.`,
    );
  });
}

export async function updateDevice(formData: FormData): Promise<ActionResult<{ id: UUID }>> {
  return guard('Could not save that device.', async () => {
    const session = await requirePermission('device:update');

    const id = text(formData, 'id');
    if (!z.uuid().safeParse(id).success) return fail('That device could not be identified.');

    const parsed = deviceSchema.safeParse(deviceFieldsFrom(formData));
    if (!parsed.success) return fail('Check the fields below.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const before = await repo.getDevice(orgId, id);
    if (!before) return fail('That device no longer exists.');

    const location = await repo.getLocation(orgId, parsed.data.locationId);
    if (!location) {
      return fail('That location no longer exists.', {
        locationId: ['Pick a location that still exists.'],
      });
    }

    const installedOn = tryCivilDate(parsed.data.installedOn);
    const lastServiceAt = tryCivilDate(parsed.data.lastServiceAt);
    const intervalAnchor = parsed.data.intervalAnchor ?? null;
    const serviceIntervalDays = parsed.data.serviceIntervalDays ?? null;
    const deviceTypeId = parsed.data.deviceTypeId ?? null;

    if (installedOn && lastServiceAt && lastServiceAt < installedOn) {
      return fail('A device cannot have been serviced before it was installed.', {
        lastServiceAt: ['This is earlier than the installation date.'],
      });
    }

    const updated = await repo.updateDevice(orgId, id, {
      locationId: parsed.data.locationId,
      deviceTypeId,
      name: parsed.data.name,
      manufacturer: parsed.data.manufacturer ?? null,
      model: parsed.data.model ?? null,
      serialNumber: parsed.data.serialNumber ?? null,
      installedOn,
      serviceIntervalDays,
      intervalAnchor,
      lastServiceAt,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    });

    /**
     * Everything the next-due calculation reads. A change to any of them invalidates the
     * stored due date and the reminder ladder hanging off it, so the schedule is rebuilt;
     * renaming a device or correcting its model number touches neither and is left alone,
     * which keeps a typo fix from re-issuing reminders.
     */
    const dueDateInputsChanged =
      before.serviceIntervalDays !== serviceIntervalDays ||
      before.intervalAnchor !== intervalAnchor ||
      before.installedOn !== installedOn ||
      before.lastServiceAt !== lastServiceAt ||
      before.deviceTypeId !== deviceTypeId;

    const statusChanged = before.status !== parsed.data.status;

    /**
     * A status change is handled by reconciling the reminder ladder alone, not by
     * recomputing the due date.
     *
     * Pausing a device says "stop chasing this", not "it is due later than we thought" —
     * the date it is next due does not move because nobody serviced it. That distinction
     * matters concretely: `computeNextServiceDue` under the `schedule` anchor steps
     * forward from the *previous due date*, so recomputing on a pause and again on the
     * resume would push an annual inspection two years into the future without anyone
     * touching the equipment. `syncDeviceReminders` withdraws the ladder on the way out
     * and rebuilds it from the unchanged due date on the way back in, which is exactly
     * what a pause means.
     */
    const nextDue = dueDateInputsChanged
      ? (await recalculateDeviceSchedule(session.organization, id, session.today)).nextDue
      : before.nextServiceDue;

    if (!dueDateInputsChanged && statusChanged) {
      await syncDeviceReminders(orgId, updated, session.today);
    }

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'device.update',
      entity: 'device',
      entityId: id,
      meta: {
        name: parsed.data.name,
        dueDateInputsChanged,
        statusChanged,
        previousStatus: before.status,
        status: parsed.data.status,
        previousDue: before.nextServiceDue,
        nextServiceDue: nextDue,
      },
    });

    revalidatePath('/app/devices');
    revalidatePath(`/app/devices/${id}`);
    revalidatePath('/app/locations');
    revalidatePath(`/app/locations/${parsed.data.locationId}`);
    revalidatePath(`/app/customers/${location.customerId}`);
    revalidatePath('/app/reminders');
    revalidatePath('/app');

    return ok({ id }, describeDeviceSave(parsed.data.name, parsed.data.status, nextDue));
  });
}

/** Say what the save actually did to the schedule, not just that it succeeded. */
function describeDeviceSave(
  name: string,
  status: (typeof DEVICE_STATUSES)[number],
  nextDue: string | null,
): string {
  if (status !== 'active') {
    return `${name} saved as ${status}. Its reminders have been withdrawn.`;
  }
  return nextDue
    ? `${name} saved. Next service due ${nextDue}.`
    : `${name} saved. It has no due date yet — add an installation or last service date to start the schedule.`;
}

export async function deleteDevice(formData: FormData): Promise<ActionResult<null>> {
  return guard('Could not delete that device.', async () => {
    const session = await requirePermission('device:delete');

    const id = text(formData, 'id');
    if (!z.uuid().safeParse(id).success) return fail('That device could not be identified.');

    const repo = getRepository();
    const orgId = session.organization.id;

    const device = await repo.getDevice(orgId, id);
    if (!device) return fail('That device no longer exists.');

    // Work orders reference the device, and a service report is a legal record of work
    // done. Retiring keeps the history and takes the device out of the reminder queue,
    // which is what "we do not service this any more" actually means.
    const workOrders = await repo.listWorkOrders(orgId, { deviceId: id, limit: 1 });
    if (workOrders.length > 0) {
      return fail(
        `${device.name} has service history attached to it. Set its status to Retired instead — that stops all reminders and keeps the record.`,
      );
    }

    await repo.deleteDevice(orgId, id);
    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'device.delete',
      entity: 'device',
      entityId: id,
      meta: { name: device.name, serialNumber: device.serialNumber },
    });

    revalidatePath('/app/devices');
    revalidatePath('/app/locations');
    revalidatePath(`/app/locations/${device.locationId}`);
    revalidatePath('/app/reminders');
    revalidatePath('/app');

    return ok(null, `${device.name} deleted.`);
  });
}
