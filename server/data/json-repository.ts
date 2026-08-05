import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { CivilDate } from '@/domain/dates';
import { compareCivil } from '@/domain/dates';
import { reminderKey } from '@/domain/reminders';
import type {
  AuditLogEntry,
  BlackoutDate,
  Booking,
  BusinessHours,
  ChecklistItem,
  ChecklistResult,
  ChecklistTemplate,
  Customer,
  Device,
  DeviceType,
  Issue,
  Location,
  Membership,
  Organization,
  Profile,
  Reminder,
  Role,
  ServiceReport,
  UUID,
  WorkOrder,
  WorkOrderStatus,
} from '@/domain/types';
import { newId } from '@/lib/ids';

import {
  ConflictError,
  NotFoundError,
  type DeviceContext,
  type DeviceFilter,
  type NewRecord,
  type Patch,
  type ReminderFilter,
  type Repository,
  type WorkOrderFilter,
} from './repository';

/**
 * File-backed repository.
 *
 * This is not a mock. It is a working driver so the application runs end-to-end with no
 * external services — `npm run dev` on a clean checkout gives a browsable app with the
 * demo organisation, and the integration tests exercise the same code paths the UI does.
 *
 * Writes go through a promise-chain mutex and land via write-to-temp-then-rename, so a
 * crash mid-write cannot leave a truncated store behind. Suitable for local development,
 * demos and tests; Supabase is the production path.
 */

export interface StoreShape {
  organizations: Organization[];
  profiles: Profile[];
  memberships: Membership[];
  customers: Customer[];
  locations: Location[];
  deviceTypes: DeviceType[];
  devices: Device[];
  checklistTemplates: ChecklistTemplate[];
  checklistItems: ChecklistItem[];
  workOrders: WorkOrder[];
  checklistResults: ChecklistResult[];
  bookings: Booking[];
  issues: Issue[];
  reminders: Reminder[];
  serviceReports: ServiceReport[];
  businessHours: BusinessHours[];
  blackoutDates: BlackoutDate[];
  auditLog: AuditLogEntry[];
  /** `${orgId}:${year}` → last allocated work-order sequence. */
  workOrderCounters: Record<string, number>;
}

export function emptyStore(): StoreShape {
  return {
    organizations: [],
    profiles: [],
    memberships: [],
    customers: [],
    locations: [],
    deviceTypes: [],
    devices: [],
    checklistTemplates: [],
    checklistItems: [],
    workOrders: [],
    checklistResults: [],
    bookings: [],
    issues: [],
    reminders: [],
    serviceReports: [],
    businessHours: [],
    blackoutDates: [],
    auditLog: [],
    workOrderCounters: {},
  };
}

const clone = <T>(value: T): T => structuredClone(value);

function matchesSearch(haystacks: readonly (string | null | undefined)[], needle: string) {
  const q = needle.trim().toLowerCase();
  if (q === '') return true;
  return haystacks.some((h) => (h ?? '').toLowerCase().includes(q));
}

export interface JsonRepositoryOptions {
  /** Omit to run purely in memory — used by the test suite. */
  filePath?: string;
  seed?: () => StoreShape;
}

export class JsonRepository implements Repository {
  private store: StoreShape;
  private readonly filePath: string | undefined;
  /** Serialises writes so two concurrent requests cannot interleave a read-modify-write. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: JsonRepositoryOptions = {}) {
    this.filePath = options.filePath;
    const seed = options.seed;

    if (this.filePath && existsSync(this.filePath)) {
      try {
        this.store = { ...emptyStore(), ...JSON.parse(readFileSync(this.filePath, 'utf8')) };
      } catch {
        // A corrupt store must not brick the app; fall back to a fresh seed.
        this.store = seed ? seed() : emptyStore();
        this.persist();
      }
    } else {
      this.store = seed ? seed() : emptyStore();
      if (this.filePath) this.persist();
    }
  }

  /* -- infrastructure ---------------------------------------------- */

