/**
 * Domain entity types and enumerations.
 *
 * These mirror the Postgres schema in `supabase/migrations/` one-for-one. They are the
 * shared vocabulary between the pure domain layer, the repository adapters and the UI.
 *
 * Pure module: types and frozen constant tuples only.
 */

import type { CivilDate, MinuteOfDay } from './dates';

export type UUID = string;
/** ISO-8601 instant, e.g. `2026-08-02T09:15:00.000Z`. */
export type Timestamp = string;

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

export const ROLES = ['owner', 'admin', 'technician', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Ascending privilege. Used for "at least this role" comparisons. */
export const ROLE_RANK: Readonly<Record<Role, number>> = Object.freeze({
  viewer: 0,
  technician: 1,
  admin: 2,
  owner: 3,
});

export const DEVICE_STATUSES = ['active', 'paused', 'retired'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const WORK_ORDER_STATUSES = [
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_KINDS = ['scheduled', 'issue', 'booking'] as const;
export type WorkOrderKind = (typeof WORK_ORDER_KINDS)[number];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const BOOKING_STATUSES = ['pending', 'confirmed', 'declined', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const ISSUE_STATUSES = ['open', 'triaged', 'converted', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_SEVERITIES = ['low', 'normal', 'high', 'critical'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const REMINDER_STATUSES = ['pending', 'sent', 'skipped', 'failed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const CHECKLIST_ITEM_KINDS = ['boolean', 'number', 'text', 'select'] as const;
export type ChecklistItemKind = (typeof CHECKLIST_ITEM_KINDS)[number];

/**
 * How the next service date is anchored when a job is completed.
 *
 * - `completion` — next due = completion date + interval. The cadence drifts if work
 *   runs late, which is what most reactive maintenance contracts want.
 * - `schedule` — next due keeps the original cadence (previous due + interval), rolling
 *   forward in whole intervals until it lands after the completion date. This is what
 *   regulated inspections want: an annual check stays on its anniversary.
 */
export const INTERVAL_ANCHORS = ['completion', 'schedule'] as const;
export type IntervalAnchor = (typeof INTERVAL_ANCHORS)[number];

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  timezone: string;
  /** Days before the due date at which a device starts showing as "due soon". */
  reminderLeadDays: number;
  defaultIntervalAnchor: IntervalAnchor;
  /** Length of a bookable appointment slot, in minutes. */
  slotMinutes: number;
  /** Minimum notice for a customer booking, in hours. */
  bookingLeadHours: number;
  /** How far ahead customers may book, in days. */
  bookingHorizonDays: number;
  isDemo: boolean;
  createdAt: Timestamp;
}

export interface Profile {
  id: UUID;
  email: string;
  fullName: string | null;
  createdAt: Timestamp;
}

export interface Membership {
  id: UUID;
  orgId: UUID;
  userId: UUID;
  role: Role;
  createdAt: Timestamp;
}

export interface Customer {
  id: UUID;
  orgId: UUID;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  externalRef: string | null;
  notes: string | null;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface Location {
  id: UUID;
  orgId: UUID;
  customerId: UUID;
  name: string;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  createdAt: Timestamp;
}

export interface DeviceType {
  id: UUID;
  orgId: UUID;
  name: string;
  defaultIntervalDays: number;
  checklistTemplateId: UUID | null;
  createdAt: Timestamp;
}

export interface Device {
  id: UUID;
  orgId: UUID;
  locationId: UUID;
  deviceTypeId: UUID | null;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installedOn: CivilDate | null;
  /** Overrides `DeviceType.defaultIntervalDays` when set. */
  serviceIntervalDays: number | null;
  intervalAnchor: IntervalAnchor | null;
  lastServiceAt: CivilDate | null;
  /** Derived. Never edited by hand — see `computeNextServiceDue`. */
  nextServiceDue: CivilDate | null;
  status: DeviceStatus;
  /** Unguessable token embedded in the QR code. */
  publicToken: string;
  notes: string | null;
  createdAt: Timestamp;
}

export interface ChecklistTemplate {
  id: UUID;
  orgId: UUID;
  name: string;
  version: number;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface ChecklistItem {
  id: UUID;
  orgId: UUID;
  templateId: UUID;
  position: number;
  label: string;
  kind: ChecklistItemKind;
  required: boolean;
  /** For `select` items. */
  options: string[] | null;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  /** For `boolean` items: which answer counts as a pass. */
  expectedBoolean: boolean | null;
}

export interface WorkOrder {
  id: UUID;
  orgId: UUID;
  code: string;
  deviceId: UUID;
  locationId: UUID;
  customerId: UUID;
  kind: WorkOrderKind;
  status: WorkOrderStatus;
  priority: Priority;
  /** Scheduled start instant. */
  scheduledFor: Timestamp | null;
  scheduledMinutes: number | null;
  assignedTo: UUID | null;
  checklistTemplateId: UUID | null;
  sourceBookingId: UUID | null;
  sourceIssueId: UUID | null;
  summary: string | null;
  internalNotes: string | null;
  openedAt: Timestamp;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  /** Civil date the work was performed — drives the next-due calculation. */
  completedOn: CivilDate | null;
  createdAt: Timestamp;
}

export interface ChecklistResult {
  id: UUID;
  orgId: UUID;
  workOrderId: UUID;
  itemId: UUID;
  /** Snapshot of the item at completion time, so template edits never rewrite history. */
  labelSnapshot: string;
  kindSnapshot: ChecklistItemKind;
  position: number;
  valueBool: boolean | null;
  valueNum: number | null;
  valueText: string | null;
  passed: boolean;
  note: string | null;
}

export interface Booking {
  id: UUID;
  orgId: UUID;
  deviceId: UUID;
  requestedDate: CivilDate;
  requestedStartMinute: MinuteOfDay;
  requestedEndMinute: MinuteOfDay;
  status: BookingStatus;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  note: string | null;
  workOrderId: UUID | null;
  createdAt: Timestamp;
}

export interface Issue {
  id: UUID;
  orgId: UUID;
  deviceId: UUID;
  severity: IssueSeverity;
  title: string;
  description: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterPhone: string | null;
  status: IssueStatus;
  workOrderId: UUID | null;
  createdAt: Timestamp;
}

export const REMINDER_STAGES = ['T_30', 'T_7', 'T_0', 'OVERDUE'] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

export interface Reminder {
  id: UUID;
  orgId: UUID;
  deviceId: UUID;
  dueDate: CivilDate;
  stage: ReminderStage;
  /** Civil date the reminder should go out. */
  scheduledFor: CivilDate;
  status: ReminderStatus;
  sentAt: Timestamp | null;
  error: string | null;
  createdAt: Timestamp;
}

export interface ServiceReport {
  id: UUID;
  orgId: UUID;
  workOrderId: UUID;
  number: string;
  generatedAt: Timestamp;
  signedByName: string | null;
  totalMinutes: number | null;
}

export interface BusinessHours {
  id: UUID;
  orgId: UUID;
  /** `0` = Sunday … `6` = Saturday. */
  weekday: number;
  isOpen: boolean;
  openMinute: MinuteOfDay;
  closeMinute: MinuteOfDay;
}

export interface BlackoutDate {
  id: UUID;
  orgId: UUID;
  date: CivilDate;
  reason: string | null;
}

export interface AuditLogEntry {
  id: UUID;
  orgId: UUID;
  actorId: UUID | null;
  action: string;
  entity: string;
  entityId: UUID | null;
  meta: Record<string, unknown> | null;
  createdAt: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Composed read models                                                */
/* ------------------------------------------------------------------ */

export interface DeviceWithContext extends Device {
  location: Location;
  customer: Customer;
  deviceType: DeviceType | null;
}

export interface WorkOrderWithContext extends WorkOrder {
  device: Device;
  location: Location;
  customer: Customer;
  assignee: Profile | null;
}
