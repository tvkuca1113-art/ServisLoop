import { describe, expect, it } from 'vitest';
import { civilDate } from '../dates';
import {
  bucketUpcomingServices,
  computeComplianceByCustomer,
  computeDashboardKpis,
  computeTechnicianStats,
  toCsv,
} from '../reports';
import type { Booking, Device, Issue, WorkOrder } from '../types';

const TODAY = civilDate('2026-08-02');

function device(over: Partial<Device> & { id: string }): Device {
  return {
    orgId: 'org-1',
    locationId: 'loc-1',
    deviceTypeId: null,
    name: 'Device',
    manufacturer: null,
    model: null,
    serialNumber: null,
    installedOn: null,
    serviceIntervalDays: 365,
    intervalAnchor: null,
    lastServiceAt: null,
    nextServiceDue: null,
    status: 'active',
    publicToken: 'tok',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function workOrder(over: Partial<WorkOrder> & { id: string }): WorkOrder {
  return {
    orgId: 'org-1',
    code: 'WO-2026-0001',
    deviceId: 'd1',
    locationId: 'loc-1',
    customerId: 'cus-1',
    kind: 'scheduled',
    status: 'scheduled',
    priority: 'normal',
    scheduledFor: null,
    scheduledMinutes: null,
    assignedTo: null,
    checklistTemplateId: null,
    sourceBookingId: null,
    sourceIssueId: null,
    summary: null,
    internalNotes: null,
    openedAt: '2026-07-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    completedOn: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function issue(over: Partial<Issue> & { id: string }): Issue {
  return {
    orgId: 'org-1',
    deviceId: 'd1',
    severity: 'normal',
    title: 'Noise',
    description: null,
    reporterName: null,
    reporterEmail: null,
    reporterPhone: null,
    status: 'open',
    workOrderId: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    ...over,
  };
}

function booking(over: Partial<Booking> & { id: string }): Booking {
  return {
    orgId: 'org-1',
    deviceId: 'd1',
    requestedDate: civilDate('2026-08-10'),
    requestedStartMinute: 480,
    requestedEndMinute: 600,
    status: 'pending',
    contactName: 'Amir',
    contactEmail: null,
    contactPhone: null,
    note: null,
    workOrderId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

describe('computeDashboardKpis', () => {
  const devices = [
    device({ id: 'd1', nextServiceDue: civilDate('2026-07-01') }), // overdue
    device({ id: 'd2', nextServiceDue: civilDate('2026-08-02') }), // due
    device({ id: 'd3', nextServiceDue: civilDate('2026-08-20') }), // due soon
    device({ id: 'd4', nextServiceDue: civilDate('2026-12-01') }), // ok
    device({ id: 'd5', nextServiceDue: null }), // unscheduled
    device({ id: 'd6', nextServiceDue: civilDate('2026-01-01'), status: 'retired' }),
  ];

  it('buckets devices by service state', () => {
    const kpis = computeDashboardKpis({
      devices,
      workOrders: [],
      issues: [],
      bookings: [],
      today: TODAY,
    });
    expect(kpis.devicesByState).toEqual({
      unscheduled: 2, // d5 plus the retired d6
      ok: 1,
      due_soon: 1,
      due: 1,
      overdue: 1,
    });
    expect(kpis.devicesTotal).toBe(6);
    expect(kpis.devicesActive).toBe(5);
    expect(kpis.overdueCount).toBe(1);
    expect(kpis.dueSoonCount).toBe(2); // due_soon + due
  });

  it('excludes unscheduled and retired devices from the compliance denominator', () => {
    const kpis = computeDashboardKpis({
      devices,
      workOrders: [],
      issues: [],
      bookings: [],
      today: TODAY,
    });
    // 4 scheduled devices, 1 overdue → 75%.
    expect(kpis.complianceRate).toBe(75);
  });

  it('reports 100% compliance when nothing is scheduled', () => {
    const kpis = computeDashboardKpis({
      devices: [device({ id: 'x', nextServiceDue: null })],
      workOrders: [],
      issues: [],
      bookings: [],
      today: TODAY,
    });
    expect(kpis.complianceRate).toBe(100);
  });

  it('counts open work, unassigned work, issues and bookings', () => {
    const kpis = computeDashboardKpis({
      devices: [],
      workOrders: [
        workOrder({ id: 'w1', status: 'scheduled', assignedTo: null }),
        workOrder({ id: 'w2', status: 'in_progress', assignedTo: 'u1' }),
        workOrder({ id: 'w3', status: 'completed', assignedTo: 'u1' }),
        workOrder({ id: 'w4', status: 'cancelled', assignedTo: null }),
      ],
      issues: [
        issue({ id: 'i1', status: 'open' }),
        issue({ id: 'i2', status: 'closed', severity: 'critical' }),
        issue({ id: 'i3', status: 'triaged', severity: 'critical' }),
      ],
      bookings: [
        booking({ id: 'b1', status: 'pending' }),
        booking({ id: 'b2', status: 'confirmed' }),
      ],
      today: TODAY,
    });
    expect(kpis.openWorkOrders).toBe(2);
    expect(kpis.unassignedWorkOrders).toBe(1); // cancelled w4 does not count
    expect(kpis.openIssues).toBe(2);
    expect(kpis.criticalIssues).toBe(1); // the closed one does not count
    expect(kpis.pendingBookings).toBe(1);
  });
});

describe('bucketUpcomingServices', () => {
  it('places each device in exactly one non-overlapping bucket', () => {
    const devices = [
      device({ id: 'a', nextServiceDue: civilDate('2026-08-05') }), // 3 days
      device({ id: 'b', nextServiceDue: civilDate('2026-08-20') }), // 18 days
      device({ id: 'c', nextServiceDue: civilDate('2026-09-20') }), // 49 days
      device({ id: 'd', nextServiceDue: civilDate('2026-10-20') }), // 79 days
      device({ id: 'e', nextServiceDue: civilDate('2027-06-01') }), // out of range
      device({ id: 'f', nextServiceDue: civilDate('2026-08-05'), status: 'paused' }),
    ];
    const buckets = bucketUpcomingServices(devices, TODAY);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(buckets.map((b) => b.label)).toEqual([
      'Next 7 days',
      '8–30 days',
      '31–60 days',
      '61–90 days',
    ]);
  });
});

describe('computeTechnicianStats', () => {
  it('summarises throughput per technician', () => {
    const orders = [
      workOrder({
        id: 'w1',
        assignedTo: 'u1',
        status: 'completed',
        openedAt: '2026-07-01T00:00:00.000Z',
        completedOn: civilDate('2026-07-05'),
      }),
      workOrder({
        id: 'w2',
        assignedTo: 'u1',
        status: 'completed',
        openedAt: '2026-07-10T00:00:00.000Z',
        completedOn: civilDate('2026-07-16'),
      }),
      workOrder({ id: 'w3', assignedTo: 'u1', status: 'in_progress' }),
      workOrder({ id: 'w4', assignedTo: 'u2', status: 'scheduled' }),
      workOrder({ id: 'w5', assignedTo: null, status: 'scheduled' }),
    ];

    const stats = computeTechnicianStats(orders);
    const u1 = stats.find((s) => s.userId === 'u1');
    expect(u1).toMatchObject({ assigned: 3, completed: 2, inProgress: 1 });
    expect(u1?.completionRate).toBeCloseTo(66.7, 1);
    expect(u1?.averageDaysToComplete).toBe(5); // (4 + 6) / 2

    const u2 = stats.find((s) => s.userId === 'u2');
    expect(u2).toMatchObject({ assigned: 1, completed: 0, averageDaysToComplete: null });
  });

  it('ignores unassigned work entirely', () => {
    const stats = computeTechnicianStats([workOrder({ id: 'w', assignedTo: null })]);
    expect(stats).toEqual([]);
  });

  it('honours a completion window', () => {
    const orders = [
      workOrder({
        id: 'w1',
        assignedTo: 'u1',
        status: 'completed',
        completedOn: civilDate('2026-07-05'),
      }),
      workOrder({
        id: 'w2',
        assignedTo: 'u1',
        status: 'completed',
        completedOn: civilDate('2026-03-05'),
      }),
    ];
    const stats = computeTechnicianStats(orders, {
      from: civilDate('2026-07-01'),
      to: civilDate('2026-07-31'),
    });
    expect(stats[0]?.completed).toBe(1);
  });

  it('sorts busiest first', () => {
    const stats = computeTechnicianStats([
      workOrder({ id: 'a', assignedTo: 'quiet', status: 'scheduled' }),
      workOrder({ id: 'b', assignedTo: 'busy', status: 'completed', completedOn: TODAY }),
      workOrder({ id: 'c', assignedTo: 'busy', status: 'completed', completedOn: TODAY }),
    ]);
    expect(stats[0]?.userId).toBe('busy');
  });
});

describe('computeComplianceByCustomer', () => {
  it('rolls devices up through locations to customers', () => {
    const devices = [
      device({ id: 'd1', locationId: 'l1', nextServiceDue: civilDate('2026-07-01') }),
      device({ id: 'd2', locationId: 'l1', nextServiceDue: civilDate('2026-12-01') }),
      device({ id: 'd3', locationId: 'l2', nextServiceDue: civilDate('2026-12-01') }),
      device({ id: 'd4', locationId: 'unknown', nextServiceDue: civilDate('2026-01-01') }),
    ];
    const locations = new Map([
      ['l1', { customerId: 'c1' }],
      ['l2', { customerId: 'c2' }],
    ]);
    const names = new Map([
      ['c1', 'Hotel Neretva'],
      ['c2', 'Klinika Sunce'],
    ]);

    const rows = computeComplianceByCustomer(devices, locations, names, TODAY);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      customerName: 'Hotel Neretva',
      devices: 2,
      overdue: 1,
      complianceRate: 50,
    });
    expect(rows[1]).toMatchObject({ customerName: 'Klinika Sunce', complianceRate: 100 });
  });

  it('puts the worst offenders first', () => {
    const devices = [
      device({ id: 'd1', locationId: 'l1', nextServiceDue: civilDate('2026-12-01') }),
      device({ id: 'd2', locationId: 'l2', nextServiceDue: civilDate('2026-01-01') }),
    ];
    const rows = computeComplianceByCustomer(
      devices,
      new Map([
        ['l1', { customerId: 'c1' }],
        ['l2', { customerId: 'c2' }],
      ]),
      new Map([
        ['c1', 'Alpha'],
        ['c2', 'Beta'],
      ]),
      TODAY,
    );
    expect(rows[0]?.customerName).toBe('Beta');
  });
});

describe('toCsv', () => {
  it('emits a header row and CRLF line endings', () => {
    expect(toCsv([{ a: 1, b: 2 }])).toBe('a,b\r\n1,2');
  });

  it('quotes values containing delimiters, quotes or newlines', () => {
    expect(toCsv([{ a: 'x,y' }])).toBe('a\r\n"x,y"');
    expect(toCsv([{ a: 'say "hi"' }])).toBe('a\r\n"say ""hi"""');
    expect(toCsv([{ a: 'line1\nline2' }])).toBe('a\r\n"line1\nline2"');
  });

  it('neutralises spreadsheet formula injection', () => {
    expect(toCsv([{ a: '=1+1' }])).toBe("a\r\n'=1+1");
    expect(toCsv([{ a: '@SUM(A1)' }])).toBe("a\r\n'@SUM(A1)");
    expect(toCsv([{ a: '-5' }])).toBe("a\r\n'-5");
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsv([{ a: null, b: undefined }])).toBe('a,b\r\n,');
  });

  it('respects an explicit column order and returns empty for no rows', () => {
    expect(toCsv([{ a: 1, b: 2 }], ['b', 'a'])).toBe('b,a\r\n2,1');
    expect(toCsv([])).toBe('');
  });
});
