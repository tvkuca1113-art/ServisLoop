import {
  BellRing,
  CalendarClock,
  CalendarCheck,
  CircleCheck,
  Cpu,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

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
  type BadgeVariant,
} from '@/components/ui';
import {
  addDays,
  eachDay,
  formatCivilShort,
  formatRelativeDays,
  isWithin,
  tryCivilDate,
  type CivilDate,
} from '@/domain/dates';
import { can } from '@/domain/permissions';
import { bucketUpcomingServices, computeDashboardKpis } from '@/domain/reports';
import { compareByUrgency, serviceStatus } from '@/domain/service-interval';
import type {
  Booking,
  Customer,
  Device,
  Issue,
  IssueSeverity,
  Location,
  Profile,
  WorkOrder,
} from '@/domain/types';
import { KIND_LABELS, PRIORITY_LABELS, STATUS_LABELS, compareWorkOrders, isTerminal } from '@/domain/work-order';
import { cn } from '@/lib/utils';
import { requireSession } from '@/server/auth/context';
import { getRepository } from '@/server/data';

/**
 * The landing screen.
 *
 * Its whole job is to answer "what needs doing" before anyone has clicked anything. Two
 * rules follow from that:
 *
 * - **Every figure is a link to the rows behind it.** A number nobody can drill into is a
 *   number nobody trusts. Each tile lands on the list that would produce the same count.
 * - **Every figure comes from `computeDashboardKpis`.** The dashboard, the device register
 *   and the reports page must never disagree about what "overdue" means, so none of them
 *   counts anything itself — they all pass rows and `session.today` to the domain.
 *
 * A technician sees something different, and deliberately so. Org-wide compliance is not
 * their work; their assigned jobs are. So for that role the page leads with their own
 * board and drops the KPI row entirely, rather than showing seven numbers they cannot act
 * on. Everyone else gets the operational picture first.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'What is overdue, due soon and in progress today.',
};

/** How far ahead the schedule strip looks. */
const SCHEDULE_DAYS = 7;

/** Enough to act on; the full list is one click away. */
const ATTENTION_LIMIT = 8;

const SEVERITY_LABELS: Readonly<Record<IssueSeverity, string>> = Object.freeze({
  low: 'Minor',
  normal: 'Working badly',
  high: 'Not working',
  critical: 'Dangerous',
});

const SEVERITY_BADGE: Readonly<Record<IssueSeverity, BadgeVariant>> = Object.freeze({
  low: 'neutral',
  normal: 'soon',
  high: 'due',
  critical: 'overdue',
});

interface Directory {
  deviceById: Map<string, Device>;
  locationById: Map<string, Location>;
  customerById: Map<string, Customer>;
  profileById: Map<string, Profile>;
}

