import { BellRing, Search, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  type BadgeVariant,
} from '@/components/ui';
import { formatCivilShort, formatRelativeDays, tryCivilDate } from '@/domain/dates';
import type { CivilDate } from '@/domain/dates';
import { can } from '@/domain/permissions';
import { STAGE_LABELS, selectDueReminders, selectStaleReminders } from '@/domain/reminders';
import {
  REMINDER_STAGES,
  REMINDER_STATUSES,
  type Customer,
  type Device,
  type Location,
  type Reminder,
  type ReminderStage,
  type ReminderStatus,
} from '@/domain/types';
import { cn } from '@/lib/utils';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';
import { REMINDER_GRACE_DAYS } from '@/server/notify/dispatch';

import { DispatchNowButton, RetryReminderButton } from './reminder-actions';

/**
 * The reminder log.
 *
 * Every row here was *derived*, never entered: a device with a due date generates a fixed
 * ladder — 30 days out, 7 days out, on the day, and once more a week after it goes overdue
 * — and `planReminders` is the only thing that builds it. So this page is a read of a
 * decision made elsewhere, and the useful questions it answers are "did it go out?" and
 * "is anything stuck?".
 *
 * The stale group at the top is the second question. A pending reminder whose send date
 * passed more than {@link REMINDER_GRACE_DAYS} days ago is never sent — telling a customer
 * their service "is due in 7 days" three weeks late is worse than saying nothing — but it
 * is also never quietly rewritten, because a growing pile of stale rows is the only signal
 * that the scheduler has stopped running.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reminders',
  description: 'The service reminder ladder and its send log.',
};

/** Native controls, matching the device register's filter bar. */
const CONTROL_CLASS =
  'h-9 rounded-md border border-border-base bg-surface px-3 text-sm text-ink shadow-sm transition-colors hover:border-border-strong';

/** The log is a table, not an archive browser; beyond this a filter is the right tool. */
const LOG_LIMIT = 500;

const STATUS_LABELS: Readonly<Record<ReminderStatus, string>> = Object.freeze({
  pending: 'Scheduled',
  sent: 'Sent',
  skipped: 'Skipped',
  failed: 'Failed',
});

const STATUS_BADGE: Readonly<Record<ReminderStatus, BadgeVariant>> = Object.freeze({
  pending: 'soon',
  sent: 'ok',
  skipped: 'neutral',
  failed: 'overdue',
});

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function isStatus(value: string): value is ReminderStatus {
  return (REMINDER_STATUSES as readonly string[]).includes(value);
}

function isStage(value: string): value is ReminderStage {
  return (REMINDER_STAGES as readonly string[]).includes(value);
}

