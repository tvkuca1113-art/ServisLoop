-- =============================================================================
-- 0004_indexes.sql
--
-- Two categories:
--
--   1. Access-path indexes. Every RLS policy filters on org_id, and PostgREST adds
--      the caller's own filters on top, so the useful shape is almost always
--      (org_id, <thing actually filtered or sorted on>) rather than org_id alone.
--   2. Correctness indexes — partial unique indexes that express rules a table
--      constraint cannot (see the double-booking guard at the bottom).
--
-- Unique *constraints* declared in 0002/0003 already create their own indexes; they
-- are not repeated here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- memberships
-- -----------------------------------------------------------------------------
-- Drives is_org_member()/org_role(), which run on essentially every query in the
-- product. The (org_id, user_id) unique constraint covers org-first lookups; this
-- covers "which organisations does this person belong to" for the org switcher.
create index if not exists memberships_user_id_idx
  on public.memberships (user_id);

create index if not exists memberships_org_role_idx
  on public.memberships (org_id, role);

-- -----------------------------------------------------------------------------
-- customers / locations
-- -----------------------------------------------------------------------------
create index if not exists customers_org_name_idx
  on public.customers (org_id, name);

-- The customer list excludes archived rows by default, so the common query never
-- touches the archived tail.
create index if not exists customers_org_active_idx
  on public.customers (org_id)
  where archived_at is null;

-- Partial rather than a plain unique constraint: importers write '' for a missing
-- key, and NULLS DISTINCT would not save us from a second empty string.
create unique index if not exists customers_org_external_ref_key
  on public.customers (org_id, external_ref)
  where external_ref is not null and btrim(external_ref) <> '';

create index if not exists locations_org_idx
  on public.locations (org_id);

create index if not exists locations_customer_idx
  on public.locations (customer_id);

-- -----------------------------------------------------------------------------
-- device_types / checklists
-- -----------------------------------------------------------------------------
create index if not exists device_types_org_idx
  on public.device_types (org_id);

create index if not exists checklist_templates_org_active_idx
  on public.checklist_templates (org_id)
  where archived_at is null;

create index if not exists checklist_items_org_idx
  on public.checklist_items (org_id);

-- (template_id, position) is already unique from 0002 and serves ordered reads.

-- -----------------------------------------------------------------------------
-- devices
-- -----------------------------------------------------------------------------
create index if not exists devices_org_status_idx
  on public.devices (org_id, status);

create index if not exists devices_location_idx
  on public.devices (location_id);

create index if not exists devices_device_type_idx
  on public.devices (device_type_id);

-- The reminder generator and the "due soon / overdue" dashboard both scan devices in
-- due-date order, and both only ever care about active kit. Paused and retired
-- devices are excluded from the index entirely, not just from the query.
create index if not exists devices_org_next_service_due_idx
  on public.devices (org_id, next_service_due)
  where status = 'active' and next_service_due is not null;

create unique index if not exists devices_org_serial_number_key
  on public.devices (org_id, serial_number)
  where serial_number is not null and btrim(serial_number) <> '';

-- devices.public_token already has a unique index from its constraint, which is what
-- the public /d/[token] lookup uses.

-- -----------------------------------------------------------------------------
-- work_orders
-- -----------------------------------------------------------------------------
create index if not exists work_orders_org_status_idx
  on public.work_orders (org_id, status);

create index if not exists work_orders_org_scheduled_for_idx
  on public.work_orders (org_id, scheduled_for);

create index if not exists work_orders_org_kind_idx
  on public.work_orders (org_id, kind);

create index if not exists work_orders_device_idx
  on public.work_orders (device_id);

-- The technician's "my jobs" view. Partial because the overwhelming majority of rows
-- in a healthy backlog are unassigned or historical.
create index if not exists work_orders_assigned_to_idx
  on public.work_orders (assigned_to, status)
  where assigned_to is not null;

-- Reverse lookup: "which job came out of this booking / this issue". Also keeps the
-- ON DELETE SET NULL cascade from bookings and issues off a sequential scan.
create index if not exists work_orders_source_booking_idx
  on public.work_orders (source_booking_id)
  where source_booking_id is not null;

create index if not exists work_orders_source_issue_idx
  on public.work_orders (source_issue_id)
  where source_issue_id is not null;

-- ---------------------------------------------------------------------------
-- Double-booking guard (PLAN.md R7).
--
-- Availability is computed deterministically in the domain layer, but two public
-- booking confirmations can be in flight at the same instant and both see a free
-- slot. This index is the arbiter: the second insert/update fails and the caller
-- re-runs availability.
--
-- It has to be a partial unique *index* rather than a table constraint, because the
-- rule only applies to live jobs — a cancelled or completed job must not block the
-- device's calendar forever, and NULL scheduled_for (drafts) must not collide.
-- ---------------------------------------------------------------------------
create unique index if not exists work_orders_device_slot_key
  on public.work_orders (device_id, scheduled_for)
  where status in ('scheduled', 'in_progress') and scheduled_for is not null;

-- -----------------------------------------------------------------------------
-- work_order_checklist_results
-- -----------------------------------------------------------------------------
-- The checklist run and the PDF renderer both read a whole work order's results in
-- template order.
create index if not exists work_order_checklist_results_work_order_idx
  on public.work_order_checklist_results (work_order_id, position);

create index if not exists work_order_checklist_results_org_idx
  on public.work_order_checklist_results (org_id);

-- -----------------------------------------------------------------------------
-- bookings / issues
-- -----------------------------------------------------------------------------
create index if not exists bookings_org_status_idx
  on public.bookings (org_id, status);

create index if not exists bookings_device_date_idx
  on public.bookings (device_id, requested_date);

create index if not exists issues_org_status_idx
  on public.issues (org_id, status);

create index if not exists issues_device_idx
  on public.issues (device_id);

-- -----------------------------------------------------------------------------
-- reminders
-- -----------------------------------------------------------------------------
create index if not exists reminders_org_status_scheduled_idx
  on public.reminders (org_id, status, scheduled_for);

create index if not exists reminders_device_idx
  on public.reminders (device_id);

-- The dispatch endpoint's only query: pending, send date reached, oldest first. The
-- partial predicate keeps the index proportional to the queue rather than to history,
-- so it stays small forever even as sent reminders accumulate.
create index if not exists reminders_pending_scheduled_idx
  on public.reminders (scheduled_for, id)
  where status = 'pending';

-- -----------------------------------------------------------------------------
-- service_reports
-- -----------------------------------------------------------------------------
create index if not exists service_reports_work_order_idx
  on public.service_reports (work_order_id);

create index if not exists service_reports_org_generated_at_idx
  on public.service_reports (org_id, generated_at desc);

-- -----------------------------------------------------------------------------
-- audit_log
-- -----------------------------------------------------------------------------
create index if not exists audit_log_org_created_at_idx
  on public.audit_log (org_id, created_at desc);

-- "Everything that ever happened to this device / this job."
create index if not exists audit_log_entity_idx
  on public.audit_log (entity, entity_id);

create index if not exists audit_log_actor_idx
  on public.audit_log (actor_id)
  where actor_id is not null;

-- business_hours (org_id, weekday) and blackout_dates (org_id, date) are already
-- unique, which is exactly the access path the availability engine uses.
