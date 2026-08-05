import { ArrowLeft, Cpu, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
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
import { serviceStatus, type ServiceState } from '@/domain/service-interval';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { DeviceForm } from '../../devices/device-form';
import { LocationForm } from '../../locations/location-form';
import { CustomerActions } from '../customer-actions';

/**
 * One customer: who they are, where their sites are, and what is due on them.
 *
 * The page answers a question a service company gets on the phone — "when are you next
 * coming, and is anything of ours late?" — so the overdue and due-soon counts sit at the
 * top and every device is listed with its state in words as well as in colour.
 */

export const dynamic = 'force-dynamic';

/**
 * Restated here rather than imported: the domain deliberately owns no presentation
 * strings, and `@/components/ui` deliberately owns no dependency on the domain.
 */
const STATE_LABELS: Readonly<Record<ServiceState, string>> = Object.freeze({
  unscheduled: 'Not scheduled',
  ok: 'On schedule',
  due_soon: 'Due soon',
  due: 'Due today',
  overdue: 'Overdue',
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await requirePermission('customer:read');
  const customer = await getRepository().getCustomer(session.organization.id, id);

  return { title: customer?.name ?? 'Customer' };
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission('customer:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  const customer = await repo.getCustomer(orgId, id);
  if (!customer) notFound();

  const [locations, devices, deviceTypes] = await Promise.all([
    repo.listLocations(orgId, id),
    repo.listDevices(orgId, { customerId: id }),
    repo.listDeviceTypes(orgId),
  ]);

  const locationById = new Map(locations.map((l) => [l.id, l]));
  const typeById = new Map(deviceTypes.map((t) => [t.id, t]));

  const rows = devices.map((device) => ({
    device,
    location: locationById.get(device.locationId) ?? null,
    typeName: device.deviceTypeId ? (typeById.get(device.deviceTypeId)?.name ?? null) : null,
    status: serviceStatus({
      nextServiceDue: device.nextServiceDue,
      today: session.today,
      leadDays: session.organization.reminderLeadDays,
      deviceStatus: device.status,
    }),
  }));

  const overdue = rows.filter((r) => r.status.state === 'overdue').length;
  const dueSoon = rows.filter(
    (r) => r.status.state === 'due_soon' || r.status.state === 'due',
  ).length;

  const nextDue = rows
    .map((r) => r.device.nextServiceDue)
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort()[0];

  const deviceCountByLocation = new Map<string, number>();
  for (const device of devices) {
    deviceCountByLocation.set(
      device.locationId,
      (deviceCountByLocation.get(device.locationId) ?? 0) + 1,
    );
  }

  const canEditCustomer = can(session.role, 'customer:update');
  const canDeleteCustomer = can(session.role, 'customer:delete');
  const canCreateLocation = can(session.role, 'location:create');
  const canCreateDevice = can(session.role, 'device:create');

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-3">
        <Link href="/app/customers">
          <ArrowLeft aria-hidden="true" />
          All customers
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{customer.name}</h1>
          <p className="text-sm text-ink-muted">
            {[
              customer.contactName,
              customer.email,
              customer.phone,
              customer.externalRef ? `Ref ${customer.externalRef}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No contact details recorded yet.'}
          </p>
        </div>

        <CustomerActions
          customer={{
            id: customer.id,
            name: customer.name,
            contactName: customer.contactName,
            email: customer.email,
            phone: customer.phone,
            externalRef: customer.externalRef,
            notes: customer.notes,
          }}
          canEdit={canEditCustomer}
          canDelete={canDeleteCustomer}
          locationCount={locations.length}
          redirectTo="/app/customers"
        />
      </header>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sites" value={String(locations.length)} />
        <Stat label="Devices" value={String(devices.length)} />
        <Stat
          label="Overdue"
          value={String(overdue)}
          tone={overdue > 0 ? 'overdue' : undefined}
          hint={overdue > 0 ? 'Past their service date' : 'Nothing is late'}
        />
        <Stat
          label="Next service due"
          value={nextDue ? formatCivilShort(nextDue) : '—'}
          hint={
            nextDue
              ? formatRelativeDays(nextDue, session.today)
              : 'No device has a due date yet'
          }
        />
      </dl>

      {customer.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Internal notes</CardTitle>
            <CardDescription>Visible to your team only.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-ink">{customer.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-ink">Sites</h2>
            <p className="text-sm text-ink-muted">
              Every physical address where you service equipment for {customer.name}.
            </p>
          </div>
          {canCreateLocation ? (
            <LocationForm
              customers={[{ id: customer.id, name: customer.name }]}
              defaultCustomerId={customer.id}
              triggerSize="sm"
            />
          ) : null}
        </div>

        {locations.length === 0 ? (
          <EmptyState
            titleAs="h3"
            icon={<MapPin />}
            title="No sites yet"
            description="A site is a building or address. Devices are installed at a site, not at the company, so this comes first."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {locations.map((location) => (
              <li key={location.id}>
                <Card className="h-full gap-2 py-4">
                  <CardHeader className="px-4">
                    <CardTitle as="h3">
                      <Link
                        href={`/app/locations/${location.id}`}
                        className="hover:text-brand-600 hover:underline"
                      >
                        {location.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {[location.addressLine, location.postalCode, location.city, location.country]
                        .filter(Boolean)
                        .join(', ') || 'No address recorded'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 text-sm text-ink-muted">
                    {deviceCountByLocation.get(location.id) ?? 0} devices
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-ink">Devices</h2>
            <p className="text-sm text-ink-muted">
              {devices.length} serviced {devices.length === 1 ? 'asset' : 'assets'}
              {dueSoon > 0 ? ` · ${dueSoon} due within ${session.organization.reminderLeadDays} days` : ''}
            </p>
          </div>
          {canCreateDevice && locations.length > 0 ? (
            <DeviceForm
              locations={locations.map((l) => ({
                id: l.id,
                name: l.name,
                customerName: customer.name,
              }))}
              deviceTypes={deviceTypes.map((t) => ({
                id: t.id,
                name: t.name,
                defaultIntervalDays: t.defaultIntervalDays,
              }))}
              defaultLocationId={locations[0]?.id}
              organizationAnchor={session.organization.defaultIntervalAnchor}
              triggerSize="sm"
            />
          ) : null}
        </div>

        {devices.length === 0 ? (
          <EmptyState
            titleAs="h3"
            icon={<Cpu />}
            title="No devices yet"
            description="Add the equipment you maintain for this customer, or import their whole list from a spreadsheet."
            action={
              <Button variant="secondary" asChild>
                <Link href="/app/devices/import">Import from a spreadsheet</Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-card border border-border-base bg-surface-raised">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Next due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ device, location, typeName, status }) => (
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
                      {location?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">{typeName ?? '—'}</TableCell>
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

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'overdue';
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border-base bg-surface-raised p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd
        className={
          tone === 'overdue'
            ? 'text-2xl font-semibold text-state-overdue'
            : 'text-2xl font-semibold text-ink'
        }
      >
        {value}
      </dd>
      {hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
