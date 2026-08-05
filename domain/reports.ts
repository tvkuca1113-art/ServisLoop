/**
 * Reporting aggregations.
 *
 * Every number shown on the dashboard and the reports page is produced here, from data
 * the caller has already fetched. No queries, no clock — pass `today` in and the same
 * inputs always yield the same figures. That property is what makes the KPI tiles
 * testable and what stops two parts of the UI from disagreeing about "overdue".
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

import { type CivilDate, addDays, diffDays, isWithin } from './dates';
import { serviceStatus, type ServiceState } from './service-interval';
import type {
  Booking,
  Device,
  Issue,
  Priority,
  WorkOrder,
  WorkOrderStatus,
} from './types';

export interface DashboardInput {
  devices: readonly Device[];
  workOrders: readonly WorkOrder[];
  issues: readonly Issue[];
  bookings: readonly Booking[];
  today: CivilDate;
  leadDays?: number;
}

export interface DashboardKpis {
  devicesTotal: number;
  devicesActive: number;
  devicesByState: Record<ServiceState, number>;
  overdueCount: number;
  dueSoonCount: number;
  /** Share of active, scheduled devices that are not overdue, 0–100 with one decimal. */
  complianceRate: number;
  openWorkOrders: number;
  workOrdersByStatus: Record<WorkOrderStatus, number>;
  unassignedWorkOrders: number;
  openIssues: number;
  criticalIssues: number;
  pendingBookings: number;
}

const EMPTY_STATE_COUNTS = (): Record<ServiceState, number> => ({
  unscheduled: 0,
  ok: 0,
  due_soon: 0,
  due: 0,
  overdue: 0,
});

const EMPTY_STATUS_COUNTS = (): Record<WorkOrderStatus, number> => ({
  draft: 0,
  scheduled: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
});

export function computeDashboardKpis(input: DashboardInput): DashboardKpis {
  const { devices, workOrders, issues, bookings, today, leadDays = 30 } = input;

  const devicesByState = EMPTY_STATE_COUNTS();
  for (const d of devices) {
    const { state } = serviceStatus({
      nextServiceDue: d.nextServiceDue,
      today,
      leadDays,
      deviceStatus: d.status,
    });
    devicesByState[state] += 1;
  }

  const workOrdersByStatus = EMPTY_STATUS_COUNTS();
  for (const wo of workOrders) workOrdersByStatus[wo.status] += 1;

  const overdueCount = devicesByState.overdue;
  const scheduledDevices =
    devicesByState.ok + devicesByState.due_soon + devicesByState.due + devicesByState.overdue;

  const complianceRate =
    scheduledDevices === 0
      ? 100
      : Math.round(((scheduledDevices - overdueCount) / scheduledDevices) * 1000) / 10;

  return {
    devicesTotal: devices.length,
    devicesActive: devices.filter((d) => d.status === 'active').length,
    devicesByState,
    overdueCount,
    dueSoonCount: devicesByState.due_soon + devicesByState.due,
    complianceRate,
    openWorkOrders:
      workOrdersByStatus.draft + workOrdersByStatus.scheduled + workOrdersByStatus.in_progress,
    workOrdersByStatus,
    unassignedWorkOrders: workOrders.filter(
      (wo) => !wo.assignedTo && wo.status !== 'completed' && wo.status !== 'cancelled',
    ).length,
    openIssues: issues.filter((i) => i.status === 'open' || i.status === 'triaged').length,
    criticalIssues: issues.filter(
      (i) => i.severity === 'critical' && i.status !== 'closed',
    ).length,
    pendingBookings: bookings.filter((b) => b.status === 'pending').length,
  };
}

/* ------------------------------------------------------------------ */
/* Workload projection                                                 */
/* ------------------------------------------------------------------ */

export interface UpcomingBucket {
  label: string;
  from: CivilDate;
  to: CivilDate;
  count: number;
}

/**
 * How much work is landing over the next weeks.
 *
 * Buckets are inclusive on both ends and non-overlapping. Overdue devices are counted
 * separately by {@link computeDashboardKpis}, not folded into "this week".
 */
export function bucketUpcomingServices(
  devices: readonly Device[],
  today: CivilDate,
): UpcomingBucket[] {
  const defs: Array<{ label: string; fromDay: number; toDay: number }> = [
    { label: 'Next 7 days', fromDay: 0, toDay: 7 },
    { label: '8–30 days', fromDay: 8, toDay: 30 },
    { label: '31–60 days', fromDay: 31, toDay: 60 },
    { label: '61–90 days', fromDay: 61, toDay: 90 },
  ];

  return defs.map((def) => {
    const from = addDays(today, def.fromDay);
    const to = addDays(today, def.toDay);
    const count = devices.filter((d) => {
      if (d.status !== 'active' || !d.nextServiceDue) return false;
      return isWithin(d.nextServiceDue, from, to);
    }).length;
    return { label: def.label, from, to, count };
  });
}

