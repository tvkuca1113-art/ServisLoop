/**
 * The repository contract.
 *
 * Every read and write in the application goes through this interface. Two adapters
 * implement it:
 *
 * - `SupabaseRepository` — production. Tenant isolation is enforced by Postgres RLS.
 * - `JsonRepository`     — a file-backed store used when Supabase is not configured, so
 *                          a clean checkout is browsable with no external services and
 *                          the test suite can exercise real repository code paths.
 *
 * Two rules keep the two adapters honest:
 *
 * 1. **Every method takes `orgId` explicitly.** Even though RLS would scope the query
 *    anyway, passing the tenant makes the JSON adapter enforce the same boundary and
 *    makes an accidental cross-tenant read visible in the call site rather than hidden
 *    in a policy.
 * 2. **No method computes a derived value.** `nextServiceDue`, work-order codes,
 *    reminder ladders and permissions are all produced by `src/domain` and handed to the
 *    repository already resolved. The repository stores; the domain decides.
 */

import type { CivilDate } from '@/domain/dates';
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

/* ------------------------------------------------------------------ */
/* Input shapes                                                        */
/* ------------------------------------------------------------------ */

/** Fields the caller supplies; `id` and `createdAt` are assigned by the repository. */
export type NewRecord<T> = Omit<T, 'id' | 'createdAt'>;
export type Patch<T> = Partial<Omit<T, 'id' | 'orgId' | 'createdAt'>>;

export interface DeviceFilter {
  locationId?: UUID;
  customerId?: UUID;
  status?: Device['status'];
  /** Devices whose `nextServiceDue` is on or before this date. */
  dueOnOrBefore?: CivilDate;
  search?: string;
  limit?: number;
}

export interface WorkOrderFilter {
  status?: WorkOrderStatus | WorkOrderStatus[];
  assignedTo?: UUID;
  deviceId?: UUID;
  customerId?: UUID;
  /** Include only orders scheduled within this civil-date window. */
  from?: CivilDate;
  to?: CivilDate;
  limit?: number;
}

export interface ReminderFilter {
  deviceId?: UUID;
  status?: Reminder['status'];
  scheduledOnOrBefore?: CivilDate;
  limit?: number;
}

