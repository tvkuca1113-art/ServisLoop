import { Mail, Phone, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type BadgeVariant,
} from '@/components/ui';
import { can } from '@/domain/permissions';
import type { Customer, Device, Issue, IssueSeverity, Location, WorkOrder } from '@/domain/types';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { IssueActions } from './issue-actions';

/**
 * Issue triage — faults reported from the QR pages, waiting to become work or be closed.
 *
 * Ordered by severity, not by arrival: a report of "it is dangerous" filed twenty minutes
 * ago must not sit under three "there is a rattle" reports from yesterday. Severity is the
 * reporter's own plain-language answer, and `priorityForIssue` carries it straight through
 * to the work order's priority when the report is converted — so the person who saw the
 * fault sets the urgency, and nobody has to re-key a judgement.
 *
 * Three tabs, because a triage queue and a history are different screens: **Open** is the
 * work, **Triaged** is what has been dealt with but is still live (including reports that
 * already became jobs), **Closed** is the record.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Issues',
  description: 'Faults reported by customers from the QR device pages.',
};

const SEVERITY_LABELS: Readonly<Record<IssueSeverity, string>> = Object.freeze({
  low: 'Minor',
  normal: 'Working badly',
  high: 'Not working',
  critical: 'Dangerous',
});

const SEVERITY_VARIANTS: Readonly<Record<IssueSeverity, BadgeVariant>> = Object.freeze({
  low: 'neutral',
  normal: 'soon',
  high: 'due',
  critical: 'overdue',
});

/** Most urgent first. */
const SEVERITY_RANK: Readonly<Record<IssueSeverity, number>> = Object.freeze({
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
});

interface IssueRow {
  issue: Issue;
  device: Device | null;
  location: Location | null;
  customer: Customer | null;
  workOrder: WorkOrder | null;
}

function IssueCard({
  row,
  canTriage,
  canClose,
}: {
  row: IssueRow;
  canTriage: boolean;
  canClose: boolean;
}) {
  const { issue, device, location, customer, workOrder } = row;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle as="h3" className="text-lg">
              {issue.title}
            </CardTitle>
            <p className="text-sm text-ink-muted">
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

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={SEVERITY_VARIANTS[issue.severity]}>
              {SEVERITY_LABELS[issue.severity]}
            </Badge>
            {workOrder ? (
              <Badge variant="outline" className="font-mono">
                {workOrder.code}
              </Badge>
            ) : null}
            {issue.status === 'closed' ? <Badge variant="neutral">Closed</Badge> : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {issue.description ? (
          <p className="whitespace-pre-line text-sm text-ink">{issue.description}</p>
        ) : (
          <p className="text-sm text-ink-subtle">No further detail was given.</p>
        )}

        <div className="flex flex-col gap-1.5 rounded-card border border-border-base bg-surface-muted p-4">
          <p className="text-sm font-medium text-ink">{issue.reporterName ?? 'Reported anonymously'}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            {issue.reporterEmail ? (
              <a
                href={`mailto:${issue.reporterEmail}`}
                className="inline-flex items-center gap-1.5 hover:text-brand-600 hover:underline"
              >
                <Mail aria-hidden="true" className="size-3.5" />
                {issue.reporterEmail}
              </a>
            ) : null}
            {issue.reporterPhone ? (
              <a
                href={`tel:${issue.reporterPhone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1.5 hover:text-brand-600 hover:underline"
              >
                <Phone aria-hidden="true" className="size-3.5" />
                {issue.reporterPhone}
              </a>
            ) : null}
            {!issue.reporterEmail && !issue.reporterPhone ? (
              <span>No contact details left — the device and site are on the report.</span>
            ) : null}
          </div>
        </div>

        {issue.status === 'closed' ? null : (
          <IssueActions
            issueId={issue.id}
            title={issue.title}
            deviceName={device?.name ?? 'this device'}
            hasWorkOrder={issue.workOrderId !== null}
            canTriage={canTriage}
            canClose={canClose}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default async function IssuesPage() {
  const session = await requirePermission('issue:read');
  const repo = getRepository();
  const orgId = session.organization.id;

  const [issues, devices, locations, customers, workOrders] = await Promise.all([
    repo.listIssues(orgId),
    repo.listDevices(orgId),
    repo.listLocations(orgId),
    repo.listCustomers(orgId),
    repo.listWorkOrders(orgId),
  ]);

  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const workOrderById = new Map(workOrders.map((w) => [w.id, w]));

  const rows: IssueRow[] = issues
    .map((issue) => {
      const device = deviceById.get(issue.deviceId) ?? null;
      const location = device ? (locationById.get(device.locationId) ?? null) : null;
      const customer = location ? (customerById.get(location.customerId) ?? null) : null;
      const workOrder = issue.workOrderId ? (workOrderById.get(issue.workOrderId) ?? null) : null;
      return { issue, device, location, customer, workOrder };
    })
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity];
      if (bySeverity !== 0) return bySeverity;
      return b.issue.createdAt.localeCompare(a.issue.createdAt);
    });

  const open = rows.filter((r) => r.issue.status === 'open');
  // `converted` sits with `triaged`: it has been dealt with, and the job it became is
  // still live. Only `closed` is finished.
  const triaged = rows.filter(
    (r) => r.issue.status === 'triaged' || r.issue.status === 'converted',
  );
  const closed = rows.filter((r) => r.issue.status === 'closed');

  const canTriage = can(session.role, 'issue:triage');
  const canClose = can(session.role, 'issue:close');

  const tabs: Array<{ value: string; label: string; rows: IssueRow[]; empty: string }> = [
    {
      value: 'open',
      label: `Open (${open.length})`,
      rows: open,
      empty: 'Nothing new. Reports arrive here the moment someone scans a device and sends one.',
    },
    {
      value: 'triaged',
      label: `Triaged (${triaged.length})`,
      rows: triaged,
      empty: 'Nothing in progress. Converting a report to a job moves it here.',
    },
    {
      value: 'closed',
      label: `Closed (${closed.length})`,
      rows: closed,
      empty: 'Nothing closed yet.',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Issues</h1>
        <p className="text-sm text-ink-muted">
          {open.length === 0
            ? 'No open reports. Faults reported from the QR device pages land here.'
            : `${open.length} open ${open.length === 1 ? 'report' : 'reports'}, most urgent first.`}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="No faults reported yet"
          description="Anyone standing at a device can scan its QR code and report a problem without an account. Those reports appear here for triage."
        />
      ) : (
        <Tabs defaultValue="open">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-4">
              {tab.rows.length === 0 ? (
                <p className="rounded-card border border-dashed border-border-base bg-surface-muted px-6 py-10 text-center text-sm text-ink-muted">
                  {tab.empty}
                </p>
              ) : (
                tab.rows.map((row) => (
                  <IssueCard
                    key={row.issue.id}
                    row={row}
                    canTriage={canTriage}
                    canClose={canClose}
                  />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