  private persist(): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.store, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }

  /** Run a mutation under the mutex, persisting once it completes. */
  private write<T>(fn: () => T): Promise<T> {
    const run = this.queue.then(() => {
      const result = fn();
      this.persist();
      return result;
    });
    // Keep the chain alive even if this operation rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private read<T>(fn: () => T): Promise<T> {
    return Promise.resolve(fn());
  }

  /** Test/demo helper: replace the whole store. */
  reset(next: StoreShape): void {
    this.store = next;
    this.persist();
  }

  snapshot(): StoreShape {
    return clone(this.store);
  }

  private stamp<T extends { id: UUID; createdAt: string }>(input: Omit<T, 'id' | 'createdAt'>): T {
    return { ...input, id: newId(), createdAt: new Date().toISOString() } as T;
  }

  private patchRow<T extends { id: UUID; orgId: UUID }>(
    rows: T[],
    entity: string,
    orgId: UUID,
    id: UUID,
    patch: Record<string, unknown>,
  ): T {
    const index = rows.findIndex((r) => r.id === id && r.orgId === orgId);
    if (index === -1) throw new NotFoundError(entity, id);
    const next = { ...rows[index], ...patch } as T;
    rows[index] = next;
    return clone(next);
  }

  /* -- organisations, people, access -------------------------------- */

  getOrganization(orgId: UUID) {
    return this.read(() => clone(this.store.organizations.find((o) => o.id === orgId) ?? null));
  }

  getOrganizationBySlug(slug: string) {
    return this.read(() => clone(this.store.organizations.find((o) => o.slug === slug) ?? null));
  }

  listOrganizationsForUser(userId: UUID) {
    return this.read(() => {
      const orgIds = new Set(
        this.store.memberships.filter((m) => m.userId === userId).map((m) => m.orgId),
      );
      return clone(
        this.store.organizations
          .filter((o) => orgIds.has(o.id))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }

  createOrganization(input: NewRecord<Organization>) {
    return this.write(() => {
      if (this.store.organizations.some((o) => o.slug === input.slug)) {
        throw new ConflictError(`An organisation with slug "${input.slug}" already exists.`);
      }
      const row = this.stamp<Organization>(input);
      this.store.organizations.push(row);
      return clone(row);
    });
  }

  updateOrganization(orgId: UUID, patch: Patch<Organization>) {
    return this.write(() => {
      const index = this.store.organizations.findIndex((o) => o.id === orgId);
      if (index === -1) throw new NotFoundError('Organization', orgId);
      const next = { ...this.store.organizations[index], ...patch } as Organization;
      this.store.organizations[index] = next;
      return clone(next);
    });
  }

  getProfile(userId: UUID) {
    return this.read(() => clone(this.store.profiles.find((p) => p.id === userId) ?? null));
  }

  upsertProfile(profile: Profile) {
    return this.write(() => {
      const index = this.store.profiles.findIndex((p) => p.id === profile.id);
      if (index === -1) this.store.profiles.push(profile);
      else this.store.profiles[index] = { ...this.store.profiles[index], ...profile };
      return clone(profile);
    });
  }

  listProfiles(userIds: readonly UUID[]) {
    return this.read(() => {
      const wanted = new Set(userIds);
      return clone(this.store.profiles.filter((p) => wanted.has(p.id)));
    });
  }

  getMembership(orgId: UUID, userId: UUID) {
    return this.read(() =>
      clone(
        this.store.memberships.find((m) => m.orgId === orgId && m.userId === userId) ?? null,
      ),
    );
  }

  listMemberships(orgId: UUID) {
    return this.read(() => clone(this.store.memberships.filter((m) => m.orgId === orgId)));
  }

  createMembership(input: NewRecord<Membership>) {
    return this.write(() => {
      const exists = this.store.memberships.some(
        (m) => m.orgId === input.orgId && m.userId === input.userId,
      );
      if (exists) throw new ConflictError('That person is already a member of this organisation.');
      const row = this.stamp<Membership>(input);
      this.store.memberships.push(row);
      return clone(row);
    });
  }

  updateMembershipRole(orgId: UUID, userId: UUID, role: Role) {
    return this.write(() => {
      const index = this.store.memberships.findIndex(
        (m) => m.orgId === orgId && m.userId === userId,
      );
      if (index === -1) throw new NotFoundError('Membership', `${orgId}/${userId}`);
      const current = this.store.memberships[index] as Membership;

      // Never allow the last owner to be demoted — it would orphan the organisation.
      if (current.role === 'owner' && role !== 'owner') {
        const owners = this.store.memberships.filter(
          (m) => m.orgId === orgId && m.role === 'owner',
        ).length;
        if (owners <= 1) {
          throw new ConflictError('An organisation must always have at least one owner.');
        }
      }

      const next: Membership = { ...current, role };
      this.store.memberships[index] = next;
      return clone(next);
    });
  }

  deleteMembership(orgId: UUID, userId: UUID) {
    return this.write(() => {
      const target = this.store.memberships.find(
        (m) => m.orgId === orgId && m.userId === userId,
      );
      if (target?.role === 'owner') {
        const owners = this.store.memberships.filter(
          (m) => m.orgId === orgId && m.role === 'owner',
        ).length;
        if (owners <= 1) {
          throw new ConflictError('An organisation must always have at least one owner.');
        }
      }
      this.store.memberships = this.store.memberships.filter(
        (m) => !(m.orgId === orgId && m.userId === userId),
      );
    });
  }

  /* -- directory ---------------------------------------------------- */

  listCustomers(orgId: UUID, search?: string) {
    return this.read(() =>
      clone(
        this.store.customers
          .filter(
            (c) =>
              c.orgId === orgId &&
              !c.archivedAt &&
              (!search || matchesSearch([c.name, c.contactName, c.email, c.externalRef], search)),
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }

  getCustomer(orgId: UUID, id: UUID) {
    return this.read(() =>
      clone(this.store.customers.find((c) => c.id === id && c.orgId === orgId) ?? null),
    );
  }

  createCustomer(input: NewRecord<Customer>) {
    return this.write(() => {
      const row = this.stamp<Customer>(input);
      this.store.customers.push(row);
      return clone(row);
    });
  }

  updateCustomer(orgId: UUID, id: UUID, patch: Patch<Customer>) {
    return this.write(() => this.patchRow(this.store.customers, 'Customer', orgId, id, patch));
  }

  deleteCustomer(orgId: UUID, id: UUID) {
    return this.write(() => {
      const hasLocations = this.store.locations.some(
        (l) => l.orgId === orgId && l.customerId === id,
      );
      if (hasLocations) {
        throw new ConflictError('Remove this customer’s locations before deleting them.');
      }
      this.store.customers = this.store.customers.filter(
        (c) => !(c.id === id && c.orgId === orgId),
      );
    });
  }

  listLocations(orgId: UUID, customerId?: UUID) {
    return this.read(() =>
      clone(
        this.store.locations
          .filter((l) => l.orgId === orgId && (!customerId || l.customerId === customerId))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }

  getLocation(orgId: UUID, id: UUID) {
    return this.read(() =>
      clone(this.store.locations.find((l) => l.id === id && l.orgId === orgId) ?? null),
    );
  }

  createLocation(input: NewRecord<Location>) {
    return this.write(() => {
      const row = this.stamp<Location>(input);
      this.store.locations.push(row);
      return clone(row);
    });
  }

  updateLocation(orgId: UUID, id: UUID, patch: Patch<Location>) {
    return this.write(() => this.patchRow(this.store.locations, 'Location', orgId, id, patch));
  }

  deleteLocation(orgId: UUID, id: UUID) {
    return this.write(() => {
      const hasDevices = this.store.devices.some((d) => d.orgId === orgId && d.locationId === id);
      if (hasDevices) throw new ConflictError('Remove this location’s devices before deleting it.');
      this.store.locations = this.store.locations.filter(
        (l) => !(l.id === id && l.orgId === orgId),
      );
    });
  }

  listDeviceTypes(orgId: UUID) {
    return this.read(() =>
      clone(
        this.store.deviceTypes
          .filter((t) => t.orgId === orgId)
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }

  createDeviceType(input: NewRecord<DeviceType>) {
    return this.write(() => {
      const row = this.stamp<DeviceType>(input);
      this.store.deviceTypes.push(row);
      return clone(row);
    });
  }

  listDevices(orgId: UUID, filter: DeviceFilter = {}) {
    return this.read(() => {
      const locationIdsForCustomer = filter.customerId
        ? new Set(
            this.store.locations
              .filter((l) => l.orgId === orgId && l.customerId === filter.customerId)
              .map((l) => l.id),
          )
        : null;

      let rows = this.store.devices.filter((d) => {
        if (d.orgId !== orgId) return false;
        if (filter.locationId && d.locationId !== filter.locationId) return false;
        if (locationIdsForCustomer && !locationIdsForCustomer.has(d.locationId)) return false;
        if (filter.status && d.status !== filter.status) return false;
        if (filter.dueOnOrBefore) {
          if (!d.nextServiceDue) return false;
          if (compareCivil(d.nextServiceDue, filter.dueOnOrBefore) > 0) return false;
        }
        if (filter.search && !matchesSearch([d.name, d.serialNumber, d.model, d.manufacturer], filter.search)) {
          return false;
        }
        return true;
      });

      rows = rows.sort((a, b) => {
        if (a.nextServiceDue && b.nextServiceDue) return compareCivil(a.nextServiceDue, b.nextServiceDue);
        if (a.nextServiceDue) return -1;
        if (b.nextServiceDue) return 1;
        return a.name.localeCompare(b.name);
      });

      return clone(filter.limit ? rows.slice(0, filter.limit) : rows);
    });
  }

  getDevice(orgId: UUID, id: UUID) {
    return this.read(() =>
      clone(this.store.devices.find((d) => d.id === id && d.orgId === orgId) ?? null),
    );
  }

  getDeviceContextByToken(publicToken: string) {
    return this.read((): DeviceContext | null => {
      const device = this.store.devices.find((d) => d.publicToken === publicToken);
      if (!device) return null;
      const location = this.store.locations.find((l) => l.id === device.locationId);
      const organization = this.store.organizations.find((o) => o.id === device.orgId);
      if (!location || !organization) return null;
      const customer = this.store.customers.find((c) => c.id === location.customerId);
      if (!customer) return null;
      const deviceType = device.deviceTypeId
        ? (this.store.deviceTypes.find((t) => t.id === device.deviceTypeId) ?? null)
        : null;
      return clone({ device, location, customer, deviceType, organization });
    });
  }

  createDevice(input: NewRecord<Device>) {
    return this.write(() => {
      if (this.store.devices.some((d) => d.publicToken === input.publicToken)) {
        throw new ConflictError('Device token collision.');
      }
      const row = this.stamp<Device>(input);
      this.store.devices.push(row);
      return clone(row);
    });
  }

  updateDevice(orgId: UUID, id: UUID, patch: Patch<Device>) {
    return this.write(() => this.patchRow(this.store.devices, 'Device', orgId, id, patch));
  }

  deleteDevice(orgId: UUID, id: UUID) {
    return this.write(() => {
      this.store.devices = this.store.devices.filter((d) => !(d.id === id && d.orgId === orgId));
      this.store.reminders = this.store.reminders.filter((r) => r.deviceId !== id);
    });
  }

  createDevicesBulk(inputs: readonly NewRecord<Device>[]) {
    return this.write(() => {
      const rows = inputs.map((i) => this.stamp<Device>(i));
      this.store.devices.push(...rows);
      return clone(rows);
    });
  }

  /* -- checklists --------------------------------------------------- */

  listChecklistTemplates(orgId: UUID) {
    return this.read(() =>
      clone(this.store.checklistTemplates.filter((t) => t.orgId === orgId && !t.archivedAt)),
    );
  }

  getChecklistTemplate(orgId: UUID, id: UUID) {
    return this.read(() =>
      clone(this.store.checklistTemplates.find((t) => t.id === id && t.orgId === orgId) ?? null),
    );
  }

  createChecklistTemplate(input: NewRecord<ChecklistTemplate>) {
    return this.write(() => {
      const row = this.stamp<ChecklistTemplate>(input);
      this.store.checklistTemplates.push(row);
      return clone(row);
    });
  }

  updateChecklistTemplate(orgId: UUID, id: UUID, patch: Patch<ChecklistTemplate>) {
    return this.write(() =>
      this.patchRow(this.store.checklistTemplates, 'ChecklistTemplate', orgId, id, patch),
    );
  }

  listChecklistItems(orgId: UUID, templateId: UUID) {
    return this.read(() =>
      clone(
        this.store.checklistItems
          .filter((i) => i.orgId === orgId && i.templateId === templateId)
          .sort((a, b) => a.position - b.position),
      ),
    );
  }

  replaceChecklistItems(
    orgId: UUID,
    templateId: UUID,
    items: readonly Omit<ChecklistItem, 'id'>[],
  ) {
    return this.write(() => {
      this.store.checklistItems = this.store.checklistItems.filter(
        (i) => !(i.orgId === orgId && i.templateId === templateId),
      );
      const rows = items.map((i) => ({ ...i, id: newId() }) as ChecklistItem);
      this.store.checklistItems.push(...rows);
      return clone(rows);
    });
  }

  listChecklistResults(orgId: UUID, workOrderId: UUID) {
    return this.read(() =>
      clone(
        this.store.checklistResults
          .filter((r) => r.orgId === orgId && r.workOrderId === workOrderId)
          .sort((a, b) => a.position - b.position),
      ),
    );
  }

  replaceChecklistResults(
    orgId: UUID,
    workOrderId: UUID,
    results: readonly Omit<ChecklistResult, 'id'>[],
  ) {
    return this.write(() => {
      this.store.checklistResults = this.store.checklistResults.filter(
        (r) => !(r.orgId === orgId && r.workOrderId === workOrderId),
      );
      const rows = results.map((r) => ({ ...r, id: newId() }) as ChecklistResult);
      this.store.checklistResults.push(...rows);
      return clone(rows);
    });
  }

  /* -- work orders -------------------------------------------------- */

  listWorkOrders(orgId: UUID, filter: WorkOrderFilter = {}) {
    return this.read(() => {
      const statuses: WorkOrderStatus[] | null = filter.status
        ? Array.isArray(filter.status)
          ? filter.status
          : [filter.status]
        : null;

      const rows = this.store.workOrders
        .filter((w) => {
          if (w.orgId !== orgId) return false;
          if (statuses && !statuses.includes(w.status)) return false;
          if (filter.assignedTo && w.assignedTo !== filter.assignedTo) return false;
          if (filter.deviceId && w.deviceId !== filter.deviceId) return false;
          if (filter.customerId && w.customerId !== filter.customerId) return false;
          if (filter.from || filter.to) {
            const day = w.scheduledFor?.slice(0, 10) as CivilDate | undefined;
            if (!day) return false;
            if (filter.from && compareCivil(day, filter.from) < 0) return false;
            if (filter.to && compareCivil(day, filter.to) > 0) return false;
          }
          return true;
        })
        .sort((a, b) => b.code.localeCompare(a.code));

      return clone(filter.limit ? rows.slice(0, filter.limit) : rows);
    });
  }

  getWorkOrder(orgId: UUID, id: UUID) {
    return this.read(() =>
      clone(this.store.workOrders.find((w) => w.id === id && w.orgId === orgId) ?? null),
    );
  }

  createWorkOrder(input: NewRecord<WorkOrder>) {
    return this.write(() => {
      if (this.store.workOrders.some((w) => w.orgId === input.orgId && w.code === input.code)) {
        throw new ConflictError(`Work order ${input.code} already exists.`);
      }
      const row = this.stamp<WorkOrder>(input);
      this.store.workOrders.push(row);
      return clone(row);
    });
  }

  updateWorkOrder(orgId: UUID, id: UUID, patch: Patch<WorkOrder>) {
    return this.write(() => this.patchRow(this.store.workOrders, 'WorkOrder', orgId, id, patch));
  }

  nextWorkOrderSequence(orgId: UUID, year: number) {
    return this.write(() => {
      const key = `${orgId}:${year}`;
      const next = (this.store.workOrderCounters[key] ?? 0) + 1;
      this.store.workOrderCounters[key] = next;
      return next;
    });
  }

  /* -- customer intake ---------------------------------------------- */

  listBookings(orgId: UUID, status?: Booking['status']) {
    return this.read(() =>
      clone(
        this.store.bookings
          .filter((b) => b.orgId === orgId && (!status || b.status === status))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),
    );
  }

  getBooking(orgId: UUID, id: UUID) {
    return this.read(() =>
      clone(this.store.bookings.find((b) => b.id === id && b.orgId === orgId) ?? null),
    );
  }

  createBooking(input: NewRecord<Booking>) {
    return this.write(() => {
      const row = this.stamp<Booking>(input);
      this.store.bookings.push(row);
      return clone(row);
    });
  }

  updateBooking(orgId: UUID, id: UUID, patch: Patch<Booking>) {
    return this.write(() => this.patchRow(this.store.bookings, 'Booking', orgId, id, patch));
  }

  listIssues(orgId: UUID, status?: Issue['status']) {
    return this.read(() =>
      clone(
        this.store.issues
          .filter((i) => i.orgId === orgId && (!status || i.status === status))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),
    );
  }

  getIssue(orgId: UUID, id: UUID) {
    return this.read(() =>
      clone(this.store.issues.find((i) => i.id === id && i.orgId === orgId) ?? null),
    );
  }

  createIssue(input: NewRecord<Issue>) {
    return this.write(() => {
      const row = this.stamp<Issue>(input);
      this.store.issues.push(row);
      return clone(row);
    });
  }

  updateIssue(orgId: UUID, id: UUID, patch: Patch<Issue>) {
    return this.write(() => this.patchRow(this.store.issues, 'Issue', orgId, id, patch));
  }

  /* -- reminders ---------------------------------------------------- */

  listReminders(orgId: UUID, filter: ReminderFilter = {}) {
    return this.read(() => {
      const rows = this.store.reminders
        .filter((r) => {
          if (r.orgId !== orgId) return false;
          if (filter.deviceId && r.deviceId !== filter.deviceId) return false;
          if (filter.status && r.status !== filter.status) return false;
          if (
            filter.scheduledOnOrBefore &&
            compareCivil(r.scheduledFor, filter.scheduledOnOrBefore) > 0
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => compareCivil(a.scheduledFor, b.scheduledFor) || a.id.localeCompare(b.id));

      return clone(filter.limit ? rows.slice(0, filter.limit) : rows);
    });
  }

  createRemindersIgnoringDuplicates(inputs: readonly NewRecord<Reminder>[]) {
    return this.write(() => {
      const existing = new Set(
        this.store.reminders.map((r) => reminderKey(r.deviceId, r.dueDate, r.stage)),
      );
      const created: Reminder[] = [];
      for (const input of inputs) {
        const key = reminderKey(input.deviceId, input.dueDate, input.stage);
        if (existing.has(key)) continue; // the idempotency guarantee
        existing.add(key);
        const row = this.stamp<Reminder>(input);
        this.store.reminders.push(row);
        created.push(row);
      }
      return clone(created);
    });
  }

  updateReminder(orgId: UUID, id: UUID, patch: Patch<Reminder>) {
    return this.write(() => this.patchRow(this.store.reminders, 'Reminder', orgId, id, patch));
  }

  deleteReminders(orgId: UUID, ids: readonly UUID[]) {
    return this.write(() => {
      const doomed = new Set(ids);
      this.store.reminders = this.store.reminders.filter(
        (r) => !(r.orgId === orgId && doomed.has(r.id)),
      );
    });
  }

  listDueRemindersAcrossOrgs(onOrBefore: CivilDate, limit: number) {
    return this.read(() =>
      clone(
        this.store.reminders
          .filter((r) => r.status === 'pending' && compareCivil(r.scheduledFor, onOrBefore) <= 0)
          .sort((a, b) => compareCivil(a.scheduledFor, b.scheduledFor) || a.id.localeCompare(b.id))
          .slice(0, limit),
      ),
    );
  }

  /* -- reports ------------------------------------------------------ */

  getServiceReportByWorkOrder(orgId: UUID, workOrderId: UUID) {
    return this.read(() =>
      clone(
        this.store.serviceReports.find(
          (r) => r.orgId === orgId && r.workOrderId === workOrderId,
        ) ?? null,
      ),
    );
  }

  createServiceReport(input: NewRecord<ServiceReport>) {
    return this.write(() => {
      // Not `stamp()`: a service report has no `createdAt`. Its `generatedAt` — supplied
      // by the caller, because it is stamped into the PDF itself — is the creation time,
      // and a second, slightly different timestamp on the same row would be a lie waiting
      // to be noticed during an audit.
      const row: ServiceReport = { ...input, id: newId() };
      this.store.serviceReports.push(row);
      return clone(row);
    });
  }

  /* -- scheduling configuration ------------------------------------- */

  listBusinessHours(orgId: UUID) {
    return this.read(() =>
      clone(
        this.store.businessHours
          .filter((h) => h.orgId === orgId)
          .sort((a, b) => a.weekday - b.weekday),
      ),
    );
  }

  replaceBusinessHours(orgId: UUID, hours: readonly Omit<BusinessHours, 'id'>[]) {
    return this.write(() => {
      this.store.businessHours = this.store.businessHours.filter((h) => h.orgId !== orgId);
      const rows = hours.map((h) => ({ ...h, id: newId() }) as BusinessHours);
      this.store.businessHours.push(...rows);
      return clone(rows);
    });
  }

  listBlackoutDates(orgId: UUID) {
    return this.read(() =>
      clone(
        this.store.blackoutDates
          .filter((b) => b.orgId === orgId)
          .sort((a, b) => compareCivil(a.date, b.date)),
      ),
    );
  }

  createBlackoutDate(input: Omit<BlackoutDate, 'id'>) {
    return this.write(() => {
      const row = { ...input, id: newId() } as BlackoutDate;
      this.store.blackoutDates.push(row);
      return clone(row);
    });
  }

  deleteBlackoutDate(orgId: UUID, id: UUID) {
    return this.write(() => {
      this.store.blackoutDates = this.store.blackoutDates.filter(
        (b) => !(b.id === id && b.orgId === orgId),
      );
    });
  }

  /* -- audit -------------------------------------------------------- */

  appendAuditLog(entry: NewRecord<AuditLogEntry>) {
    return this.write(() => {
      this.store.auditLog.push(this.stamp<AuditLogEntry>(entry));
      // Keep the local store from growing without bound during long demo sessions.
      if (this.store.auditLog.length > 5000) {
        this.store.auditLog = this.store.auditLog.slice(-4000);
      }
    });
  }

  listAuditLog(orgId: UUID, limit = 100) {
    return this.read(() =>
      clone(
        this.store.auditLog
          .filter((a) => a.orgId === orgId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit),
      ),
    );
  }
}

/** Default on-disk location, git-ignored. */
export const DEFAULT_STORE_PATH = join(process.cwd(), '.data', 'store.json');
