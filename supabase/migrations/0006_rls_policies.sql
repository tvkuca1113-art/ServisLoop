-- =============================================================================
-- 0006_rls_policies.sql — the permission matrix, expressed in Postgres
--
-- This file is the second of two independent enforcement points. The first is
-- `can(role, action, ctx)` in src/domain/permissions.ts, which every server action and
-- route handler calls. If a bug lets a request past that guard, these policies still
-- refuse it. The two must be changed together; the mapping is:
--
--   can(role, 'x:read')                 ->  SELECT   using is_org_member(org_id)
--   can('admin', 'x:create|update|delete') ->  INSERT/UPDATE/DELETE
--                                            using has_role_at_least(org_id, 'admin')
--   ASSIGNEE_ONLY                       ->  is_assigned_technician(work_order_id)
--                                            or assigned_to = auth_user_id()
--
-- `anon` HAS NO POLICIES ON ANY TABLE — DELIBERATELY
-- --------------------------------------------------
-- Every policy below is `to authenticated`, so an unauthenticated request matches
-- nothing and reads nothing, on every table, forever. The three public surfaces —
-- the /d/[token] QR page, booking submission and issue reporting — do not query
-- Postgres as `anon`. They go through server route handlers that hold the
-- service-role key and are scoped by the unguessable per-device `public_token`
-- (PLAN.md §2.4). That keeps the public attack surface at "one route handler you can
-- read in full" rather than "whatever a policy on nine tables happens to permit".
--
-- Adding a single `to anon` policy anywhere silently converts this design into the
-- other one. Don't.
--
-- Column-level restriction is not attempted. A technician who may UPDATE a device row
-- may in principle write any column of it, including the derived `next_service_due`.
-- The application is the guard for derived columns; the database is the guard for
-- tenancy and role.
--
-- RLS itself was enabled in 0002/0003, next to each CREATE TABLE, so the schema is
-- closed by default. The assertion at the bottom of this file fails the migration if
-- any table was missed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations for select to authenticated
  using (public.is_org_member(id));

-- Any signed-in user may found an organisation. The bootstrap membership that makes
-- them its owner is authorised by memberships_insert_member below.
drop policy if exists organizations_insert_authenticated on public.organizations;
create policy organizations_insert_authenticated
  on public.organizations for insert to authenticated
  with check (public.auth_user_id() is not null);

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin
  on public.organizations for update to authenticated
  using (public.has_role_at_least(id, 'admin'))
  with check (public.has_role_at_least(id, 'admin'));

-- can('admin', 'org:delete') is absent from the matrix: deleting an organisation
-- cascades to every row this company owns, so it is the owner's decision alone.
drop policy if exists organizations_delete_owner on public.organizations;
create policy organizations_delete_owner
  on public.organizations for delete to authenticated
  using (public.org_role(id) = 'owner');

-- -----------------------------------------------------------------------------
-- profiles
--
-- Not a tenant table — a profile belongs to a person, not to an organisation, and one
-- person can be in several. Visibility is therefore "me, plus anyone I share an
-- organisation with", which is what the assignee picker and the work-order header
-- need and nothing more.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select_self_or_colleague on public.profiles;
create policy profiles_select_self_or_colleague
  on public.profiles for select to authenticated
  using (id = public.auth_user_id() or public.shares_org_with(id));

-- The row is normally created by handle_new_user() (0007), which runs as definer and
-- needs no policy. This exists so a client can repair a missing profile for itself.
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (id = public.auth_user_id());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = public.auth_user_id())
  with check (id = public.auth_user_id());

-- No DELETE policy at all. Profiles are removed by cascade when the auth.users row is
-- deleted through GoTrue; letting a client delete one directly would orphan work-order
-- assignments and audit entries for no product reason.

-- -----------------------------------------------------------------------------
-- memberships
--
-- RECURSION: memberships_select_member calls is_org_member(), which itself selects
-- from memberships. That is safe only because is_org_member() is SECURITY DEFINER and
-- therefore reads the table as its owner, bypassing this very policy. Inlining that
-- EXISTS here instead would raise 42P17 "infinite recursion detected in policy for
-- relation memberships" on the first query. See the header of 0005.
-- -----------------------------------------------------------------------------
drop policy if exists memberships_select_member on public.memberships;
create policy memberships_select_member
  on public.memberships for select to authenticated
  using (public.is_org_member(org_id));

