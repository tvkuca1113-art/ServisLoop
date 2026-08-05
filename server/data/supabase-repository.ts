import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { addDays, civilDate, type CivilDate } from '@/domain/dates';
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
import { parseWorkOrderCode } from '@/domain/work-order';
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from '@/lib/database.types';

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
 * The production repository, backed by Supabase.
 *
 * Three things are worth knowing before reading further.
 *
 * **RLS is the tenancy boundary, not this file.** Every query still filters on `org_id`
 * because the interface demands it and because an accidental cross-tenant read should be
 * visible at the call site — but the guarantee comes from the policies in
 * `supabase/migrations/0006_rls_policies.sql`.
 *
 * **The client is per call, never per module.** It is produced by a factory so that the
 * cron job and the public QR endpoints can hand in a service-role client, and so that
 * `next build` — which imports this module to collect route metadata — never needs
 * credentials. The default factory imports `@/server/supabase/server` dynamically, which
 * keeps `next/headers` (and therefore the need for a request scope) out of the module
 * graph until a query actually runs.
 *
 * **It must behave exactly like `JsonRepository`.** Same sort orders, same
 * `null`-versus-throw semantics, same conflict messages. `__tests__/repository-parity.test.ts`
 * guards the method list; the rest is guarded by keeping the two files side by side when
 * either changes.
 */

type Client = SupabaseClient<Database>;

/** Produces the client a call should use. May be async — the default one is. */
export type SupabaseClientFactory = () => Client | Promise<Client>;

async function defaultClientFactory(): Promise<Client> {
  const { createServerSupabaseClient } = await import('@/server/supabase/server');
  return createServerSupabaseClient();
}

/* ------------------------------------------------------------------ */
/* Error translation                                                   */
/* ------------------------------------------------------------------ */

/** Unique violation — the only Postgres error that maps onto a domain concept. */
const UNIQUE_VIOLATION = '23505';
/** PostgREST's "expected one row, got none". */
const NO_ROWS_RETURNED = 'PGRST116';
/** RLS refused an INSERT (an UPDATE or DELETE is refused silently instead). */
const INSUFFICIENT_PRIVILEGE = '42501';

/** Constraint name → the message the user should see when that constraint fires. */
type ConflictMessages = Readonly<Record<string, string>>;

function isMissingRow(error: PostgrestError): boolean {
  return error.code === NO_ROWS_RETURNED;
}

/**
 * Turn a PostgREST failure into a domain error.
 *
 * A unique violation is a `ConflictError` the caller can show to a user; the constraint
 * name is matched against `conflicts` so that, for example, a duplicate work-order code
 * and a double-booked slot do not produce the same sentence. Everything else is a bug or
 * an outage and is rethrown with its code attached rather than being flattened into a
 * generic "database error".
 */
function raise(operation: string, error: PostgrestError, conflicts: ConflictMessages = {}): never {
  if (error.code === UNIQUE_VIOLATION) {
    const text = `${error.message} ${error.details ?? ''}`;
    const matched = Object.entries(conflicts).find(([constraint]) => text.includes(constraint));
    throw new ConflictError(matched?.[1] ?? `${operation} conflicts with an existing record.`);
  }
  throw new Error(`${operation} failed [${error.code}]: ${error.message}`);
}

/**
 * The row an UPDATE returned, or `NotFoundError`.
 *
 * RLS denies UPDATE and DELETE *silently* — the statement affects zero rows rather than
 * raising — so an empty result means either "no such row" or "you may not touch it", and
 * this adapter cannot tell which. It always reports the first. That ambiguity is
 * deliberate: answering "it exists, but not for you" would confirm the existence of
 * another tenant's record to anyone who can guess a UUID.
 */
function updatedRow<T>(row: T | null, entity: string, id: string): T {
  if (row === null) throw new NotFoundError(entity, id);
  return row;
}

/* ------------------------------------------------------------------ */
/* Row ↔ entity mapping                                                */
/*                                                                     */
/* The database is snake_case and the domain is camelCase, so every    */
/* table gets a `toX` (row → entity) and, where it is written, a       */
/* `fromX` (new entity → insert) and `patchX` (partial → update).      */
/* Nothing maps inline: a column rename should break in one place.     */
/* ------------------------------------------------------------------ */

/**
 * Postgres `date` columns arrive as `YYYY-MM-DD`. Validating rather than blind-casting
 * the brand means a column accidentally migrated to `timestamptz` fails here, loudly,
 * instead of silently poisoning every interval calculation downstream.
 */
const toCivil = (value: string): CivilDate => civilDate(value);
const toCivilOrNull = (value: string | null): CivilDate | null =>
  value === null ? null : civilDate(value);

/** `jsonb` can hold any JSON document; the audit log only ever stores an object. */
function toMeta(value: Json | null): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

/** Drop keys the caller did not set, so a patch never nulls a column it never mentioned. */
function definedOnly<T extends object>(payload: T): T {
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Guarantee a non-empty column list.
 *
 * PostgREST rejects a PATCH that names no columns, while the JSON adapter treats an empty
 * patch as a no-op that still returns the row. Writing `updated_at` — which the
 * `set_updated_at` trigger overwrites with `now()` anyway — keeps the two equivalent
 * without inventing a write.
 */
function touch<T extends { updated_at?: string }>(payload: T): T {
  return Object.keys(payload).length === 0
    ? { ...payload, updated_at: new Date().toISOString() }
    : payload;
}

/* -- organisations, people, access --------------------------------- */

function toOrganization(row: Tables<'organizations'>): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    reminderLeadDays: row.reminder_lead_days,
    defaultIntervalAnchor: row.default_interval_anchor,
    slotMinutes: row.slot_minutes,
    bookingLeadHours: row.booking_lead_hours,
    bookingHorizonDays: row.booking_horizon_days,
    isDemo: row.is_demo,
    createdAt: row.created_at,
  };
}

function fromOrganization(input: NewRecord<Organization>): TablesInsert<'organizations'> {
  return {
    name: input.name,
    slug: input.slug,
    timezone: input.timezone,
    reminder_lead_days: input.reminderLeadDays,
    default_interval_anchor: input.defaultIntervalAnchor,
    slot_minutes: input.slotMinutes,
    booking_lead_hours: input.bookingLeadHours,
    booking_horizon_days: input.bookingHorizonDays,
    is_demo: input.isDemo,
  };
}

function patchOrganization(patch: Patch<Organization>): TablesUpdate<'organizations'> {
  return definedOnly({
    name: patch.name,
    slug: patch.slug,
    timezone: patch.timezone,
    reminder_lead_days: patch.reminderLeadDays,
    default_interval_anchor: patch.defaultIntervalAnchor,
    slot_minutes: patch.slotMinutes,
    booking_lead_hours: patch.bookingLeadHours,
    booking_horizon_days: patch.bookingHorizonDays,
    is_demo: patch.isDemo,
  });
}

function toProfile(row: Tables<'profiles'>): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    createdAt: row.created_at,
  };
}

function fromProfile(profile: Profile): TablesInsert<'profiles'> {
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.fullName,
    created_at: profile.createdAt,
  };
}

