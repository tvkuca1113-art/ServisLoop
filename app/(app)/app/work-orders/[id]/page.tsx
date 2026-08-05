import { ArrowLeft, ClipboardList, FileDown, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeVariant,
} from '@/components/ui';
import { describeScore, scoreChecklist } from '@/domain/checklist';
import { formatCivilShort, formatRelativeDays, tryCivilDate } from '@/domain/dates';
import { can } from '@/domain/permissions';
import { effectiveIntervalDays, describeInterval } from '@/domain/service-interval';
import type { ChecklistResult, Priority, WorkOrderStatus } from '@/domain/types';
import {
  allowedTransitions,
  checkTransition,
  isTerminal,
  KIND_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '@/domain/work-order';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { AssignControl } from '../assign-control';
import { ChecklistRun } from '../checklist-run';
import { StatusActions } from '../status-actions';
import { EditWorkOrderForm } from '../work-order-form';

/**
 * One job, as a technician standing in front of the equipment needs it.
 *
 * The page is ordered by what gets used: context first (what am I looking at, and why is
 * this job open), then the controls that move it along, then the checklist. The report
 * panel sits last because it only exists once the job is closed.
 *
 * The status controls come from `allowedTransitions(status)` — the legal edges, and only
 * those. This page never renders a button for a move the machine would refuse, so a
 * technician is not offered "Complete" on a job that has not been started, and nobody is
 * offered anything at all on a job that is already closed. The same table then refuses the
 * move server-side, so the UI is a convenience over the guard rather than the guard itself.
 */

export const dynamic = 'force-dynamic';

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

const STATUS_COPY: Readonly<Record<WorkOrderStatus, string>> = Object.freeze({
  draft: 'Not on the calendar yet. Give it a date to schedule it.',
  scheduled: 'On the calendar. It can be started once somebody owns it.',
  in_progress: 'Being worked on. Complete the checklist to close it.',
  completed: 'Closed. The device’s next service date was rebuilt from this visit.',
  cancelled: 'Called off. The device still owes the service this job was for.',
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await requirePermission('work_order:read');
  const workOrder = await getRepository().getWorkOrder(session.organization.id, id);

  return { title: workOrder?.code ?? 'Work order' };
}

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission('work_order:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  const workOrder = await repo.getWorkOrder(orgId, id);
  if (!workOrder) notFound();

  const [device, location, customer, memberships, deviceTypes, results, report] =
    await Promise.all([
      repo.getDevice(orgId, workOrder.deviceId),
      repo.getLocation(orgId, workOrder.locationId),
      repo.getCustomer(orgId, workOrder.customerId),
      repo.listMemberships(orgId),
      repo.listDeviceTypes(orgId),
      repo.listChecklistResults(orgId, workOrder.id),
      repo.getServiceReportByWorkOrder(orgId, workOrder.id),
    ]);

  const profiles = await repo.listProfiles(memberships.map((m) => m.userId));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const items = workOrder.checklistTemplateId
    ? await repo.listChecklistItems(orgId, workOrder.checklistTemplateId)
    : [];

  const template = workOrder.checklistTemplateId
    ? await repo.getChecklistTemplate(orgId, workOrder.checklistTemplateId)
    : null;

  // What opened this job. A technician who knows a customer reported knocking on cold
  // start arrives with half the diagnosis already done.
  const issue = workOrder.sourceIssueId ? await repo.getIssue(orgId, workOrder.sourceIssueId) : null;
  const booking = workOrder.sourceBookingId
    ? await repo.getBooking(orgId, workOrder.sourceBookingId)
    : null;

  const assignee = workOrder.assignedTo ? (profileById.get(workOrder.assignedTo) ?? null) : null;
  const isAssignee = workOrder.assignedTo === session.user.id;

  const allowed = allowedTransitions(workOrder.status);
  const canUpdate = can(session.role, 'work_order:update', { isAssignee });
  const canAssign = can(session.role, 'work_order:assign') && !isTerminal(workOrder.status);
  const canStart = can(session.role, 'work_order:start', { isAssignee });
  const canComplete = can(session.role, 'work_order:complete', { isAssignee });
  const canCancel = can(session.role, 'work_order:cancel');
  const canGenerateReport = can(session.role, 'report:generate', { isAssignee });

  // Ask the machine, do not guess: this is the same call the completion action makes, with
  // an optimistic checklist so the only reasons that come back are the structural ones.
  const completionCheck = checkTransition({
    from: workOrder.status,
    to: 'completed',
    assignedTo: workOrder.assignedTo,
    scheduledFor: workOrder.scheduledFor,
    completedOn: session.today,
    checklistComplete: true,
    today: session.today,
  });
  const completionBlocked = completionCheck.ok ? null : completionCheck.errors.join(' ');

  const scheduledDay = workOrder.scheduledFor
    ? tryCivilDate(workOrder.scheduledFor.slice(0, 10))
    : null;
  const scheduledTime = workOrder.scheduledFor ? workOrder.scheduledFor.slice(11, 16) : '';

  const deviceType = device?.deviceTypeId
    ? (deviceTypes.find((t) => t.id === device.deviceTypeId) ?? null)
    : null;

  const score = scoreChecklist(results, items.length === 0 ? results.length : items.length);

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3 w-fit">
        <Link href="/app/work-orders">
          <ArrowLeft aria-hidden="true" />
          All work orders
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink-muted">
            {customer ? (
              <Link
                href={`/app/customers/${customer.id}`}
                className="hover:text-brand-600 hover:underline"
              >
                {customer.name}
              </Link>
            ) : (
              'Customer removed'
            )}
            {location ? <> · {location.name}</> : null}
          </p>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink">
            {workOrder.code}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={STATUS_BADGE[workOrder.status]}>
              {STATUS_LABELS[workOrder.status]}
            </Badge>
            <Badge variant={PRIORITY_BADGE[workOrder.priority]}>
              {PRIORITY_LABELS[workOrder.priority]}
            </Badge>
            <span className="text-sm text-ink-muted">{STATUS_COPY[workOrder.status]}</span>
          </div>
        </div>

        {canUpdate && !isTerminal(workOrder.status) ? (
          <EditWorkOrderForm
            code={workOrder.code}
            workOrder={{
              id: workOrder.id,
              priority: workOrder.priority,
              scheduledDate: scheduledDay ?? '',
              scheduledTime,
              scheduledMinutes: workOrder.scheduledMinutes,
              summary: workOrder.summary,
              internalNotes: workOrder.internalNotes,
              isDraft: workOrder.status === 'draft',
            }}
          />
        ) : null}
      </header>

      {issue ? (
        <Alert variant="warning" icon={<TriangleAlert />}>
          <AlertTitle>Opened from a reported fault: “{issue.title}”</AlertTitle>
          <AlertDescription>
            {issue.description ?? 'No further detail was given.'}
            {issue.reporterName ? ` — reported by ${issue.reporterName}.` : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {booking ? (
        <Alert variant="info" icon={<ClipboardList />}>
          <AlertTitle>
            Opened from a customer booking for {formatCivilShort(booking.requestedDate)}
          </AlertTitle>
          <AlertDescription>
            Requested by {booking.contactName}
            {booking.note ? ` — “${booking.note}”` : '.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">The job</CardTitle>
            <CardDescription>
              {workOrder.summary ?? 'No summary was written for this job.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Device">
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
                {device?.serialNumber ? (
                  <span className="block font-mono text-xs text-ink-subtle">
                    {device.serialNumber}
                  </span>
                ) : null}
              </Field>

              <Field label="Site">
                <span className="text-ink">{location?.name ?? '—'}</span>
                {location?.addressLine ? (
                  <span className="block text-xs text-ink-subtle">
                    {[location.addressLine, location.city].filter(Boolean).join(', ')}
                  </span>
                ) : null}
              </Field>

              <Field label="Kind">
                <span className="text-ink">{KIND_LABELS[workOrder.kind]}</span>
              </Field>

              <Field label="Scheduled">
                <span className="text-ink">
                  {scheduledDay
                    ? `${formatCivilShort(scheduledDay)}${scheduledTime ? ` · ${scheduledTime}` : ''}`
                    : 'Not scheduled'}
                </span>
                {scheduledDay ? (
                  <span className="block text-xs text-ink-subtle">
                    {formatRelativeDays(scheduledDay, session.today)}
                    {workOrder.scheduledMinutes
                      ? ` · ${workOrder.scheduledMinutes} minutes allowed`
                      : ''}
                  </span>
                ) : null}
              </Field>

              <Field label="Checklist">
                <span className="text-ink">{template?.name ?? 'None attached'}</span>
                <span className="block text-xs text-ink-subtle">
                  {template
                    ? `Version ${template.version} · ${items.length} checks`
                    : 'The device type carries the template. Without one, closing records only the date.'}
                </span>
              </Field>

              <Field label="Next service after this">
                <span className="text-ink">
                  {device?.nextServiceDue ? formatCivilShort(device.nextServiceDue) : 'Not scheduled'}
                </span>
                {device ? (
                  <span className="block text-xs text-ink-subtle">
                    {describeInterval(effectiveIntervalDays(device, deviceType))}
                  </span>
                ) : null}
              </Field>
            </dl>

            {workOrder.internalNotes ? (
              <>
                <Separator />
                <div className="flex flex-col gap-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Internal notes
                  </h3>
                  <p className="whitespace-pre-wrap text-sm text-ink">{workOrder.internalNotes}</p>
                  <p className="text-xs text-ink-subtle">
                    Never shown to the customer, never printed on the report.
                  </p>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Who and what next</CardTitle>
            <CardDescription>
              Only the moves this job can legally make are offered.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <AssignControl
              workOrderId={workOrder.id}
              assignedTo={workOrder.assignedTo}
              members={memberships.map((membership) => ({
                id: membership.userId,
                name:
                  profileById.get(membership.userId)?.fullName ??
                  profileById.get(membership.userId)?.email ??
                  'Unknown',
                role: membership.role,
              }))}
              canAssign={canAssign}
            />

            <Separator />

            <StatusActions
              workOrderId={workOrder.id}
              code={workOrder.code}
              status={workOrder.status}
              allowed={allowed}
              scheduledDate={scheduledDay ?? ''}
              scheduledTime={scheduledTime}
              priority={workOrder.priority}
              canStart={canStart}
              canUpdate={canUpdate}
              canCancel={canCancel}
            />

            <dl className="flex flex-col gap-3 border-t border-border-base pt-4">
              <Field label="Opened">
                <span className="text-ink">{workOrder.openedAt.slice(0, 10)}</span>
              </Field>
              {workOrder.startedAt ? (
                <Field label="Started">
                  <span className="text-ink">{workOrder.startedAt.slice(0, 16).replace('T', ' ')}</span>
                </Field>
              ) : null}
              {workOrder.completedOn ? (
                <Field label="Completed">
                  <span className="text-ink">{formatCivilShort(workOrder.completedOn)}</span>
                  <span className="block text-xs text-ink-subtle">
                    by {assignee?.fullName ?? assignee?.email ?? 'an unrecorded technician'}
                  </span>
                </Field>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* -- the checklist ------------------------------------------------ */}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Service checklist</CardTitle>
          <CardDescription>
            {workOrder.status === 'completed'
              ? 'What was recorded on the day. Each line keeps a snapshot of the check as it read then, so editing the template later cannot rewrite this.'
              : 'Every failed check needs a note. That rule is enforced when the job is closed, not here.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {workOrder.status === 'completed' || results.length > 0 ? (
            <RecordedChecklist results={results} summary={describeScore(score)} />
          ) : isTerminal(workOrder.status) ? (
            <p className="text-sm text-ink-muted">
              This job was cancelled before any checks were recorded.
            </p>
          ) : (
            <ChecklistRun
              workOrderId={workOrder.id}
              code={workOrder.code}
              items={items.map((item) => ({
                id: item.id,
                position: item.position,
                label: item.label,
                kind: item.kind,
                required: item.required,
                options: item.options,
                unit: item.unit,
                minValue: item.minValue,
                maxValue: item.maxValue,
                expectedBoolean: item.expectedBoolean,
              }))}
              today={session.today}
              defaultSignedBy={customer?.contactName ?? ''}
              canComplete={canComplete}
              blockedReason={completionBlocked}
            />
          )}
        </CardContent>
      </Card>

      {/* -- the report --------------------------------------------------- */}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Service report</CardTitle>
          <CardDescription>
            A signed PDF for the customer: the device, the checklist as recorded, the
            pass/fail summary and the next service date.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {workOrder.status !== 'completed' ? (
            <p className="text-sm text-ink-muted">
              A report states that work was carried out, so there is nothing to produce until
              the job is closed.
            </p>
          ) : (
            <>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Field label="Report number">
                  <span className="font-mono text-ink">
                    {report?.number ?? 'Assigned on first download'}
                  </span>
                </Field>
                <Field label="Signed by">
                  <span className="text-ink">{report?.signedByName ?? 'Not signed'}</span>
                </Field>
                <Field label="Checks">
                  <span className="text-ink">{describeScore(score)}</span>
                </Field>
              </dl>

              {canGenerateReport ? (
                <Button variant="secondary" asChild className="w-fit">
                  <a href={`/api/work-orders/${workOrder.id}/report`} download>
                    <FileDown aria-hidden="true" />
                    Download the PDF
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-ink-muted">
                  Your role cannot generate this report. Ask an administrator, or the
                  technician it is assigned to.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The recorded run, read-only.
 *
 * Failures carry the word "Fail", a state badge and the note that explains them — three
 * signals for the same fact, none of them colour alone.
 */
function RecordedChecklist({
  results,
  summary,
}: {
  results: readonly ChecklistResult[];
  summary: string;
}) {
  if (results.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No checks were recorded — this job ran without a checklist template.
      </p>
    );
  }

  const ordered = [...results].sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-ink">{summary}</p>

      <div className="rounded-card border border-border-base">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Check</TableHead>
              <TableHead>Recorded</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((result) => (
              <TableRow key={result.id}>
                <TableCell className="text-xs text-ink-subtle tabular-nums">
                  {result.position}
                </TableCell>
                <TableCell className="text-sm text-ink">
                  {result.labelSnapshot}
                  {result.note ? (
                    <span className="block text-xs text-ink-muted">Note: {result.note}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-ink-muted">
                  {formatRecordedValue(result)}
                </TableCell>
                <TableCell>
                  <Badge variant={result.passed ? 'ok' : 'overdue'}>
                    {result.passed ? 'Pass' : 'Fail'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatRecordedValue(result: ChecklistResult): string {
  switch (result.kindSnapshot) {
    case 'boolean':
      return result.valueBool === null ? 'Not recorded' : result.valueBool ? 'Yes' : 'No';
    case 'number':
      return result.valueNum === null ? 'Not recorded' : String(result.valueNum);
    default:
      return result.valueText && result.valueText.trim() !== '' ? result.valueText : 'Not recorded';
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
