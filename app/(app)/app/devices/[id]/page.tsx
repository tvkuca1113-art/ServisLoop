import { ArrowLeft, BellRing, Download, ExternalLink, Wrench } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  serviceStateBadgeVariant,
} from '@/components/ui';
import { formatCivilShort, formatRelativeDays } from '@/domain/dates';
import { can } from '@/domain/permissions';
import { STAGE_LABELS } from '@/domain/reminders';
import {
  describeInterval,
  effectiveAnchor,
  effectiveIntervalDays,
  projectSchedule,
  serviceStatus,
  type ServiceState,
} from '@/domain/service-interval';
import { KIND_LABELS, STATUS_LABELS } from '@/domain/work-order';
import type { DeviceStatus, IntervalAnchor, ReminderStatus } from '@/domain/types';
import { devicePublicUrl } from '@/lib/env';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { DeviceForm } from '../device-form';

/**
 * One device, in full.
 *
 * The schedule panel is the heart of it. It shows not just the next due date but *why* it
 * is that date — which interval applies and where it came from, which anchor is in force
 * and whether it was inherited, and the dates that follow if nothing changes. A due date
 * a person cannot explain is a due date they will not trust, and a service company that
 * does not trust the dates goes back to the spreadsheet.
 *
 * The projected dates are exactly that: a projection. Only the first is stored; the rest
 * are `projectSchedule` output and will move the moment a job is completed early or late.
 * The panel says so.
 */

export const dynamic = 'force-dynamic';

const STATE_LABELS: Readonly<Record<ServiceState, string>> = Object.freeze({
  unscheduled: 'Not scheduled',
  ok: 'On schedule',
  due_soon: 'Due soon',
  due: 'Due today',
  overdue: 'Overdue',
});

const DEVICE_STATUS_COPY: Readonly<Record<DeviceStatus, string>> = Object.freeze({
  active: 'Active — serviced on schedule and included in reminders.',
  paused: 'Paused — no due date and no reminders until it is made active again.',
  retired: 'Retired — permanently out of service. History is kept, nothing is chased.',
});

const ANCHOR_COPY: Readonly<Record<IntervalAnchor, string>> = Object.freeze({
  completion: 'measured from the day the work is finished',
  schedule: 'measured from the original due date, keeping its anniversary',
});

const REMINDER_STATUS_LABELS: Readonly<Record<ReminderStatus, string>> = Object.freeze({
  pending: 'Queued',
  sent: 'Sent',
  skipped: 'Skipped',
  failed: 'Failed',
});

