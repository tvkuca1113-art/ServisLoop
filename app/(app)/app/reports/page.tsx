import { Download, FileText, Search } from 'lucide-react';
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
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import {
  addDays,
  diffDays,
  formatCivilShort,
  isWithin,
  startOfMonth,
  tryCivilDate,
  type CivilDate,
} from '@/domain/dates';
import { can } from '@/domain/permissions';
import {
  computeComplianceByCustomer,
  computeTechnicianStats,
  type ComplianceRow,
} from '@/domain/reports';
import { KIND_LABELS } from '@/domain/work-order';
import { cn } from '@/lib/utils';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

/**
 * Reports.
 *
 * Three questions, in the order an owner asks them: are we keeping our customers'
 * equipment compliant, is the team getting through the work, and what exactly did we do?
 *
 * Every number is computed by `src/domain/reports.ts` from rows this page fetched — the
 * same functions the dashboard tiles and the CSV export call, so the three can never
 * disagree about what "overdue" means. Nothing here aggregates anything itself.
 *
 * The window lives in the URL. A report is something people send each other, and
 * `?from=…&to=…` makes "the figures I was looking at" a link rather than a description.
 *
 * ## On the bars
 *
 * They are plain divs with a percentage width, and every one of them carries the number in
 * text beside it. The bar is a second encoding of a figure that is already written down,
 * never the only one — read in greyscale, or by someone who cannot separate amber from
 * red, the table says exactly the same thing. State colours are reserved for service
 * state, so quantity bars use the brand ramp; a green bar on this page always means
 * "compliant", never "big".
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reports',
  description: 'Compliance by customer, technician throughput and service history.',
};

/** Mirrors the CSV route default, so the screen and a bare `curl` agree. */
const DEFAULT_WINDOW_DAYS = 90;

/** The history table is a summary; the CSV is the full record. */
const HISTORY_LIMIT = 60;

