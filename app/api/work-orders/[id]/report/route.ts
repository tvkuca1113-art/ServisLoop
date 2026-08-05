import { NextResponse, type NextRequest } from 'next/server';

import { ForbiddenError } from '@/domain/permissions';
import { effectiveIntervalDays } from '@/domain/service-interval';
import { slugify } from '@/lib/utils';
import { isFrameworkError } from '@/server/actions/errors';
import { requirePermission, requireSession } from '@/server/auth/context';
import { getRepository } from '@/server/data';
import { renderServiceReport, serviceReportNumber } from '@/server/pdf/service-report';

/**
 * The signed service report for one job, as a PDF.
 *
 * `GET /api/work-orders/{id}/report`
 *
 * Three things this route is careful about:
 *
 * **Authorisation is contextual.** `report:generate` is unconditional for owners and
 * administrators, but assignee-only for technicians — so the work order has to be loaded
 * before the check can be made, and `isAssignee` is handed to the matrix rather than
 * turned into an `if` here. A member of another organisation gets the same 404 as a job
 * that never existed: the lookup is scoped by `session.organization.id`, so there is
 * nothing to tell the two apart.
 *
 * **The report row is created once and then reused.** `service_reports` is what makes the
 * report *number* durable — a customer who downloads the same report twice, a year apart,
 * must get the same `SR-YYYY-NNNN` on both copies, and an accountant matching a report to
 * an invoice needs that number not to move. So the first generation inserts the row and
 * every regeneration reads it back. The number itself is derived from the work-order code,
 * so it is identical whichever path opened the row.
 *
 * **Only a completed job has a report.** A service report states that work was carried
 * out. Producing one for a job still in progress would be a document making a claim that
 * is not yet true, so it is refused rather than rendered with blanks.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  // Next 15 hands route params as a promise.
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  try {
    // The session comes first because the work order is needed to answer "is this the
    // assignee?", and the work order can only be read inside a tenant.
    const session = await requireSession();
    const repo = getRepository();
    const orgId = session.organization.id;

    const workOrder = await repo.getWorkOrder(orgId, id);
    if (!workOrder) {
      return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    }

    await requirePermission('report:generate', {
      isAssignee: workOrder.assignedTo === session.user.id,
    });

    if (workOrder.status !== 'completed') {
      return NextResponse.json(
        {
          error:
            'A service report can only be produced for a completed job. Finish the checklist and close the job first.',
        },
        { status: 409 },
      );
    }

    const [device, location, results, deviceTypes, existingReport] = await Promise.all([
      repo.getDevice(orgId, workOrder.deviceId),
      repo.getLocation(orgId, workOrder.locationId),
      repo.listChecklistResults(orgId, workOrder.id),
      repo.listDeviceTypes(orgId),
      repo.getServiceReportByWorkOrder(orgId, workOrder.id),
    ]);

    if (!device || !location) {
      return NextResponse.json(
        { error: 'The device or site this job was filed against no longer exists.' },
        { status: 404 },
      );
    }

    const customer = await repo.getCustomer(orgId, workOrder.customerId);
    if (!customer) {
      return NextResponse.json({ error: 'The customer for this job no longer exists.' }, { status: 404 });
    }

    const [technician] = workOrder.assignedTo ? await repo.listProfiles([workOrder.assignedTo]) : [];

    const items = workOrder.checklistTemplateId
      ? await repo.listChecklistItems(orgId, workOrder.checklistTemplateId)
      : [];

    // First generation opens the row; every regeneration reuses it, which is what keeps
    // the number — and therefore the customer's copy — stable.
    const report =
      existingReport ??
      (await repo.createServiceReport({
        orgId,
        workOrderId: workOrder.id,
        number: serviceReportNumber(workOrder.code),
        generatedAt: new Date().toISOString(),
        signedByName: null,
        totalMinutes: null,
      }));

    const deviceType = device.deviceTypeId
      ? (deviceTypes.find((t) => t.id === device.deviceTypeId) ?? null)
      : null;

    const pdf = await renderServiceReport({
      organization: session.organization,
      workOrder,
      device,
      location,
      customer,
      technician: technician ?? null,
      report,
      results,
      items,
      // Read off the device rather than recomputed: `recalculateDeviceSchedule` already
      // wrote it at completion, and this route must not become a second opinion.
      nextServiceDue: device.nextServiceDue,
      intervalDays: effectiveIntervalDays(device, deviceType),
    });

    // A meaningful download name — `report.pdf` in a folder of them is useless. Slugified,
    // so the filename stays ASCII even when the customer's name is not.
    const stem = `${slugify(report.number)}-${slugify(customer.name) || 'customer'}`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.byteLength),
        'Content-Disposition': `attachment; filename="${stem}.pdf"`,
        // Scoped to one signed-in user, so it must never land in a shared cache.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    // `redirect()` and `notFound()` signal control flow by throwing; those must reach the
    // framework untouched. Everything else is a real failure.
    if (isFrameworkError(error)) throw error;

    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: 'Your role does not allow you to generate this report.' },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not produce the report.' },
      { status: 500 },
    );
  }
}
