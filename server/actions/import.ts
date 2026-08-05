'use server';

import { revalidatePath } from 'next/cache';

import { buildImportPreview, type DeviceImportRow } from '@/domain/import-mapping';
import { DEFAULT_INTERVAL_DAYS } from '@/domain/service-interval';
import type { Customer, Device, DeviceType, Location, UUID } from '@/domain/types';
import { newPublicToken } from '@/lib/ids';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';
import type { NewRecord } from '@/server/data/repository';
import {
  ImportParseError,
  parseUpload,
  type ImportCommitSummary,
  type ImportPreviewPayload,
} from '@/server/import/parse';
import { recalculateDeviceSchedule } from '@/server/service/scheduling';

import { guard } from './errors';
import { fail, ok, type ActionResult } from './result';

/**
 * Device import — the two-phase upload.
 *
 * `previewImport` parses and validates and **writes nothing**. `commitImport` parses the
 * same file again, validates it again, and only then writes. The preview is never trusted
 * as input: it went to the browser and came back, so treating it as the source of truth
 * would mean a hand-crafted request could insert rows that never passed validation. Doing
 * the work twice costs a second parse of a file that is at most 5 MB, which is a good
 * trade for not having a server-side upload cache to expire, secure and clean up.
 *
 * The consequence a reviewer should know about: the user must still have the file
 * selected when they press Confirm, because the browser re-uploads it. The import screen
 * keeps the `File` handle in component state for exactly that reason.
 */

/** Directory rows created concurrently per batch. Bounded so a big file cannot fan out. */
const SCHEDULE_CONCURRENCY = 8;

function fileFrom(formData: FormData): File | null {
  const value = formData.get('file');
  return value instanceof File && value.size > 0 ? value : null;
}

/* ------------------------------------------------------------------ */
/* Phase 1 — dry run                                                   */
/* ------------------------------------------------------------------ */

