import { addDays, civilDate, civilDateFromUTC, type CivilDate } from '@/domain/dates';
import { planReminders } from '@/domain/reminders';
import { defaultBusinessHours } from '@/domain/availability';
import { formatWorkOrderCode } from '@/domain/work-order';
import type {
  ChecklistItem,
  ChecklistTemplate,
  Customer,
  Device,
  DeviceType,
  Location,
  Membership,
  Organization,
  Profile,
  Reminder,
  WorkOrder,
} from '@/domain/types';

import { emptyStore, type StoreShape } from './json-repository';

/**
 * The demo organisation.
 *
 * Built from fixed UUIDs and offsets from a supplied reference day, so the same
 * `anchorToday` always produces byte-identical data. That determinism is what lets the
 * integration tests assert against the seed and lets `npm run db:reset` return a
 * demo to a known state.
 *
 * Dates are expressed as offsets rather than literals so the demo is always
 * *interesting* — a few devices overdue, a few due soon, most healthy — no matter when
 * someone first opens it.
 */

export const DEMO = {
  orgId: '00000000-0000-4000-8000-000000000001',
  ownerId: '00000000-0000-4000-8000-000000000010',
  dispatcherId: '00000000-0000-4000-8000-000000000011',
  tech1Id: '00000000-0000-4000-8000-000000000012',
  tech2Id: '00000000-0000-4000-8000-000000000013',
  slug: 'demo',
} as const;

const uuid = (n: number, prefix = 'a'): string =>
  `00000000-0000-4000-8${prefix}00-${String(n).padStart(12, '0')}`;

const iso = (day: CivilDate): string => `${day}T08:00:00.000Z`;

interface DeviceSeed {
  name: string;
  type: number;
  manufacturer: string;
  model: string;
  serial: string;
  /** Offset in days from the reference day. Negative = overdue. */
  dueOffset: number | null;
  intervalDays: number;
  installedYearsAgo: number;
  status?: Device['status'];
}

interface LocationSeed {
  name: string;
  address: string;
  city: string;
  devices: DeviceSeed[];
}

interface CustomerSeed {
  name: string;
  contact: string;
  email: string;
  phone: string;
  locations: LocationSeed[];
}

const DEVICE_TYPES: Array<{ name: string; intervalDays: number }> = [
  { name: 'Gas boiler', intervalDays: 365 },
  { name: 'Air conditioning unit', intervalDays: 180 },
  { name: 'Fire alarm panel', intervalDays: 90 },
  { name: 'Passenger lift', intervalDays: 30 },
];

