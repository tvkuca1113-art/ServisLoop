-- =============================================================================
-- 0007_triggers.sql — the small amount of behaviour that belongs in the database
--
-- The rule this file follows: a trigger may maintain *bookkeeping* (timestamps, audit
-- rows, mirroring a fact that has already been decided). It may not make a *business
-- decision*. Business decisions live in src/domain/**, are pure, and are unit-tested;
-- duplicating one here would create a second implementation that drifts silently and
-- can only be observed by running a database.
--
-- The clearest case is the next service due date — see sync_device_last_service().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- set_updated_at() — keep updated_at honest
--
-- Done in the database rather than in the repository adapters because there are two
-- adapters and several server actions, and "the row was touched at" must be true even
-- for an UPDATE issued from psql during an incident.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- Attached by discovery rather than by a hand-maintained list: every base table in
-- `public` that has an updated_at column gets the trigger, so a table added in a later
-- migration is covered the moment this file is replayed, and a table without the
-- column is skipped instead of erroring.
do $$
declare
  r record;
begin
  for r in
    select t.table_name
      from information_schema.tables t
      join information_schema.columns c
        on c.table_schema = t.table_schema
       and c.table_name = t.table_name
     where t.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.column_name = 'updated_at'
     order by t.table_name
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', r.table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()',
      r.table_name
    );
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- handle_new_user() — mirror a new auth.users row into public.profiles
--
-- auth.users belongs to GoTrue and is not exposed through PostgREST, so without this
-- the application would have no name to put on a work order and no way to populate an
-- assignee picker.
--
-- SECURITY DEFINER because the insert happens inside GoTrue's own transaction, as a
-- role that has no rights on public.profiles.
--
-- ON CONFLICT DO NOTHING because this must never raise: an exception in an AFTER
-- INSERT trigger on auth.users aborts the sign-up itself, turning a duplicate profile
-- row into "account creation is broken".
--
-- Creating a trigger on auth.users requires the migration to run as `postgres`, which
-- is what the Supabase CLI and the dashboard's SQL editor do.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    -- profiles.email is NOT NULL, but a phone-only signup has no email address.
    coalesce(new.email, ''),
    nullif(
      btrim(coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      )),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- sync_device_last_service() — completion writes back the service date
--
-- WHAT THIS DOES: copies the completion date onto the device. That is bookkeeping —
-- the date was already decided by the technician and validated by checkTransition().
--
-- WHAT THIS DELIBERATELY DOES NOT DO: recompute devices.next_service_due.
--
-- The next due date is not "last service + interval". It depends on the effective
-- interval (device override -> device type default -> 365), on the anchor
-- ('completion' lets the cadence drift, 'schedule' rolls the original due date forward
-- in whole intervals until it clears the completion date), and on the org's default
-- anchor when the device does not state one. That logic is computeNextServiceDue() in
-- src/domain/service-interval.ts: pure, exhaustively unit-tested, and the declared
-- single source of truth for the column.
--
-- Re-implementing it in PL/pgSQL would give the product two implementations of its
-- most important rule. They would agree on the day they were written and disagree
-- some months later, and the disagreement would surface as a compliance failure in a
-- signed report rather than as a test failure. So the application computes the value
-- and writes devices.next_service_due explicitly, in the same transaction as the
-- completion, and this trigger leaves that column alone.
-- -----------------------------------------------------------------------------
create or replace function public.sync_device_last_service()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_was_completed boolean := false;
begin
  -- OLD is unassigned on INSERT, so it is only read inside a TG_OP guard rather than
  -- as one half of a boolean expression.
  if tg_op = 'UPDATE' then
    v_was_completed := (old.status = 'completed');
  end if;

  if new.status = 'completed'
     and not v_was_completed
     and new.completed_on is not null
  then
    update public.devices d
       set last_service_at = new.completed_on
     where d.id = new.device_id
       -- Never move the date backwards. Back-dated paperwork for an old job must not
       -- overwrite a more recent service that has already been recorded.
       and (d.last_service_at is null or d.last_service_at < new.completed_on);
  end if;

  -- AFTER trigger: the return value is ignored.
  return null;
end;
$fn$;

drop trigger if exists sync_device_last_service on public.work_orders;
create trigger sync_device_last_service
  after insert or update on public.work_orders
  for each row execute function public.sync_device_last_service();

-- -----------------------------------------------------------------------------
-- log_change() — append-only audit for the three tables that matter
--
-- devices, work_orders and memberships: what is in the field, what was done to it,
-- and who was allowed to do it. Everything else is reconstructable from those three.
--
-- SECURITY DEFINER so that audit_log needs no INSERT policy — see 0006. auth.uid() is
-- recorded as the actor and is NULL for service-role writes (the public booking and
-- issue endpoints, the reminder cron), which is itself the useful signal.
-- -----------------------------------------------------------------------------
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_org_id    uuid;
  v_entity_id uuid;
  v_meta      jsonb;
begin
  if tg_op = 'DELETE' then
    v_org_id    := old.org_id;
    v_entity_id := old.id;
    v_meta      := jsonb_build_object('before', to_jsonb(old));
  elsif tg_op = 'UPDATE' then
    v_org_id    := new.org_id;
    v_entity_id := new.id;
    v_meta      := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
  else
    v_org_id    := new.org_id;
    v_entity_id := new.id;
    v_meta      := jsonb_build_object('after', to_jsonb(new));
  end if;

  -- Deleting an organisation cascades into these tables, and the parent row is gone by
  -- the time the cascade fires. Writing an audit row here would violate
  -- audit_log_org_id_fkey and abort the whole delete. Nobody wants an audit trail for
  -- an organisation that no longer exists anyway, so the row is skipped.
  if not exists (select 1 from public.organizations o where o.id = v_org_id) then
    return null;
  end if;

  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, meta)
  values (
    v_org_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name::text,
    v_entity_id,
    v_meta
  );

  return null;
end;
$fn$;

drop trigger if exists log_change on public.devices;
create trigger log_change
  after insert or update or delete on public.devices
  for each row execute function public.log_change();

drop trigger if exists log_change on public.work_orders;
create trigger log_change
  after insert or update or delete on public.work_orders
  for each row execute function public.log_change();

drop trigger if exists log_change on public.memberships;
create trigger log_change
  after insert or update or delete on public.memberships
  for each row execute function public.log_change();

-- -----------------------------------------------------------------------------
-- Privileges on the trigger functions.
--
-- Nothing calls these directly; they are only reachable through the triggers above,
-- which run regardless of the caller's EXECUTE rights. Revoking removes a
-- SECURITY DEFINER function from the API's reach for no cost.
-- -----------------------------------------------------------------------------
revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.sync_device_last_service() from public;
revoke all on function public.log_change() from public;