function toMembership(row: Tables<'memberships'>): Membership {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

function fromMembership(input: NewRecord<Membership>): TablesInsert<'memberships'> {
  return {
    org_id: input.orgId,
    user_id: input.userId,
    role: input.role,
  };
}

/* -- directory ------------------------------------------------------ */

function toCustomer(row: Tables<'customers'>): Customer {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    externalRef: row.external_ref,
    notes: row.notes,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

function fromCustomer(input: NewRecord<Customer>): TablesInsert<'customers'> {
  return {
    org_id: input.orgId,
    name: input.name,
    contact_name: input.contactName,
    email: input.email,
    phone: input.phone,
    external_ref: input.externalRef,
    notes: input.notes,
    archived_at: input.archivedAt,
  };
}

function patchCustomer(patch: Patch<Customer>): TablesUpdate<'customers'> {
  return definedOnly({
    name: patch.name,
    contact_name: patch.contactName,
    email: patch.email,
    phone: patch.phone,
    external_ref: patch.externalRef,
    notes: patch.notes,
    archived_at: patch.archivedAt,
  });
}

function toLocation(row: Tables<'locations'>): Location {
  return {
    id: row.id,
    orgId: row.org_id,
    customerId: row.customer_id,
    name: row.name,
    addressLine: row.address_line,
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function fromLocation(input: NewRecord<Location>): TablesInsert<'locations'> {
  return {
    org_id: input.orgId,
    customer_id: input.customerId,
    name: input.name,
    address_line: input.addressLine,
    city: input.city,
    postal_code: input.postalCode,
    country: input.country,
    notes: input.notes,
  };
}

function patchLocation(patch: Patch<Location>): TablesUpdate<'locations'> {
  return definedOnly({
    customer_id: patch.customerId,
    name: patch.name,
    address_line: patch.addressLine,
    city: patch.city,
    postal_code: patch.postalCode,
    country: patch.country,
    notes: patch.notes,
  });
}

function toDeviceType(row: Tables<'device_types'>): DeviceType {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    defaultIntervalDays: row.default_interval_days,
    checklistTemplateId: row.checklist_template_id,
    createdAt: row.created_at,
  };
}

function fromDeviceType(input: NewRecord<DeviceType>): TablesInsert<'device_types'> {
  return {
    org_id: input.orgId,
    name: input.name,
    default_interval_days: input.defaultIntervalDays,
    checklist_template_id: input.checklistTemplateId,
  };
}

function toDevice(row: Tables<'devices'>): Device {
  return {
    id: row.id,
    orgId: row.org_id,
    locationId: row.location_id,
    deviceTypeId: row.device_type_id,
    name: row.name,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    installedOn: toCivilOrNull(row.installed_on),
    serviceIntervalDays: row.service_interval_days,
    intervalAnchor: row.interval_anchor,
    lastServiceAt: toCivilOrNull(row.last_service_at),
    nextServiceDue: toCivilOrNull(row.next_service_due),
    status: row.status,
    publicToken: row.public_token,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function fromDevice(input: NewRecord<Device>): TablesInsert<'devices'> {
  return {
    org_id: input.orgId,
    location_id: input.locationId,
    device_type_id: input.deviceTypeId,
    name: input.name,
    manufacturer: input.manufacturer,
    model: input.model,
    serial_number: input.serialNumber,
    installed_on: input.installedOn,
    service_interval_days: input.serviceIntervalDays,
    interval_anchor: input.intervalAnchor,
    last_service_at: input.lastServiceAt,
    next_service_due: input.nextServiceDue,
    status: input.status,
    public_token: input.publicToken,
    notes: input.notes,
  };
}

function patchDevice(patch: Patch<Device>): TablesUpdate<'devices'> {
  return definedOnly({
    location_id: patch.locationId,
    device_type_id: patch.deviceTypeId,
    name: patch.name,
    manufacturer: patch.manufacturer,
    model: patch.model,
    serial_number: patch.serialNumber,
    installed_on: patch.installedOn,
    service_interval_days: patch.serviceIntervalDays,
    interval_anchor: patch.intervalAnchor,
    last_service_at: patch.lastServiceAt,
    next_service_due: patch.nextServiceDue,
    status: patch.status,
    public_token: patch.publicToken,
    notes: patch.notes,
  });
}

/* -- checklists ----------------------------------------------------- */

function toChecklistTemplate(row: Tables<'checklist_templates'>): ChecklistTemplate {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    version: row.version,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

function fromChecklistTemplate(
  input: NewRecord<ChecklistTemplate>,
): TablesInsert<'checklist_templates'> {
  return {
    org_id: input.orgId,
    name: input.name,
    version: input.version,
    archived_at: input.archivedAt,
  };
}

function patchChecklistTemplate(
  patch: Patch<ChecklistTemplate>,
): TablesUpdate<'checklist_templates'> {
  return definedOnly({
    name: patch.name,
    version: patch.version,
    archived_at: patch.archivedAt,
  });
}

function toChecklistItem(row: Tables<'checklist_items'>): ChecklistItem {
  return {
    id: row.id,
    orgId: row.org_id,
    templateId: row.template_id,
    position: row.position,
    label: row.label,
    kind: row.kind,
    required: row.required,
    options: row.options,
    unit: row.unit,
    minValue: row.min_value,
    maxValue: row.max_value,
    expectedBoolean: row.expected_boolean,
  };
}

function fromChecklistItem(item: Omit<ChecklistItem, 'id'>): TablesInsert<'checklist_items'> {
  return {
    org_id: item.orgId,
    template_id: item.templateId,
    position: item.position,
    label: item.label,
    kind: item.kind,
    required: item.required,
    options: item.options,
    unit: item.unit,
    min_value: item.minValue,
    max_value: item.maxValue,
    expected_boolean: item.expectedBoolean,
  };
}

function toChecklistResult(row: Tables<'work_order_checklist_results'>): ChecklistResult {
  return {
    id: row.id,
    orgId: row.org_id,
    workOrderId: row.work_order_id,
    itemId: row.item_id,
    labelSnapshot: row.label_snapshot,
    kindSnapshot: row.kind_snapshot,
    position: row.position,
    valueBool: row.value_bool,
    valueNum: row.value_num,
    valueText: row.value_text,
    passed: row.passed,
    note: row.note,
  };
}

function fromChecklistResult(
  result: Omit<ChecklistResult, 'id'>,
): TablesInsert<'work_order_checklist_results'> {
  return {
    org_id: result.orgId,
    work_order_id: result.workOrderId,
    item_id: result.itemId,
    label_snapshot: result.labelSnapshot,
    kind_snapshot: result.kindSnapshot,
    position: result.position,
    value_bool: result.valueBool,
    value_num: result.valueNum,
    value_text: result.valueText,
    passed: result.passed,
    note: result.note,
  };
}

/* -- work orders ---------------------------------------------------- */

function toWorkOrder(row: Tables<'work_orders'>): WorkOrder {
  return {
    id: row.id,
    orgId: row.org_id,
    code: row.code,
    deviceId: row.device_id,
    locationId: row.location_id,
    customerId: row.customer_id,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    scheduledFor: row.scheduled_for,
    scheduledMinutes: row.scheduled_minutes,
    assignedTo: row.assigned_to,
    checklistTemplateId: row.checklist_template_id,
    sourceBookingId: row.source_booking_id,
    sourceIssueId: row.source_issue_id,
    summary: row.summary,
    internalNotes: row.internal_notes,
    openedAt: row.opened_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completedOn: toCivilOrNull(row.completed_on),
    createdAt: row.created_at,
  };
}

function fromWorkOrder(input: NewRecord<WorkOrder>): TablesInsert<'work_orders'> {
  return {
    org_id: input.orgId,
    code: input.code,
    device_id: input.deviceId,
    location_id: input.locationId,
    customer_id: input.customerId,
    kind: input.kind,
    status: input.status,
    priority: input.priority,
    scheduled_for: input.scheduledFor,
    scheduled_minutes: input.scheduledMinutes,
    assigned_to: input.assignedTo,
    checklist_template_id: input.checklistTemplateId,
    source_booking_id: input.sourceBookingId,
    source_issue_id: input.sourceIssueId,
    summary: input.summary,
    internal_notes: input.internalNotes,
    opened_at: input.openedAt,
    started_at: input.startedAt,
    completed_at: input.completedAt,
    completed_on: input.completedOn,
  };
}

function patchWorkOrder(patch: Patch<WorkOrder>): TablesUpdate<'work_orders'> {
  return definedOnly({
    code: patch.code,
    device_id: patch.deviceId,
    location_id: patch.locationId,
    customer_id: patch.customerId,
    kind: patch.kind,
    status: patch.status,
    priority: patch.priority,
    scheduled_for: patch.scheduledFor,
    scheduled_minutes: patch.scheduledMinutes,
    assigned_to: patch.assignedTo,
    checklist_template_id: patch.checklistTemplateId,
    source_booking_id: patch.sourceBookingId,
    source_issue_id: patch.sourceIssueId,
    summary: patch.summary,
    internal_notes: patch.internalNotes,
    opened_at: patch.openedAt,
    started_at: patch.startedAt,
    completed_at: patch.completedAt,
    completed_on: patch.completedOn,
  });
}

/* -- customer intake ------------------------------------------------ */

function toBooking(row: Tables<'bookings'>): Booking {
  return {
    id: row.id,
    orgId: row.org_id,
    deviceId: row.device_id,
    requestedDate: toCivil(row.requested_date),
    requestedStartMinute: row.requested_start_minute,
    requestedEndMinute: row.requested_end_minute,
    status: row.status,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    note: row.note,
    workOrderId: row.work_order_id,
    createdAt: row.created_at,
  };
}

function fromBooking(input: NewRecord<Booking>): TablesInsert<'bookings'> {
  return {
    org_id: input.orgId,
    device_id: input.deviceId,
    requested_date: input.requestedDate,
    requested_start_minute: input.requestedStartMinute,
    requested_end_minute: input.requestedEndMinute,
    status: input.status,
    contact_name: input.contactName,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone,
    note: input.note,
    work_order_id: input.workOrderId,
  };
}

function patchBooking(patch: Patch<Booking>): TablesUpdate<'bookings'> {
  return definedOnly({
    device_id: patch.deviceId,
    requested_date: patch.requestedDate,
    requested_start_minute: patch.requestedStartMinute,
    requested_end_minute: patch.requestedEndMinute,
    status: patch.status,
    contact_name: patch.contactName,
    contact_email: patch.contactEmail,
    contact_phone: patch.contactPhone,
    note: patch.note,
    work_order_id: patch.workOrderId,
  });
}

function toIssue(row: Tables<'issues'>): Issue {
  return {
    id: row.id,
    orgId: row.org_id,
    deviceId: row.device_id,
    severity: row.severity,
    title: row.title,
    description: row.description,
    reporterName: row.reporter_name,
    reporterEmail: row.reporter_email,
    reporterPhone: row.reporter_phone,
    status: row.status,
    workOrderId: row.work_order_id,
    createdAt: row.created_at,
  };
}

function fromIssue(input: NewRecord<Issue>): TablesInsert<'issues'> {
  return {
    org_id: input.orgId,
    device_id: input.deviceId,
    severity: input.severity,
    title: input.title,
    description: input.description,
    reporter_name: input.reporterName,
    reporter_email: input.reporterEmail,
    reporter_phone: input.reporterPhone,
    status: input.status,
    work_order_id: input.workOrderId,
  };
}

function patchIssue(patch: Patch<Issue>): TablesUpdate<'issues'> {
  return definedOnly({
    device_id: patch.deviceId,
    severity: patch.severity,
    title: patch.title,
    description: patch.description,
    reporter_name: patch.reporterName,
    reporter_email: patch.reporterEmail,
    reporter_phone: patch.reporterPhone,
    status: patch.status,
    work_order_id: patch.workOrderId,
  });
}

/* -- reminders, reports, scheduling, audit -------------------------- */

function toReminder(row: Tables<'reminders'>): Reminder {
  return {
    id: row.id,
    orgId: row.org_id,
    deviceId: row.device_id,
    dueDate: toCivil(row.due_date),
    stage: row.stage,
    scheduledFor: toCivil(row.scheduled_for),
    status: row.status,
    sentAt: row.sent_at,
    error: row.error,
    createdAt: row.created_at,
  };
}

function fromReminder(input: NewRecord<Reminder>): TablesInsert<'reminders'> {
  return {
    org_id: input.orgId,
    device_id: input.deviceId,
    due_date: input.dueDate,
    stage: input.stage,
    scheduled_for: input.scheduledFor,
    status: input.status,
    sent_at: input.sentAt,
    error: input.error,
  };
}

function patchReminder(patch: Patch<Reminder>): TablesUpdate<'reminders'> {
  return definedOnly({
    device_id: patch.deviceId,
    due_date: patch.dueDate,
    stage: patch.stage,
    scheduled_for: patch.scheduledFor,
    status: patch.status,
    sent_at: patch.sentAt,
    error: patch.error,
  });
}

function toServiceReport(row: Tables<'service_reports'>): ServiceReport {
  return {
    id: row.id,
    orgId: row.org_id,
    workOrderId: row.work_order_id,
    number: row.number,
    generatedAt: row.generated_at,
    signedByName: row.signed_by_name,
    totalMinutes: row.total_minutes,
  };
}

function fromServiceReport(input: NewRecord<ServiceReport>): TablesInsert<'service_reports'> {
  return {
    org_id: input.orgId,
    work_order_id: input.workOrderId,
    number: input.number,
    generated_at: input.generatedAt,
    signed_by_name: input.signedByName,
    total_minutes: input.totalMinutes,
  };
}

function toBusinessHours(row: Tables<'business_hours'>): BusinessHours {
  return {
    id: row.id,
    orgId: row.org_id,
    weekday: row.weekday,
    isOpen: row.is_open,
    openMinute: row.open_minute,
    closeMinute: row.close_minute,
  };
}

function fromBusinessHours(hours: Omit<BusinessHours, 'id'>): TablesInsert<'business_hours'> {
  return {
    org_id: hours.orgId,
    weekday: hours.weekday,
    is_open: hours.isOpen,
    open_minute: hours.openMinute,
    close_minute: hours.closeMinute,
  };
}

function toBlackoutDate(row: Tables<'blackout_dates'>): BlackoutDate {
  return {
    id: row.id,
    orgId: row.org_id,
    date: toCivil(row.date),
    reason: row.reason,
  };
}

function fromBlackoutDate(input: Omit<BlackoutDate, 'id'>): TablesInsert<'blackout_dates'> {
  return {
    org_id: input.orgId,
    date: input.date,
    reason: input.reason,
  };
}

function toAuditLogEntry(row: Tables<'audit_log'>): AuditLogEntry {
  return {
    id: row.id,
    orgId: row.org_id,
    actorId: row.actor_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    meta: toMeta(row.meta),
    createdAt: row.created_at,
  };
}

function fromAuditLogEntry(entry: NewRecord<AuditLogEntry>): TablesInsert<'audit_log'> {
  return {
    org_id: entry.orgId,
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    // `jsonb` accepts any JSON document. The `unknown` values are the caller's promise
    // that what it logged is serialisable; there is no cheaper way to state that.
    meta: entry.meta as unknown as Json | null,
  };
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/**
 * Build an `ilike` pattern for a free-text search box, or `null` for "no filter".
 *
 * PostgREST's `or=(...)` filter is a comma-separated, parenthesised grammar, so a term
 * containing `,` `(` `)` `"` or `\` would break out of it. `%` and `_` are LIKE wildcards
 * and a user typing them means the literal character. Both classes are stripped rather
 * than escaped: this is a search box, and a slightly broader match is a better failure
 * mode than a 400 or an accidental "match everything".
 */
function searchPattern(search: string | undefined): string | null {
  if (!search) return null;
  const cleaned = search.trim().replace(/[,()"\\%_]/g, ' ').trim();
  return cleaned === '' ? null : `%${cleaned}%`;
}

/** Midnight UTC of a civil date, as PostgREST wants it for a `timestamptz` comparison. */
const startOfDayUTC = (day: CivilDate): string => `${day}T00:00:00.000Z`;

/* ------------------------------------------------------------------ */
/* The adapter                                                         */
/* ------------------------------------------------------------------ */

export class SupabaseRepository implements Repository {
  private readonly clientFactory: SupabaseClientFactory;

  /**
   * @param clientFactory produces the client each call uses. Defaults to the
   * request-scoped, RLS-bound client; the cron sweep and the public QR, booking and
   * issue endpoints pass a service-role client instead (see {@link admin}).
   */
  constructor(clientFactory: SupabaseClientFactory = defaultClientFactory) {
    this.clientFactory = clientFactory;
  }

  /**
   * A repository backed by the service-role client, which **bypasses RLS**.
   *
   * For the reminder cron and the public token-scoped endpoints only — see the header of
   * `@/server/supabase/admin`. Imported dynamically so that merely importing this module
   * never requires a service-role key.
   */
  static admin(): SupabaseRepository {
    return new SupabaseRepository(async () => {
      const { createAdminClient } = await import('@/server/supabase/admin');
      return createAdminClient();
    });
  }

  /** Never memoised: the session lives in cookies and belongs to one request. */
  private client(): Promise<Client> {
    return Promise.resolve(this.clientFactory());
  }

  /* -- organisations, people, access -------------------------------- */

  async getOrganization(orgId: UUID): Promise<Organization | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load organisation', error);
    return data ? toOrganization(data) : null;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load organisation by slug', error);
    return data ? toOrganization(data) : null;
  }

  async listOrganizationsForUser(userId: UUID): Promise<Organization[]> {
    const client = await this.client();

    // Two statements rather than an embed: `memberships → organizations` would return the
    // organisation nested under each membership, and the org switcher wants a plain list
    // ordered by name.
    const memberships = await client.from('memberships').select('org_id').eq('user_id', userId);
    if (memberships.error) raise('List memberships', memberships.error);

    const orgIds = memberships.data.map((row) => row.org_id);
    if (orgIds.length === 0) return [];

    const { data, error } = await client
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .order('name', { ascending: true });
    if (error) raise('List organisations', error);
    return data.map(toOrganization);
  }

  async createOrganization(input: NewRecord<Organization>): Promise<Organization> {
    const client = await this.client();
    const { data, error } = await client
      .from('organizations')
      .insert(fromOrganization(input))
      .select()
      .single();
    if (error) {
      raise('Create organisation', error, {
        organizations_slug_key: `An organisation with slug "${input.slug}" already exists.`,
      });
    }
    return toOrganization(data);
  }

  async updateOrganization(orgId: UUID, patch: Patch<Organization>): Promise<Organization> {
    const client = await this.client();
    const { data, error } = await client
      .from('organizations')
      .update(touch(patchOrganization(patch)))
      .eq('id', orgId)
      .select()
      .maybeSingle();
    if (error) {
      raise('Update organisation', error, {
        organizations_slug_key: 'That slug is already taken by another organisation.',
      });
    }
    return toOrganization(updatedRow(data, 'Organization', orgId));
  }

  async getProfile(userId: UUID): Promise<Profile | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load profile', error);
    return data ? toProfile(data) : null;
  }

  async upsertProfile(profile: Profile): Promise<Profile> {
    const client = await this.client();
    const { data, error } = await client
      .from('profiles')
      .upsert(fromProfile(profile), { onConflict: 'id' })
      .select()
      .single();
    if (error) raise('Upsert profile', error);
    return toProfile(data);
  }

  async listProfiles(userIds: readonly UUID[]): Promise<Profile[]> {
    if (userIds.length === 0) return [];
    const client = await this.client();
    const { data, error } = await client.from('profiles').select('*').in('id', [...userIds]);
    if (error) raise('List profiles', error);
    return data.map(toProfile);
  }

  async getMembership(orgId: UUID, userId: UUID): Promise<Membership | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('memberships')
      .select('*')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load membership', error);
    return data ? toMembership(data) : null;
  }

  async listMemberships(orgId: UUID): Promise<Membership[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('memberships')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });
    if (error) raise('List memberships', error);
    return data.map(toMembership);
  }

  async createMembership(input: NewRecord<Membership>): Promise<Membership> {
    const client = await this.client();
    const { data, error } = await client
      .from('memberships')
      .insert(fromMembership(input))
      .select()
      .single();
    if (error) {
      raise('Create membership', error, {
        memberships_org_user_key: 'That person is already a member of this organisation.',
      });
    }
    return toMembership(data);
  }

  async updateMembershipRole(orgId: UUID, userId: UUID, role: Role): Promise<Membership> {
    const client = await this.client();

    const current = await client
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (current.error && !isMissingRow(current.error)) raise('Load membership', current.error);
    if (!current.data) throw new NotFoundError('Membership', `${orgId}/${userId}`);

    if (current.data.role === 'owner' && role !== 'owner') {
      await this.assertNotLastOwner(client, orgId);
    }

    const { data, error } = await client
      .from('memberships')
      .update(touch<TablesUpdate<'memberships'>>({ role }))
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .select()
      .maybeSingle();
    if (error) raise('Update membership role', error);
    return toMembership(updatedRow(data, 'Membership', `${orgId}/${userId}`));
  }

  async deleteMembership(orgId: UUID, userId: UUID): Promise<void> {
    const client = await this.client();

    const current = await client
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (current.error && !isMissingRow(current.error)) raise('Load membership', current.error);

    // Absent row: nothing to delete and nothing to guard, matching the JSON adapter's
    // filter-based delete, which is silent about a row that was not there.
    if (current.data?.role === 'owner') {
      await this.assertNotLastOwner(client, orgId);
    }

    const { error } = await client
      .from('memberships')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId);
    if (error) raise('Delete membership', error);
  }

  /**
   * Refuse to leave an organisation ownerless.
   *
   * There is no database constraint for this — it needs a count across rows — so it is
   * enforced here and in the JSON adapter identically. Two admins demoting the last two
   * owners at the same instant could still slip through; the recovery for that is
   * re-granting ownership, which is why it is not worth an advisory lock.
   */
  private async assertNotLastOwner(client: Client, orgId: UUID): Promise<void> {
    const { count, error } = await client
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'owner');
    if (error) raise('Count organisation owners', error);
    if ((count ?? 0) <= 1) {
      throw new ConflictError('An organisation must always have at least one owner.');
    }
  }

  /* -- directory ---------------------------------------------------- */

  async listCustomers(orgId: UUID, search?: string): Promise<Customer[]> {
    const client = await this.client();
    let query = client
      .from('customers')
      .select('*')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .order('name', { ascending: true });

    const pattern = searchPattern(search);
    if (pattern) {
      query = query.or(
        `name.ilike.${pattern},contact_name.ilike.${pattern},email.ilike.${pattern},external_ref.ilike.${pattern}`,
      );
    }

    const { data, error } = await query;
    if (error) raise('List customers', error);
    return data.map(toCustomer);
  }

  async getCustomer(orgId: UUID, id: UUID): Promise<Customer | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load customer', error);
    return data ? toCustomer(data) : null;
  }

  async createCustomer(input: NewRecord<Customer>): Promise<Customer> {
    const client = await this.client();
    const { data, error } = await client
      .from('customers')
      .insert(fromCustomer(input))
      .select()
      .single();
    if (error) {
      raise('Create customer', error, {
        customers_org_external_ref_key:
          'Another customer in this organisation already uses that reference.',
      });
    }
    return toCustomer(data);
  }

  async updateCustomer(orgId: UUID, id: UUID, patch: Patch<Customer>): Promise<Customer> {
    const client = await this.client();
    const { data, error } = await client
      .from('customers')
      .update(touch(patchCustomer(patch)))
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) {
      raise('Update customer', error, {
        customers_org_external_ref_key:
          'Another customer in this organisation already uses that reference.',
      });
    }
    return toCustomer(updatedRow(data, 'Customer', id));
  }

  async deleteCustomer(orgId: UUID, id: UUID): Promise<void> {
    const client = await this.client();

    // `locations_customer_id_fkey` cascades, and locations cascade into devices — so
    // without this check, deleting a customer would silently take their entire estate and
    // its job history with it. The JSON adapter refuses for the same reason.
    const { count, error: countError } = await client
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('customer_id', id);
    if (countError) raise('Count customer locations', countError);
    if ((count ?? 0) > 0) {
      throw new ConflictError('Remove this customer’s locations before deleting them.');
    }

    const { error } = await client.from('customers').delete().eq('org_id', orgId).eq('id', id);
    if (error) raise('Delete customer', error);
  }

  async listLocations(orgId: UUID, customerId?: UUID): Promise<Location[]> {
    const client = await this.client();
    let query = client
      .from('locations')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });
    if (customerId) query = query.eq('customer_id', customerId);

    const { data, error } = await query;
    if (error) raise('List locations', error);
    return data.map(toLocation);
  }

  async getLocation(orgId: UUID, id: UUID): Promise<Location | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('locations')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load location', error);
    return data ? toLocation(data) : null;
  }

  async createLocation(input: NewRecord<Location>): Promise<Location> {
    const client = await this.client();
    const { data, error } = await client
      .from('locations')
      .insert(fromLocation(input))
      .select()
      .single();
    if (error) raise('Create location', error);
    return toLocation(data);
  }

  async updateLocation(orgId: UUID, id: UUID, patch: Patch<Location>): Promise<Location> {
    const client = await this.client();
    const { data, error } = await client
      .from('locations')
      .update(touch(patchLocation(patch)))
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) raise('Update location', error);
    return toLocation(updatedRow(data, 'Location', id));
  }

  async deleteLocation(orgId: UUID, id: UUID): Promise<void> {
    const client = await this.client();

    // Same reasoning as deleteCustomer: `devices_location_id_fkey` cascades.
    const { count, error: countError } = await client
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('location_id', id);
    if (countError) raise('Count location devices', countError);
    if ((count ?? 0) > 0) {
      throw new ConflictError('Remove this location’s devices before deleting it.');
    }

    const { error } = await client.from('locations').delete().eq('org_id', orgId).eq('id', id);
    if (error) raise('Delete location', error);
  }

  async listDeviceTypes(orgId: UUID): Promise<DeviceType[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('device_types')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true });
    if (error) raise('List device types', error);
    return data.map(toDeviceType);
  }

  async createDeviceType(input: NewRecord<DeviceType>): Promise<DeviceType> {
    const client = await this.client();
    const { data, error } = await client
      .from('device_types')
      .insert(fromDeviceType(input))
      .select()
      .single();
    if (error) {
      raise('Create device type', error, {
        device_types_name_key: 'A device type with that name already exists.',
      });
    }
    return toDeviceType(data);
  }

  async listDevices(orgId: UUID, filter: DeviceFilter = {}): Promise<Device[]> {
    const client = await this.client();

    let locationIds: string[] | null = null;
    if (filter.customerId) {
      // `devices` has no customer_id — it is reached through the location. Resolving the
      // ids first keeps the main query a plain filter; an `!inner` embed would work too
      // but changes the shape of every row for one optional filter.
      const locations = await client
        .from('locations')
        .select('id')
        .eq('org_id', orgId)
        .eq('customer_id', filter.customerId);
      if (locations.error) raise('List customer locations', locations.error);
      locationIds = locations.data.map((row) => row.id);
      if (locationIds.length === 0) return [];
    }

    let query = client
      .from('devices')
      .select('*')
      .eq('org_id', orgId)
      // Devices with a due date first, soonest first; undated ones fall to the end. The
      // secondary key makes the order total, which the JSON adapter gets from insertion
      // order and a database cannot promise.
      .order('next_service_due', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (filter.locationId) query = query.eq('location_id', filter.locationId);
    if (locationIds) query = query.in('location_id', locationIds);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.dueOnOrBefore) query = query.lte('next_service_due', filter.dueOnOrBefore);

    const pattern = searchPattern(filter.search);
    if (pattern) {
      query = query.or(
        `name.ilike.${pattern},serial_number.ilike.${pattern},model.ilike.${pattern},manufacturer.ilike.${pattern}`,
      );
    }
    if (filter.limit) query = query.limit(filter.limit);

    const { data, error } = await query;
    if (error) raise('List devices', error);
    return data.map(toDevice);
  }

  async getDevice(orgId: UUID, id: UUID): Promise<Device | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('devices')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load device', error);
    return data ? toDevice(data) : null;
  }

  async getDeviceContextByToken(publicToken: string): Promise<DeviceContext | null> {
    const client = await this.client();

    // One query, four tables. This runs on the public QR page, where the visitor is
    // waiting and four sequential round trips would be visible; PostgREST resolves the
    // embeds through the foreign keys in a single request.
    //
    // Not scoped by org on purpose: the token is the scope. It is unguessable, and the
    // organisation is resolved *from* it.
    const { data, error } = await client
      .from('devices')
      .select(
        '*, location:locations(*, customer:customers(*)), device_type:device_types(*), organization:organizations(*)',
      )
      .eq('public_token', publicToken)
      .maybeSingle();

    if (error && !isMissingRow(error)) raise('Load device by token', error);
    if (!data) return null;

    const { location, device_type: deviceType, organization, ...device } = data;
    // A device always has a location, a customer and an organisation (all NOT NULL
    // foreign keys), so a missing embed means the row was filtered out by RLS rather than
    // absent. Treat it as "no such device", exactly as the JSON adapter does.
    if (!location || !location.customer || !organization) return null;

    return {
      device: toDevice(device),
      location: toLocation(location),
      customer: toCustomer(location.customer),
      deviceType: deviceType ? toDeviceType(deviceType) : null,
      organization: toOrganization(organization),
    };
  }

  async createDevice(input: NewRecord<Device>): Promise<Device> {
    const client = await this.client();
    const { data, error } = await client.from('devices').insert(fromDevice(input)).select().single();
    if (error) {
      raise('Create device', error, {
        devices_public_token_key: 'Device token collision.',
        devices_org_serial_number_key:
          'Another device in this organisation already uses that serial number.',
      });
    }
    return toDevice(data);
  }

  async updateDevice(orgId: UUID, id: UUID, patch: Patch<Device>): Promise<Device> {
    const client = await this.client();
    const { data, error } = await client
      .from('devices')
      .update(touch(patchDevice(patch)))
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) {
      raise('Update device', error, {
        devices_public_token_key: 'Device token collision.',
        devices_org_serial_number_key:
          'Another device in this organisation already uses that serial number.',
      });
    }
    return toDevice(updatedRow(data, 'Device', id));
  }

  async deleteDevice(orgId: UUID, id: UUID): Promise<void> {
    const client = await this.client();
    // The device's reminders go with it through `reminders_device_id_fkey on delete
    // cascade`; the JSON adapter has to do that sweep by hand.
    const { error } = await client.from('devices').delete().eq('org_id', orgId).eq('id', id);
    if (error) raise('Delete device', error);
  }

  async createDevicesBulk(inputs: readonly NewRecord<Device>[]): Promise<Device[]> {
    if (inputs.length === 0) return [];
    const client = await this.client();
    // One statement, therefore one transaction: a CSV import either lands completely or
    // not at all, which is what the importer's dry-run preview promises the user.
    const { data, error } = await client
      .from('devices')
      .insert(inputs.map(fromDevice))
      .select();
    if (error) {
      raise('Import devices', error, {
        devices_public_token_key: 'Device token collision.',
        devices_org_serial_number_key:
          'Two devices in this import share a serial number that is already in use.',
      });
    }
    return data.map(toDevice);
  }

  /* -- checklists --------------------------------------------------- */

  async listChecklistTemplates(orgId: UUID): Promise<ChecklistTemplate[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('checklist_templates')
      .select('*')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .order('created_at', { ascending: true });
    if (error) raise('List checklist templates', error);
    return data.map(toChecklistTemplate);
  }

  async getChecklistTemplate(orgId: UUID, id: UUID): Promise<ChecklistTemplate | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('checklist_templates')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load checklist template', error);
    return data ? toChecklistTemplate(data) : null;
  }

  async createChecklistTemplate(
    input: NewRecord<ChecklistTemplate>,
  ): Promise<ChecklistTemplate> {
    const client = await this.client();
    const { data, error } = await client
      .from('checklist_templates')
      .insert(fromChecklistTemplate(input))
      .select()
      .single();
    if (error) {
      raise('Create checklist template', error, {
        checklist_templates_name_version_key:
          'That checklist name and version already exist. Bump the version.',
      });
    }
    return toChecklistTemplate(data);
  }

  async updateChecklistTemplate(
    orgId: UUID,
    id: UUID,
    patch: Patch<ChecklistTemplate>,
  ): Promise<ChecklistTemplate> {
    const client = await this.client();
    const { data, error } = await client
      .from('checklist_templates')
      .update(touch(patchChecklistTemplate(patch)))
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) {
      raise('Update checklist template', error, {
        checklist_templates_name_version_key:
          'That checklist name and version already exist. Bump the version.',
      });
    }
    return toChecklistTemplate(updatedRow(data, 'ChecklistTemplate', id));
  }

  async listChecklistItems(orgId: UUID, templateId: UUID): Promise<ChecklistItem[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('checklist_items')
      .select('*')
      .eq('org_id', orgId)
      .eq('template_id', templateId)
      .order('position', { ascending: true });
    if (error) raise('List checklist items', error);
    return data.map(toChecklistItem);
  }

  async replaceChecklistItems(
    orgId: UUID,
    templateId: UUID,
    items: readonly Omit<ChecklistItem, 'id'>[],
  ): Promise<ChecklistItem[]> {
    const client = await this.client();

    // Delete-then-insert, in two statements, because PostgREST has no transaction across
    // requests. Templates are versioned rather than edited in place (PLAN.md R10), so the
    // window between the two only ever affects a draft nobody is running against.
    const removed = await client
      .from('checklist_items')
      .delete()
      .eq('org_id', orgId)
      .eq('template_id', templateId);
    if (removed.error) raise('Clear checklist items', removed.error);

    if (items.length === 0) return [];

    const { data, error } = await client
      .from('checklist_items')
      .insert(items.map(fromChecklistItem))
      .select();
    if (error) {
      raise('Replace checklist items', error, {
        checklist_items_template_position_key: 'Two checklist items share the same position.',
      });
    }
    return data.map(toChecklistItem);
  }

  async listChecklistResults(orgId: UUID, workOrderId: UUID): Promise<ChecklistResult[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('work_order_checklist_results')
      .select('*')
      .eq('org_id', orgId)
      .eq('work_order_id', workOrderId)
      .order('position', { ascending: true });
    if (error) raise('List checklist results', error);
    return data.map(toChecklistResult);
  }

  async replaceChecklistResults(
    orgId: UUID,
    workOrderId: UUID,
    results: readonly Omit<ChecklistResult, 'id'>[],
  ): Promise<ChecklistResult[]> {
    const client = await this.client();

    if (results.length === 0) {
      const cleared = await client
        .from('work_order_checklist_results')
        .delete()
        .eq('org_id', orgId)
        .eq('work_order_id', workOrderId);
      if (cleared.error) raise('Clear checklist results', cleared.error);
      return [];
    }

    // Upsert rather than delete-then-insert: DELETE on this table is admin-only (0006),
    // precisely so a technician cannot destroy evidence, and the checklist run is exactly
    // the flow a technician performs. `(work_order_id, item_id)` is the unique key, so
    // re-answering an item updates its row.
    const { data, error } = await client
      .from('work_order_checklist_results')
      .upsert(results.map(fromChecklistResult), { onConflict: 'work_order_id,item_id' })
      .select();
    if (error) raise('Save checklist results', error);

    // Drop answers to items that are no longer part of the run. Only an admin can do
    // this; for a technician it is a silent no-op, and the common case — re-running the
    // same template — leaves nothing stale behind anyway.
    const keep = data.map((row) => row.id);
    const pruned = await client
      .from('work_order_checklist_results')
      .delete()
      .eq('org_id', orgId)
      .eq('work_order_id', workOrderId)
      .not('id', 'in', `(${keep.join(',')})`);
    if (pruned.error) raise('Prune checklist results', pruned.error);

    return data.map(toChecklistResult);
  }

  /* -- work orders -------------------------------------------------- */

  async listWorkOrders(orgId: UUID, filter: WorkOrderFilter = {}): Promise<WorkOrder[]> {
    const client = await this.client();
    let query = client
      .from('work_orders')
      .select('*')
      .eq('org_id', orgId)
      .order('code', { ascending: false });

    if (filter.status) {
      const statuses: WorkOrderStatus[] = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      query = statuses.length === 1 ? query.eq('status', statuses[0]!) : query.in('status', statuses);
    }
    if (filter.assignedTo) query = query.eq('assigned_to', filter.assignedTo);
    if (filter.deviceId) query = query.eq('device_id', filter.deviceId);
    if (filter.customerId) query = query.eq('customer_id', filter.customerId);

    // `scheduled_for` is an instant but the filter is a civil day, so the window is sent
    // as explicit UTC bounds — half-open at the top, which is how "up to and including
    // this day" is expressed against a timestamp — rather than as a bare date whose
    // meaning would depend on the database's timezone setting. Unscheduled orders fail
    // both comparisons and drop out, matching the JSON adapter.
    if (filter.from) query = query.gte('scheduled_for', startOfDayUTC(filter.from));
    if (filter.to) query = query.lt('scheduled_for', startOfDayUTC(addDays(filter.to, 1)));

    if (filter.limit) query = query.limit(filter.limit);

    const { data, error } = await query;
    if (error) raise('List work orders', error);
    return data.map(toWorkOrder);
  }

  async getWorkOrder(orgId: UUID, id: UUID): Promise<WorkOrder | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('work_orders')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load work order', error);
    return data ? toWorkOrder(data) : null;
  }

  async createWorkOrder(input: NewRecord<WorkOrder>): Promise<WorkOrder> {
    const client = await this.client();
    const { data, error } = await client
      .from('work_orders')
      .insert(fromWorkOrder(input))
      .select()
      .single();
    if (error) {
      raise('Create work order', error, {
        work_orders_code_key: `Work order ${input.code} already exists.`,
        work_orders_device_slot_key:
          'That time slot was just taken for this device. Pick another slot.',
      });
    }
    return toWorkOrder(data);
  }

  async updateWorkOrder(orgId: UUID, id: UUID, patch: Patch<WorkOrder>): Promise<WorkOrder> {
    const client = await this.client();
    const { data, error } = await client
      .from('work_orders')
      .update(touch(patchWorkOrder(patch)))
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) {
      raise('Update work order', error, {
        work_orders_code_key: 'That work-order code is already in use.',
        work_orders_device_slot_key:
          'That time slot was just taken for this device. Pick another slot.',
      });
    }
    return toWorkOrder(updatedRow(data, 'WorkOrder', id));
  }

  async nextWorkOrderSequence(orgId: UUID, year: number): Promise<number> {
    const client = await this.client();

    // `next_work_order_code()` is the only race-safe allocator: it increments the counter
    // with `insert ... on conflict do update`, so two concurrent callers serialise inside
    // one statement. There is deliberately no fallback — counting existing work orders
    // would hand the same number to two simultaneous requests and mint a duplicate code
    // on a customer-facing document.
    const { data, error } = await client.rpc('next_work_order_code', {
      p_org_id: orgId,
      p_year: year,
    });
    if (error) raise('Allocate work-order code', error);

    // The function returns the formatted code; the interface wants the bare sequence, so
    // the format is parsed back off rather than being reimplemented here.
    const parsed = typeof data === 'string' ? parseWorkOrderCode(data) : null;
    if (!parsed) {
      throw new Error(
        `next_work_order_code returned "${String(data)}", which is not a work-order code.`,
      );
    }
    return parsed.sequence;
  }

  /* -- customer intake ---------------------------------------------- */

  async listBookings(orgId: UUID, status?: Booking['status']): Promise<Booking[]> {
    const client = await this.client();
    let query = client
      .from('bookings')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) raise('List bookings', error);
    return data.map(toBooking);
  }

  async getBooking(orgId: UUID, id: UUID): Promise<Booking | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('bookings')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load booking', error);
    return data ? toBooking(data) : null;
  }

  async createBooking(input: NewRecord<Booking>): Promise<Booking> {
    const client = await this.client();
    const { data, error } = await client
      .from('bookings')
      .insert(fromBooking(input))
      .select()
      .single();
    if (error) raise('Create booking', error);
    return toBooking(data);
  }

  async updateBooking(orgId: UUID, id: UUID, patch: Patch<Booking>): Promise<Booking> {
    const client = await this.client();
    const { data, error } = await client
      .from('bookings')
      .update(touch(patchBooking(patch)))
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) raise('Update booking', error);
    return toBooking(updatedRow(data, 'Booking', id));
  }

  async listIssues(orgId: UUID, status?: Issue['status']): Promise<Issue[]> {
    const client = await this.client();
    let query = client
      .from('issues')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) raise('List issues', error);
    return data.map(toIssue);
  }

  async getIssue(orgId: UUID, id: UUID): Promise<Issue | null> {
    const client = await this.client();
    const { data, error } = await client
      .from('issues')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error && !isMissingRow(error)) raise('Load issue', error);
    return data ? toIssue(data) : null;
  }

  async createIssue(input: NewRecord<Issue>): Promise<Issue> {
    const client = await this.client();
    const { data, error } = await client.from('issues').insert(fromIssue(input)).select().single();
    if (error) raise('Create issue', error);
    return toIssue(data);
  }

  async updateIssue(orgId: UUID, id: UUID, patch: Patch<Issue>): Promise<Issue> {
    const client = await this.client();
    const { data, error } = await client
      .from('issues')
      .update(touch(patchIssue(patch)))
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) raise('Update issue', error);
    return toIssue(updatedRow(data, 'Issue', id));
  }

  /* -- reminders ---------------------------------------------------- */

  async listReminders(orgId: UUID, filter: ReminderFilter = {}): Promise<Reminder[]> {
    const client = await this.client();
    let query = client
      .from('reminders')
      .select('*')
      .eq('org_id', orgId)
      .order('scheduled_for', { ascending: true })
      .order('id', { ascending: true });

    if (filter.deviceId) query = query.eq('device_id', filter.deviceId);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.scheduledOnOrBefore) {
      query = query.lte('scheduled_for', filter.scheduledOnOrBefore);
    }
    if (filter.limit) query = query.limit(filter.limit);

    const { data, error } = await query;
    if (error) raise('List reminders', error);
    return data.map(toReminder);
  }

  async createRemindersIgnoringDuplicates(
    inputs: readonly NewRecord<Reminder>[],
  ): Promise<Reminder[]> {
    if (inputs.length === 0) return [];
    const client = await this.client();

    // THE idempotency guarantee (PLAN.md R6).
    //
    // `ignoreDuplicates: true` makes PostgREST emit `ON CONFLICT DO NOTHING` against
    // `reminders_device_due_stage_key (device_id, due_date, stage)`. Postgres then skips
    // rows that already exist — including duplicates inside this same batch — and
    // `RETURNING` yields only the rows it actually inserted. That is what the return type
    // means, and what the reminder job relies on: it may run twice a day, be retried by
    // the cron provider, or overlap with itself, and no customer is ever mailed twice.
    //
    // `ignoreDuplicates: false` would be an upsert instead, resurrecting reminders that
    // had already been sent or skipped by resetting their state.
    const { data, error } = await client
      .from('reminders')
      .upsert(inputs.map(fromReminder), {
        onConflict: 'device_id,due_date,stage',
        ignoreDuplicates: true,
      })
      .select();
    if (error) raise('Create reminders', error);
    return data.map(toReminder);
  }

  async updateReminder(orgId: UUID, id: UUID, patch: Patch<Reminder>): Promise<Reminder> {
    const client = await this.client();
    const { data, error } = await client
      .from('reminders')
      .update(touch(patchReminder(patch)))
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) raise('Update reminder', error);
    return toReminder(updatedRow(data, 'Reminder', id));
  }

  async deleteReminders(orgId: UUID, ids: readonly UUID[]): Promise<void> {
    if (ids.length === 0) return;
    const client = await this.client();
    const { error } = await client
      .from('reminders')
      .delete()
      .eq('org_id', orgId)
      .in('id', [...ids]);
    if (error) raise('Delete reminders', error);
  }

  /**
   * The cron sweep: every tenant's due reminders in one pass.
   *
   * This is the one method with no `orgId`, so it only returns rows when the caller
   * supplied a service-role client — `SupabaseRepository.admin()` — which bypasses RLS.
   * Called with the ordinary request-scoped client it is not a security hole, merely
   * useless: the policies narrow it to the caller's own organisations.
   */
  async listDueRemindersAcrossOrgs(onOrBefore: CivilDate, limit: number): Promise<Reminder[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', onOrBefore)
      // Oldest first, then by id so a batch boundary is stable across runs. This is the
      // access path `reminders_pending_scheduled_idx` exists for.
      .order('scheduled_for', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit);
    if (error) raise('List due reminders', error);
    return data.map(toReminder);
  }

  /* -- reports ------------------------------------------------------ */

  async getServiceReportByWorkOrder(
    orgId: UUID,
    workOrderId: UUID,
  ): Promise<ServiceReport | null> {
    const client = await this.client();
    // Nothing stops a job having more than one report row, so the oldest is taken rather
    // than `maybeSingle()`, which would fail the request in that case.
    const { data, error } = await client
      .from('service_reports')
      .select('*')
      .eq('org_id', orgId)
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) raise('Load service report', error);
    const row = data[0];
    return row ? toServiceReport(row) : null;
  }

  async createServiceReport(input: NewRecord<ServiceReport>): Promise<ServiceReport> {
    const client = await this.client();
    const { data, error } = await client
      .from('service_reports')
      .insert(fromServiceReport(input))
      .select()
      .single();
    if (error) {
      raise('Create service report', error, {
        service_reports_number_key: `Service report ${input.number} already exists.`,
      });
    }
    return toServiceReport(data);
  }

  /* -- scheduling configuration ------------------------------------- */

  async listBusinessHours(orgId: UUID): Promise<BusinessHours[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('business_hours')
      .select('*')
      .eq('org_id', orgId)
      .order('weekday', { ascending: true });
    if (error) raise('List business hours', error);
    return data.map(toBusinessHours);
  }

  async replaceBusinessHours(
    orgId: UUID,
    hours: readonly Omit<BusinessHours, 'id'>[],
  ): Promise<BusinessHours[]> {
    const client = await this.client();

    const removed = await client.from('business_hours').delete().eq('org_id', orgId);
    if (removed.error) raise('Clear business hours', removed.error);

    if (hours.length === 0) return [];

    const { data, error } = await client
      .from('business_hours')
      .insert(hours.map(fromBusinessHours))
      .select();
    if (error) {
      raise('Replace business hours', error, {
        business_hours_org_weekday_key: 'That weekday appears twice in the opening hours.',
      });
    }
    return data.map(toBusinessHours);
  }

  async listBlackoutDates(orgId: UUID): Promise<BlackoutDate[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('blackout_dates')
      .select('*')
      .eq('org_id', orgId)
      .order('date', { ascending: true });
    if (error) raise('List blackout dates', error);
    return data.map(toBlackoutDate);
  }

  async createBlackoutDate(input: Omit<BlackoutDate, 'id'>): Promise<BlackoutDate> {
    const client = await this.client();
    const { data, error } = await client
      .from('blackout_dates')
      .insert(fromBlackoutDate(input))
      .select()
      .single();
    if (error) {
      raise('Create blackout date', error, {
        blackout_dates_org_date_key: 'That date is already blocked out.',
      });
    }
    return toBlackoutDate(data);
  }

  async deleteBlackoutDate(orgId: UUID, id: UUID): Promise<void> {
    const client = await this.client();
    const { error } = await client.from('blackout_dates').delete().eq('org_id', orgId).eq('id', id);
    if (error) raise('Delete blackout date', error);
  }

  /* -- audit -------------------------------------------------------- */

  async appendAuditLog(entry: NewRecord<AuditLogEntry>): Promise<void> {
    const client = await this.client();
    const { error } = await client.from('audit_log').insert(fromAuditLogEntry(entry));
    if (!error) return;

    // `audit_log` has no INSERT policy for any API role (0006): rows arrive through the
    // SECURITY DEFINER `log_change()` trigger, which is what makes the log append-only
    // and unforgeable. An application-level entry for the tables that trigger covers is
    // therefore expected to be refused, and failing the user's write because its audit
    // echo was denied would be the wrong trade. Anything other than a refusal is a real
    // fault and still throws.
    if (error.code === INSUFFICIENT_PRIVILEGE) return;
    raise('Append audit log', error);
  }

  async listAuditLog(orgId: UUID, limit = 100): Promise<AuditLogEntry[]> {
    const client = await this.client();
    const { data, error } = await client
      .from('audit_log')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) raise('List audit log', error);
    return data.map(toAuditLogEntry);
  }
}

export type { Repository };