const CUSTOMERS: CustomerSeed[] = [
  {
    name: 'Hotel Neretva',
    contact: 'Amina Hodžić',
    email: 'tehnika@hotelneretva.example',
    phone: '+387 36 555 120',
    locations: [
      {
        name: 'Main building',
        address: 'Maršala Tita 12',
        city: 'Mostar',
        devices: [
          {
            name: 'Boiler room — primary',
            type: 0,
            manufacturer: 'Viessmann',
            model: 'Vitodens 200-W',
            serial: 'VD-200-88421',
            dueOffset: -22,
            intervalDays: 365,
            installedYearsAgo: 6,
          },
          {
            name: 'Boiler room — backup',
            type: 0,
            manufacturer: 'Viessmann',
            model: 'Vitodens 100-W',
            serial: 'VD-100-88422',
            dueOffset: 41,
            intervalDays: 365,
            installedYearsAgo: 6,
          },
          {
            name: 'Lobby AC',
            type: 1,
            manufacturer: 'Daikin',
            model: 'FTXM50R',
            serial: 'DK-50R-11903',
            dueOffset: 5,
            intervalDays: 180,
            installedYearsAgo: 3,
          },
          {
            name: 'Guest lift A',
            type: 3,
            manufacturer: 'Kone',
            model: 'MonoSpace 500',
            serial: 'KN-MS500-4471',
            dueOffset: 12,
            intervalDays: 30,
            installedYearsAgo: 9,
          },
          {
            name: 'Fire panel — reception',
            type: 2,
            manufacturer: 'Bosch',
            model: 'FPA-5000',
            serial: 'BS-FPA-72214',
            dueOffset: -3,
            intervalDays: 90,
            installedYearsAgo: 4,
          },
        ],
      },
      {
        name: 'Annex wing',
        address: 'Maršala Tita 14',
        city: 'Mostar',
        devices: [
          {
            name: 'Annex AC — floor 1',
            type: 1,
            manufacturer: 'Mitsubishi',
            model: 'MSZ-AP35VG',
            serial: 'MT-AP35-55120',
            dueOffset: 88,
            intervalDays: 180,
            installedYearsAgo: 2,
          },
          {
            name: 'Annex AC — floor 2',
            type: 1,
            manufacturer: 'Mitsubishi',
            model: 'MSZ-AP35VG',
            serial: 'MT-AP35-55121',
            dueOffset: 88,
            intervalDays: 180,
            installedYearsAgo: 2,
          },
        ],
      },
    ],
  },
  {
    name: 'Klinika Sunce',
    contact: 'dr. Emir Begić',
    email: 'odrzavanje@klinikasunce.example',
    phone: '+387 33 712 440',
    locations: [
      {
        name: 'Outpatient clinic',
        address: 'Zmaja od Bosne 74',
        city: 'Sarajevo',
        devices: [
          {
            name: 'Theatre AC unit',
            type: 1,
            manufacturer: 'Daikin',
            model: 'FXFQ63A',
            serial: 'DK-63A-30188',
            dueOffset: 2,
            intervalDays: 180,
            installedYearsAgo: 5,
          },
          {
            name: 'Fire panel — east stair',
            type: 2,
            manufacturer: 'Siemens',
            model: 'Cerberus FIT',
            serial: 'SM-CFIT-90233',
            dueOffset: 19,
            intervalDays: 90,
            installedYearsAgo: 7,
          },
          {
            name: 'Service lift',
            type: 3,
            manufacturer: 'Schindler',
            model: '3300 AP',
            serial: 'SC-3300-1180',
            dueOffset: -8,
            intervalDays: 30,
            installedYearsAgo: 11,
          },
          {
            name: 'Heating boiler',
            type: 0,
            manufacturer: 'Buderus',
            model: 'Logamax plus GB172',
            serial: 'BD-GB172-6640',
            dueOffset: 210,
            intervalDays: 365,
            installedYearsAgo: 8,
          },
        ],
      },
    ],
  },
  {
    name: 'Pekara Klas',
    contact: 'Senad Kovačević',
    email: 'senad@pekaraklas.example',
    phone: '+387 32 445 901',
    locations: [
      {
        name: 'Production hall',
        address: 'Industrijska zona bb',
        city: 'Zenica',
        devices: [
          {
            name: 'Process boiler',
            type: 0,
            manufacturer: 'Bosch',
            model: 'Universal UT-H',
            serial: 'BS-UTH-22004',
            dueOffset: 65,
            intervalDays: 365,
            installedYearsAgo: 4,
          },
          {
            name: 'Fire panel — hall',
            type: 2,
            manufacturer: 'Bosch',
            model: 'FPA-1200',
            serial: 'BS-FPA-22110',
            dueOffset: 27,
            intervalDays: 90,
            installedYearsAgo: 4,
          },
          {
            name: 'Cold store AC',
            type: 1,
            manufacturer: 'Carrier',
            model: '38QUS',
            serial: 'CR-38Q-77410',
            dueOffset: null,
            intervalDays: 180,
            installedYearsAgo: 1,
            status: 'paused',
          },
        ],
      },
      {
        name: 'Retail shop — centre',
        address: 'Trg Alije Izetbegovića 3',
        city: 'Zenica',
        devices: [
          {
            name: 'Shop AC',
            type: 1,
            manufacturer: 'LG',
            model: 'S12EQ',
            serial: 'LG-S12-40021',
            dueOffset: 130,
            intervalDays: 180,
            installedYearsAgo: 2,
          },
        ],
      },
    ],
  },
  {
    name: 'Poslovni centar Unitic',
    contact: 'Lejla Softić',
    email: 'facility@unitic.example',
    phone: '+387 33 289 100',
    locations: [
      {
        name: 'Tower A',
        address: 'Fra Anđela Zvizdovića 1',
        city: 'Sarajevo',
        devices: [
          {
            name: 'Lift A1',
            type: 3,
            manufacturer: 'Otis',
            model: 'Gen2 Comfort',
            serial: 'OT-G2-55001',
            dueOffset: 8,
            intervalDays: 30,
            installedYearsAgo: 12,
          },
          {
            name: 'Lift A2',
            type: 3,
            manufacturer: 'Otis',
            model: 'Gen2 Comfort',
            serial: 'OT-G2-55002',
            dueOffset: -1,
            intervalDays: 30,
            installedYearsAgo: 12,
          },
          {
            name: 'Chiller — roof',
            type: 1,
            manufacturer: 'Trane',
            model: 'RTAF 160',
            serial: 'TR-RTAF-9012',
            dueOffset: 54,
            intervalDays: 180,
            installedYearsAgo: 6,
          },
          {
            name: 'Fire panel — Tower A',
            type: 2,
            manufacturer: 'Honeywell',
            model: 'NOTIFIER NFS2',
            serial: 'HW-NFS2-3301',
            dueOffset: 61,
            intervalDays: 90,
            installedYearsAgo: 10,
          },
          {
            name: 'Decommissioned boiler',
            type: 0,
            manufacturer: 'Vaillant',
            model: 'ecoTEC pro',
            serial: 'VL-ECO-1102',
            dueOffset: null,
            intervalDays: 365,
            installedYearsAgo: 15,
            status: 'retired',
          },
        ],
      },
    ],
  },
];

