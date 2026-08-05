import { Building2, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Badge,
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { can } from '@/domain/permissions';
import { serviceStatus } from '@/domain/service-interval';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { LocationForm } from './location-form';

/**
 * Sites, grouped by the customer they belong to.
 *
 * Grouped rather than a flat table because a site name on its own is ambiguous — three
 * customers can each have a "Warehouse", and the only thing that tells them apart is
 * whose it is. The customer heading carries that, so the row does not have to repeat it.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Locations',
  description: 'Every site where you service equipment, grouped by customer.',
};

export default async function LocationsPage() {
  const session = await requirePermission('location:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  const [customers, locations, devices] = await Promise.all([
    repo.listCustomers(orgId),
    repo.listLocations(orgId),
    repo.listDevices(orgId),
  ]);

  const deviceCounts = new Map<string, number>();
  const overdueCounts = new Map<string, number>();
  for (const device of devices) {
    deviceCounts.set(device.locationId, (deviceCounts.get(device.locationId) ?? 0) + 1);

    const status = serviceStatus({
      nextServiceDue: device.nextServiceDue,
      today: session.today,
      leadDays: session.organization.reminderLeadDays,
      deviceStatus: device.status,
    });
    if (status.state === 'overdue') {
      overdueCounts.set(device.locationId, (overdueCounts.get(device.locationId) ?? 0) + 1);
    }
  }

  const byCustomer = customers
    .map((customer) => ({
      customer,
      sites: locations.filter((l) => l.customerId === customer.id),
    }))
    .filter((group) => group.sites.length > 0);

  const orphaned = locations.filter((l) => !customers.some((c) => c.id === l.customerId));

  const canCreate = can(session.role, 'location:create');
  const canEdit = can(session.role, 'location:update');
  const canDelete = can(session.role, 'location:delete');
  const customerOptions = customers.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Locations</h1>
          <p className="text-sm text-ink-muted">
            {locations.length} {locations.length === 1 ? 'site' : 'sites'} across{' '}
            {byCustomer.length} {byCustomer.length === 1 ? 'customer' : 'customers'}.
          </p>
        </div>

        {canCreate && customers.length > 0 ? (
          <LocationForm customers={customerOptions} />
        ) : null}
      </header>

      {customers.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="No customers yet"
          description="Sites belong to a customer, so add the company first. Importing a spreadsheet creates both at once."
          action={
            <>
              <Button asChild>
                <Link href="/app/customers">Go to customers</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/app/devices/import">Import from a spreadsheet</Link>
              </Button>
            </>
          }
        />
      ) : locations.length === 0 ? (
        <EmptyState
          icon={<MapPin />}
          title="No sites yet"
          description="A site is one address — a building, a plant, a hotel. Devices are installed at a site, so this comes before adding equipment."
          action={canCreate ? <LocationForm customers={customerOptions} /> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {byCustomer.map(({ customer, sites }) => (
            <section key={customer.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink">
                  <Link
                    href={`/app/customers/${customer.id}`}
                    className="hover:text-brand-600 hover:underline"
                  >
                    {customer.name}
                  </Link>
                </h2>
                <span className="text-sm text-ink-muted">
                  {sites.length} {sites.length === 1 ? 'site' : 'sites'}
                </span>
              </div>

              <div className="rounded-card border border-border-base bg-surface-raised">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead numeric>Devices</TableHead>
                      <TableHead numeric>Overdue</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {sites.map((site) => {
                      const overdue = overdueCounts.get(site.id) ?? 0;
                      const deviceCount = deviceCounts.get(site.id) ?? 0;

                      return (
                        <TableRow key={site.id}>
                          <TableCell>
                            <Link
                              href={`/app/locations/${site.id}`}
                              className="font-medium text-ink hover:text-brand-600 hover:underline"
                            >
                              {site.name}
                            </Link>
                          </TableCell>

                          <TableCell className="text-sm text-ink-muted">
                            {[site.addressLine, site.postalCode, site.city, site.country]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </TableCell>

                          <TableCell numeric>{deviceCount}</TableCell>

                          <TableCell numeric>
                            {overdue === 0 ? (
                              <span className="text-ink-subtle">0</span>
                            ) : (
                              <Badge variant="overdue">{overdue} overdue</Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            {canEdit ? (
                              <LocationForm
                                customers={customerOptions}
                                location={{
                                  id: site.id,
                                  customerId: site.customerId,
                                  name: site.name,
                                  addressLine: site.addressLine,
                                  city: site.city,
                                  postalCode: site.postalCode,
                                  country: site.country,
                                  notes: site.notes,
                                }}
                                deviceCount={deviceCount}
                                canDelete={canDelete}
                                triggerSize="sm"
                              />
                            ) : (
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/app/locations/${site.id}`}>View</Link>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}

          {orphaned.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-ink">Unassigned sites</h2>
              <p className="text-sm text-ink-muted">
                These sites point at a customer that no longer exists. Edit each one to move it
                to a current customer.
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {orphaned.map((site) => (
                  <li key={site.id}>
                    <Link
                      href={`/app/locations/${site.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {site.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
