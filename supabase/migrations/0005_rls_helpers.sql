-- =============================================================================
-- 0005_rls_helpers.sql — the functions every policy in 0006 is built from
--
-- WHY THESE ARE ALL `SECURITY DEFINER`
-- ------------------------------------
-- A policy on `memberships` that answers "is the caller a member of this org?" by
-- selecting from `memberships` would re-enter the same policy to evaluate that
-- select, and PostgreSQL raises `infinite recursion detected in policy for relation
-- "memberships"` (42P17). It is not a hypothetical: it is the single most common way
-- a Supabase schema breaks in production, and it breaks *at query time*, not at
-- migration time.
--
-- The standard fix, used here, is to move the lookup into a SECURITY DEFINER
-- function. Such a function executes as its owner — `postgres`, which owns these
-- tables — and a table owner is exempt from that table's row level security. The
-- function's internal SELECT therefore reads memberships directly, no policy is
-- evaluated, and the recursion cannot start. The function returns a plain boolean, so
-- nothing about other tenants' rows leaks out of it.
--
-- Two consequences that must not be undone by a later migration:
--
--   * Do NOT run `alter table public.memberships force row level security`. FORCE
--     removes the owner's exemption and the recursion comes straight back.
--   * These functions must keep their owner. If a migration recreates them while
--     connected as a different role, that role becomes the definer and inherits its
--     visibility instead.
--
-- `set search_path = public, pg_temp` is mandatory on every SECURITY DEFINER
-- function: without it a caller can prepend a schema of their own to search_path and
-- have the function resolve `memberships` to a table they control. `auth.uid()` is
-- always written schema-qualified for the same reason.
--
-- All are marked STABLE (not VOLATILE): they read only within the statement, which
-- lets the planner evaluate them once per query rather than once per row. On a policy
-- applied to a large table that is the difference between an index scan and a
-- disaster.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- auth_user_id() — the calling user, or NULL
--
-- NULL means "not a logged-in end user": the service role (public QR/booking/issue
-- endpoints, the reminder cron) and migrations both present as NULL here. Every
-- policy below is written so that NULL grants nothing — the service role bypasses RLS
-- outright and never relies on a policy evaluating in its favour.
-- -----------------------------------------------------------------------------
create or replace function public.auth_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select auth.uid();
$fn$;

-- -----------------------------------------------------------------------------
-- role_rank() — the ordering viewer < technician < admin < owner
--
-- Mirrors ROLE_RANK in src/domain/types.ts. Kept as a separate IMMUTABLE function so
-- the ordering is written down exactly once; has_role_at_least() below is then a
-- two-line comparison instead of a nested CASE that has to be re-read every time
-- someone audits the policies. NULL in (no membership) means NULL out, which
-- comparisons treat as "not permitted".
-- -----------------------------------------------------------------------------
create or replace function public.role_rank(p_role public.user_role)
returns int
language sql
immutable
as $fn$
  select case p_role
           when 'viewer'     then 0
           when 'technician' then 1
           when 'admin'      then 2
           when 'owner'      then 3
         end;
$fn$;

-- -----------------------------------------------------------------------------
-- is_org_member() — the tenancy boundary
--
-- This is the predicate behind every SELECT policy in the product.
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.memberships m
     where m.org_id = p_org_id
       and m.user_id = auth.uid()
  );
$fn$;

-- -----------------------------------------------------------------------------
-- org_role() — the caller's role in one organisation, or NULL if not a member
-- -----------------------------------------------------------------------------
create or replace function public.org_role(p_org_id uuid)
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select m.role
    from public.memberships m
   where m.org_id = p_org_id
     and m.user_id = auth.uid()
   limit 1;
$fn$;