const BOILER_CHECKS: Array<Omit<ChecklistItem, 'id' | 'orgId' | 'templateId'>> = [
  { position: 1, label: 'Flue and combustion gases visually inspected', kind: 'boolean', required: true, options: null, unit: null, minValue: null, maxValue: null, expectedBoolean: true },
  { position: 2, label: 'System pressure', kind: 'number', required: true, options: null, unit: 'bar', minValue: 1, maxValue: 2.5, expectedBoolean: null },
  { position: 3, label: 'Flue gas temperature', kind: 'number', required: true, options: null, unit: '°C', minValue: 60, maxValue: 200, expectedBoolean: null },
  { position: 4, label: 'Gas leak detected', kind: 'boolean', required: true, options: null, unit: null, minValue: null, maxValue: null, expectedBoolean: false },
  { position: 5, label: 'Burner condition', kind: 'select', required: true, options: ['good', 'worn', 'replace'], unit: null, minValue: null, maxValue: null, expectedBoolean: null },
  { position: 6, label: 'Safety valve tested', kind: 'boolean', required: true, options: null, unit: null, minValue: null, maxValue: null, expectedBoolean: true },
  { position: 7, label: 'Engineer notes', kind: 'text', required: false, options: null, unit: null, minValue: null, maxValue: null, expectedBoolean: null },
];

const AC_CHECKS: Array<Omit<ChecklistItem, 'id' | 'orgId' | 'templateId'>> = [
  { position: 1, label: 'Filters cleaned or replaced', kind: 'boolean', required: true, options: null, unit: null, minValue: null, maxValue: null, expectedBoolean: true },
  { position: 2, label: 'Refrigerant pressure', kind: 'number', required: true, options: null, unit: 'bar', minValue: 4, maxValue: 12, expectedBoolean: null },
  { position: 3, label: 'Condensate drain clear', kind: 'boolean', required: true, options: null, unit: null, minValue: null, maxValue: null, expectedBoolean: true },
  { position: 4, label: 'Supply air temperature', kind: 'number', required: true, options: null, unit: '°C', minValue: 8, maxValue: 20, expectedBoolean: null },
  { position: 5, label: 'Unusual noise or vibration', kind: 'boolean', required: true, options: null, unit: null, minValue: null, maxValue: null, expectedBoolean: false },
  { position: 6, label: 'Engineer notes', kind: 'text', required: false, options: null, unit: null, minValue: null, maxValue: null, expectedBoolean: null },
];