-- can('admin', 'member:invite') plus the owner guard from the matrix: an admin may not
-- create an owner. The second branch is the bootstrap — the founder of an
-- organisation that has no members yet makes themselves its owner, and only itself.
drop policy if exists memberships_insert_member on public.memberships;
create policy memberships_insert_member
  on public.memberships for insert to authenticated
  with check (
    (
      public.has_role_at_least(org_id, 'admin')
      and (role <> 'owner' or public.org_role(org_id) = 'owner')
    )
    or (
      not public.org_has_members(org_id)
      and user_id = public.auth_user_id()
      and role = 'owner'
    )
  );

-- can('admin', 'member:update_role') = ctx.targetRole !== 'owner'.
-- USING sees the row as it is (an admin cannot touch an owner's row); WITH CHECK sees
-- the row as it would become (an admin cannot promote anyone to owner). Both halves
-- are needed: either one alone leaves a way to end up with an owner you did not have
-- the authority to create.
drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin
  on public.memberships for update to authenticated
  using (
    public.has_role_at_least(org_id, 'admin')
    and (role <> 'owner' or public.org_role(org_id) = 'owner')
  )
  with check (
    public.has_role_at_least(org_id, 'admin')
    and (role <> 'owner' or public.org_role(org_id) = 'owner')
  );

-- can('admin', 'member:remove') = targetRole !== 'owner' && !isSelf. An admin removing
-- their own membership is how an organisation accidentally locks itself out, so it is
-- refused here and offered as an explicit "leave organisation" flow instead. An owner
-- is exempt from both qualifiers, exactly as in the matrix.
drop policy if exists memberships_delete_admin on public.memberships;
create policy memberships_delete_admin
  on public.memberships for delete to authenticated
  using (
    public.has_role_at_least(org_id, 'admin')
    and (
      public.org_role(org_id) = 'owner'
      or (role <> 'owner' and user_id <> public.auth_user_id())
    )
  );

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
drop policy if exists customers_select_member on public.customers;
create policy customers_select_member
  on public.customers for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists customers_insert_admin on public.customers;
create policy customers_insert_admin
  on public.customers for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists customers_update_admin on public.customers;
create policy customers_update_admin
  on public.customers for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists customers_delete_admin on public.customers;
create policy customers_delete_admin
  on public.customers for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------
drop policy if exists locations_select_member on public.locations;
create policy locations_select_member
  on public.locations for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists locations_insert_admin on public.locations;
create policy locations_insert_admin
  on public.locations for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists locations_update_admin on public.locations;
create policy locations_update_admin
  on public.locations for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists locations_delete_admin on public.locations;
create policy locations_delete_admin
  on public.locations for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- device_types
-- -----------------------------------------------------------------------------
drop policy if exists device_types_select_member on public.device_types;
create policy device_types_select_member
  on public.device_types for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists device_types_insert_admin on public.device_types;
create policy device_types_insert_admin
  on public.device_types for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists device_types_update_admin on public.device_types;
create policy device_types_update_admin
  on public.device_types for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists device_types_delete_admin on public.device_types;
create policy device_types_delete_admin
  on public.device_types for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- checklist_templates  (can(role, 'checklist:manage') is admin and above)
-- -----------------------------------------------------------------------------
drop policy if exists checklist_templates_select_member on public.checklist_templates;
create policy checklist_templates_select_member
  on public.checklist_templates for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists checklist_templates_insert_admin on public.checklist_templates;
create policy checklist_templates_insert_admin
  on public.checklist_templates for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists checklist_templates_update_admin on public.checklist_templates;
create policy checklist_templates_update_admin
  on public.checklist_templates for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists checklist_templates_delete_admin on public.checklist_templates;
create policy checklist_templates_delete_admin
  on public.checklist_templates for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- checklist_items
-- -----------------------------------------------------------------------------
drop policy if exists checklist_items_select_member on public.checklist_items;
create policy checklist_items_select_member
  on public.checklist_items for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists checklist_items_insert_admin on public.checklist_items;
create policy checklist_items_insert_admin
  on public.checklist_items for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists checklist_items_update_admin on public.checklist_items;
create policy checklist_items_update_admin
  on public.checklist_items for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists checklist_items_delete_admin on public.checklist_items;
create policy checklist_items_delete_admin
  on public.checklist_items for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- devices
-- -----------------------------------------------------------------------------
drop policy if exists devices_select_member on public.devices;
create policy devices_select_member
  on public.devices for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists devices_insert_admin on public.devices;
create policy devices_insert_admin
  on public.devices for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

-- The one place a technician writes outside their own jobs. can('technician',
-- 'device:update') is unconditionally true in the matrix: a technician records
-- findings — serial number corrections, notes, status — against the device in front of
-- them, which may not be the device on their next scheduled job.
drop policy if exists devices_update_admin_or_technician on public.devices;
create policy devices_update_admin_or_technician
  on public.devices for update to authenticated
  using (
    public.has_role_at_least(org_id, 'admin')
    or public.org_role(org_id) = 'technician'
  )
  with check (
    public.has_role_at_least(org_id, 'admin')
    or public.org_role(org_id) = 'technician'
  );

drop policy if exists devices_delete_admin on public.devices;
create policy devices_delete_admin
  on public.devices for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- work_orders
-- -----------------------------------------------------------------------------
drop policy if exists work_orders_select_member on public.work_orders;
create policy work_orders_select_member
  on public.work_orders for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists work_orders_insert_admin on public.work_orders;
create policy work_orders_insert_admin
  on public.work_orders for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

-- can('technician', 'work_order:update'|'start'|'complete') = ASSIGNEE_ONLY.
--
-- The WITH CHECK half is what makes 'work_order:assign' admin-only in practice: it is
-- evaluated against the *new* row, so a technician whose edit sets assigned_to to
-- anyone but themselves fails the check. They can work the job and close it; they
-- cannot hand it to someone else or take one that was not given to them.
drop policy if exists work_orders_update_admin_or_assignee on public.work_orders;
create policy work_orders_update_admin_or_assignee
  on public.work_orders for update to authenticated
  using (
    public.has_role_at_least(org_id, 'admin')
    or (
      public.org_role(org_id) = 'technician'
      and assigned_to = public.auth_user_id()
    )
  )
  with check (
    public.has_role_at_least(org_id, 'admin')
    or (
      public.org_role(org_id) = 'technician'
      and assigned_to = public.auth_user_id()
    )
  );

drop policy if exists work_orders_delete_admin on public.work_orders;
create policy work_orders_delete_admin
  on public.work_orders for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- work_order_checklist_results
--
-- is_org_member(org_id) is ANDed in so that a work order whose id leaked cannot be
-- answered from outside the tenant even if is_assigned_technician() somehow matched.
-- -----------------------------------------------------------------------------
drop policy if exists work_order_checklist_results_select_member
  on public.work_order_checklist_results;
create policy work_order_checklist_results_select_member
  on public.work_order_checklist_results for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists work_order_checklist_results_insert_admin_or_assignee
  on public.work_order_checklist_results;
create policy work_order_checklist_results_insert_admin_or_assignee
  on public.work_order_checklist_results for insert to authenticated
  with check (
    public.is_org_member(org_id)
    and (
      public.has_role_at_least(org_id, 'admin')
      or public.is_assigned_technician(work_order_id)
    )
  );

drop policy if exists work_order_checklist_results_update_admin_or_assignee
  on public.work_order_checklist_results;
create policy work_order_checklist_results_update_admin_or_assignee
  on public.work_order_checklist_results for update to authenticated
  using (
    public.is_org_member(org_id)
    and (
      public.has_role_at_least(org_id, 'admin')
      or public.is_assigned_technician(work_order_id)
    )
  )
  with check (
    public.is_org_member(org_id)
    and (
      public.has_role_at_least(org_id, 'admin')
      or public.is_assigned_technician(work_order_id)
    )
  );

-- DELETE is admin-only on purpose. A checklist run upserts against the
-- (work_order_id, item_id) unique key, so correcting an answer is an UPDATE;
-- a technician never needs to destroy evidence to fix a typo.
drop policy if exists work_order_checklist_results_delete_admin
  on public.work_order_checklist_results;
create policy work_order_checklist_results_delete_admin
  on public.work_order_checklist_results for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- bookings  (read for members; confirm/decline is admin and above)
--
-- Public submissions arrive through the service role, not through these policies.
-- -----------------------------------------------------------------------------
drop policy if exists bookings_select_member on public.bookings;
create policy bookings_select_member
  on public.bookings for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists bookings_insert_admin on public.bookings;
create policy bookings_insert_admin
  on public.bookings for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists bookings_update_admin on public.bookings;
create policy bookings_update_admin
  on public.bookings for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists bookings_delete_admin on public.bookings;
create policy bookings_delete_admin
  on public.bookings for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- issues  (read for members; triage/close is admin and above)
-- -----------------------------------------------------------------------------
drop policy if exists issues_select_member on public.issues;
create policy issues_select_member
  on public.issues for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists issues_insert_admin on public.issues;
create policy issues_insert_admin
  on public.issues for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists issues_update_admin on public.issues;
create policy issues_update_admin
  on public.issues for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists issues_delete_admin on public.issues;
create policy issues_delete_admin
  on public.issues for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- reminders
--
-- The dispatch job flips pending -> sent through the service role, which bypasses
-- RLS; these policies cover the reminder log UI only.
-- -----------------------------------------------------------------------------
drop policy if exists reminders_select_member on public.reminders;
create policy reminders_select_member
  on public.reminders for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists reminders_insert_admin on public.reminders;
create policy reminders_insert_admin
  on public.reminders for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists reminders_update_admin on public.reminders;
create policy reminders_update_admin
  on public.reminders for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists reminders_delete_admin on public.reminders;
create policy reminders_delete_admin
  on public.reminders for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- service_reports
--
-- can('technician', 'report:generate') = ASSIGNEE_ONLY, so a technician may create the
-- report for the job they just finished — and only that one.
-- -----------------------------------------------------------------------------
drop policy if exists service_reports_select_member on public.service_reports;
create policy service_reports_select_member
  on public.service_reports for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists service_reports_insert_admin_or_assignee on public.service_reports;
create policy service_reports_insert_admin_or_assignee
  on public.service_reports for insert to authenticated
  with check (
    public.is_org_member(org_id)
    and (
      public.has_role_at_least(org_id, 'admin')
      or public.is_assigned_technician(work_order_id)
    )
  );

-- A signed report is a record, not a draft: amending or withdrawing one is a
-- management decision.
drop policy if exists service_reports_update_admin on public.service_reports;
create policy service_reports_update_admin
  on public.service_reports for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists service_reports_delete_admin on public.service_reports;
create policy service_reports_delete_admin
  on public.service_reports for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- business_hours
-- -----------------------------------------------------------------------------
drop policy if exists business_hours_select_member on public.business_hours;
create policy business_hours_select_member
  on public.business_hours for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists business_hours_insert_admin on public.business_hours;
create policy business_hours_insert_admin
  on public.business_hours for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists business_hours_update_admin on public.business_hours;
create policy business_hours_update_admin
  on public.business_hours for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists business_hours_delete_admin on public.business_hours;
create policy business_hours_delete_admin
  on public.business_hours for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- blackout_dates
-- -----------------------------------------------------------------------------
drop policy if exists blackout_dates_select_member on public.blackout_dates;
create policy blackout_dates_select_member
  on public.blackout_dates for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists blackout_dates_insert_admin on public.blackout_dates;
create policy blackout_dates_insert_admin
  on public.blackout_dates for insert to authenticated
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists blackout_dates_update_admin on public.blackout_dates;
create policy blackout_dates_update_admin
  on public.blackout_dates for update to authenticated
  using (public.has_role_at_least(org_id, 'admin'))
  with check (public.has_role_at_least(org_id, 'admin'));

drop policy if exists blackout_dates_delete_admin on public.blackout_dates;
create policy blackout_dates_delete_admin
  on public.blackout_dates for delete to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- audit_log — readable by admins, writable by nobody
--
-- SELECT is restricted to admin and above rather than to all members: the meta column
-- carries before/after snapshots of every audited row, including work-order internal
-- notes, so it is a strictly higher privilege than reading the entities themselves.
--
-- There is no INSERT, UPDATE or DELETE policy. Rows arrive only through log_change()
-- (0007), which is SECURITY DEFINER and so is not subject to these policies. That is
-- what makes the log append-only in practice: no role reachable from the API can
-- write to it at all, forged entry or otherwise.
-- -----------------------------------------------------------------------------
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
  on public.audit_log for select to authenticated
  using (public.has_role_at_least(org_id, 'admin'));

-- -----------------------------------------------------------------------------
-- work_order_counters — readable by members, writable by nobody
--
-- Same shape as audit_log: the only writer is next_work_order_code() (0003), which is
-- SECURITY DEFINER. Without any write policy, a client cannot rewind a tenant's
-- numbering line and mint a duplicate work-order code.
-- -----------------------------------------------------------------------------
drop policy if exists work_order_counters_select_member on public.work_order_counters;
create policy work_order_counters_select_member
  on public.work_order_counters for select to authenticated
  using (public.is_org_member(org_id));

-- =============================================================================
-- Assertion: every table in `public` has row level security enabled.
--
-- RLS is turned on beside each CREATE TABLE, which means a table added later by
-- someone who forgot would be wide open to every authenticated user and nothing would
-- complain. This turns that omission into a failed migration.
-- =============================================================================
do $$
declare
  v_unprotected text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_unprotected
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  if v_unprotected is not null then
    raise exception
      'Row level security is not enabled on public table(s): %. Add `alter table ... enable row level security` next to the CREATE TABLE.',
      v_unprotected;
  end if;
end
$$;
