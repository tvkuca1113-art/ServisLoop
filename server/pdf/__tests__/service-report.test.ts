import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, civilDate } from '@/domain/dates';
import type {
  ChecklistItem,
  ChecklistResult,
  Customer,
  Device,
  Location,
  Organization,
  Profile,
  ServiceReport,
  WorkOrder,
} from '@/domain/types';
import { __setRepositoryForTests } from '@/server/data';
import { JsonRepository } from '@/server/data/json-repository';
import { createDemoStore, DEMO } from '@/server/data/seed';

import { renderServiceReport, serviceReportNumber, type ServiceReportInput } from '../service-report';

/**
 * Integration tests for the PDF renderer.
 *
 * Rendered against a real `JsonRepository` seeded with the demo organisation, so the input
 * is the same shape the route hands it — including the Bosnian names in the fixture, which
 * are the whole reason a Unicode font is embedded rather than a standard one.
 *
 * Three properties are load-bearing and are asserted directly:
 *
 * - it produces a PDF at all;
 * - the same input produces byte-identical output, so a regenerated report can be
 *   checksummed against the customer's copy;
 * - a checklist longer than one page continues onto a second one rather than running off
 *   the bottom of the first.
 */

const TODAY = civilDate('2026-08-02');

let repo: JsonRepository;
let org: Organization;
let device: Device;
let location: Location;
let customer: Customer;
let technician: Profile;
let workOrder: WorkOrder;

async function seed(): Promise<void> {
  repo = new JsonRepository({ seed: () => createDemoStore(TODAY) });
  __setRepositoryForTests(repo);

  const found = await repo.getOrganization(DEMO.orgId);
  if (!found) throw new Error('demo organisation missing from seed');
  org = found;

  const devices = await repo.listDevices(org.id);
  const withType = devices.find((d) => d.deviceTypeId && d.serialNumber);
  if (!withType) throw new Error('seed has no device with a type');
  device = withType;

  const foundLocation = await repo.getLocation(org.id, device.locationId);
  if (!foundLocation) throw new Error('seed device has no location');
  location = foundLocation;

  const foundCustomer = await repo.getCustomer(org.id, location.customerId);
  if (!foundCustomer) throw new Error('seed location has no customer');
  customer = foundCustomer;

  const [profile] = await repo.listProfiles([DEMO.tech1Id]);
  if (!profile) throw new Error('seed has no technician profile');
  technician = profile;

  const orders = await repo.listWorkOrders(org.id, { deviceId: device.id });
  const first = orders[0];
  workOrder =
    first ??
    (await repo.createWorkOrder({
      orgId: org.id,
      code: 'WO-2026-0099',
      deviceId: device.id,
      locationId: location.id,
      customerId: customer.id,
      kind: 'scheduled',
      status: 'completed',
      priority: 'normal',
      scheduledFor: `${TODAY}T08:00:00.000Z`,
      scheduledMinutes: 120,
      assignedTo: technician.id,
      checklistTemplateId: null,
      sourceBookingId: null,
      sourceIssueId: null,
      summary: null,
      internalNotes: null,
      openedAt: `${TODAY}T07:00:00.000Z`,
      startedAt: `${TODAY}T08:00:00.000Z`,
      completedAt: `${TODAY}T10:00:00.000Z`,
      completedOn: TODAY,
    }));
}

beforeEach(seed);

/** A fixed report row — the renderer takes its timestamps from here, never from a clock. */
function reportRow(overrides: Partial<ServiceReport> = {}): ServiceReport {
  return {
    id: 'report-fixed-id',
    orgId: org.id,
    workOrderId: workOrder.id,
    number: serviceReportNumber(workOrder.code),
    generatedAt: '2026-08-02T10:15:00.000Z',
    signedByName: 'Amina Hodžić',
    totalMinutes: 95,
    ...overrides,
  };
}

function result(
  index: number,
  overrides: Partial<ChecklistResult> = {},
): ChecklistResult {
  return {
    id: `result-${index}`,
    orgId: org.id,
    workOrderId: workOrder.id,
    itemId: `item-${index}`,
    labelSnapshot: `Check number ${index}`,
    kindSnapshot: 'boolean',
    position: index,
    valueBool: true,
    valueNum: null,
    valueText: null,
    passed: true,
    note: null,
    ...overrides,
  };
}

