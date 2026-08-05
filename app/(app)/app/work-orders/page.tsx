import { Plus, Search, Wrench } from 'lucide-react';
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
  type BadgeVariant,
} from '@/components/ui';
import { addDays, formatCivilShort, formatRelativeDays, tryCivilDate } from '@/domain/dates';
import type { CivilDate } from '@/domain/dates';
import { can } from '@/domain/permissions';
import {
  PRIORITIES,
  WORK_ORDER_KINDS,
  WORK_ORDER_STATUSES,
  type Priority,
  type WorkOrderKind,
  type WorkOrderStatus,
} from '@/domain/types';
import {
  compareWorkOrders,
  isTerminal,
  KIND_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '@/domain/work-order';
import { cn } from '@/lib/utils';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

/**
 * The job board.
 *
 * Sorted by `compareWorkOrders` — urgent first, then by scheduled date, then by code — and
 * *not* by the repository's own ordering. Urgency is a domain judgement, and the whole
 * point of the board is that the thing at the top is the thing to do next.
 *
 * The technician default is the reason this page is not just a filtered table. A
 * technician opening ServisLoop wants their own jobs, in order, and anything else is
 * noise; so `mine` defaults on for that role and off for everyone else. It stays a URL
 * parameter rather than a stored preference, so the filter is bookmarkable, shareable,
 * survives a refresh, and the back button undoes it — and a technician who genuinely wants
 * the whole board is one click away from it.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Work orders',
  description: 'Schedule, assign and complete service jobs.',
};

/** Native controls, matching the device register's filter bar. */
const CONTROL_CLASS =
  'h-9 rounded-md border border-border-base bg-surface px-3 text-sm text-ink shadow-sm transition-colors hover:border-border-strong';

const STATUS_BADGE: Readonly<Record<WorkOrderStatus, BadgeVariant>> = Object.freeze({
  draft: 'neutral',
  scheduled: 'soon',
  in_progress: 'due',
  completed: 'ok',
  cancelled: 'neutral',
});

const PRIORITY_BADGE: Readonly<Record<Priority, BadgeVariant>> = Object.freeze({
  urgent: 'overdue',
  high: 'due',
  normal: 'neutral',
  low: 'neutral',
});

/** Named windows, so the common questions are one click rather than two date pickers. */
const WINDOWS = [
  { value: '', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'month', label: 'Next 30 days' },
  { value: 'overdue', label: 'Past due' },
] as const;

type WindowValue = (typeof WINDOWS)[number]['value'];

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function isStatus(value: string): value is WorkOrderStatus {
  return (WORK_ORDER_STATUSES as readonly string[]).includes(value);
}

function isKind(value: string): value is WorkOrderKind {
  return (WORK_ORDER_KINDS as readonly string[]).includes(value);
}

function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

function isWindow(value: string): value is WindowValue {
  return WINDOWS.some((w) => w.value === value);
}

/** Resolve a named window into the civil-date bounds the repository filter takes. */
function windowBounds(
  window: WindowValue,
  today: CivilDate,
): { from?: CivilDate; to?: CivilDate } {
  switch (window) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: today, to: addDays(today, 7) };
    case 'month':
      return { from: today, to: addDays(today, 30) };
    case 'overdue':
      return { to: addDays(today, -1) };
    default:
      return {};
  }
}

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePermission('work_order:read');
  const params = await searchParams;

  const statusParam = firstParam(params.status);
  const statusFilter = isStatus(statusParam) ? statusParam : null;
  const kindParam = firstParam(params.kind);
  const kindFilter = isKind(kindParam) ? kindParam : null;
  const priorityParam = firstParam(params.priority);
  const priorityFilter = isPriority(priorityParam) ? priorityParam : null;
  const windowParam = firstParam(params.window);
  const windowFilter: WindowValue = isWindow(windowParam) ? windowParam : '';
  const assigneeParam = firstParam(params.assignee);

  // The technician default, with an explicit opt-out.
  //
  // An unticked checkbox submits nothing, so "off" and "never asked" arrive identically —
  // which would make a technician unable to turn their own default off. The form therefore
  // always submits `mineSet=1`, and its presence is what distinguishes a deliberate choice
  // from a first visit.
  const mineAnswered = firstParam(params.mineSet) === '1';
  const mine = mineAnswered ? firstParam(params.mine) === '1' : session.role === 'technician';

  const repo = getRepository();
  const orgId = session.organization.id;
  const bounds = windowBounds(windowFilter, session.today);

  // "My jobs" wins over the assignee picker: they are the same filter, and the toggle is
  // the one the technician actually reached for.
  const assignedTo = mine ? session.user.id : assigneeParam === '' ? undefined : assigneeParam;

  const [orders, devices, locations, customers, memberships] = await Promise.all([
    repo.listWorkOrders(orgId, {
      ...(statusFilter === null ? {} : { status: statusFilter }),
      ...(assignedTo === undefined ? {} : { assignedTo }),
      ...(bounds.from === undefined ? {} : { from: bounds.from }),
      ...(bounds.to === undefined ? {} : { to: bounds.to }),
    }),
    repo.listDevices(orgId),
    repo.listLocations(orgId),
    repo.listCustomers(orgId),
    repo.listMemberships(orgId),
  ]);

  const profiles = await repo.listProfiles(memberships.map((m) => m.userId));

  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  // Kind and priority are filtered here rather than pushed into the repository: neither is
  // part of `WorkOrderFilter`, and widening that interface for two equality checks over a
  // list this size would buy nothing.
  const filtered = orders.filter((order) => {
    if (kindFilter && order.kind !== kindFilter) return false;
    if (priorityFilter && order.priority !== priorityFilter) return false;
    return true;
  });

  const rows = [...filtered].sort(compareWorkOrders).map((order) => ({
    order,
    device: deviceById.get(order.deviceId) ?? null,
    location: locationById.get(order.locationId) ?? null,
    customer: customerById.get(order.customerId) ?? null,
    assignee: order.assignedTo ? (profileById.get(order.assignedTo) ?? null) : null,
  }));

  const open = rows.filter((r) => !isTerminal(r.order.status)).length;
  const unassigned = rows.filter(
    (r) => !r.order.assignedTo && !isTerminal(r.order.status),
  ).length;

  const anyFilter =
    statusFilter !== null ||
    kindFilter !== null ||
    priorityFilter !== null ||
    windowFilter !== '' ||
    assigneeParam !== '' ||
    mine !== (session.role === 'technician');

  const canCreate = can(session.role, 'work_order:create');

  const teamOptions = memberships
    .map((m) => ({ id: m.userId, name: profileById.get(m.userId)?.fullName ?? profileById.get(m.userId)?.email ?? 'Unknown' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {mine ? 'My jobs' : 'Work orders'}
          </h1>
          <p className="text-sm text-ink-muted">
            {open === 0
              ? 'Nothing open here.'
              : `${open} open${unassigned > 0 ? `, ${unassigned} waiting for a technician` : ''}.`}
          </p>
        </div>

        {canCreate ? (
          <Button asChild>
            <Link href="/app/work-orders/new">
              <Plus aria-hidden="true" />
              Open a job
            </Link>
          </Button>
        ) : null}
      </header>

      {/*
        A plain GET form with native controls, matching the device register. The filter
        belongs in the URL — bookmarkable, shareable, survives a refresh, and the back
        button undoes it. Native controls submit without JavaScript, which the Radix
        equivalents cannot do from a Server Component.
      */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-border-base bg-surface-muted p-4"
      >
        {/* Marks the answer as deliberate — see the note where `mine` is resolved. */}
        <input type="hidden" name="mineSet" value="1" />

        <label className="flex h-9 items-center gap-2 rounded-md border border-border-base bg-surface px-3 text-sm text-ink">
          <input
            type="checkbox"
            name="mine"
            value="1"
            defaultChecked={mine}
            className="size-4 rounded-sm border border-border-strong accent-brand-600"
          />
          My jobs
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wo-status" className="text-sm font-medium text-ink">
            Status
          </label>
          <select
            id="wo-status"
            name="status"
            defaultValue={statusFilter ?? ''}
            className={cn(CONTROL_CLASS, 'min-w-36')}
          >
            <option value="">Any status</option>
            {WORK_ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wo-assignee" className="text-sm font-medium text-ink">
            Assignee
          </label>
          <select
            id="wo-assignee"
            name="assignee"
            defaultValue={assigneeParam}
            disabled={mine}
            className={cn(CONTROL_CLASS, 'min-w-44 disabled:opacity-60')}
          >
            <option value="">Anyone</option>
            {teamOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wo-kind" className="text-sm font-medium text-ink">
            Kind
          </label>
          <select
            id="wo-kind"
            name="kind"
            defaultValue={kindFilter ?? ''}
            className={cn(CONTROL_CLASS, 'min-w-44')}
          >
            <option value="">Any kind</option>
            {WORK_ORDER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wo-priority" className="text-sm font-medium text-ink">
            Priority
          </label>
          <select
            id="wo-priority"
            name="priority"
            defaultValue={priorityFilter ?? ''}
            className={cn(CONTROL_CLASS, 'min-w-32')}
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wo-window" className="text-sm font-medium text-ink">
            Scheduled
          </label>
          <select
            id="wo-window"
            name="window"
            defaultValue={windowFilter}
            className={cn(CONTROL_CLASS, 'min-w-36')}
          >
            {WINDOWS.map((option) => (
              <option key={option.value || 'any'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Apply
        </Button>

        {anyFilter ? (
          <Button variant="ghost" asChild>
            <Link href="/app/work-orders">Clear</Link>
          </Button>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title={anyFilter ? 'No jobs match those filters' : mine ? 'Nothing assigned to you' : 'No work orders yet'}
          description={
            anyFilter
              ? 'Widen the filters, or clear them to see the whole board.'
              : mine
                ? 'When a job is assigned to you it appears here, urgent first.'
                : 'Jobs are opened from a due device, from a customer booking, from a reported fault — or by hand.'
          }
          action={
            anyFilter ? (
              <Button variant="secondary" asChild>
                <Link href="/app/work-orders">Clear filters</Link>
              </Button>
            ) : canCreate ? (
              <Button asChild>
                <Link href="/app/work-orders/new">Open a job</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="rounded-card border border-border-base bg-surface-raised">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Customer · Site</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map(({ order, device, location, customer, assignee }) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/app/work-orders/${order.id}`}
                      className="font-mono text-sm font-medium text-ink hover:text-brand-600 hover:underline"
                    >
                      {order.code}
                    </Link>
                    <span className="block text-xs text-ink-subtle">
                      {KIND_LABELS[order.kind]}
                    </span>
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
                    {order.summary ? (
                      <span className="block text-xs text-ink-muted">{order.summary}</span>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-sm">
                    {customer ? (
                      <Link
                        href={`/app/customers/${customer.id}`}
                        className="text-ink hover:text-brand-600 hover:underline"
                      >
                        {customer.name}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                    {location ? (
                      <span className="block text-xs text-ink-muted">{location.name}</span>
                    ) : null}
                  </TableCell>

                  <TableCell className="text-sm">
                    <ScheduledCell scheduledFor={order.scheduledFor} today={session.today} />
                  </TableCell>

                  <TableCell className="text-sm">
                    {assignee ? (
                      <span className="text-ink">{assignee.fullName ?? assignee.email}</span>
                    ) : (
                      <span className="text-ink-subtle">Unassigned</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={PRIORITY_BADGE[order.priority]}>
                      {PRIORITY_LABELS[order.priority]}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge variant={STATUS_BADGE[order.status]}>
                      {STATUS_LABELS[order.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * The scheduled slot.
 *
 * The date is shown with a plain-language offset beside it — `in 4 days`, `12 days ago` —
 * because "3 Aug" alone does not answer the only question the board is asked, which is
 * whether this job is late.
 */
function ScheduledCell({
  scheduledFor,
  today,
}: {
  scheduledFor: string | null;
  today: CivilDate;
}) {
  if (!scheduledFor) {
    return <span className="text-ink-subtle">Not scheduled</span>;
  }

  const day = tryCivilDate(scheduledFor.slice(0, 10));
  const time = scheduledFor.slice(11, 16);

  if (!day) return <span className="text-ink-subtle">—</span>;

  return (
    <div className="flex flex-col">
      <span className="whitespace-nowrap text-ink">
        {formatCivilShort(day)}
        {time ? ` · ${time}` : ''}
      </span>
      <span className="text-xs text-ink-muted">{formatRelativeDays(day, today)}</span>
    </div>
  );
}
