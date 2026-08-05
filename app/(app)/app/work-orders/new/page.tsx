import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@/components/ui';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { NewWorkOrderForm } from '../work-order-form';

/**
 * Open a job by hand.
 *
 * Most work orders are not created here — they arrive from a due device, a customer
 * booking or a reported fault. This page is for the call that comes in by telephone, and
 * it is a full page rather than a dialog because choosing the right device out of a whole
 * register deserves the room.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Open a job',
  description: 'Create a work order against a device.',
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePermission('work_order:create');
  const params = await searchParams;

  const repo = getRepository();
  const orgId = session.organization.id;

  const [devices, locations, customers, memberships] = await Promise.all([
    repo.listDevices(orgId),
    repo.listLocations(orgId),
    repo.listCustomers(orgId),
    repo.listMemberships(orgId),
  ]);

  const profiles = await repo.listProfiles(memberships.map((m) => m.userId));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  // Retired equipment is out of the picker: a job against it would generate a service
  // report for a machine that is gone. Paused devices stay, because a one-off visit to a
  // paused device is a real thing to want.
  const options = devices
    .filter((device) => device.status !== 'retired')
    .map((device) => {
      const location = locationById.get(device.locationId) ?? null;
      return {
        id: device.id,
        name: device.name,
        serialNumber: device.serialNumber,
        locationName: location?.name ?? 'Unknown site',
        customerName: location
          ? (customerById.get(location.customerId)?.name ?? 'Unknown customer')
          : 'Unknown customer',
      };
    })
    .sort(
      (a, b) => a.customerName.localeCompare(b.customerName) || a.name.localeCompare(b.name),
    );

  const requestedDevice = firstParam(params.device);
  const defaultDeviceId = options.some((o) => o.id === requestedDevice)
    ? requestedDevice
    : undefined;

  const members = memberships
    .map((membership) => ({
      id: membership.userId,
      name:
        profileById.get(membership.userId)?.fullName ??
        profileById.get(membership.userId)?.email ??
        'Unknown',
      role: membership.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3 w-fit">
        <Link href="/app/work-orders">
          <ArrowLeft aria-hidden="true" />
          All work orders
        </Link>
      </Button>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Open a job</h1>
        <p className="text-sm text-ink-muted">
          The reference is allocated when you save — {session.organization.name} numbers jobs
          in sequence for the year.
        </p>
      </header>

      {options.length === 0 ? (
        <EmptyState
          title="No devices to work on"
          description="A job is always against a piece of equipment. Add a device — or import a register from a spreadsheet — and this page will have something to file against."
          action={
            <Button asChild>
              <Link href="/app/devices">Go to the device register</Link>
            </Button>
          }
        />
      ) : (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle as="h2">Job details</CardTitle>
            <CardDescription>
              Pick the device; the site, the customer and the checklist follow from it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewWorkOrderForm
              devices={options}
              members={members}
              {...(defaultDeviceId === undefined ? {} : { defaultDeviceId })}
              today={session.today}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