/** A device joined to the rows the UI always needs alongside it. */
export interface DeviceContext {
  device: Device;
  location: Location;
  customer: Customer;
  deviceType: DeviceType | null;
  organization: Organization;
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} "${id}" was not found.`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/* ------------------------------------------------------------------ */
/* The interface                                                       */
/* ------------------------------------------------------------------ */

export interface Repository {
  /* -- organisations, people, access ------------------------------- */
  getOrganization(orgId: UUID): Promise<Organization | null>;
  getOrganizationBySlug(slug: string): Promise<Organization | null>;
  listOrganizationsForUser(userId: UUID): Promise<Organization[]>;
  createOrganization(input: NewRecord<Organization>): Promise<Organization>;
  updateOrganization(orgId: UUID, patch: Patch<Organization>): Promise<Organization>;

  getProfile(userId: UUID): Promise<Profile | null>;
  upsertProfile(profile: Profile): Promise<Profile>;
  listProfiles(userIds: readonly UUID[]): Promise<Profile[]>;

  getMembership(orgId: UUID, userId: UUID): Promise<Membership | null>;
  listMemberships(orgId: UUID): Promise<Membership[]>;
  createMembership(input: NewRecord<Membership>): Promise<Membership>;
  updateMembershipRole(orgId: UUID, userId: UUID, role: Role): Promise<Membership>;
  deleteMembership(orgId: UUID, userId: UUID): Promise<void>;

  /* -- directory ---------------------------------------------------- */
  listCustomers(orgId: UUID, search?: string): Promise<Customer[]>;
  getCustomer(orgId: UUID, id: UUID): Promise<Customer | null>;
  createCustomer(input: NewRecord<Customer>): Promise<Customer>;
  updateCustomer(orgId: UUID, id: UUID, patch: Patch<Customer>): Promise<Customer>;
  deleteCustomer(orgId: UUID, id: UUID): Promise<void>;

  listLocations(orgId: UUID, customerId?: UUID): Promise<Location[]>;
  getLocation(orgId: UUID, id: UUID): Promise<Location | null>;
  createLocation(input: NewRecord<Location>): Promise<Location>;
  updateLocation(orgId: UUID, id: UUID, patch: Patch<Location>): Promise<Location>;
  deleteLocation(orgId: UUID, id: UUID): Promise<void>;

  listDeviceTypes(orgId: UUID): Promise<DeviceType[]>;
  createDeviceType(input: NewRecord<DeviceType>): Promise<DeviceType>;

  listDevices(orgId: UUID, filter?: DeviceFilter): Promise<Device[]>;
  getDevice(orgId: UUID, id: UUID): Promise<Device | null>;
  /** Public QR lookup. Deliberately not scoped by org — the token *is* the scope. */
  getDeviceContextByToken(publicToken: string): Promise<DeviceContext | null>;
  createDevice(input: NewRecord<Device>): Promise<Device>;
  updateDevice(orgId: UUID, id: UUID, patch: Patch<Device>): Promise<Device>;
  deleteDevice(orgId: UUID, id: UUID): Promise<void>;
  /** Bulk insert for CSV/XLSX import. All-or-nothing. */
  createDevicesBulk(inputs: readonly NewRecord<Device>[]): Promise<Device[]>;

  /* -- checklists --------------------------------------------------- */
  listChecklistTemplates(orgId: UUID): Promise<ChecklistTemplate[]>;
  getChecklistTemplate(orgId: UUID, id: UUID): Promise<ChecklistTemplate | null>;
  createChecklistTemplate(input: NewRecord<ChecklistTemplate>): Promise<ChecklistTemplate>;
  /** Rename or archive a template. Archiving is a soft delete: history keeps its snapshots. */
  updateChecklistTemplate(
    orgId: UUID,
    id: UUID,
    patch: Patch<ChecklistTemplate>,
  ): Promise<ChecklistTemplate>;
  listChecklistItems(orgId: UUID, templateId: UUID): Promise<ChecklistItem[]>;
  replaceChecklistItems(
    orgId: UUID,
    templateId: UUID,
    items: readonly Omit<ChecklistItem, 'id'>[],
  ): Promise<ChecklistItem[]>;

  listChecklistResults(orgId: UUID, workOrderId: UUID): Promise<ChecklistResult[]>;
  replaceChecklistResults(
    orgId: UUID,
    workOrderId: UUID,
    results: readonly Omit<ChecklistResult, 'id'>[],
  ): Promise<ChecklistResult[]>;

  /* -- work orders -------------------------------------------------- */
  listWorkOrders(orgId: UUID, filter?: WorkOrderFilter): Promise<WorkOrder[]>;
  getWorkOrder(orgId: UUID, id: UUID): Promise<WorkOrder | null>;
  createWorkOrder(input: NewRecord<WorkOrder>): Promise<WorkOrder>;
  updateWorkOrder(orgId: UUID, id: UUID, patch: Patch<WorkOrder>): Promise<WorkOrder>;
  /**
   * Allocate the next code for the year, atomically.
   *
   * Returns the raw sequence number; the caller formats it via
   * `formatWorkOrderCode` so the format lives in exactly one place.
   */
  nextWorkOrderSequence(orgId: UUID, year: number): Promise<number>;

  /* -- customer intake ---------------------------------------------- */
  listBookings(orgId: UUID, status?: Booking['status']): Promise<Booking[]>;
  getBooking(orgId: UUID, id: UUID): Promise<Booking | null>;
  createBooking(input: NewRecord<Booking>): Promise<Booking>;
  updateBooking(orgId: UUID, id: UUID, patch: Patch<Booking>): Promise<Booking>;

  listIssues(orgId: UUID, status?: Issue['status']): Promise<Issue[]>;
  getIssue(orgId: UUID, id: UUID): Promise<Issue | null>;
  createIssue(input: NewRecord<Issue>): Promise<Issue>;
  updateIssue(orgId: UUID, id: UUID, patch: Patch<Issue>): Promise<Issue>;

  /* -- reminders ---------------------------------------------------- */
  listReminders(orgId: UUID, filter?: ReminderFilter): Promise<Reminder[]>;
  /** Ignores rows whose `(deviceId, dueDate, stage)` already exists — the idempotency key. */
  createRemindersIgnoringDuplicates(
    inputs: readonly NewRecord<Reminder>[],
  ): Promise<Reminder[]>;
  updateReminder(orgId: UUID, id: UUID, patch: Patch<Reminder>): Promise<Reminder>;
  deleteReminders(orgId: UUID, ids: readonly UUID[]): Promise<void>;
  /** Cross-tenant sweep used by the dispatch job, which runs with elevated privileges. */
  listDueRemindersAcrossOrgs(onOrBefore: CivilDate, limit: number): Promise<Reminder[]>;

  /* -- reports ------------------------------------------------------ */
  getServiceReportByWorkOrder(orgId: UUID, workOrderId: UUID): Promise<ServiceReport | null>;
  createServiceReport(input: NewRecord<ServiceReport>): Promise<ServiceReport>;

  /* -- scheduling configuration ------------------------------------- */
  listBusinessHours(orgId: UUID): Promise<BusinessHours[]>;
  replaceBusinessHours(
    orgId: UUID,
    hours: readonly Omit<BusinessHours, 'id'>[],
  ): Promise<BusinessHours[]>;
  listBlackoutDates(orgId: UUID): Promise<BlackoutDate[]>;
  createBlackoutDate(input: Omit<BlackoutDate, 'id'>): Promise<BlackoutDate>;
  deleteBlackoutDate(orgId: UUID, id: UUID): Promise<void>;

  /* -- audit -------------------------------------------------------- */
  appendAuditLog(entry: NewRecord<AuditLogEntry>): Promise<void>;
  listAuditLog(orgId: UUID, limit?: number): Promise<AuditLogEntry[]>;
}