/** Native controls, matching the device register's filter bar. */
const CONTROL_CLASS =
  'h-9 rounded-md border border-border-base bg-surface px-3 text-sm text-ink shadow-sm transition-colors hover:border-border-strong';

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** Compliance is the one figure on this page with a judgement attached to its colour. */
function complianceTone(rate: number): 'ok' | 'soon' | 'due' | 'overdue' {
  if (rate >= 100) return 'ok';
  if (rate >= 90) return 'soon';
  if (rate >= 75) return 'due';
  return 'overdue';
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePermission('report:read');
  const params = await searchParams;

  const today = session.today;
  const requestedTo = tryCivilDate(firstParam(params.to));
  const to = requestedTo ?? today;
  const requestedFrom = tryCivilDate(firstParam(params.from));
  const from = requestedFrom && requestedFrom <= to ? requestedFrom : addDays(to, -DEFAULT_WINDOW_DAYS);

  const repo = getRepository();
  const orgId = session.organization.id;

  const [devices, locations, customers, workOrders, memberships] = await Promise.all([
    repo.listDevices(orgId),
    repo.listLocations(orgId),
    repo.listCustomers(orgId),
    repo.listWorkOrders(orgId),
    repo.listMemberships(orgId),
  ]);
  const profiles = await repo.listProfiles(memberships.map((m) => m.userId));

  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const compliance = computeComplianceByCustomer(
    devices,
    new Map(locations.map((l) => [l.id, { customerId: l.customerId }])),
    new Map(customers.map((c) => [c.id, c.name])),
    today,
    session.organization.reminderLeadDays,
  );

  const technicians = computeTechnicianStats(workOrders, { from, to });
  const busiest = technicians.reduce((max, t) => Math.max(max, t.assigned), 0);

  const history = workOrders
    .filter((wo) => wo.status === 'completed' && wo.completedOn !== null)
    .filter((wo) => (wo.completedOn ? isWithin(wo.completedOn, from, to) : false))
    .sort(
      (a, b) =>
        (b.completedOn ?? '').localeCompare(a.completedOn ?? '') || b.code.localeCompare(a.code),
    );

  const totalDevices = compliance.reduce((sum, row) => sum + row.devices, 0);
  const totalOverdue = compliance.reduce((sum, row) => sum + row.overdue, 0);
  const overallRate =
    totalDevices === 0 ? 100 : Math.round(((totalDevices - totalOverdue) / totalDevices) * 1000) / 10;

  const canExport = can(session.role, 'report:export');
  const windowQuery = `from=${from}&to=${to}`;
  const windowDays = diffDays(from, to) + 1;

  const presets: Array<{ label: string; from: CivilDate; to: CivilDate }> = [
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
    { label: 'Last 90 days', from: addDays(today, -89), to: today },
    { label: 'This month', from: startOfMonth(today), to: today },
    { label: 'Last 12 months', from: addDays(today, -364), to: today },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Reports</h1>
          <p className="text-sm text-ink-muted">
            {formatCivilShort(from)} to {formatCivilShort(to)} · {windowDays} days ·{' '}
            {history.length} job{history.length === 1 ? '' : 's'} completed.
          </p>
        </div>

        {canExport ? (
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton kind="compliance" label="Compliance CSV" query={windowQuery} />
            <ExportButton kind="technicians" label="Throughput CSV" query={windowQuery} />
            <ExportButton kind="history" label="History CSV" query={windowQuery} />
          </div>
        ) : null}
      </header>

      {/*
        A plain GET form with native controls, matching the device register and the job
        board. The window belongs in the URL — bookmarkable, shareable, survives a refresh,
        and it is what the export links carry.
      */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-border-base bg-surface-muted p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-from" className="text-sm font-medium text-ink">
            From
          </label>
          <Input id="report-from" type="date" name="from" defaultValue={from} className="w-44" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-to" className="text-sm font-medium text-ink">
            To
          </label>
          <Input id="report-to" type="date" name="to" defaultValue={to} className="w-44" />
        </div>

        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Apply
        </Button>

        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((preset) => {
            const isActive = preset.from === from && preset.to === to;
            return (
              <Link
                key={preset.label}
                href={`/app/reports?from=${preset.from}&to=${preset.to}`}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  CONTROL_CLASS,
                  'inline-flex items-center',
                  isActive ? 'border-brand-600 text-brand-600' : 'text-ink-muted hover:text-ink',
                )}
              >
                {preset.label}
              </Link>
            );
          })}
        </div>
      </form>

      {/* ---------------------------------------------------------------- */}
      {/* Compliance                                                       */}
      {/* ---------------------------------------------------------------- */}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Compliance by customer</CardTitle>
          <CardDescription>
            Share of each customer&rsquo;s active devices that are not overdue, as of{' '}
            {formatCivilShort(today)}. This is a statement about today rather than about the
            window above — a device is either overdue now or it is not. &ldquo;Due soon&rdquo;
            uses this organisation&rsquo;s {session.organization.reminderLeadDays}-day lead time.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold tabular text-ink">{overallRate}%</span>
            <span className="text-sm text-ink-muted">
              across {totalDevices} active device{totalDevices === 1 ? '' : 's'}
              {totalOverdue > 0 ? `, ${totalOverdue} overdue` : ', none overdue'}
            </span>
          </div>

          {compliance.length === 0 ? (
            <EmptyState
              titleAs="h3"
              icon={<FileText />}
              title="No active devices to measure"
              description="Compliance is computed over active devices that belong to a customer site. Add a device to the register and it appears here."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/app/devices">Open the device register</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-[38%]">Compliance</TableHead>
                  <TableHead>Devices</TableHead>
                  <TableHead>Overdue</TableHead>
                  <TableHead>Due soon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compliance.map((row) => (
                  <ComplianceTableRow key={row.customerId} row={row} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Technician throughput                                            */}
      {/* ---------------------------------------------------------------- */}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Technician throughput</CardTitle>
          <CardDescription>
            Jobs assigned to each person, and how many of them closed. A job counts towards
            &ldquo;assigned&rdquo; if it is still open or if it was completed inside the window,
            so work carried over from before {formatCivilShort(from)} is still visible.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {technicians.length === 0 ? (
            <EmptyState
              titleAs="h3"
              icon={<FileText />}
              title="Nothing assigned in this window"
              description="Throughput is measured per assignee. Assign a job to a technician and their figures appear here."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/app/work-orders">Open the job board</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead className="w-[32%]">Assigned · completed</TableHead>
                  <TableHead>In progress</TableHead>
                  <TableHead>Completion rate</TableHead>
                  <TableHead>Average days to close</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.map((stat) => {
                  const profile = profileById.get(stat.userId);
                  return (
                    <TableRow key={stat.userId}>
                      <TableCell className="font-medium text-ink">
                        {profile?.fullName ?? profile?.email ?? 'Former member'}
                        {profile?.fullName ? (
                          <span className="block text-xs font-normal text-ink-subtle">
                            {profile.email}
                          </span>
                        ) : null}
                      </TableCell>

                      <TableCell>
                        <Meter
                          percent={busiest === 0 ? 0 : (stat.assigned / busiest) * 100}
                          fillPercent={stat.assigned === 0 ? 0 : (stat.completed / stat.assigned) * 100}
                          label={`${stat.completed} of ${stat.assigned} closed`}
                        />
                      </TableCell>

                      <TableCell className="tabular text-sm text-ink">{stat.inProgress}</TableCell>

                      <TableCell className="tabular text-sm text-ink">
                        {stat.completionRate}%
                      </TableCell>

                      <TableCell className="tabular text-sm text-ink-muted">
                        {stat.averageDaysToComplete === null
                          ? 'No closed jobs'
                          : `${stat.averageDaysToComplete} days`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Service history                                                  */}
      {/* ---------------------------------------------------------------- */}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Service history</CardTitle>
          <CardDescription>
            Every job completed between {formatCivilShort(from)} and {formatCivilShort(to)}, most
            recent first. The next service date shown is the one recorded against the device at
            completion, not a recomputed guess.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {history.length === 0 ? (
            <EmptyState
              titleAs="h3"
              icon={<FileText />}
              title="No jobs completed in this window"
              description="Widen the date range, or check the job board for work still in progress."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/app/work-orders">Open the job board</Link>
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Customer · Site</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Next due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.slice(0, HISTORY_LIMIT).map((wo) => {
                    const device = deviceById.get(wo.deviceId) ?? null;
                    const location = locationById.get(wo.locationId) ?? null;
                    const customer = customerById.get(wo.customerId) ?? null;
                    const assignee = wo.assignedTo ? profileById.get(wo.assignedTo) : undefined;

                    return (
                      <TableRow key={wo.id}>
                        <TableCell>
                          <Link
                            href={`/app/work-orders/${wo.id}`}
                            className="font-mono text-sm font-medium text-ink hover:text-brand-600 hover:underline"
                          >
                            {wo.code}
                          </Link>
                          <span className="block text-xs text-ink-subtle">
                            {KIND_LABELS[wo.kind]}
                          </span>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-sm text-ink">
                          {wo.completedOn ? formatCivilShort(wo.completedOn) : '—'}
                        </TableCell>

                        <TableCell className="text-sm">
                          <span className="text-ink">{customer?.name ?? '—'}</span>
                          {location ? (
                            <span className="block text-xs text-ink-muted">{location.name}</span>
                          ) : null}
                        </TableCell>

                        <TableCell className="text-sm">
                          {device ? (
                            <Link
                              href={`/app/devices/${device.id}`}
                              className="text-ink hover:text-brand-600 hover:underline"
                            >
                              {device.name}
                            </Link>
                          ) : (
                            <span className="text-ink-subtle">Device removed</span>
                          )}
                        </TableCell>

                        <TableCell className="text-sm text-ink-muted">
                          {assignee?.fullName ?? assignee?.email ?? 'Unassigned'}
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-sm text-ink-muted">
                          {device?.nextServiceDue
                            ? formatCivilShort(device.nextServiceDue)
                            : 'Not scheduled'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {history.length > HISTORY_LIMIT ? (
                <p className="text-sm text-ink-subtle">
                  Showing the {HISTORY_LIMIT} most recent of {history.length} completed jobs.
                  {canExport ? ' The CSV export contains all of them.' : ''}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */

function ExportButton({
  kind,
  label,
  query,
}: {
  kind: 'compliance' | 'technicians' | 'history';
  label: string;
  query: string;
}) {
  return (
    <Button variant="secondary" size="sm" asChild>
      {/*
        A plain anchor, not `next/link`: this is a file download served by a route handler,
        not a client-side navigation, and `download` tells the browser to keep the
        `Content-Disposition` filename.
      */}
      <a href={`/api/reports/${kind}?${query}`} download>
        <Download aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}

function ComplianceTableRow({ row }: { row: ComplianceRow }) {
  const tone = complianceTone(row.complianceRate);

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/app/customers/${row.customerId}`}
          className="font-medium text-ink hover:text-brand-600 hover:underline"
        >
          {row.customerName}
        </Link>
      </TableCell>

      <TableCell>
        <Meter percent={100} fillPercent={row.complianceRate} tone={tone} label={`${row.complianceRate}%`} />
      </TableCell>

      <TableCell className="tabular text-sm text-ink">{row.devices}</TableCell>

      <TableCell>
        {row.overdue > 0 ? (
          <Badge variant="overdue">{row.overdue} overdue</Badge>
        ) : (
          <span className="text-sm text-ink-subtle">None</span>
        )}
      </TableCell>

      <TableCell>
        {row.dueSoon > 0 ? (
          <Badge variant="soon">{row.dueSoon} due soon</Badge>
        ) : (
          <span className="text-sm text-ink-subtle">None</span>
        )}
      </TableCell>
    </TableRow>
  );
}

const TONE_FILL = {
  ok: 'bg-state-ok',
  soon: 'bg-state-soon',
  due: 'bg-state-due',
  overdue: 'bg-state-overdue',
  brand: 'bg-brand-600',
} as const;

/**
 * A bar and the number it encodes, side by side.
 *
 * `percent` scales the track (so rows are comparable to each other) and `fillPercent`
 * fills it (the share being reported). The label is not optional and is never derived from
 * the colour: the bar is decoration for a figure that is already written down.
 *
 * `aria-hidden` on the bar itself, because the label immediately after it says the same
 * thing — a screen reader should hear the number once, not twice.
 */
function Meter({
  percent,
  fillPercent,
  tone = 'brand',
  label,
}: {
  percent: number;
  fillPercent: number;
  tone?: keyof typeof TONE_FILL;
  label: string;
}) {
  const track = Math.max(0, Math.min(100, percent));
  const fill = Math.max(0, Math.min(100, fillPercent));

  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden="true"
        className="h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-surface-muted ring-1 ring-inset ring-border-base"
        style={{ maxWidth: `${track}%` }}
      >
        <div className={cn('h-full rounded-full', TONE_FILL[tone])} style={{ width: `${fill}%` }} />
      </div>
      <span className="tabular shrink-0 whitespace-nowrap text-sm text-ink">{label}</span>
    </div>
  );
}
