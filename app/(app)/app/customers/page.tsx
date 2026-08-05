import { Building2, Search } from 'lucide-react';
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
} from '@/components/ui';
import { can } from '@/domain/permissions';
import { serviceStatus } from '@/domain/service-interval';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { CustomerActions } from './customer-actions';
import { CustomerForm } from './customer-form';

/**
 * The customer list.
 *
 * Counts are computed here rather than fetched per row: the three lists are one read
 * each, and joining them in memory is cheaper than a query per customer — an organisation
 * with 200 customers would otherwise cost 400 round trips to render one table.
 *
 * The overdue count is the number that makes this page worth opening, so it is the only
 * one that gets colour, and it carries the word "overdue" alongside it. Colour alone
 * never conveys state in this application.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Customers',
  description: 'Companies, their sites and the devices you service for them.',
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePermission('customer:read');
  const params = await searchParams;
  const query = firstParam(params.q).trim();

  const repo = getRepository();
  const orgId = session.organization.id;

  const [customers, locations, devices] = await Promise.all([
    repo.listCustomers(orgId, query === '' ? undefined : query),
    repo.listLocations(orgId),
    repo.listDevices(orgId),
  ]);

  const customerIdByLocation = new Map(locations.map((l) => [l.id, l.customerId]));

  const locationCounts = new Map<string, number>();
  for (const location of locations) {
    locationCounts.set(location.customerId, (locationCounts.get(location.customerId) ?? 0) + 1);
  }

  const deviceCounts = new Map<string, number>();
  const overdueCounts = new Map<string, number>();
  for (const device of devices) {
    const customerId = customerIdByLocation.get(device.locationId);
    if (!customerId) continue;

    deviceCounts.set(customerId, (deviceCounts.get(customerId) ?? 0) + 1);

    const status = serviceStatus({
      nextServiceDue: device.nextServiceDue,
      today: session.today,
      leadDays: session.organization.reminderLeadDays,
      deviceStatus: device.status,
    });
    if (status.state === 'overdue') {
      overdueCounts.set(customerId, (overdueCounts.get(customerId) ?? 0) + 1);
    }
  }

  const canCreate = can(session.role, 'customer:create');
  const canEdit = can(session.role, 'customer:update');
  const canDelete = can(session.role, 'customer:delete');

  const totalOverdue = [...overdueCounts.values()].reduce((sum, n) => sum + n, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Customers</h1>
          <p className="text-sm text-ink-muted">
            {customers.length} {customers.length === 1 ? 'company' : 'companies'}
            {query === '' ? '' : ` matching “${query}”`}
            {totalOverdue > 0 ? ` · ${totalOverdue} overdue devices between them` : ''}
          </p>
        </div>

        {canCreate ? <CustomerForm /> : null}
      </header>

      {/*
        A plain GET form. The filter is a URL, which means it survives a refresh, can be
        bookmarked and sent to a colleague, and works with JavaScript still loading —
        none of which is true of client-side filter state.
      */}
      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <label htmlFor="customer-search" className="text-sm font-medium text-ink">
            Search customers
          </label>
          <Input
            id="customer-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Company, contact, email or reference"
          />
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Search
        </Button>
        {query === '' ? null : (
          <Button variant="ghost" asChild>
            <Link href="/app/customers">Clear</Link>
          </Button>
        )}
      </form>

      {customers.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={query === '' ? 'No customers yet' : `Nothing matches “${query}”`}
          description={
            query === ''
              ? 'Add the first company you service. You can also import a whole equipment list from a spreadsheet — that creates customers, sites and devices in one pass.'
              : 'Try a shorter search, or check the spelling of the company name.'
          }
          action={
            query === '' ? (
              <>
                {canCreate ? <CustomerForm /> : null}
                <Button variant="secondary" asChild>
                  <Link href="/app/devices/import">Import from a spreadsheet</Link>
                </Button>
              </>
            ) : (
              <Button variant="secondary" asChild>
                <Link href="/app/customers">Show all customers</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-card border border-border-base bg-surface-raised">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead numeric>Sites</TableHead>
                <TableHead numeric>Devices</TableHead>
                <TableHead numeric>Overdue</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {customers.map((customer) => {
                const overdue = overdueCounts.get(customer.id) ?? 0;
                const sites = locationCounts.get(customer.id) ?? 0;

                return (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/app/customers/${customer.id}`}
                        className="font-medium text-ink hover:text-brand-600 hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.externalRef ? (
                        <span className="block text-xs text-ink-subtle">
                          Ref {customer.externalRef}
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span className="text-ink">{customer.contactName ?? '—'}</span>
                        {customer.email ? (
                          <a
                            href={`mailto:${customer.email}`}
                            className="text-ink-muted hover:text-brand-600 hover:underline"
                          >
                            {customer.email}
                          </a>
                        ) : null}
                        {customer.phone ? (
                          <span className="text-ink-muted">{customer.phone}</span>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell numeric>{sites}</TableCell>
                    <TableCell numeric>{deviceCounts.get(customer.id) ?? 0}</TableCell>

                    <TableCell numeric>
                      {overdue === 0 ? (
                        <span className="text-ink-subtle">0</span>
                      ) : (
                        <Badge variant="overdue">{overdue} overdue</Badge>
                      )}
                    </TableCell>

                    <TableCell>
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
                        canEdit={canEdit}
                        canDelete={canDelete}
                        locationCount={sites}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