-- -----------------------------------------------------------------------------
-- has_role_at_least() — "admin or better", the write predicate
--
-- COALESCE to false so a non-member (NULL role, NULL rank, NULL comparison) is denied
-- rather than producing a NULL that a policy would also treat as denial but that is
-- far harder to reason about when composed with OR.
-- -----------------------------------------------------------------------------
create or replace function public.has_role_at_least(p_org_id uuid, p_min public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    public.role_rank(public.org_role(p_org_id)) >= public.role_rank(p_min),
    false
  );
$fn$;

-- -----------------------------------------------------------------------------
-- is_assigned_technician() — the one context-sensitive rule
--
-- Mirrors ASSIGNEE_ONLY in src/domain/permissions.ts: a technician may act on the
-- jobs assigned to them and no others.
--
-- This asks only "is the caller the assignee of that job". It deliberately does not
-- re-check organisation membership, because every policy that uses it is ANDed with
-- is_org_member(org_id) on the row being written — checking twice in two places
-- invites the two checks to drift apart.
--
-- SECURITY DEFINER here does double duty: it also lets the checklist-results policy
-- reach into work_orders without the caller needing to satisfy the work_orders SELECT
-- policy first.
-- -----------------------------------------------------------------------------
create or replace function public.is_assigned_technician(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.work_orders w
     where w.id = p_work_order_id
       and w.assigned_to = auth.uid()
  );
$fn$;

-- -----------------------------------------------------------------------------
-- org_has_members() — is this organisation still unclaimed?
--
-- Exists solely to break the chicken-and-egg in organisation creation: the first
-- membership row cannot be authorised by an existing membership, because there is
-- none. The memberships INSERT policy in 0006 uses this to allow exactly one
-- bootstrap row — the creator making themselves owner of an organisation that has no
-- members yet — and nothing else.
--
-- Must be a function for the usual reason: an inline `not exists (select 1 from
-- memberships ...)` written into the memberships policy would recurse.
-- -----------------------------------------------------------------------------
create or replace function public.org_has_members(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.memberships m
     where m.org_id = p_org_id
  );
$fn$;

-- -----------------------------------------------------------------------------
-- shares_org_with() — do the caller and this person overlap in any organisation?
--
-- Only used by the profiles SELECT policy, so that an assignee dropdown can show
-- colleagues' names. Written as a helper for the same anti-recursion reason as the
-- rest: a policy on `profiles` that joined `memberships` inline would evaluate the
-- memberships policies, which call these helpers, which would then be reached through
-- a policy chain instead of directly.
-- -----------------------------------------------------------------------------
create or replace function public.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.memberships mine
      join public.memberships theirs on theirs.org_id = mine.org_id
     where mine.user_id = auth.uid()
       and theirs.user_id = p_user_id
  );
$fn$;

-- -----------------------------------------------------------------------------
-- Privileges
--
-- EXECUTE is revoked from PUBLIC and granted explicitly. `anon` is not on the list:
-- it has no policies anywhere (see 0006), so it has no reason to evaluate one, and a
-- SECURITY DEFINER function is exactly the kind of object an unauthenticated role
-- should not be able to probe.
-- -----------------------------------------------------------------------------
revoke all on function public.auth_user_id() from public;
revoke all on function public.role_rank(public.user_role) from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.org_role(uuid) from public;
revoke all on function public.has_role_at_least(uuid, public.user_role) from public;
revoke all on function public.is_assigned_technician(uuid) from public;
revoke all on function public.org_has_members(uuid) from public;
revoke all on function public.shares_org_with(uuid) from public;

grant execute on function public.auth_user_id() to authenticated, service_role;
grant execute on function public.role_rank(public.user_role) to authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.org_role(uuid) to authenticated, service_role;
grant execute on function public.has_role_at_least(uuid, public.user_role) to authenticated, service_role;
grant execute on function public.is_assigned_technician(uuid) to authenticated, service_role;
grant execute on function public.org_has_members(uuid) to authenticated, service_role;
grant execute on function public.shares_org_with(uuid) to authenticated, service_role;
