import { Cpu, Search, Upload } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Badge,
  Button,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  serviceStateBadgeVariant,
} from '@/components/ui';
import { formatCivilShort, type CivilDate } from '@/domain/dates';
import { can } from '@/domain/permissions';
import {
  describeInterval,
  effectiveIntervalDays,
  serviceStatus,
  type ServiceState,
} from '@/domain/service-interval';
import { DEVICE_STATUSES, type DeviceStatus } from '@/domain/types';
import { cn } from '@/lib/utils';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { DeviceForm, DeviceTypeForm } from './device-form';

/**
 * The device register — the screen this product exists for.
 *
 * Everything on it answers one question: what needs servicing, and when. So the sort is
 * by urgency (the repository returns devices in due-date order, soonest first), and the
 * "Next due" column is the widest thing on the row.
 *
 * Two rules that are not negotiable here:
 *
 * - **The state is computed, never stored.** `serviceStatus()` is asked, with the
 *   organisation's own `reminderLeadDays`, so an organisation that considers 60 days
 *   "due soon" sees 60 days of amber. Nothing on this page recomputes a due date.
 * - **Colour is never the only signal.** Every state badge carries its label in words
 *   and a leading dot, and the date sits beside it in plain text. Read in greyscale, or
 *   by someone who cannot distinguish amber from red, the table says exactly the same
 *   thing.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Devices',
  description: 'Every serviced asset, its interval and its next service date.',
};

const STATE_LABELS: Readonly<Record<ServiceState, string>> = Object.freeze({
  unscheduled: 'Not scheduled',
  ok: 'On schedule',
  due_soon: 'Due soon',
  due: 'Due today',
  overdue: 'Overdue',
});

const DEVICE_STATUS_LABELS: Readonly<Record<DeviceStatus, string>> = Object.freeze({
  active: 'Active',
  paused: 'Paused',
  retired: 'Retired',
});

/** Native controls, on purpose — see the note on the filter bar below. */
const CONTROL_CLASS =
  'h-9 rounded-md border border-border-base bg-surface px-3 text-sm text-ink shadow-sm transition-colors hover:border-border-strong';

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function isDeviceStatus(value: string): value is DeviceStatus {
  return (DEVICE_STATUSES as readonly string[]).includes(value);
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePermission('device:read');
  const params = await searchParams;

  const query = firstParam(params.q).trim();
  const customerFilter = firstParam(params.customer);
  const statusParam = firstParam(params.status);
  const statusFilter = isDeviceStatus(statusParam) ? statusParam : null;
  const overdueOnly = firstParam(params.overdue) === '1';

  const repo = getRepository();
  const orgId = session.organization.id;

  const [customers, locations, deviceTypes, devices] = await Promise.all([
    repo.listCustomers(orgId),
    repo.listLocations(orgId),
    repo.listDeviceTypes(orgId),
    repo.listDevices(orgId, {
      ...(query === '' ? {} : { search: query }),
      ...(customerFilter === '' ? {} : { customerId: customerFilter }),
      ...(statusFilter === null ? {} : { status: statusFilter }),
    }),
  ]);

  const locationById = new Map(locations.map((l) => [l.id, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const typeById = new Map(deviceTypes.map((t) => [t.id, t]));

  const allRows = devices.map((device) => {
    const location = locationById.get(device.locationId) ?? null;
    const deviceType = device.deviceTypeId ? (typeById.get(device.deviceTypeId) ?? null) : null;

    return {
      device,
      location,
      customer: location ? (customerById.get(location.customerId) ?? null) : null,
      deviceType,
      intervalDays: effectiveIntervalDays(device, deviceType),
      status: serviceStatus({
        nextServiceDue: device.nextServiceDue,
        today: session.today,
        leadDays: session.organization.reminderLeadDays,
        deviceStatus: device.status,
      }),
    };
  });

  // The overdue filter is applied here rather than pushed into the repository: "overdue"
  // is a domain judgement about a device that also depends on its status, and the
  // repository is deliberately not allowed to make it.
  const rows = overdueOnly ? allRows.filter((r) => r.status.state === 'overdue') : allRows;

  const counts = allRows.reduce<Record<ServiceState, number>>(
    (acc, row) => {
      acc[row.status.state] += 1;
      return acc;
    },
    { unscheduled: 0, ok: 0, due_soon: 0, due: 0, overdue: 0 },
  );

  const filtered = query !== '' || customerFilter !== '' || statusFilter !== null || overdueOnly;
  const canCreate = can(session.role, 'device:create');
  const canEdit = can(session.role, 'device:update');
  const canDelete = can(session.role, 'device:delete');
  const canImport = can(session.role, 'device:import');

  const locationOptions = locations.map((location) => ({
    id: location.id,
    name: location.name,
    customerName: customerById.get(location.customerId)?.name ?? 'Unassigned',
  }));
  const typeOptions = deviceTypes.map((t) => ({
    id: t.id,
    name: t.name,
    defaultIntervalDays: t.defaultIntervalDays,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Devices</h1>
          <p className="text-sm text-ink-muted">
            {counts.overdue > 0
              ? `${counts.overdue} overdue, ${counts.due + counts.due_soon} due within ${session.organization.reminderLeadDays} days.`
              : `Nothing overdue. ${counts.due + counts.due_soon} due within ${session.organization.reminderLeadDays} days.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canImport ? (
            <Button variant="secondary" asChild>
              <Link href="/app/devices/import">
                <Upload aria-hidden="true" />
                Import
              </Link>
            </Button>
          ) : null}
          {canCreate ? <DeviceTypeForm /> : null}
          {canCreate ? (
            <DeviceForm
              locations={locationOptions}
              deviceTypes={typeOptions}
              organizationAnchor={session.organization.defaultIntervalAnchor}
            />
          ) : null}
        </div>
      </header>

      {/*
        A plain GET form with native controls.
        The filter belongs in the URL — bookmarkable, shareable, survives a refresh, and
        the back button undoes it. Native `<select>` and `<input type="checkbox">` submit
        without JavaScript, which the Radix equivalents cannot do from a Server Component;
        they are styled with the same tokens as the design-system controls next to them.
      */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-border-base bg-surface-muted p-4">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="device-search" className="text-sm font-medium text-ink">
            Search
          </label>
          <Input
            id="device-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Name, serial number, model or manufacturer"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="device-customer" className="text-sm font-medium text-ink">
            Customer
          </label>
          <select
            id="device-customer"
            name="customer"
            defaultValue={customerFilter}
            className={cn(CONTROL_CLASS, 'min-w-48')}
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="device-status" className="text-sm font-medium text-ink">
            Status
          </label>
          <select
            id="device-status"
            name="status"
            defaultValue={statusFilter ?? ''}
            className={cn(CONTROL_CLASS, 'min-w-36')}
          >
            <option value="">Any status</option>
            {DEVICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {DEVICE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex h-9 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="overdue"
            value="1"
            defaultChecked={overdueOnly}
            className="size-4 rounded-sm border border-border-strong accent-brand-600"
          />
          Overdue only
        </label>

        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Apply
        </Button>

        {filtered ? (
          <Button variant="ghost" asChild>
            <Link href="/app/devices">Clear</Link>
          </Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Cpu />}
          title={filtered ? 'No devices match those filters' : 'No devices yet'}
          description={
            filtered
              ? 'Widen the search, or clear the filters to see the whole register.'
              : 'Add equipment one at a time, or import an existing list from a CSV or Excel file — that creates the customers and sites it references as it goes.'
          }
          action={
            filtered ? (
              <Button variant="secondary" asChild>
                <Link href="/app/devices">Clear filters</Link>
              </Button>
            ) : (
              <>
                {canCreate ? (
                  <DeviceForm
                    locations={locationOptions}
                    deviceTypes={typeOptions}
                    organizationAnchor={session.organization.defaultIntervalAnchor}
                  />
                ) : null}
                {canImport ? (
                  <Button variant="secondary" asChild>
                    <Link href="/app/devices/import">Import from a spreadsheet</Link>
                  </Button>
                ) : null}
              </>
            )
          }
        />
      ) : (
        <div className="rounded-card border border-border-base bg-surface-raised">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Customer · Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Last service</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map(({ device, location, customer, deviceType, intervalDays, status }) => (
                <TableRow key={device.id}>
                  <TableCell>
                    <Link
                      href={`/app/devices/${device.id}`}
                      className="font-medium text-ink hover:text-brand-600 hover:underline"
                    >
                      {device.name}
                    </Link>
                    {device.serialNumber ? (
                      <span className="block font-mono text-xs text-ink-subtle">
                        {device.serialNumber}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-sm">
                    {customer ? (
                      <Link
                        href={`/app/customers/${customer.id}`}
                        className="text-ink hover:text-brand-600 hover:underline"
                      >
                        {customer.name}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">Unassigned</span>
                    )}
                    {location ? (
                      <Link
                        href={`/app/locations/${location.id}`}
                        className="block text-xs text-ink-muted hover:text-brand-600 hover:underline"
                      >
                        {location.name}
                      </Link>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-sm text-ink-muted">
                    {deviceType?.name ?? '—'}
                  </TableCell>

                  <TableCell className="text-sm text-ink-muted">
                    {describeInterval(intervalDays)}
                    {device.serviceIntervalDays !== null ? (
                      <span className="block text-xs text-ink-subtle">Device override</span>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-sm text-ink-muted">
                    {device.lastServiceAt ? formatCivilShort(device.lastServiceAt) : 'Never'}
                  </TableCell>

                  <TableCell>
                    <DueCell
                      state={status.state}
                      daysUntilDue={status.daysUntilDue}
                      nextServiceDue={device.nextServiceDue}
                    />
                  </TableCell>

                  <TableCell>
                    <span
                      className={cn(
                        'text-sm',
                        device.status === 'active' ? 'text-ink' : 'text-ink-muted',
                      )}
                    >
                      {DEVICE_STATUS_LABELS[device.status]}
                    </span>
                  </TableCell>

                  {canEdit ? (
                    <TableCell className="text-right">
                      <DeviceForm
                        locations={locationOptions}
                        deviceTypes={typeOptions}
                        device={{
                          id: device.id,
                          locationId: device.locationId,
                          deviceTypeId: device.deviceTypeId,
                          name: device.name,
                          manufacturer: device.manufacturer,
                          model: device.model,
                          serialNumber: device.serialNumber,
                          installedOn: device.installedOn,
                          lastServiceAt: device.lastServiceAt,
                          serviceIntervalDays: device.serviceIntervalDays,
                          intervalAnchor: device.intervalAnchor,
                          status: device.status,
                          notes: device.notes,
                        }}
                        organizationAnchor={session.organization.defaultIntervalAnchor}
                        canDelete={canDelete}
                        triggerLabel="Edit"
                        triggerSize="sm"
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * The service state of one device.
 *
 * Three independent signals for the same fact: the badge's colour, its text label, and
 * the date with a plain-language offset underneath. Any one of them alone is enough.
 */
function DueCell({
  state,
  daysUntilDue,
  nextServiceDue,
}: {
  state: ServiceState;
  daysUntilDue: number | null;
  nextServiceDue: CivilDate | null;
}) {
  const offset =
    daysUntilDue === null
      ? null
      : daysUntilDue < 0
        ? `${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? 'day' : 'days'} late`
        : daysUntilDue === 0
          ? 'today'
          : `in ${daysUntilDue} ${daysUntilDue === 1 ? 'day' : 'days'}`;

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={serviceStateBadgeVariant(state)}>{STATE_LABELS[state]}</Badge>
      <span className="whitespace-nowrap text-xs text-ink-muted">
        {nextServiceDue === null
          ? 'No due date'
          : `${formatCivilShort(nextServiceDue)}${offset ? ` · ${offset}` : ''}`}
      </span>
    </div>
  );
}