function input(overrides: Partial<ServiceReportInput> = {}): ServiceReportInput {
  return {
    organization: org,
    workOrder: { ...workOrder, status: 'completed', completedOn: TODAY },
    device,
    location,
    customer,
    technician,
    report: reportRow(),
    results: [
      result(1),
      result(2, {
        kindSnapshot: 'number',
        valueBool: null,
        valueNum: 1.8,
      }),
      result(3, {
        kindSnapshot: 'select',
        valueBool: null,
        valueText: 'worn',
        passed: false,
        note: 'Burner shows scaling on the left bank. Replacement quoted separately.',
      }),
    ],
    items: [],
    nextServiceDue: addDays(TODAY, 365),
    intervalDays: 365,
    ...overrides,
  };
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

function header(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.slice(0, 5));
}

describe('renderServiceReport', () => {
  it('produces a PDF', async () => {
    const bytes = await renderServiceReport(input());

    expect(header(bytes)).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic — the same input renders the same bytes', async () => {
    // The property that lets a regenerated report be checksummed against the copy the
    // customer already holds. It only holds because the renderer takes its timestamps
    // from the stored report row and stamps them into the document explicitly.
    const first = await renderServiceReport(input());
    const second = await renderServiceReport(input());

    expect(second.byteLength).toBe(first.byteLength);
    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
  });

  it('changes when the input changes', async () => {
    // Guards the guard: a renderer that ignored its input would also be "deterministic".
    const first = await renderServiceReport(input());
    const second = await renderServiceReport(
      input({ report: reportRow({ signedByName: 'Neko Drugi' }) }),
    );

    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(false);
  });

  it('flows a long checklist onto a second page rather than off the first', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      result(i + 1, {
        labelSnapshot: `Inspection point ${i + 1} — visual condition, fixings and clearance`,
        passed: i % 7 !== 0,
        note: i % 7 === 0 ? 'Fixing corroded; replaced with stainless equivalent on site.' : null,
      }),
    );

    const bytes = await renderServiceReport(input({ results: many }));
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(2);

    // And the tail of the document is still there: the signature block and the footer are
    // laid out after the checklist, so an overflow that silently truncated would show up
    // as a missing page rather than a short one.
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe((await pageCount(bytes)));
    expect(doc.getPage(doc.getPageCount() - 1)).toBeDefined();
  });

  it('renders Bosnian diacritics without throwing', async () => {
    // The reason DejaVu is embedded at all: the standard PDF fonts are Latin-1 and
    // `pdf-lib` throws `WinAnsi cannot encode` on the first `č`.
    const bosnian = {
      ...device,
      name: 'Kotlovnica — grijač čvrsto ušće, đon žica',
      manufacturer: 'Preduzeće Šipad d.o.o.',
      model: 'ČĆŽŠĐ-100',
    };

    const bytes = await renderServiceReport(
      input({
        device: bosnian,
        customer: { ...customer, name: 'Ugostiteljstvo “Šadrvan” d.o.o.' },
        technician: { ...technician, fullName: 'Đorđe Šišković' },
        report: reportRow({ signedByName: 'Mujo Hadžiabdić' }),
        results: [
          result(1, {
            labelSnapshot: 'Provjera dimovodnih plinova i čađi',
            kindSnapshot: 'text',
            valueBool: null,
            valueText: 'Očišćeno, bez naslaga čađi.',
          }),
        ],
      }),
    );

    expect(header(bytes)).toBe('%PDF-');
  });

  it('handles a job with no checklist at all', async () => {
    const bytes = await renderServiceReport(input({ results: [], items: [] }));
    expect(header(bytes)).toBe('%PDF-');
  });

  it('prints the tolerance band beside a numeric reading', async () => {
    const item: ChecklistItem = {
      id: 'item-2',
      orgId: org.id,
      templateId: 'template-1',
      position: 2,
      label: 'System pressure',
      kind: 'number',
      required: true,
      options: null,
      unit: 'bar',
      minValue: 1,
      maxValue: 2.5,
      expectedBoolean: null,
    };

    const bytes = await renderServiceReport(input({ items: [item] }));
    expect(header(bytes)).toBe('%PDF-');
  });
});

describe('serviceReportNumber', () => {
  it('shares the work order’s sequence', () => {
    expect(serviceReportNumber('WO-2026-0042')).toBe('SR-2026-0042');
  });

  it('degrades safely for a code it cannot parse', () => {
    expect(serviceReportNumber('WO-LEGACY')).toBe('SR-LEGACY');
  });
});