/* ------------------------------------------------------------------ */
/* Technician throughput                                               */
/* ------------------------------------------------------------------ */

export interface TechnicianStat {
  userId: string;
  assigned: number;
  completed: number;
  inProgress: number;
  /** Completed as a share of assigned, 0–100 with one decimal. */
  completionRate: number;
  /** Mean days between opening and completion. `null` when nothing has completed. */
  averageDaysToComplete: number | null;
}

export function computeTechnicianStats(
  workOrders: readonly WorkOrder[],
  window?: { from: CivilDate; to: CivilDate },
): TechnicianStat[] {
  const inWindow = (wo: WorkOrder): boolean => {
    if (!window) return true;
    if (!wo.completedOn) return true;
    return isWithin(wo.completedOn, window.from, window.to);
  };

  const byUser = new Map<string, WorkOrder[]>();
  for (const wo of workOrders) {
    if (!wo.assignedTo || !inWindow(wo)) continue;
    const list = byUser.get(wo.assignedTo);
    if (list) list.push(wo);
    else byUser.set(wo.assignedTo, [wo]);
  }

  const stats: TechnicianStat[] = [];
  for (const [userId, orders] of byUser) {
    const completed = orders.filter((o) => o.status === 'completed');
    const durations: number[] = [];

    for (const o of completed) {
      if (!o.completedOn) continue;
      const opened = o.openedAt.slice(0, 10);
      // `openedAt` is an ISO instant; its date portion is a civil date by construction.
      const days = diffDays(opened as CivilDate, o.completedOn);
      if (Number.isFinite(days) && days >= 0) durations.push(days);
    }

    stats.push({
      userId,
      assigned: orders.length,
      completed: completed.length,
      inProgress: orders.filter((o) => o.status === 'in_progress').length,
      completionRate:
        orders.length === 0
          ? 0
          : Math.round((completed.length / orders.length) * 1000) / 10,
      averageDaysToComplete:
        durations.length === 0
          ? null
          : Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
    });
  }

  return stats.sort((a, b) => b.completed - a.completed || a.userId.localeCompare(b.userId));
}

/* ------------------------------------------------------------------ */
/* Compliance                                                          */
/* ------------------------------------------------------------------ */

export interface ComplianceRow {
  customerId: string;
  customerName: string;
  devices: number;
  overdue: number;
  dueSoon: number;
  complianceRate: number;
}

export function computeComplianceByCustomer(
  devices: readonly Device[],
  locationsById: ReadonlyMap<string, { customerId: string }>,
  customerNamesById: ReadonlyMap<string, string>,
  today: CivilDate,
  leadDays = 30,
): ComplianceRow[] {
  const byCustomer = new Map<string, { devices: number; overdue: number; dueSoon: number }>();

  for (const d of devices) {
    if (d.status !== 'active') continue;
    const location = locationsById.get(d.locationId);
    if (!location) continue;

    const bucket = byCustomer.get(location.customerId) ?? { devices: 0, overdue: 0, dueSoon: 0 };
    bucket.devices += 1;

    const { state } = serviceStatus({
      nextServiceDue: d.nextServiceDue,
      today,
      leadDays,
      deviceStatus: d.status,
    });
    if (state === 'overdue') bucket.overdue += 1;
    if (state === 'due_soon' || state === 'due') bucket.dueSoon += 1;

    byCustomer.set(location.customerId, bucket);
  }

  const rows: ComplianceRow[] = [];
  for (const [customerId, b] of byCustomer) {
    rows.push({
      customerId,
      customerName: customerNamesById.get(customerId) ?? 'Unknown customer',
      devices: b.devices,
      overdue: b.overdue,
      dueSoon: b.dueSoon,
      complianceRate:
        b.devices === 0 ? 100 : Math.round(((b.devices - b.overdue) / b.devices) * 1000) / 10,
    });
  }

  return rows.sort(
    (a, b) => b.overdue - a.overdue || a.customerName.localeCompare(b.customerName),
  );
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

/**
 * Serialise rows to RFC 4180 CSV.
 *
 * Values are quoted whenever they contain a delimiter, quote or newline, and embedded
 * quotes are doubled. A leading `=`, `+`, `-` or `@` is prefixed with an apostrophe so a
 * spreadsheet does not interpret exported data as a formula.
 */
export function toCsv(
  rows: readonly Record<string, unknown>[],
  columns?: readonly string[],
): string {
  const headers = columns ?? (rows.length > 0 ? Object.keys(rows[0] as object) : []);
  if (headers.length === 0) return '';

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    let s = String(value);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\r\n');
}

export const PRIORITY_WEIGHTS: Readonly<Record<Priority, number>> = Object.freeze({
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
});
