import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle, Button } from '@/components/ui';
import { getRangeAvailability, type SlotUnavailableReason } from '@/domain/availability';
import {
  addDays,
  civilDateInTimeZone,
  diffDays,
  toUTCDate,
  tryCivilDate,
  weekdayOf,
  type CivilDate,
} from '@/domain/dates';
import { weekdayShortName } from '@/lib/weekdays';
import { getRepository } from '@/server/data';
import { collectBusyIntervals } from '@/server/service/scheduling';

import { BookingForm, type DayOption } from './booking-form';

/**
 * Public booking — pick a slot, leave a contact, done.
 *
 * Availability is computed here, on the server, by `getRangeAvailability` from the pure
 * domain layer: the organisation's business hours, its closed days, its slot length,
 * notice period and booking horizon, minus everything already on the calendar. The page
 * never decides any of that itself.
 *
 * Unavailable slots are rendered greyed *with their reason* rather than hidden. A day
 * that silently shows three boxes instead of five reads as a bug; "10:00–12:00 · already
 * booked" reads as an answer, and it is the difference between a customer picking another
 * time and a customer ringing up to ask what happened.
 *
 * What the browser sees is a snapshot, and it is never trusted. `submitBooking` re-runs
 * `validateSlotSelection` against freshly-read busy intervals before it writes — see the
 * note on that action for the race this closes.
 *
 * Exposes nothing the device page does not: the device, its site, and this organisation's
 * opening hours. Availability is expressed as free/busy only, so a competitor holding a
 * token learns when a slot is taken, never by whom or for what.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Book a service',
  description: 'Request a service visit for this device.',
  robots: { index: false, follow: false },
};

/** Days shown at once. Two weeks fits a phone's horizontal scroll without paging fatigue. */
const WINDOW_DAYS = 14;

/** Customer-facing wording for each reason a slot cannot be taken. */
function reasonText(reason: SlotUnavailableReason, leadHours: number): string {
  switch (reason) {
    case 'booked':
      return 'Already booked';
    case 'too_soon':
      return `Less than ${leadHours}h notice`;
    case 'past':
      return 'Already passed';
    case 'closed':
      return 'Closed';
    case 'blackout':
      return 'Closed that day';
    case 'beyond_horizon':
      return 'Too far ahead';
  }
}

/** `"11 Aug"` — compact enough for a day chip on a narrow phone. */
function dayNumberLabel(date: CivilDate): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(toUTCDate(date));
}

/** Minutes since local midnight in the organisation's timezone. See `intake.ts`. */
function nowMinuteInTimeZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export default async function BookDevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;

  const repo = getRepository();
  const context = await repo.getDeviceContextByToken(token);
  if (!context) notFound();

  const { device, organization } = context;
  if (device.status === 'retired') notFound();

  const now = new Date();
  const today = civilDateInTimeZone(now, organization.timezone);
  const nowMinute = nowMinuteInTimeZone(now, organization.timezone);

  // The engine refuses a horizon beyond a year; organisation settings allow two. Clamp
  // rather than throw — a generous setting should book a year out, not break the page.
  const horizonDays = Math.min(organization.bookingHorizonDays, 365);
  const lastDay = addDays(today, horizonDays);

  // `?from=` pages the window. Clamped into the bookable range, so a hand-edited URL can
  // only ever ask for days the organisation already accepts.
  const requestedFrom = typeof query.from === 'string' ? tryCivilDate(query.from) : null;
  const windowStart =
    requestedFrom && requestedFrom > today && requestedFrom <= lastDay ? requestedFrom : today;
  const windowDays = Math.max(1, Math.min(WINDOW_DAYS, diffDays(windowStart, lastDay) + 1));
  const windowEnd = addDays(windowStart, windowDays - 1);

  const [businessHours, blackouts, busy] = await Promise.all([
    repo.listBusinessHours(organization.id),
    repo.listBlackoutDates(organization.id),
    collectBusyIntervals(organization.id, organization, windowStart, windowEnd),
  ]);

  const availability = getRangeAvailability({
    from: windowStart,
    days: windowDays,
    businessHours,
    blackoutDates: blackouts.map((b) => b.date),
    busy,
    config: {
      slotMinutes: organization.slotMinutes,
      leadHours: organization.bookingLeadHours,
      horizonDays,
      capacity: 1,
    },
    today,
    nowMinute,
  });

  const days: DayOption[] = availability.map((day) => ({
    date: day.date,
    weekday: weekdayShortName(weekdayOf(day.date)),
    dayLabel: dayNumberLabel(day.date),
    availableCount: day.availableCount,
    slots: day.slots.map((slot) => ({
      startMinute: slot.startMinute,
      label: slot.label,
      available: slot.available,
      reason: slot.reason === null ? null : reasonText(slot.reason, organization.bookingLeadHours),
    })),
  }));

  const firstOpen = days.find((d) => d.availableCount > 0);
  const anythingBookable = firstOpen !== undefined;

  const previousStart = windowStart === today ? null : maxDate(today, addDays(windowStart, -WINDOW_DAYS));
  const nextStart = addDays(windowStart, windowDays);
  const hasNext = nextStart <= lastDay;

  return (
    <main id="main" className="min-h-dvh bg-surface-muted px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-3 w-fit">
            <Link href={`/d/${token}`}>
              <ArrowLeft aria-hidden="true" />
              Back to the device
            </Link>
          </Button>

          <header className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink-muted">{organization.name}</p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-ink">
              Book a service
            </h1>
            <p className="text-sm text-ink-muted">
              For {device.name}
              {device.serialNumber ? ` · ${device.serialNumber}` : ''}
            </p>
          </header>
        </div>

        {anythingBookable ? (
          <>
            {/* Window paging. Plain links, so it works before any JavaScript arrives. */}
            {previousStart !== null || hasNext ? (
              <nav aria-label="Change the dates shown" className="flex items-center justify-between gap-2">
                {previousStart !== null ? (
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/d/${token}/book?from=${previousStart}`}>
                      <ChevronLeft aria-hidden="true" />
                      Earlier
                    </Link>
                  </Button>
                ) : (
                  <span />
                )}
                {hasNext ? (
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/d/${token}/book?from=${nextStart}`}>
                      Later
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  </Button>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}

            <BookingForm
              token={token}
              deviceName={device.name}
              organizationName={organization.name}
              days={days}
              initialDate={firstOpen.date}
            />
          </>
        ) : (
          <Alert variant="warning">
            <AlertTitle>No times available between now and {dayNumberLabel(windowEnd)}</AlertTitle>
            <AlertDescription>
              <p>
                Nothing is free in this window
                {hasNext ? ', but there may be later dates.' : '.'} You can also report the problem
                and {organization.name} will get in touch.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2 pb-4">
          {!anythingBookable && hasNext ? (
            <Button variant="secondary" asChild className="w-full">
              <Link href={`/d/${token}/book?from=${nextStart}`}>Look at later dates</Link>
            </Button>
          ) : null}
          <Button variant="ghost" asChild className="w-full">
            <Link href={`/d/${token}/report`}>Something is wrong with it — report a problem</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

function maxDate(a: CivilDate, b: CivilDate): CivilDate {
  return a > b ? a : b;
}