interface Row {
  reminder: Reminder;
  device: Device | null;
  location: Location | null;
  customer: Customer | null;
}

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePermission('reminder:read');
  const params = await searchParams;

  const statusParam = firstParam(params.status);
  const statusFilter = isStatus(statusParam) ? statusParam : null;
  const stageParam = firstParam(params.stage);
  const stageFilter = isStage(stageParam) ? stageParam : null;

  const repo = getRepository();
  const orgId = session.organization.id;

  const [logRows, pendingRows, devices, locations, customers] = await Promise.all([
    repo.listReminders(orgId, {
      ...(statusFilter === null ? {} : { status: statusFilter }),
      limit: LOG_LIMIT,
    }),
    // Fetched separately and unfiltered by the page's own controls: the stale warning and
    // the "due now" count are facts about the queue, not about what is on screen.
    repo.listReminders(orgId, { status: 'pending' }),
    repo.listDevices(orgId),
    repo.listLocations(orgId),
    repo.listCustomers(orgId),
  ]);

  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const decorate = (reminder: Reminder): Row => {
    const device = deviceById.get(reminder.deviceId) ?? null;
    const location = device ? (locationById.get(device.locationId) ?? null) : null;
    const customer = location ? (customerById.get(location.customerId) ?? null) : null;
    return { reminder, device, location, customer };
  };

  const stale = selectStaleReminders(pendingRows, session.today, REMINDER_GRACE_DAYS);
  const staleIds = new Set(stale.map((r) => r.id));
  const dueNow = selectDueReminders({
    reminders: pendingRows,
    today: session.today,
    graceDays: REMINDER_GRACE_DAYS,
  });

  const rows = logRows
    .filter((r) => (stageFilter === null ? true : r.stage === stageFilter))
    .sort(compareForLog)
    .map(decorate);

  const filtered = statusFilter !== null || stageFilter !== null;
  const canManage = can(session.role, 'reminder:manage');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Reminders</h1>
          <p className="text-sm text-ink-muted">
            {pendingRows.length} scheduled
            {dueNow.length > 0 ? `, ${dueNow.length} ready to send` : ', none due today'}
            {stale.length > 0 ? `, ${stale.length} stuck` : ''}.
          </p>
        </div>

        {canManage ? <DispatchNowButton dueCount={dueNow.length} /> : null}
      </header>

      {stale.length > 0 ? (
        <Alert variant="warning" icon={<TriangleAlert />} role="status">
          <AlertTitle>
            {stale.length} reminder{stale.length === 1 ? '' : 's'} went past its send date
          </AlertTitle>
          <AlertDescription>
            <p>
              These were due to go out more than {REMINDER_GRACE_DAYS} days ago and are now too
              late to be worth sending — a &ldquo;due in 7 days&rdquo; notice that arrives three
              weeks afterwards is worse than nothing. They are left as scheduled rather than
              quietly closed, because a growing pile here is the signal that the dispatch job
              has stopped running.
            </p>

            <ul className="mt-3 flex flex-col gap-1">
              {stale.slice(0, 8).map((reminder) => {
                const row = decorate(reminder);
                return (
                  <li key={reminder.id} className="text-sm">
                    <DeviceLink row={row} />{' '}
                    <span className="text-ink-muted">
                      — {STAGE_LABELS[reminder.stage]}, due to send{' '}
                      {formatCivilShort(reminder.scheduledFor)} (
                      {formatRelativeDays(reminder.scheduledFor, session.today)})
                    </span>
                  </li>
                );
              })}
              {stale.length > 8 ? (
                <li className="text-sm text-ink-muted">…and {stale.length - 8} more.</li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {/*
        A plain GET form with native controls, matching the device register and the job
        board. The filter belongs in the URL — bookmarkable, shareable, survives a refresh,
        and the back button undoes it.
      */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-border-base bg-surface-muted p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reminder-status" className="text-sm font-medium text-ink">
            Status
          </label>
          <select
            id="reminder-status"
            name="status"
            defaultValue={statusFilter ?? ''}
            className={cn(CONTROL_CLASS, 'min-w-40')}
          >
            <option value="">Any status</option>
            {REMINDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reminder-stage" className="text-sm font-medium text-ink">
            Stage
          </label>
          <select
            id="reminder-stage"
            name="stage"
            defaultValue={stageFilter ?? ''}
            className={cn(CONTROL_CLASS, 'min-w-44')}
          >
            <option value="">Every stage</option>
            {REMINDER_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Apply
        </Button>

        {filtered ? (
          <Button variant="ghost" asChild>
            <Link href="/app/reminders">Clear</Link>
          </Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BellRing />}
          title={filtered ? 'No reminders match those filters' : 'No reminders yet'}
          description={
            filtered
              ? 'Widen the filters, or clear them to see the whole log.'
              : 'Reminders are generated from device due dates. Give a device a service interval and an installation or last-service date, and its ladder appears here.'
          }
          action={
            filtered ? (
              <Button variant="secondary" asChild>
                <Link href="/app/reminders">Clear filters</Link>
              </Button>
            ) : (
              <Button variant="secondary" asChild>
                <Link href="/app/devices">Open the device register</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-card border border-border-base bg-surface-raised">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Customer · Site</TableHead>
                <TableHead>Service due</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Sends on</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => {
                const { reminder } = row;
                const isStale = staleIds.has(reminder.id);

                return (
                  <TableRow key={reminder.id}>
                    <TableCell>
                      <DeviceLink row={row} />
                    </TableCell>

                    <TableCell className="text-sm">
                      {row.customer ? (
                        <Link
                          href={`/app/customers/${row.customer.id}`}
                          className="text-ink hover:text-brand-600 hover:underline"
                        >
                          {row.customer.name}
                        </Link>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                      {row.location ? (
                        <span className="block text-xs text-ink-muted">{row.location.name}</span>
                      ) : null}
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-sm text-ink">
                      {formatCivilShort(reminder.dueDate)}
                    </TableCell>

                    <TableCell className="text-sm text-ink-muted">
                      {STAGE_LABELS[reminder.stage]}
                    </TableCell>

                    <TableCell className="text-sm">
                      <span className="block whitespace-nowrap text-ink">
                        {formatCivilShort(reminder.scheduledFor)}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {formatRelativeDays(reminder.scheduledFor, session.today)}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={isStale ? 'overdue' : STATUS_BADGE[reminder.status]}>
                          {isStale ? 'Missed its window' : STATUS_LABELS[reminder.status]}
                        </Badge>
                        {reminder.sentAt ? (
                          <span className="whitespace-nowrap text-xs text-ink-muted">
                            {formatInstant(reminder.sentAt)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell className="max-w-72 text-sm">
                      {reminder.error ? (
                        <span
                          className={cn(
                            'block text-pretty',
                            reminder.status === 'failed' ? 'text-state-overdue' : 'text-ink-muted',
                          )}
                        >
                          {reminder.error}
                        </span>
                      ) : reminder.status === 'sent' ? (
                        <span className="text-ink-muted">Delivered to the transport</span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </TableCell>

                    {canManage ? (
                      <TableCell className="text-right">
                        {reminder.status === 'failed' || reminder.status === 'skipped' ? (
                          <div className="flex justify-end">
                            <RetryReminderButton
                              reminderId={reminder.id}
                              deviceName={row.device?.name ?? 'this device'}
                            />
                          </div>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {logRows.length >= LOG_LIMIT ? (
        <p className="text-sm text-ink-subtle">
          Showing the first {LOG_LIMIT} reminders. Narrow the status or stage filter to see the
          rest.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">How reminders go out</CardTitle>
          <CardDescription>
            The ladder is derived from the due date, so it never has to be maintained by hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-ink-muted">
          <ul className="flex flex-col gap-1">
            {REMINDER_STAGES.map((stage) => (
              <li key={stage}>
                <span className="font-medium text-ink">{STAGE_LABELS[stage]}</span> —{' '}
                {stage === 'OVERDUE'
                  ? 'a final notice a week after the date passed'
                  : 'a notice relative to the service due date'}
                .
              </li>
            ))}
          </ul>
          <p>
            Sending is driven by <code className="font-mono text-xs">POST /api/cron/reminders</code>
            , authenticated with <code className="font-mono text-xs">CRON_SECRET</code>. It is
            safe to run more than once: each reminder is unique on{' '}
            <code className="font-mono text-xs">(device, due date, stage)</code>, only scheduled
            rows are ever picked up, and a row moves to sent the moment it is handed over — so a
            repeat run finds nothing left to do.
          </p>
          <p>
            With no email provider configured, the rendered message is written to the server log
            instead. Connecting a provider means implementing one interface in{' '}
            <code className="font-mono text-xs">src/server/notify/transport.ts</code> and nothing
            else.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Log ordering.
 *
 * Scheduled reminders first, soonest send date at the top — that is the queue, and its head
 * is what goes out next. Everything already dealt with follows, most recent first, which is
 * how a log is read.
 */
function compareForLog(a: Reminder, b: Reminder): number {
  const aPending = a.status === 'pending';
  const bPending = b.status === 'pending';
  if (aPending !== bPending) return aPending ? -1 : 1;
  if (aPending) return a.scheduledFor.localeCompare(b.scheduledFor) || a.id.localeCompare(b.id);
  return b.scheduledFor.localeCompare(a.scheduledFor) || a.id.localeCompare(b.id);
}

function DeviceLink({ row }: { row: Row }) {
  if (!row.device) {
    return <span className="text-sm text-ink-subtle">Device removed</span>;
  }
  return (
    <Link
      href={`/app/devices/${row.device.id}`}
      className="font-medium text-ink hover:text-brand-600 hover:underline"
    >
      {row.device.name}
    </Link>
  );
}

/** `2026-08-02T09:15:00.000Z` → `2 Aug 2026 · 09:15`. Never used for storage. */
function formatInstant(instant: string): string {
  const day: CivilDate | null = tryCivilDate(instant.slice(0, 10));
  if (!day) return instant;
  const time = instant.slice(11, 16);
  return time ? `${formatCivilShort(day)} · ${time}` : formatCivilShort(day);
}