/** How many future visits to project. Four is one screen and one planning horizon. */
const PROJECTION_COUNT = 4;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await requirePermission('device:read');
  const device = await getRepository().getDevice(session.organization.id, id);

  return { title: device?.name ?? 'Device' };
}

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission('device:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  const device = await repo.getDevice(orgId, id);
  if (!device) notFound();

  const [location, deviceTypes, locations, customers, workOrders, reminders] = await Promise.all([
    repo.getLocation(orgId, device.locationId),
    repo.listDeviceTypes(orgId),
    repo.listLocations(orgId),
    repo.listCustomers(orgId),
    repo.listWorkOrders(orgId, { deviceId: id, limit: 10 }),
    repo.listReminders(orgId, { deviceId: id }),
  ]);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const customer = location ? (customerById.get(location.customerId) ?? null) : null;
  const deviceType = device.deviceTypeId
    ? (deviceTypes.find((t) => t.id === device.deviceTypeId) ?? null)
    : null;

  const intervalDays = effectiveIntervalDays(device, deviceType);
  const anchor = effectiveAnchor(device, session.organization.defaultIntervalAnchor);
  const status = serviceStatus({
    nextServiceDue: device.nextServiceDue,
    today: session.today,
    leadDays: session.organization.reminderLeadDays,
    deviceStatus: device.status,
  });

  // Projection only makes sense once there is a first date to project from.
  const projected =
    device.nextServiceDue && device.status === 'active'
      ? projectSchedule(device.nextServiceDue, intervalDays, PROJECTION_COUNT)
      : [];

  const sortedReminders = [...reminders].sort((a, b) =>
    a.scheduledFor < b.scheduledFor ? 1 : a.scheduledFor > b.scheduledFor ? -1 : 0,
  );

  const canEdit = can(session.role, 'device:update');
  const canDelete = can(session.role, 'device:delete');
  const publicUrl = devicePublicUrl(device.publicToken);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-3">
        <Link href="/app/devices">
          <ArrowLeft aria-hidden="true" />
          All devices
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink-muted">
            {customer ? (
              <Link
                href={`/app/customers/${customer.id}`}
                className="hover:text-brand-600 hover:underline"
              >
                {customer.name}
              </Link>
            ) : (
              'Unassigned customer'
            )}
            {location ? (
              <>
                {' · '}
                <Link
                  href={`/app/locations/${location.id}`}
                  className="hover:text-brand-600 hover:underline"
                >
                  {location.name}
                </Link>
              </>
            ) : null}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{device.name}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={serviceStateBadgeVariant(status.state)}>
              {STATE_LABELS[status.state]}
            </Badge>
            <span className="text-sm text-ink-muted">{DEVICE_STATUS_COPY[device.status]}</span>
          </div>
        </div>

        {canEdit ? (
          <DeviceForm
            locations={locations.map((l) => ({
              id: l.id,
              name: l.name,
              customerName: customerById.get(l.customerId)?.name ?? 'Unassigned',
            }))}
            deviceTypes={deviceTypes.map((t) => ({
              id: t.id,
              name: t.name,
              defaultIntervalDays: t.defaultIntervalDays,
            }))}
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
            hasHistory={workOrders.length > 0}
            redirectAfterDelete="/app/devices"
          />
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Service schedule</CardTitle>
            <CardDescription>
              Every date below is calculated. Nothing here is typed in by hand.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Interval">
                <span className="text-ink">{describeInterval(intervalDays)}</span>
                <span className="block text-xs text-ink-subtle">
                  {device.serviceIntervalDays !== null
                    ? `Set on this device (${intervalDays} days)`
                    : deviceType
                      ? `Inherited from the ${deviceType.name} type`
                      : 'The organisation default — this device has no type'}
                </span>
              </Field>

              <Field label="Next service is measured">
                <span className="text-ink">
                  {anchor === 'completion' ? 'From the completion date' : 'From the due date'}
                </span>
                <span className="block text-xs text-ink-subtle">
                  {device.intervalAnchor === null
                    ? `Organisation default — ${ANCHOR_COPY[anchor]}`
                    : `Overridden on this device — ${ANCHOR_COPY[anchor]}`}
                </span>
              </Field>

              <Field label="Installed on">
                <span className="text-ink">
                  {device.installedOn ? formatCivilShort(device.installedOn) : 'Not recorded'}
                </span>
                {device.installedOn ? null : (
                  <span className="block text-xs text-ink-subtle">
                    Without this, a never-serviced device has no due date at all.
                  </span>
                )}
              </Field>

              <Field label="Last service">
                <span className="text-ink">
                  {device.lastServiceAt
                    ? `${formatCivilShort(device.lastServiceAt)} · ${formatRelativeDays(device.lastServiceAt, session.today)}`
                    : 'Never serviced'}
                </span>
              </Field>

              <Field label="Next due">
                <span className="text-ink">
                  {device.nextServiceDue
                    ? `${formatCivilShort(device.nextServiceDue)} · ${formatRelativeDays(device.nextServiceDue, session.today)}`
                    : 'Not scheduled'}
                </span>
                <span className="block text-xs text-ink-subtle">
                  {STATE_LABELS[status.state]}
                  {status.daysUntilDue !== null && status.daysUntilDue < 0
                    ? ` by ${Math.abs(status.daysUntilDue)} days`
                    : ''}
                </span>
              </Field>

              <Field label="Reminders start">
                <span className="text-ink">
                  {session.organization.reminderLeadDays} days before the due date
                </span>
                <span className="block text-xs text-ink-subtle">
                  Set for the whole organisation in Settings.
                </span>
              </Field>
            </dl>

            {projected.length > 0 ? (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-ink">If nothing changes</h3>
                  <p className="text-sm text-ink-muted">
                    The visits after the next one, projected at {describeInterval(intervalDays).toLowerCase()}. Only
                    the first is committed — completing a job early or late moves everything
                    after it.
                  </p>
                  <ol className="flex flex-wrap gap-2 pt-1">
                    {projected.map((date, index) => (
                      <li
                        key={date}
                        className="rounded-md border border-border-base bg-surface-muted px-2.5 py-1 text-xs text-ink-muted"
                      >
                        <span className="sr-only">Visit {index + 2}: </span>
                        {formatCivilShort(date)}
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">QR code</CardTitle>
            <CardDescription>
              Stick it on the device. Scanning opens the public page, where anyone on site can
              report a fault or request a visit without an account.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-3">
            <Image
              src={`/api/devices/${device.id}/qr?format=png&size=320`}
              alt={`QR code for ${device.name}`}
              width={160}
              height={160}
              unoptimized
              className="size-40 rounded-md border border-border-base bg-surface p-2"
            />

            <p className="w-full break-all text-center font-mono text-xs text-ink-subtle">
              {publicUrl}
            </p>

            <div className="flex w-full flex-col gap-2">
              <Button variant="secondary" asChild>
                <a href={`/api/devices/${device.id}/qr?format=svg`} download>
                  <Download aria-hidden="true" />
                  Download SVG
                </a>
              </Button>
              <Button variant="ghost" asChild>
                <a href={`/d/${device.publicToken}`} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Open public page
                </a>
              </Button>
              {location ? (
                <Button variant="ghost" asChild>
                  <Link href={`/app/locations/${location.id}?print=labels`}>
                    Print labels for this site
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Identity</CardTitle>
          <CardDescription>What this device is, and how to recognise it on site.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Type">
              <span className="text-ink">{deviceType?.name ?? 'No type set'}</span>
            </Field>
            <Field label="Manufacturer">
              <span className="text-ink">{device.manufacturer ?? '—'}</span>
            </Field>
            <Field label="Model">
              <span className="text-ink">{device.model ?? '—'}</span>
            </Field>
            <Field label="Serial number">
              <span className="font-mono text-ink">{device.serialNumber ?? '—'}</span>
            </Field>
          </dl>

          {device.notes ? (
            <>
              <Separator className="my-4" />
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Notes
                </h3>
                <p className="whitespace-pre-wrap text-sm text-ink">{device.notes}</p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">Recent work orders</h2>
          <p className="text-sm text-ink-muted">
            The last ten jobs filed against this device, newest first.
          </p>
        </div>

        {workOrders.length === 0 ? (
          <EmptyState
            titleAs="h3"
            icon={<Wrench />}
            title="No work orders yet"
            description="Nothing has been scheduled or carried out on this device through ServisLoop."
          />
        ) : (
          <div className="rounded-card border border-border-base bg-surface-raised">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/app/work-orders/${order.id}`}
                        className="font-mono text-sm font-medium text-ink hover:text-brand-600 hover:underline"
                      >
                        {order.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {KIND_LABELS[order.kind]}
                    </TableCell>
                    <TableCell className="text-sm text-ink">
                      {STATUS_LABELS[order.status]}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {order.scheduledFor ? order.scheduledFor.slice(0, 16).replace('T', ' ') : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {order.completedOn ? formatCivilShort(order.completedOn) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">Reminder history</h2>
          <p className="text-sm text-ink-muted">
            The ladder is rebuilt whenever the due date moves, so queued reminders for a date
            that changed disappear rather than going out wrong.
          </p>
        </div>

        {sortedReminders.length === 0 ? (
          <EmptyState
            titleAs="h3"
            icon={<BellRing />}
            title="No reminders"
            description={
              device.status === 'active'
                ? 'This device has no due date yet, so there is nothing to remind anyone about.'
                : 'Paused and retired devices are never chased, so their reminders are withdrawn.'
            }
          />
        ) : (
          <div className="rounded-card border border-border-base bg-surface-raised">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Sends on</TableHead>
                  <TableHead>For due date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedReminders.map((reminder) => (
                  <TableRow key={reminder.id}>
                    <TableCell className="text-sm text-ink">
                      {STAGE_LABELS[reminder.stage]}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {formatCivilShort(reminder.scheduledFor)}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {formatCivilShort(reminder.dueDate)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-ink">
                        {REMINDER_STATUS_LABELS[reminder.status]}
                      </span>
                      {reminder.error ? (
                        <span className="block text-xs text-state-overdue">{reminder.error}</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
