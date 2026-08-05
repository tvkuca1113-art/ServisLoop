import { ArrowLeft, Cpu, Printer, QrCode } from 'lucide-react';
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
import { describeInterval, effectiveIntervalDays, serviceStatus, type ServiceState } from '@/domain/service-interval';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { DeviceForm } from '../../devices/device-form';
import { LocationForm } from '../location-form';

/**
 * One site: its address, its devices, and a printable sheet of QR labels.
 *
 * The label sheet is this same route with `?print=labels`, rather than a separate page.
 * That keeps the device list and the labels reading from one query and one permission
 * check, and it means the printable view is a URL a technician can be sent.
 */

export const dynamic = 'force-dynamic';

/** See the note in the customer detail page: presentation strings live with the screen. */
const STATE_LABELS: Readonly<Record<ServiceState, string>> = Object.freeze({
  unscheduled: 'Not scheduled',
  ok: 'On schedule',
  due_soon: 'Due soon',
  due: 'Due today',
  overdue: 'Overdue',
});

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await requirePermission('location:read');
  const location = await getRepository().getLocation(session.organization.id, id);

  return { title: location?.name ?? 'Location' };
}

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const printLabels = query.print === 'labels';

  const session = await requirePermission('location:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  const location = await repo.getLocation(orgId, id);
  if (!location) notFound();

  const [customer, customers, devices, deviceTypes] = await Promise.all([
    repo.getCustomer(orgId, location.customerId),
    repo.listCustomers(orgId),
    repo.listDevices(orgId, { locationId: id }),
    repo.listDeviceTypes(orgId),
  ]);

  const typeById = new Map(deviceTypes.map((t) => [t.id, t]));

  const rows = devices.map((device) => {
    const deviceType = device.deviceTypeId ? (typeById.get(device.deviceTypeId) ?? null) : null;
    return {
      device,
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

  const address =
    [location.addressLine, location.postalCode, location.city, location.country]
      .filter(Boolean)
      .join(', ') || 'No address recorded';

  if (printLabels) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href={`/app/locations/${location.id}`}>
              <ArrowLeft aria-hidden="true" />
              Back to {location.name}
            </Link>
          </Button>
          <p className="text-sm text-ink-muted">
            Use your browser&rsquo;s print dialog. Each label carries the device&rsquo;s own QR
            code — scanning it opens the public device page, where a customer can report a
            fault or request a visit.
          </p>
        </div>

        <h1 className="text-xl font-semibold text-ink">
          QR labels · {customer?.name ?? 'Unassigned'} · {location.name}
        </h1>

        {devices.length === 0 ? (
          <EmptyState
            icon={<QrCode />}
            title="Nothing to print"
            description="There are no devices at this site yet."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex break-inside-avoid flex-col items-center gap-2 rounded-card border border-border-strong bg-surface p-4 text-center"
              >
                <Image
                  // The QR endpoint renders the token, not the id, into the code; it is
                  // addressed by device so the label survives a token rotation.
                  src={`/api/devices/${device.id}/qr?format=png&size=320`}
                  alt={`QR code for ${device.name}`}
                  width={160}
                  height={160}
                  unoptimized
                  className="size-40"
                />
                <span className="text-sm font-semibold text-ink">{device.name}</span>
                <span className="text-xs text-ink-muted">
                  {customer?.name ?? '—'} · {location.name}
                </span>
                {device.serialNumber ? (
                  <span className="font-mono text-xs text-ink-subtle">{device.serialNumber}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const canEditLocation = can(session.role, 'location:update');
  const canDeleteLocation = can(session.role, 'location:delete');
  const canCreateDevice = can(session.role, 'device:create');
  const overdue = rows.filter((r) => r.status.state === 'overdue').length;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-3">
        <Link href="/app/locations">
          <ArrowLeft aria-hidden="true" />
          All locations
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
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{location.name}</h1>
          <p className="text-sm text-ink-muted">{address}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {devices.length > 0 ? (
            <Button variant="secondary" asChild>
              <Link href={`/app/locations/${location.id}?print=labels`}>
                <Printer aria-hidden="true" />
                Print QR labels
              </Link>
            </Button>
          ) : null}

          {canEditLocation ? (
            <LocationForm
              customers={customers.map((c) => ({ id: c.id, name: c.name }))}
              location={{
                id: location.id,
                customerId: location.customerId,
                name: location.name,
                addressLine: location.addressLine,
                city: location.city,
                postalCode: location.postalCode,
                country: location.country,
                notes: location.notes,
              }}
              deviceCount={devices.length}
              canDelete={canDeleteLocation}
              redirectAfterDelete="/app/locations"
            />
          ) : null}
        </div>
      </header>

      {location.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Access notes</CardTitle>
            <CardDescription>Shown to the technician on the job.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-ink">{location.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-ink">Devices at this site</h2>
            <p className="text-sm text-ink-muted">
              {devices.length} {devices.length === 1 ? 'device' : 'devices'}
              {overdue > 0 ? ` · ${overdue} overdue` : ''}
            </p>
          </div>

          {canCreateDevice ? (
            <DeviceForm
              locations={[
                {
                  id: location.id,
                  name: location.name,
                  customerName: customer?.name ?? 'Unassigned',
                },
              ]}
              deviceTypes={deviceTypes.map((t) => ({
                id: t.id,
                name: t.name,
                defaultIntervalDays: t.defaultIntervalDays,
              }))}
              defaultLocationId={location.id}
              organizationAnchor={session.organization.defaultIntervalAnchor}
              triggerSize="sm"
            />
          ) : null}
        </div>

        {devices.length === 0 ? (
          <EmptyState
            titleAs="h3"
            icon={<Cpu />}
            title="No devices here yet"
            description="Add the equipment installed at this site. Each device gets its own QR code, which you can print from this page."
          />
        ) : (
          <div className="rounded-card border border-border-base bg-surface-raised">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Next due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ device, deviceType, intervalDays, status }) => (
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
                    <TableCell className="text-sm text-ink-muted">
                      {deviceType?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {describeInterval(intervalDays)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={serviceStateBadgeVariant(status.state)}>
                          {STATE_LABELS[status.state]}
                        </Badge>
                        <span className="text-xs text-ink-muted">
                          {device.nextServiceDue
                            ? `${formatCivilShort(device.nextServiceDue)} · ${formatRelativeDays(device.nextServiceDue, session.today)}`
                            : 'No due date'}
                        </span>
                      </div>
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