export default async function DashboardPage() {
  const session = await requireSession();

  const repo = getRepository();
  const orgId = session.organization.id;
  const today = session.today;

  const [devices, workOrders, issues, bookings, locations, customers, memberships] =
    await Promise.all([
      repo.listDevices(orgId),
      repo.listWorkOrders(orgId),
      repo.listIssues(orgId),
      repo.listBookings(orgId),
      repo.listLocations(orgId),
      repo.listCustomers(orgId),
      repo.listMemberships(orgId),
    ]);

  const profiles = await repo.listProfiles(memberships.map((m) => m.userId));

  const directory: Directory = {
    deviceById: new Map(devices.map((d) => [d.id, d])),
    locationById: new Map(locations.map((l) => [l.id, l])),
    customerById: new Map(customers.map((c) => [c.id, c])),
    profileById: new Map(profiles.map((p) => [p.id, p])),
  };

  const leadDays = session.organization.reminderLeadDays;
  const kpis = computeDashboardKpis({ devices, workOrders, issues, bookings, today, leadDays });

  // Oldest first: the device that has been overdue longest is the one the customer will
  // ask about. `compareByUrgency` sorts by due date ascending and pushes unscheduled last.
  const overdueDevices = devices
    .filter(
      (device) =>
        serviceStatus({
          nextServiceDue: device.nextServiceDue,
          today,
          leadDays,
          deviceStatus: device.status,
        }).state === 'overdue',
    )
    .sort(compareByUrgency);

  const scheduleTo = addDays(today, SCHEDULE_DAYS - 1);
  const scheduled = workOrders
    .filter((wo) => !isTerminal(wo.status) && wo.scheduledFor !== null)
    .filter((wo) => {
      const day = tryCivilDate((wo.scheduledFor ?? '').slice(0, 10));
      return day !== null && isWithin(day, today, scheduleTo);
    })
    .sort(compareWorkOrders);

  const myJobs = workOrders
    .filter((wo) => wo.assignedTo === session.user.id && !isTerminal(wo.status))
    .sort(compareWorkOrders);

  const pendingBookings = bookings.filter((b) => b.status === 'pending');
  const openIssues = issues.filter((i) => i.status === 'open' || i.status === 'triaged');
  const unassigned = workOrders.filter((wo) => !isTerminal(wo.status) && !wo.assignedTo);

  const workload = bucketUpcomingServices(devices, today);

  const greeting = session.user.fullName?.split(' ')[0] ?? null;

  if (session.role === 'technician') {
    return (
      <TechnicianDashboard
        greeting={greeting}
        today={today}
        myJobs={myJobs}
        overdueDevices={overdueDevices}
        directory={directory}
        canOpenJob={can(session.role, 'work_order:create')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {greeting ? `Good day, ${greeting}` : 'Dashboard'}
        </h1>
        <p className="text-sm text-ink-muted">
          {session.organization.name} · {formatCivilShort(today)} ·{' '}
          {kpis.overdueCount === 0
            ? 'nothing overdue'
            : `${kpis.overdueCount} device${kpis.overdueCount === 1 ? '' : 's'} overdue`}
          .
        </p>
      </header>

      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          href="/app/devices?overdue=1"
          label="Overdue devices"
          value={kpis.overdueCount}
          hint="Past their service date"
          tone={kpis.overdueCount > 0 ? 'overdue' : 'ok'}
          icon={<Cpu />}
        />
        <KpiTile
          href="/app/devices?status=active"
          label={`Due within ${leadDays} days`}
          value={kpis.dueSoonCount}
          hint="The register, soonest first"
          tone={kpis.dueSoonCount > 0 ? 'soon' : 'ok'}
          icon={<CalendarClock />}
        />
        <KpiTile
          href="/app/work-orders?mineSet=1&mine=0"
          label="Open jobs"
          value={kpis.openWorkOrders}
          hint={`${kpis.workOrdersByStatus.in_progress} in progress`}
          tone="neutral"
          icon={<Wrench />}
        />
        <KpiTile
          href="/app/work-orders?mineSet=1&mine=0"
          label="Waiting for a technician"
          value={kpis.unassignedWorkOrders}
          hint="Open jobs with nobody assigned"
          tone={kpis.unassignedWorkOrders > 0 ? 'due' : 'ok'}
          icon={<Wrench />}
        />
        <KpiTile
          href="/app/issues"
          label="Open issues"
          value={kpis.openIssues}
          hint={
            kpis.criticalIssues > 0
              ? `${kpis.criticalIssues} reported as dangerous`
              : 'Reported from the QR pages'
          }
          tone={kpis.criticalIssues > 0 ? 'overdue' : kpis.openIssues > 0 ? 'soon' : 'ok'}
          icon={<TriangleAlert />}
        />
        <KpiTile
          href="/app/bookings"
          label="Booking requests"
          value={kpis.pendingBookings}
          hint="Waiting to be confirmed or declined"
          tone={kpis.pendingBookings > 0 ? 'soon' : 'ok'}
          icon={<CalendarCheck />}
        />
        <KpiTile
          href="/app/reports"
          label="Compliance"
          value={`${kpis.complianceRate}%`}
          hint="Scheduled devices not overdue"
          tone={kpis.complianceRate >= 100 ? 'ok' : kpis.complianceRate >= 90 ? 'soon' : 'overdue'}
          icon={<CircleCheck />}
        />
        <KpiTile
          href="/app/reminders"
          label="Devices on schedule"
          value={kpis.devicesByState.ok}
          hint={`${kpis.devicesActive} active of ${kpis.devicesTotal} in the register`}
          tone="neutral"
          icon={<BellRing />}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <NeedsAttention
          overdueDevices={overdueDevices}
          unassigned={unassigned}
          directory={directory}
          today={today}
        />
        <SevenDays today={today} scheduled={scheduled} directory={directory} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Triage
          bookings={pendingBookings}
          issues={openIssues}
          directory={directory}
          today={today}
        />
        <Workload buckets={workload} overdueCount={kpis.overdueCount} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Technician view                                                     */
/* ------------------------------------------------------------------ */

/**
 * What a technician opens ServisLoop for.
 *
 * Their own jobs, in the order `compareWorkOrders` says to do them — urgent first, then by
 * scheduled date. No compliance rate, no booking queue, no org-wide counts: a technician
 * cannot confirm a booking or triage an issue, and a dashboard full of other people's work
 * is a dashboard nobody reads.
 */
function TechnicianDashboard({
  greeting,
  today,
  myJobs,
  overdueDevices,
  directory,
  canOpenJob,
}: {
  greeting: string | null;
  today: CivilDate;
  myJobs: readonly WorkOrder[];
  overdueDevices: readonly Device[];
  directory: Directory;
  canOpenJob: boolean;
}) {
  const todayJobs = myJobs.filter((wo) => (wo.scheduledFor ?? '').slice(0, 10) === today);
  const inProgress = myJobs.filter((wo) => wo.status === 'in_progress');
  const late = myJobs.filter((wo) => {
    const day = tryCivilDate((wo.scheduledFor ?? '').slice(0, 10));
    return day !== null && day < today;
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {greeting ? `Good day, ${greeting}` : 'My jobs'}
        </h1>
        <p className="text-sm text-ink-muted">
          {formatCivilShort(today)} ·{' '}
          {myJobs.length === 0
            ? 'nothing assigned to you'
            : `${myJobs.length} open, ${todayJobs.length} scheduled for today`}
          .
        </p>
      </header>

      <section aria-label="My workload" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          href="/app/work-orders?mineSet=1&mine=1"
          label="My open jobs"
          value={myJobs.length}
          hint="Assigned to you and not finished"
          tone="neutral"
          icon={<Wrench />}
        />
        <KpiTile
          href="/app/work-orders?mineSet=1&mine=1&window=today"
          label="Scheduled today"
          value={todayJobs.length}
          hint="On your calendar for today"
          tone={todayJobs.length > 0 ? 'soon' : 'ok'}
          icon={<CalendarClock />}
        />
        <KpiTile
          href="/app/work-orders?mineSet=1&mine=1&status=in_progress"
          label="In progress"
          value={inProgress.length}
          hint="Started but not closed"
          tone="neutral"
          icon={<Wrench />}
        />
        <KpiTile
          href="/app/work-orders?mineSet=1&mine=1&window=overdue"
          label="Past their slot"
          value={late.length}
          hint="Scheduled before today, still open"
          tone={late.length > 0 ? 'overdue' : 'ok'}
          icon={<TriangleAlert />}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Next up</CardTitle>
          <CardDescription>
            Your jobs in the order to do them — urgent first, then by scheduled date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {myJobs.length === 0 ? (
            <EmptyState
              titleAs="h3"
              icon={<Wrench />}
              title="Nothing assigned to you"
              description="When a dispatcher assigns you a job it appears here, most urgent first."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/app/work-orders?mineSet=1&mine=0">See the whole board</Link>
                </Button>
              }
            />
          ) : (
            <WorkOrderTable
              orders={myJobs.slice(0, ATTENTION_LIMIT)}
              directory={directory}
              today={today}
              showAssignee={false}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Overdue in the register</CardTitle>
          <CardDescription>
            Devices past their service date. Nobody may have opened a job for them yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overdueDevices.length === 0 ? (
            <EmptyState
              titleAs="h3"
              icon={<CircleCheck />}
              title="Nothing overdue"
              description="Every active device with a due date is inside its interval."
            />
          ) : (
            <DeviceTable
              devices={overdueDevices.slice(0, ATTENTION_LIMIT)}
              total={overdueDevices.length}
              directory={directory}
              today={today}
              canOpenJob={canOpenJob}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

function NeedsAttention({
  overdueDevices,
  unassigned,
  directory,
  today,
}: {
  overdueDevices: readonly Device[];
  unassigned: readonly WorkOrder[];
  directory: Directory;
  today: CivilDate;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Needs attention</CardTitle>
        <CardDescription>
          Devices past their service date, longest-overdue first, then jobs nobody is holding.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {overdueDevices.length === 0 ? (
          <EmptyState
            titleAs="h3"
            icon={<CircleCheck />}
            title="Nothing overdue"
            description="Every active device with a due date is inside its interval."
          />
        ) : (
          <DeviceTable
            devices={overdueDevices.slice(0, ATTENTION_LIMIT)}
            total={overdueDevices.length}
            directory={directory}
            today={today}
            canOpenJob
          />
        )}

        {unassigned.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">
              {unassigned.length} open job{unassigned.length === 1 ? '' : 's'} waiting for a
              technician
            </h3>
            <ul className="flex flex-col gap-1">
              {unassigned.slice(0, 5).map((wo) => (
                <li key={wo.id} className="text-sm">
                  <Link
                    href={`/app/work-orders/${wo.id}`}
                    className="font-mono font-medium text-ink hover:text-brand-600 hover:underline"
                  >
                    {wo.code}
                  </Link>{' '}
                  <span className="text-ink-muted">
                    {directory.deviceById.get(wo.deviceId)?.name ?? 'Device removed'} ·{' '}
                    {PRIORITY_LABELS[wo.priority]} priority
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/app/work-orders?mineSet=1&mine=0">Open the job board</Link>
              </Button>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The week ahead.
 *
 * Every day is listed, including the empty ones — a gap in the calendar is information,
 * and a list that silently omits Thursday makes it look busy.
 */
function SevenDays({
  today,
  scheduled,
  directory,
}: {
  today: CivilDate;
  scheduled: readonly WorkOrder[];
  directory: Directory;
}) {
  const days = eachDay(today, addDays(today, SCHEDULE_DAYS - 1));

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Next 7 days</CardTitle>
        <CardDescription>
          {scheduled.length === 0
            ? 'Nothing is on the calendar this week.'
            : `${scheduled.length} job${scheduled.length === 1 ? '' : 's'} scheduled between now and ${formatCivilShort(addDays(today, SCHEDULE_DAYS - 1))}.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {days.map((day) => {
          const jobs = scheduled.filter((wo) => (wo.scheduledFor ?? '').slice(0, 10) === day);

          return (
            <div key={day} className="flex flex-col gap-1.5 border-b border-border-base pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-ink">{formatCivilShort(day)}</span>
                <span className="text-xs text-ink-subtle">{formatRelativeDays(day, today)}</span>
              </div>

              {jobs.length === 0 ? (
                <p className="text-sm text-ink-subtle">Nothing scheduled</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {jobs.map((wo) => {
                    const device = directory.deviceById.get(wo.deviceId) ?? null;
                    const customer = directory.customerById.get(wo.customerId) ?? null;
                    const assignee = wo.assignedTo
                      ? directory.profileById.get(wo.assignedTo)
                      : undefined;
                    const time = (wo.scheduledFor ?? '').slice(11, 16);

                    return (
                      <li key={wo.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        {time ? (
                          <span className="tabular font-medium text-ink">{time}</span>
                        ) : null}
                        <Link
                          href={`/app/work-orders/${wo.id}`}
                          className="text-ink hover:text-brand-600 hover:underline"
                        >
                          {device?.name ?? wo.code}
                        </Link>
                        <span className="text-ink-muted">
                          {customer ? `· ${customer.name}` : ''}{' '}
                          {assignee
                            ? `· ${assignee.fullName ?? assignee.email}`
                            : '· unassigned'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Triage({
  bookings,
  issues,
  directory,
  today,
}: {
  bookings: readonly Booking[];
  issues: readonly Issue[];
  directory: Directory;
  today: CivilDate;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">From your customers</CardTitle>
        <CardDescription>
          Booking requests and fault reports submitted from the QR pages, waiting for a decision.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">
            {bookings.length} booking request{bookings.length === 1 ? '' : 's'}
          </h3>
          {bookings.length === 0 ? (
            <p className="text-sm text-ink-subtle">Nothing waiting.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {bookings.slice(0, 4).map((booking) => {
                const device = directory.deviceById.get(booking.deviceId) ?? null;
                return (
                  <li key={booking.id} className="text-sm">
                    <span className="font-medium text-ink">{booking.contactName}</span>{' '}
                    <span className="text-ink-muted">
                      · {device?.name ?? 'Device removed'} ·{' '}
                      {formatCivilShort(booking.requestedDate)} (
                      {formatRelativeDays(booking.requestedDate, today)})
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app/bookings">Open bookings</Link>
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">
            {issues.length} open issue{issues.length === 1 ? '' : 's'}
          </h3>
          {issues.length === 0 ? (
            <p className="text-sm text-ink-subtle">Nothing reported.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {[...issues]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 4)
                .map((issue) => {
                  const device = directory.deviceById.get(issue.deviceId) ?? null;
                  return (
                    <li key={issue.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={SEVERITY_BADGE[issue.severity]}>
                        {SEVERITY_LABELS[issue.severity]}
                      </Badge>
                      <span className="text-ink">{issue.title}</span>
                      <span className="text-ink-muted">· {device?.name ?? 'Device removed'}</span>
                    </li>
                  );
                })}
            </ul>
          )}
          <div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app/issues">Open issue triage</Link>
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

/**
 * How much work is landing over the next quarter.
 *
 * The bars are decoration for numbers that are already written out beside them: the count
 * is in text on every row, so the panel reads identically in greyscale. Overdue is shown
 * first and separately, because `bucketUpcomingServices` deliberately does not fold a
 * backlog into "next 7 days" — a device that was due in March is not this week's work.
 */
function Workload({
  buckets,
  overdueCount,
}: {
  buckets: ReadonlyArray<{ label: string; from: CivilDate; to: CivilDate; count: number }>;
  overdueCount: number;
}) {
  const peak = Math.max(overdueCount, ...buckets.map((b) => b.count), 1);

  const rows = [
    {
      key: 'overdue',
      label: 'Already overdue',
      detail: 'Past their service date',
      count: overdueCount,
      fill: 'bg-state-overdue',
      href: '/app/devices?overdue=1',
    },
    ...buckets.map((bucket) => ({
      key: bucket.label,
      label: bucket.label,
      detail: `${formatCivilShort(bucket.from)} – ${formatCivilShort(bucket.to)}`,
      count: bucket.count,
      fill: bucket.label === 'Next 7 days' ? 'bg-state-due' : 'bg-brand-600',
      href: '/app/devices?status=active',
    })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Workload ahead</CardTitle>
        <CardDescription>
          Active devices falling due, by window. Overdue work is counted separately rather than
          folded into this week.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Link
                href={row.href}
                className="text-sm font-medium text-ink hover:text-brand-600 hover:underline"
              >
                {row.label}
              </Link>
              <span className="tabular text-sm text-ink">
                {row.count} device{row.count === 1 ? '' : 's'}
              </span>
            </div>

            <div
              aria-hidden="true"
              className="h-2 w-full overflow-hidden rounded-full bg-surface-muted ring-1 ring-inset ring-border-base"
            >
              <div
                className={cn('h-full rounded-full', row.fill)}
                style={{ width: `${Math.round((row.count / peak) * 100)}%` }}
              />
            </div>

            <span className="text-xs text-ink-subtle">{row.detail}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Shared tables                                                       */
/* ------------------------------------------------------------------ */

function DeviceTable({
  devices,
  total,
  directory,
  today,
  canOpenJob,
}: {
  devices: readonly Device[];
  total: number;
  directory: Directory;
  today: CivilDate;
  canOpenJob: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>Customer · Site</TableHead>
            <TableHead>Was due</TableHead>
            {canOpenJob ? <TableHead className="text-right">Action</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device) => {
            const location = directory.locationById.get(device.locationId) ?? null;
            const customer = location
              ? (directory.customerById.get(location.customerId) ?? null)
              : null;

            return (
              <TableRow key={device.id}>
                <TableCell>
                  <Link
                    href={`/app/devices/${device.id}`}
                    className="font-medium text-ink hover:text-brand-600 hover:underline"
                  >
                    {device.name}
                  </Link>
                </TableCell>

                <TableCell className="text-sm">
                  <span className="text-ink">{customer?.name ?? '—'}</span>
                  {location ? (
                    <span className="block text-xs text-ink-muted">{location.name}</span>
                  ) : null}
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant="overdue">
                      {device.nextServiceDue
                        ? formatRelativeDays(device.nextServiceDue, today)
                        : 'No due date'}
                    </Badge>
                    <span className="whitespace-nowrap text-xs text-ink-muted">
                      {device.nextServiceDue ? formatCivilShort(device.nextServiceDue) : '—'}
                    </span>
                  </div>
                </TableCell>

                {canOpenJob ? (
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/app/work-orders/new?device=${device.id}`}>Open a job</Link>
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {total > devices.length ? (
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app/devices?overdue=1">
              See all {total} overdue devices
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function WorkOrderTable({
  orders,
  directory,
  today,
  showAssignee,
}: {
  orders: readonly WorkOrder[];
  directory: Directory;
  today: CivilDate;
  showAssignee: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Device</TableHead>
          <TableHead>Customer · Site</TableHead>
          <TableHead>Scheduled</TableHead>
          {showAssignee ? <TableHead>Assignee</TableHead> : null}
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((wo) => {
          const device = directory.deviceById.get(wo.deviceId) ?? null;
          const location = directory.locationById.get(wo.locationId) ?? null;
          const customer = directory.customerById.get(wo.customerId) ?? null;
          const assignee = wo.assignedTo ? directory.profileById.get(wo.assignedTo) : undefined;
          const day = tryCivilDate((wo.scheduledFor ?? '').slice(0, 10));

          return (
            <TableRow key={wo.id}>
              <TableCell>
                <Link
                  href={`/app/work-orders/${wo.id}`}
                  className="font-mono text-sm font-medium text-ink hover:text-brand-600 hover:underline"
                >
                  {wo.code}
                </Link>
                <span className="block text-xs text-ink-subtle">{KIND_LABELS[wo.kind]}</span>
              </TableCell>

              <TableCell className="text-sm text-ink">{device?.name ?? 'Device removed'}</TableCell>

              <TableCell className="text-sm">
                <span className="text-ink">{customer?.name ?? '—'}</span>
                {location ? (
                  <span className="block text-xs text-ink-muted">{location.name}</span>
                ) : null}
              </TableCell>

              <TableCell className="text-sm">
                {day ? (
                  <>
                    <span className="block whitespace-nowrap text-ink">
                      {formatCivilShort(day)}
                      {(wo.scheduledFor ?? '').slice(11, 16)
                        ? ` · ${(wo.scheduledFor ?? '').slice(11, 16)}`
                        : ''}
                    </span>
                    <span className="text-xs text-ink-muted">{formatRelativeDays(day, today)}</span>
                  </>
                ) : (
                  <span className="text-ink-subtle">Not scheduled</span>
                )}
              </TableCell>

              {showAssignee ? (
                <TableCell className="text-sm text-ink-muted">
                  {assignee?.fullName ?? assignee?.email ?? 'Unassigned'}
                </TableCell>
              ) : null}

              <TableCell>
                <Badge variant={wo.status === 'in_progress' ? 'due' : 'soon'}>
                  {STATUS_LABELS[wo.status]}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/* ------------------------------------------------------------------ */
/* Tiles                                                               */
/* ------------------------------------------------------------------ */

const TILE_TONE = {
  ok: 'text-state-ok',
  soon: 'text-state-soon',
  due: 'text-state-due',
  overdue: 'text-state-overdue',
  neutral: 'text-ink-subtle',
} as const;

/**
 * One figure, and the list it came from.
 *
 * The whole tile is the link, so the click target is the card rather than a word inside
 * it. Colour is an accent on the icon only: the label states what the number is and the
 * hint states what you will see when you follow it, so the tile survives greyscale.
 */
function KpiTile({
  href,
  label,
  value,
  hint,
  tone,
  icon,
}: {
  href: string;
  label: string;
  value: number | string;
  hint: string;
  tone: keyof typeof TILE_TONE;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-card border border-border-base bg-surface-raised p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-muted"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('[&_svg]:size-4', TILE_TONE[tone])}>
          {icon}
        </span>
        <span className="text-sm font-medium text-ink-muted">{label}</span>
      </span>
      <span className="tabular text-3xl font-semibold leading-tight text-ink">{value}</span>
      <span className="text-xs text-ink-subtle">{hint}</span>
    </Link>
  );
}