export async function previewImport(
  formData: FormData,
): Promise<ActionResult<ImportPreviewPayload>> {
  return guard('Could not read that file.', async () => {
    await requirePermission('device:import');

    const file = fileFrom(formData);
    if (!file) return fail('Choose a CSV or Excel file to upload.');

    let parsed;
    try {
      parsed = await parseUpload(file);
    } catch (error) {
      // Parse failures carry copy written for the uploader — show it, do not flatten it.
      if (error instanceof ImportParseError) return fail(error.message);
      throw error;
    }

    const preview = buildImportPreview(parsed.headers, parsed.rows);

    return ok({
      fileName: file.name,
      fileSize: file.size,
      headers: parsed.headers,
      preview,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Phase 2 — commit                                                    */
/* ------------------------------------------------------------------ */

/** Case-insensitive directory key. `Dizala d.o.o.` and `DIZALA D.O.O.` are one company. */
function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

function locationKey(customerId: UUID, name: string): string {
  return `${customerId}:${nameKey(name)}`;
}

/** Run `task` over `items` with a fixed ceiling on in-flight work. */
async function inBatches<T>(
  items: readonly T[],
  size: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(task));
  }
}

/**
 * Write the valid rows of an uploaded file.
 *
 * Commit semantics, stated once so the UI copy and this code agree:
 *
 * - **Only valid rows are written.** Rows the preview flagged are skipped and counted, not
 *   guessed at. A file that is 90% clean imports its 90% rather than failing whole, which
 *   is what `canCommit` (missing required columns = no, some valid rows = yes) already
 *   promises the user.
 * - **Customers, locations and device types are matched by name, case-insensitively,
 *   within the organisation, and created only when absent.** A location is scoped to its
 *   customer, so two customers may each have a "Warehouse".
 * - **Serial numbers are the identity of a device.** A serial already in the organisation
 *   is skipped, and a serial repeated later in the same file is skipped after its first
 *   appearance. Re-uploading the same export therefore adds nothing instead of doubling
 *   the fleet. Rows with no serial cannot be matched and are always created.
 * - **Due dates are derived, never imported.** Devices are inserted with a null
 *   `nextServiceDue`; `recalculateDeviceSchedule` then computes it from the interval,
 *   anchor, installation date and last service date, and builds the reminder ladder — so
 *   an imported fleet is already on the reminder queue when the page reloads.
 *
 * Not transactional across tables: the device insert is all-or-nothing, but customers and
 * locations are created as they are encountered. If the device insert fails, those rows
 * remain. That is safe to retry — the second run matches them by name and creates only
 * what is still missing.
 */
export async function commitImport(
  formData: FormData,
): Promise<ActionResult<ImportCommitSummary>> {
  return guard('Could not import that file.', async () => {
    const session = await requirePermission('device:import');

    const file = fileFrom(formData);
    if (!file) return fail('Choose a file to import. The confirmation step re-reads it.');

    let parsed;
    try {
      parsed = await parseUpload(file);
    } catch (error) {
      if (error instanceof ImportParseError) return fail(error.message);
      throw error;
    }

    // Re-validated server-side. The preview the browser saw is advisory only.
    const preview = buildImportPreview(parsed.headers, parsed.rows);

    if (preview.mapping.missingRequired.length > 0) {
      return fail(
        'That file is missing required columns, so nothing was imported. Add them and upload it again.',
      );
    }
    if (preview.validRows === 0) {
      return fail('No row in that file passed validation, so nothing was imported.');
    }

    const repo = getRepository();
    const orgId = session.organization.id;

    const [customers, locations, deviceTypes, existingDevices] = await Promise.all([
      repo.listCustomers(orgId),
      repo.listLocations(orgId),
      repo.listDeviceTypes(orgId),
      repo.listDevices(orgId),
    ]);

    const customersByName = new Map<string, Customer>(
      customers.map((c) => [nameKey(c.name), c]),
    );
    const locationsByKey = new Map<string, Location>(
      locations.map((l) => [locationKey(l.customerId, l.name), l]),
    );
    const typesByName = new Map<string, DeviceType>(
      deviceTypes.map((t) => [nameKey(t.name), t]),
    );
    /** Serials already in the organisation before this upload. */
    const existingSerials = new Set<string>(
      existingDevices
        .map((d) => d.serialNumber)
        .filter((s): s is string => s !== null && s.trim() !== '')
        .map(nameKey),
    );
    /** Serials claimed by an earlier row of this same upload. */
    const serialsSeenInFile = new Set<string>();

    const summary: ImportCommitSummary = {
      customersCreated: 0,
      locationsCreated: 0,
      deviceTypesCreated: 0,
      devicesCreated: 0,
      rowsSkippedInvalid: preview.invalidRows,
      rowsSkippedDuplicate: 0,
      rowsSkippedExisting: 0,
    };

    const pending: NewRecord<Device>[] = [];

    for (const result of preview.rows) {
      const row: DeviceImportRow | null = result.value;
      if (!result.ok || !row) continue;

      const serialKey = row.serialNumber ? nameKey(row.serialNumber) : null;
      if (serialKey) {
        if (existingSerials.has(serialKey)) {
          summary.rowsSkippedExisting += 1;
          continue;
        }
        if (serialsSeenInFile.has(serialKey)) {
          summary.rowsSkippedDuplicate += 1;
          continue;
        }
      }

      let customer = customersByName.get(nameKey(row.customerName));
      if (!customer) {
        customer = await repo.createCustomer({
          orgId,
          name: row.customerName,
          contactName: null,
          email: null,
          phone: null,
          externalRef: null,
          notes: null,
          archivedAt: null,
        });
        customersByName.set(nameKey(customer.name), customer);
        summary.customersCreated += 1;
      }

      const locKey = locationKey(customer.id, row.locationName);
      let location = locationsByKey.get(locKey);
      if (!location) {
        location = await repo.createLocation({
          orgId,
          customerId: customer.id,
          name: row.locationName,
          addressLine: row.address,
          city: row.city,
          postalCode: null,
          country: null,
          notes: null,
        });
        locationsByKey.set(locKey, location);
        summary.locationsCreated += 1;
      }

      let deviceTypeId: UUID | null = null;
      if (row.deviceType) {
        let deviceType = typesByName.get(nameKey(row.deviceType));
        if (!deviceType) {
          deviceType = await repo.createDeviceType({
            orgId,
            name: row.deviceType,
            // The row's own interval is stored on the device, so a new type gets the
            // house default rather than inheriting one row's cadence for every future
            // device of that type.
            defaultIntervalDays: DEFAULT_INTERVAL_DAYS,
            checklistTemplateId: null,
          });
          typesByName.set(nameKey(deviceType.name), deviceType);
          summary.deviceTypesCreated += 1;
        }
        deviceTypeId = deviceType.id;
      }

      if (serialKey) serialsSeenInFile.add(serialKey);

      pending.push({
        orgId,
        locationId: location.id,
        deviceTypeId,
        name: row.deviceName,
        manufacturer: row.manufacturer,
        model: row.model,
        serialNumber: row.serialNumber,
        installedOn: row.installedOn,
        serviceIntervalDays: row.serviceIntervalDays,
        // Imports never carry an anchor column; each device follows the organisation
        // default until someone overrides it on the device itself.
        intervalAnchor: null,
        lastServiceAt: row.lastServiceAt,
        nextServiceDue: null,
        status: row.status,
        publicToken: newPublicToken(),
        notes: row.notes,
      });
    }

    if (pending.length === 0) {
      return fail(
        'Every valid row in that file is a device you already have, so nothing was imported.',
      );
    }

    const created = await repo.createDevicesBulk(pending);
    summary.devicesCreated = created.length;

    // Due dates and reminders, immediately — an imported fleet that shows "not scheduled"
    // until someone edits each device would be worse than not importing it.
    await inBatches(created, SCHEDULE_CONCURRENCY, async (device) => {
      await recalculateDeviceSchedule(session.organization, device.id, session.today);
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'device.import',
      entity: 'device',
      entityId: null,
      meta: { fileName: file.name, ...summary },
    });

    revalidatePath('/app/devices');
    revalidatePath('/app/customers');
    revalidatePath('/app/locations');
    revalidatePath('/app/reminders');
    revalidatePath('/app');

    return ok(
      summary,
      `Imported ${summary.devicesCreated} ${summary.devicesCreated === 1 ? 'device' : 'devices'}.`,
    );
  });
}
