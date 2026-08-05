import { CalendarClock, Mail, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeVariant,
} from '@/components/ui';
import { formatCivilLong, formatMinuteOfDay, formatRelativeDays } from '@/domain/dates';
import { can } from '@/domain/permissions';
import type { Booking, BookingStatus } from '@/domain/types';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { BookingActions } from './booking-actions';

/**
 * Booking triage — the inbox for appointments customers asked for themselves.
 *
 * Pending requests come first and are the only thing with actions on them, because they
 * are the only thing that needs a human. Everything already decided drops into a compact
 * record below: useful for "did we ever answer Hotel Neretva?", but not competing for
 * attention with the four requests that came in overnight.
 *
 * Every pending request is holding a slot on the calendar (`collectBusyIntervals` counts
 * pending bookings as busy), so leaving one undecided is not free — it blocks that time
 * for every other customer. The page says so.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bookings',
  description: 'Appointment requests from customers, waiting to be confirmed or declined.',
};

const STATUS_LABELS: Readonly<Record<BookingStatus, string>> = Object.freeze({
  pending: 'Waiting for a decision',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
});

const STATUS_VARIANTS: Readonly<Record<BookingStatus, BadgeVariant>> = Object.freeze({
  pending: 'soon',
  confirmed: 'ok',
  declined: 'neutral',
  cancelled: 'neutral',
});

function windowLabel(booking: Booking): string {
  return `${formatMinuteOfDay(booking.requestedStartMinute)}–${formatMinuteOfDay(booking.requestedEndMinute)}`;
}

export default async function BookingsPage() {
  const session = await requirePermission('booking:read');
  const repo = getRepository();
  const orgId = session.organization.id;

  const [bookings, devices, locations, customers, workOrders] = await Promise.all([
    repo.listBookings(orgId),
    repo.listDevices(orgId),
    repo.listLocations(orgId),
    repo.listCustomers(orgId),
    repo.listWorkOrders(orgId),
  ]);

  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const workOrderById = new Map(workOrders.map((w) => [w.id, w]));

  const rows = bookings.map((booking) => {
    const device = deviceById.get(booking.deviceId) ?? null;
    const location = device ? (locationById.get(device.locationId) ?? null) : null;
    const customer = location ? (customerById.get(location.customerId) ?? null) : null;
    const workOrder = booking.workOrderId ? (workOrderById.get(booking.workOrderId) ?? null) : null;
    return { booking, device, location, customer, workOrder };
  });

  // Soonest requested date first — the one happening on Thursday needs answering before
  // the one three weeks out, whatever order they arrived in.
  const pending = rows
    .filter((r) => r.booking.status === 'pending')
    .sort((a, b) =>
      a.booking.requestedDate === b.booking.requestedDate
        ? a.booking.requestedStartMinute - b.booking.requestedStartMinute
        : a.booking.requestedDate < b.booking.requestedDate
          ? -1
          : 1,
    );
  const decided = rows.filter((r) => r.booking.status !== 'pending');

  const canConfirm = can(session.role, 'booking:confirm');
  const canDecline = can(session.role, 'booking:decline');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Bookings</h1>
        <p className="text-sm text-ink-muted">
          {pending.length === 0
            ? 'Nothing waiting. Requests arrive here from the QR pages on your devices.'
            : `${pending.length} ${pending.length === 1 ? 'request is' : 'requests are'} holding a slot on the calendar until you decide.`}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="No booking requests yet"
          description="When a customer scans the QR code on a device and asks for a visit, the request lands here. Nobody needs an account to send one."
        />
      ) : null}

      {pending.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Needs a decision
          </h2>

          {pending.map(({ booking, device, location, customer }) => (
            <Card key={booking.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle as="h3" className="text-lg">
                      {formatCivilLong(booking.requestedDate)} · {windowLabel(booking)}
                    </CardTitle>
                    <p className="text-sm text-ink-muted">
                      {formatRelativeDays(booking.requestedDate, session.today)} ·{' '}
                      {device ? (
                        <Link
                          href={`/app/devices/${device.id}`}
                          className="hover:text-brand-600 hover:underline"
                        >
                          {device.name}
                        </Link>
                      ) : (
                        'Device removed'
                      )}
                      {customer ? ` · ${customer.name}` : ''}
                      {location ? ` · ${location.name}` : ''}
                    </p>
                  </div>

                  <Badge variant={STATUS_VARIANTS[booking.status]}>
                    {STATUS_LABELS[booking.status]}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5 rounded-card border border-border-base bg-surface-muted p-4">
                  <p className="text-sm font-medium text-ink">{booking.contactName}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                    {booking.contactEmail ? (
                      <a
                        href={`mailto:${booking.contactEmail}`}
                        className="inline-flex items-center gap-1.5 hover:text-brand-600 hover:underline"
                      >
                        <Mail aria-hidden="true" className="size-3.5" />
                        {booking.contactEmail}
                      </a>
                    ) : null}
                    {booking.contactPhone ? (
                      <a
                        href={`tel:${booking.contactPhone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1.5 hover:text-brand-600 hover:underline"
                      >
                        <Phone aria-hidden="true" className="size-3.5" />
                        {booking.contactPhone}
                      </a>
                    ) : null}
                  </div>
                  {booking.note ? (
                    <p className="whitespace-pre-line pt-1 text-sm text-ink">{booking.note}</p>
                  ) : null}
                </div>

                <BookingActions
                  bookingId={booking.id}
                  contactName={booking.contactName}
                  deviceName={device?.name ?? 'this device'}
                  whenLabel={`${formatCivilLong(booking.requestedDate)}, ${windowLabel(booking)}`}
                  canConfirm={canConfirm}
                  canDecline={canDecline}
                />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {decided.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Decided</h2>

          <div className="overflow-hidden rounded-card border border-border-base">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Job</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decided.map(({ booking, device, customer, workOrder }) => (
                  <TableRow key={booking.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatCivilLong(booking.requestedDate)}
                      <span className="block text-xs text-ink-muted">{windowLabel(booking)}</span>
                    </TableCell>
                    <TableCell>
                      {device ? (
                        <Link
                          href={`/app/devices/${device.id}`}
                          className="text-ink hover:text-brand-600 hover:underline"
                        >
                          {device.name}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">Removed</span>
                      )}
                      {customer ? (
                        <span className="block text-xs text-ink-muted">{customer.name}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{booking.contactName}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[booking.status]}>
                        {STATUS_LABELS[booking.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {workOrder ? workOrder.code : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