/**
 * Build the complete demo store.
 *
 * @param anchorToday the reference day all offsets are measured from
 * @param tokenFor    injected so tests can use predictable tokens while the running app
 *                    uses cryptographically random ones
 */
export function createDemoStore(
  anchorToday: CivilDate = civilDateFromUTC(new Date()),
  tokenFor: (index: number) => string = (i) =>
    `demo-token-${String(i).padStart(3, '0')}-${'x'.repeat(30)}`,
): StoreShape {
  const store = emptyStore();
  const now = iso(anchorToday);

  const org: Organization = {
    id: DEMO.orgId,
    name: 'ServisLoop Demo d.o.o.',
    slug: DEMO.slug,
    timezone: 'Europe/Sarajevo',
    reminderLeadDays: 30,
    defaultIntervalAnchor: 'schedule',
    slotMinutes: 120,
    bookingLeadHours: 24,
    bookingHorizonDays: 60,
    isDemo: true,
    createdAt: now,
  };
  store.organizations.push(org);

  const people: Array<[string, string, string, Membership['role']]> = [
    [DEMO.ownerId, 'owner@demo.servisloop.app', 'Adnan Selimović', 'owner'],
    [DEMO.dispatcherId, 'dispatch@demo.servisloop.app', 'Marija Perić', 'admin'],
    [DEMO.tech1Id, 'tech1@demo.servisloop.app', 'Haris Delić', 'technician'],
    [DEMO.tech2Id, 'tech2@demo.servisloop.app', 'Ivan Marić', 'technician'],
  ];

  people.forEach(([id, email, fullName, role], i) => {
    const profile: Profile = { id, email, fullName, createdAt: now };
    store.profiles.push(profile);
    store.memberships.push({
      id: uuid(100 + i, 'b'),
      orgId: org.id,
      userId: id,
      role,
      createdAt: now,
    });
  });

  // Device types
  const typeIds: string[] = [];
  DEVICE_TYPES.forEach((t, i) => {
    const row: DeviceType = {
      id: uuid(200 + i, 'c'),
      orgId: org.id,
      name: t.name,
      defaultIntervalDays: t.intervalDays,
      checklistTemplateId: null,
      createdAt: now,
    };
    typeIds.push(row.id);
    store.deviceTypes.push(row);
  });

  // Checklist templates
  const boilerTemplate: ChecklistTemplate = {
    id: uuid(300, 'd'),
    orgId: org.id,
    name: 'Annual gas boiler service',
    version: 1,
    archivedAt: null,
    createdAt: now,
  };
  const acTemplate: ChecklistTemplate = {
    id: uuid(301, 'd'),
    orgId: org.id,
    name: 'AC unit maintenance',
    version: 1,
    archivedAt: null,
    createdAt: now,
  };
  store.checklistTemplates.push(boilerTemplate, acTemplate);

  BOILER_CHECKS.forEach((item, i) => {
    store.checklistItems.push({
      ...item,
      id: uuid(400 + i, 'e'),
      orgId: org.id,
      templateId: boilerTemplate.id,
    });
  });
  AC_CHECKS.forEach((item, i) => {
    store.checklistItems.push({
      ...item,
      id: uuid(500 + i, 'e'),
      orgId: org.id,
      templateId: acTemplate.id,
    });
  });

  const boilerTypeId = typeIds[0] as string;
  const acTypeId = typeIds[1] as string;
  store.deviceTypes = store.deviceTypes.map((t) =>
    t.id === boilerTypeId
      ? { ...t, checklistTemplateId: boilerTemplate.id }
      : t.id === acTypeId
        ? { ...t, checklistTemplateId: acTemplate.id }
        : t,
  );

  // Customers → locations → devices
  let customerIndex = 0;
  let locationIndex = 0;
  let deviceIndex = 0;

  for (const c of CUSTOMERS) {
    const customer: Customer = {
      id: uuid(1000 + customerIndex, 'f'),
      orgId: org.id,
      name: c.name,
      contactName: c.contact,
      email: c.email,
      phone: c.phone,
      externalRef: `CUST-${String(customerIndex + 1).padStart(3, '0')}`,
      notes: null,
      archivedAt: null,
      createdAt: now,
    };
    store.customers.push(customer);
    customerIndex += 1;

    for (const l of c.locations) {
      const location: Location = {
        id: uuid(2000 + locationIndex, 'f'),
        orgId: org.id,
        customerId: customer.id,
        name: l.name,
        addressLine: l.address,
        city: l.city,
        postalCode: null,
        country: 'BA',
        notes: null,
        createdAt: now,
      };
      store.locations.push(location);
      locationIndex += 1;

      for (const d of l.devices) {
        const nextServiceDue = d.dueOffset === null ? null : addDays(anchorToday, d.dueOffset);
        const lastServiceAt = nextServiceDue ? addDays(nextServiceDue, -d.intervalDays) : null;

        const device: Device = {
          id: uuid(3000 + deviceIndex, 'f'),
          orgId: org.id,
          locationId: location.id,
          deviceTypeId: typeIds[d.type] ?? null,
          name: d.name,
          manufacturer: d.manufacturer,
          model: d.model,
          serialNumber: d.serial,
          installedOn: addDays(anchorToday, -365 * d.installedYearsAgo),
          serviceIntervalDays: d.intervalDays,
          intervalAnchor: null,
          lastServiceAt,
          nextServiceDue,
          status: d.status ?? 'active',
          publicToken: tokenFor(deviceIndex),
          notes: null,
          createdAt: now,
        };
        store.devices.push(device);
        deviceIndex += 1;
      }
    }
  }

  // Business hours and a public holiday
  defaultBusinessHours().forEach((h, i) => {
    store.businessHours.push({ ...h, id: uuid(600 + i, 'e'), orgId: org.id });
  });
  store.blackoutDates.push({
    id: uuid(700, 'e'),
    orgId: org.id,
    date: addDays(anchorToday, 14),
    reason: 'Company training day',
  });

  // Reminders derived from every scheduled device, using the same planner the app uses.
  const reminders: Reminder[] = [];
  let reminderIndex = 0;
  for (const device of store.devices) {
    if (device.status !== 'active' || !device.nextServiceDue) continue;
    for (const item of planReminders({ deviceId: device.id, dueDate: device.nextServiceDue })) {
      const isPast = item.scheduledFor <= anchorToday;
      reminders.push({
        id: uuid(4000 + reminderIndex, 'f'),
        orgId: org.id,
        deviceId: device.id,
        dueDate: item.dueDate,
        stage: item.stage,
        scheduledFor: item.scheduledFor,
        status: isPast ? 'sent' : 'pending',
        sentAt: isPast ? iso(item.scheduledFor) : null,
        error: null,
        createdAt: now,
      });
      reminderIndex += 1;
    }
  }
  store.reminders.push(...reminders);

  // A handful of work orders across the lifecycle.
  const year = Number(anchorToday.slice(0, 4));
  const overdueDevices = store.devices.filter(
    (d) => d.status === 'active' && d.nextServiceDue && d.nextServiceDue < anchorToday,
  );
  const soonDevices = store.devices.filter(
    (d) =>
      d.status === 'active' &&
      d.nextServiceDue &&
      d.nextServiceDue >= anchorToday &&
      d.nextServiceDue <= addDays(anchorToday, 20),
  );

  const workOrders: WorkOrder[] = [];
  let sequence = 0;

  const pushWorkOrder = (
    device: Device,
    status: WorkOrder['status'],
    scheduledOffset: number,
    assignedTo: string | null,
    kind: WorkOrder['kind'] = 'scheduled',
  ): void => {
    const location = store.locations.find((l) => l.id === device.locationId);
    if (!location) return;
    sequence += 1;
    const scheduledDay = addDays(anchorToday, scheduledOffset);
    workOrders.push({
      id: uuid(5000 + sequence, 'f'),
      orgId: org.id,
      code: formatWorkOrderCode(year, sequence),
      deviceId: device.id,
      locationId: location.id,
      customerId: location.customerId,
      kind,
      status,
      priority: status === 'in_progress' ? 'high' : 'normal',
      scheduledFor: `${scheduledDay}T${status === 'in_progress' ? '09' : '08'}:00:00.000Z`,
      scheduledMinutes: 120,
      assignedTo,
      checklistTemplateId:
        device.deviceTypeId === boilerTypeId
          ? boilerTemplate.id
          : device.deviceTypeId === acTypeId
            ? acTemplate.id
            : null,
      sourceBookingId: null,
      sourceIssueId: null,
      summary: null,
      internalNotes: null,
      openedAt: iso(addDays(anchorToday, scheduledOffset - 7)),
      startedAt: status === 'in_progress' ? iso(scheduledDay) : null,
      completedAt: null,
      completedOn: null,
      createdAt: iso(addDays(anchorToday, scheduledOffset - 7)),
    });
  };

  overdueDevices.slice(0, 3).forEach((d, i) => {
    pushWorkOrder(d, i === 0 ? 'in_progress' : 'scheduled', i === 0 ? 0 : 2 + i, i % 2 === 0 ? DEMO.tech1Id : DEMO.tech2Id);
  });
  soonDevices.slice(0, 3).forEach((d, i) => {
    pushWorkOrder(d, 'scheduled', 3 + i * 2, i === 0 ? DEMO.tech2Id : null);
  });
  if (overdueDevices[0]) {
    pushWorkOrder(overdueDevices[0], 'draft', 9, null);
  }
  // Completed history.
  //
  // Without this the reports page, the technician throughput figures and the PDF service
  // report all open empty, and the first thing anyone evaluating the product sees is a
  // blank screen. Each completed job gets a full set of checklist results so the generated
  // PDF has real content — including one failed check with an explanation, because a
  // report that only ever shows green proves nothing about the failure path.
  const completedSeeds: Array<{ device: Device; daysAgo: number; tech: string }> = [];
  const serviceable = store.devices.filter((d) => d.status === 'active' && d.deviceTypeId);
  [40, 75, 118, 160].forEach((daysAgo, i) => {
    const device = serviceable[i % Math.max(serviceable.length, 1)];
    if (device) {
      completedSeeds.push({ device, daysAgo, tech: i % 2 === 0 ? DEMO.tech1Id : DEMO.tech2Id });
    }
  });

  let resultIndex = 0;
  for (const { device, daysAgo, tech } of completedSeeds) {
    const location = store.locations.find((l) => l.id === device.locationId);
    if (!location) continue;

    sequence += 1;
    const completedOn = addDays(anchorToday, -daysAgo);
    const templateId =
      device.deviceTypeId === boilerTypeId
        ? boilerTemplate.id
        : device.deviceTypeId === acTypeId
          ? acTemplate.id
          : null;

    const workOrderId = uuid(5500 + sequence, 'f');
    workOrders.push({
      id: workOrderId,
      orgId: org.id,
      code: formatWorkOrderCode(year, sequence),
      deviceId: device.id,
      locationId: location.id,
      customerId: location.customerId,
      kind: 'scheduled',
      status: 'completed',
      priority: 'normal',
      scheduledFor: `${completedOn}T08:00:00.000Z`,
      scheduledMinutes: 120,
      assignedTo: tech,
      checklistTemplateId: templateId,
      sourceBookingId: null,
      sourceIssueId: null,
      summary: 'Routine maintenance carried out, unit left in service.',
      internalNotes: null,
      openedAt: iso(addDays(completedOn, -10)),
      startedAt: `${completedOn}T08:05:00.000Z`,
      completedAt: `${completedOn}T10:20:00.000Z`,
      completedOn,
      createdAt: iso(addDays(completedOn, -10)),
    });

    const items = store.checklistItems
      .filter((it) => it.templateId === templateId)
      .sort((a, b) => a.position - b.position);

    // One deliberate failure on the oldest job, so the demo shows a real fault record.
    const failItemPosition = daysAgo === 160 ? 5 : -1;

    for (const item of items) {
      const shouldFail = item.position === failItemPosition;
      const midpoint =
        item.minValue !== null && item.maxValue !== null
          ? Math.round(((item.minValue + item.maxValue) / 2) * 10) / 10
          : 0;

      store.checklistResults.push({
        id: uuid(7000 + resultIndex, 'f'),
        orgId: org.id,
        workOrderId,
        itemId: item.id,
        labelSnapshot: item.label,
        kindSnapshot: item.kind,
        position: item.position,
        valueBool: item.kind === 'boolean' ? (item.expectedBoolean ?? true) : null,
        valueNum: item.kind === 'number' ? midpoint : null,
        valueText:
          item.kind === 'select'
            ? shouldFail
              ? 'replace'
              : (item.options?.[0] ?? null)
            : item.kind === 'text'
              ? 'No further action required.'
              : null,
        passed: !shouldFail,
        note: shouldFail ? 'Burner showing heavy wear; replacement quoted separately.' : null,
      });
      resultIndex += 1;
    }

    store.serviceReports.push({
      id: uuid(7500 + sequence, 'f'),
      orgId: org.id,
      workOrderId,
      number: formatWorkOrderCode(year, sequence).replace('WO-', 'SR-'),
      generatedAt: `${completedOn}T10:30:00.000Z`,
      signedByName: 'Customer representative',
      totalMinutes: 135,
    });
  }

  store.workOrders.push(...workOrders);
  store.workOrderCounters[`${org.id}:${year}`] = sequence;

  // Customer intake: one pending booking, two open issues.
  const bookingDevice = soonDevices[0] ?? store.devices[0];
  if (bookingDevice) {
    store.bookings.push({
      id: uuid(6000, 'f'),
      orgId: org.id,
      deviceId: bookingDevice.id,
      requestedDate: addDays(anchorToday, 6),
      requestedStartMinute: 10 * 60,
      requestedEndMinute: 12 * 60,
      status: 'pending',
      contactName: 'Amina Hodžić',
      contactEmail: 'tehnika@hotelneretva.example',
      contactPhone: '+387 36 555 120',
      note: 'Preferably before noon — the restaurant opens at 12.',
      workOrderId: null,
      createdAt: iso(addDays(anchorToday, -1)),
    });
  }

  const issueDevice = overdueDevices[1] ?? store.devices[1];
  if (issueDevice) {
    store.issues.push({
      id: uuid(6100, 'f'),
      orgId: org.id,
      deviceId: issueDevice.id,
      severity: 'high',
      title: 'Loud knocking when the unit starts',
      description:
        'Started three days ago. Happens on every cold start, settles after about a minute.',
      reporterName: 'Senad Kovačević',
      reporterEmail: 'senad@pekaraklas.example',
      reporterPhone: '+387 32 445 901',
      status: 'open',
      workOrderId: null,
      createdAt: iso(addDays(anchorToday, -2)),
    });
  }

  const issueDevice2 = store.devices.find((d) => d.status === 'active' && d.id !== issueDevice?.id);
  if (issueDevice2) {
    store.issues.push({
      id: uuid(6101, 'f'),
      orgId: org.id,
      deviceId: issueDevice2.id,
      severity: 'critical',
      title: 'Fault lamp lit, unit will not restart',
      description: 'Panel shows error E04. We have switched it off at the isolator.',
      reporterName: 'Lejla Softić',
      reporterEmail: 'facility@unitic.example',
      reporterPhone: '+387 33 289 100',
      status: 'triaged',
      workOrderId: null,
      createdAt: iso(addDays(anchorToday, -1)),
    });
  }

  return store;
}

/** Human-readable summary of what the demo contains, shown on the demo banner. */
export function describeDemo(store: StoreShape): string {
  return [
    `${store.customers.length} customers`,
    `${store.locations.length} locations`,
    `${store.devices.length} devices`,
    `${store.workOrders.length} work orders`,
    `${store.reminders.length} reminders`,
  ].join(' · ');
}

export const DEMO_ANCHOR_FOR_TESTS = civilDate('2026-08-02');
