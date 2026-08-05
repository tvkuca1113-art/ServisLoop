import { NextResponse, type NextRequest } from 'next/server';

import { addDays, isWithin, tryCivilDate, type CivilDate } from '@/domain/dates';
import { ForbiddenError } from '@/domain/permissions';
import {
  computeComplianceByCustomer,
  computeTechnicianStats,
  toCsv,
} from '@/domain/reports';
import { KIND_LABELS, PRIORITY_LABELS } from '@/domain/work-order';
import { isFrameworkError } from '@/server/actions/errors';
import { requirePermission, type SessionContext } from '@/server/auth/context';
import { getRepository } from '@/server/data';

/**
 * CSV export for the reports page.
 *
 * `GET /api/reports/{compliance|technicians|history}?from=YYYY-MM-DD&to=YYYY-MM-DD`
 *
 * Every figure is produced by the same functions the reports page renders —
 * `computeComplianceByCustomer`, `computeTechnicianStats` — so a spreadsheet and the
 * screen can never disagree. Serialisation is `toCsv` from the domain, which quotes
 * properly and neutralises leading `=`, `+`, `-` and `@` so an exported cell cannot be
 * interpreted as a formula by Excel.
 *
 * Gated on `report:export`, which owners and administrators hold. Reading a report and
 * walking out of the building with it are different acts: a technician can see throughput
 * on screen and cannot download the customer list.
 */

export const dynamic = 'force-dynamic';

/** Mirrors the reports page default, so a bare `curl` gets the same window as the UI. */
const DEFAULT_WINDOW_DAYS = 90;

const KINDS = ['compliance', 'technicians', 'history'] as const;
type ReportKind = (typeof KINDS)[number];

function isKind(value: string): value is ReportKind {
  return (KINDS as readonly string[]).includes(value);
}

export async function GET(
  request: NextRequest,
  // Next 15 hands route params as a promise.
  { params }: { params: Promise<{ kind: string }> },
): Promise<NextResponse> {
  const { kind } = await params;

  try {
    if (!isKind(kind)) {
      return NextResponse.json(
        { error: `Unknown report "${kind}". Expected one of: ${KINDS.join(', ')}.` },
        { status: 404 },
      );
    }

    const session = await requirePermission('report:export');
    const orgId = session.organization.id;

    const to = tryCivilDate(request.nextUrl.searchParams.get('to')) ?? session.today;
    const requestedFrom = tryCivilDate(request.nextUrl.searchParams.get('from'));
    const from =
      requestedFrom && requestedFrom <= to ? requestedFrom : addDays(to, -DEFAULT_WINDOW_DAYS);

    const { rows, columns } = await buildReport(kind, { orgId, from, to, session });

    // A UTF-8 byte-order mark. `toCsv` is correct without it, but Excel on Windows guesses
    // the code page from the first bytes and mangles Bosnian names — Hodžić, Perić — when
    // it guesses wrong. Every other tool ignores it.
    const body = `\uFEFF${toCsv(rows, columns)}`;
    const filename = `servisloop-${kind}-${from}-to-${to}.csv`;

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Scoped to one signed-in user, so it must never land in a shared cache.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    // `redirect()` and `notFound()` signal control flow by throwing; those must reach the
    // framework untouched.
    if (isFrameworkError(error)) throw error;

    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: 'Your role does not allow exporting reports.' },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not build that export.' },
      { status: 500 },
    );
  }
}

interface BuildContext {
  orgId: string;
  from: CivilDate;
  to: CivilDate;
  session: SessionContext;
}

interface Report {
  rows: Record<string, unknown>[];
  /** Explicit column order — an export whose columns move between runs is not a report. */
  columns: string[];
}

async function buildReport(kind: ReportKind, ctx: BuildContext): Promise<Report> {
  const repo = getRepository();
  const { orgId, from, to, session } = ctx;

  if (kind === 'compliance') {
    const [devices, locations, customers] = await Promise.all([
      repo.listDevices(orgId),
      repo.listLocations(orgId),
      repo.listCustomers(orgId),
    ]);

    // Compliance is a statement about *now*, not about the window: a device is either
    // overdue today or it is not. The window still appears in the filename so a file on
    // disk records when it was taken.
    const compliance = computeComplianceByCustomer(
      devices,
      new Map(locations.map((l) => [l.id, { customerId: l.customerId }])),
      new Map(customers.map((c) => [c.id, c.name])),
      session.today,
      session.organization.reminderLeadDays,
    );

    return {
      columns: ['customer', 'devices', 'overdue', 'due_soon', 'compliance_rate', 'as_of'],
      rows: compliance.map((row) => ({
        customer: row.customerName,
        devices: row.devices,
        overdue: row.overdue,
        due_soon: row.dueSoon,
        compliance_rate: row.complianceRate,
        as_of: session.today,
      })),
    };
  }

  if (kind === 'technicians') {
    const [workOrders, memberships] = await Promise.all([
      repo.listWorkOrders(orgId),
      repo.listMemberships(orgId),
    ]);
    const profiles = await repo.listProfiles(memberships.map((m) => m.userId));
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const stats = computeTechnicianStats(workOrders, { from, to });

    return {
      columns: [
        'technician',
        'email',
        'assigned',
        'completed',
        'in_progress',
        'completion_rate',
        'average_days_to_complete',
        'window_from',
        'window_to',
      ],
      rows: stats.map((stat) => {
        const profile = profileById.get(stat.userId);
        return {
          technician: profile?.fullName ?? profile?.email ?? stat.userId,
          email: profile?.email ?? '',
          assigned: stat.assigned,
          completed: stat.completed,
          in_progress: stat.inProgress,
          completion_rate: stat.completionRate,
          average_days_to_complete: stat.averageDaysToComplete ?? '',
          window_from: from,
          window_to: to,
        };
      }),
    };
  }

  // history
  const [workOrders, devices, locations, customers, memberships] = await Promise.all([
    repo.listWorkOrders(orgId, { status: 'completed' }),
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

  const completed = workOrders
    .filter((wo) => wo.completedOn !== null && isWithin(wo.completedOn, from, to))
    .sort((a, b) => (a.completedOn ?? '').localeCompare(b.completedOn ?? '') || a.code.localeCompare(b.code));

  return {
    columns: [
      'work_order',
      'completed_on',
      'customer',
      'site',
      'device',
      'serial_number',
      'kind',
      'priority',
      'technician',
      'summary',
      'next_service_due',
    ],
    rows: completed.map((wo) => {
      const device = deviceById.get(wo.deviceId) ?? null;
      const assignee = wo.assignedTo ? profileById.get(wo.assignedTo) : undefined;
      return {
        work_order: wo.code,
        completed_on: wo.completedOn ?? '',
        customer: customerById.get(wo.customerId)?.name ?? '',
        site: locationById.get(wo.locationId)?.name ?? '',
        device: device?.name ?? '',
        serial_number: device?.serialNumber ?? '',
        kind: KIND_LABELS[wo.kind],
        priority: PRIORITY_LABELS[wo.priority],
        technician: assignee?.fullName ?? assignee?.email ?? '',
        summary: wo.summary ?? '',
        // Read off the device rather than recomputed: `recalculateDeviceSchedule` wrote it
        // at completion, and an export must not become a second opinion.
        next_service_due: device?.nextServiceDue ?? '',
      };
    }),
  };
}
