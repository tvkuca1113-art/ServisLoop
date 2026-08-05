import { CalendarPlus, MapPin, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  serviceStateBadgeVariant,
} from '@/components/ui';
import { civilDateInTimeZone, formatCivilLong, formatRelativeDays } from '@/domain/dates';
import { serviceStatus, type ServiceState } from '@/domain/service-interval';
import { getRepository } from '@/server/data';

/**
 * The public device page — what a QR sticker on a machine opens.
 *
 * ── WHAT THIS PAGE MAY SHOW ──────────────────────────────────────────────────
 *
 * This URL is reachable by ANYONE holding the token: the caretaker, the tenant, the
 * cleaner, whoever photographed the sticker last week. There is no sign-in and no
 * session. So the page shows only what a person standing in front of the machine can
 * already see or legitimately needs:
 *
 *   • the name of the company that services it, so they know who is coming
 *   • the device: name, manufacturer, model, serial number
 *   • where it is — the site it belongs to
 *   • its service status: next due date, or how far overdue it is
 *   • two actions: book a service, report a problem
 *
 * It must NEVER show: the customer's name or contact details, internal notes, prices,
 * work-order history, technician names, any other device, or anything at all about the
 * organisation's other customers. The device context is fetched by token
 * (`getDeviceContextByToken`) precisely so that one token resolves to one device and
 * nothing else — there is no list to accidentally render.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Built phone-first, because that is the only way it is ever opened: one column, large
 * type, touch targets you can hit wearing gloves in a badly lit plant room.
 */

export const dynamic = 'force-dynamic';

/**
 * `noindex, nofollow`. These URLs carry an unguessable token; a crawler that indexed one
 * would publish it. The token is the only thing standing between the page and the open
 * web, so it must never reach a search engine or a referrer-following bot.
 */
export const metadata: Metadata = {
  title: 'Device service page',
  description: 'Service status for this device, with options to book a visit or report a fault.',
  robots: { index: false, follow: false },
};

const STATE_LABELS: Readonly<Record<ServiceState, string>> = Object.freeze({
  unscheduled: 'No service scheduled',
  ok: 'On schedule',
  due_soon: 'Service due soon',
  due: 'Service due today',
  overdue: 'Service overdue',
});

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className={mono ? 'font-mono text-sm text-ink' : 'text-sm text-ink'}>{value}</dd>
    </div>
  );
}

export default async function PublicDevicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const repo = getRepository();
  const context = await repo.getDeviceContextByToken(token);
  // A wrong, revoked or made-up token is a 404 — never a message that says the token was
  // *nearly* right, and never a redirect that hints at what lives here.
  if (!context) notFound();

  const { device, location, organization } = context;

  // No session on a public page, so "today" comes from the organisation's own calendar —
  // the one the service schedule is kept in — rather than from the visitor's device.
  const today = civilDateInTimeZone(new Date(), organization.timezone);
  const status = serviceStatus({
    nextServiceDue: device.nextServiceDue,
    today,
    leadDays: organization.reminderLeadDays,
    deviceStatus: device.status,
  });

  const retired = device.status === 'retired';
  const address = [location.addressLine, location.postalCode, location.city]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return (
    <main id="main" className="min-h-dvh bg-surface-muted px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink-muted">{organization.name}</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
            {device.name}
          </h1>
        </header>

        <Card>
          <CardHeader className="gap-3">
            <CardTitle as="h2" className="sr-only">
              Service status
            </CardTitle>
            <div className="flex flex-col gap-2">
              <Badge variant={serviceStateBadgeVariant(status.state)} className="text-sm">
                {STATE_LABELS[status.state]}
              </Badge>

              <p className="text-base text-ink">
                {device.nextServiceDue && status.state !== 'unscheduled' ? (
                  <>
                    Next service {formatRelativeDays(device.nextServiceDue, today)} —{' '}
                    <span className="font-medium">{formatCivilLong(device.nextServiceDue)}</span>
                  </>
                ) : retired ? (
                  'This device is marked as out of service.'
                ) : (
                  'No service date is set for this device yet.'
                )}
              </p>

              {status.state === 'overdue' && status.daysUntilDue !== null ? (
                <p className="text-sm text-ink-muted">
                  It is {Math.abs(status.daysUntilDue)} days past its service date. Booking a
                  visit below is the quickest way to get it back on schedule.
                </p>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        {/* The two things a person at the machine ever wants. Nothing competes with them. */}
        <div className="flex flex-col gap-3">
          {retired ? (
            <p className="rounded-card border border-border-base bg-surface px-4 py-3 text-sm text-ink-muted">
              This device is no longer in service, so it cannot be booked online. If something is
              wrong with it, report it below and {organization.name} will pick it up.
            </p>
          ) : (
            <Button asChild size="lg" className="h-14 w-full text-base">
              <Link href={`/d/${token}/book`}>
                <CalendarPlus aria-hidden="true" className="size-5" />
                Book a service
              </Link>
            </Button>
          )}

          <Button asChild variant="secondary" size="lg" className="h-14 w-full text-base">
            <Link href={`/d/${token}/report`}>
              <TriangleAlert aria-hidden="true" className="size-5" />
              Report a problem
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">This device</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Manufacturer" value={device.manufacturer ?? '—'} />
              <Detail label="Model" value={device.model ?? '—'} />
              <Detail label="Serial number" value={device.serialNumber ?? '—'} mono />
              <Detail label="Installed" value={device.installedOn ? formatCivilLong(device.installedOn) : '—'} />
            </dl>

            <div className="mt-5 flex items-start gap-2 border-t border-border-base pt-4">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-ink">{location.name}</p>
                {address ? <p className="text-sm text-ink-muted">{address}</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <footer className="pb-4 text-center text-xs text-ink-subtle">
          <p>
            Serviced by {organization.name}. This page is private to whoever scans the code on
            this machine.
          </p>
        </footer>
      </div>
    </main>
  );
}
