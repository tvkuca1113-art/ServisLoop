-- =============================================================================
-- 0003_operations_tables.sql — scheduling, intake, output and audit
--
-- work_orders <-> bookings and work_orders <-> issues are mutually referencing: a
-- booking that has been confirmed points at the job it produced, and the job points
-- back at the booking that caused it. That cycle cannot be expressed in a single
-- pass, so work_orders is created with the two source columns as bare uuids and the
-- foreign keys are attached after bookings and issues exist, at the bottom of this
-- file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- work_orders
-- -----------------------------------------------------------------------------
create table if not exists public.work_orders (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  -- WO-YYYY-NNNN, allocated by next_work_order_code() below.
  code                  text not null,
  -- Devices are retired (status = 'retired'), not deleted, precisely so that job
  -- history survives. Cascade is here for the one case where deletion is intended —
  -- removing an entire organisation — so that it is a single statement rather than a
  -- hand-ordered teardown script.
  device_id             uuid not null references public.devices (id) on delete cascade,
  -- location_id and customer_id are denormalised from the device. They are carried on
  -- the row because a job's paperwork must record where the work was done and who was
  -- billed *at the time*, which survives a later device move.
  location_id           uuid not null references public.locations (id) on delete cascade,
  customer_id           uuid not null references public.customers (id) on delete cascade,
  kind                  public.work_order_kind not null,
  status                public.work_order_status not null default 'draft',
  priority              public.priority not null default 'normal',
  -- Scheduled start instant. Unlike service dates (which are civil dates), an
  -- appointment is a real point in time and is stored as timestamptz.
  scheduled_for         timestamptz,
  -- Planned duration in minutes, not a minute-of-day.
  scheduled_minutes     int,
  -- set null: a technician leaving the company must never delete their job history.
  assigned_to           uuid references public.profiles (id) on delete set null,
  checklist_template_id uuid references public.checklist_templates (id) on delete set null,
  -- Foreign keys attached at the bottom of this file (see header).
  source_booking_id     uuid,
  source_issue_id       uuid,
  summary               text,
  internal_notes        text,
  opened_at             timestamptz not null default now(),
  started_at            timestamptz,
  completed_at          timestamptz,
  -- The civil date the work was performed. This, not completed_at, drives the
  -- next-due calculation — see PLAN.md R5 on timezone drift.
  completed_on          date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint work_orders_code_key unique (org_id, code),
  constraint work_orders_scheduled_minutes_range
    check (scheduled_minutes is null or scheduled_minutes between 15 and 1440),
  -- Mirrors requirementsFor('completed') in src/domain/work-order.ts. A completed job
  -- with no completion date would produce a service report that cannot state when the
  -- work happened, and would leave the next due date uncomputable.
  constraint work_orders_completed_needs_dates
    check (status <> 'completed' or (completed_on is not null and completed_at is not null)),
  constraint work_orders_scheduled_needs_slot
    check (status <> 'scheduled' or scheduled_for is not null)
);

alter table public.work_orders enable row level security;

comment on column public.work_orders.completed_on is
  'Civil date the work was carried out. Input to computeNextServiceDue(); see 0007.';

-- -----------------------------------------------------------------------------
-- bookings — customer-requested appointments from the public QR page
-- -----------------------------------------------------------------------------
create table if not exists public.bookings (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations (id) on delete cascade,
  device_id              uuid not null references public.devices (id) on delete cascade,
  requested_date         date not null,
  requested_start_minute int not null,
  requested_end_minute   int not null,
  status                 public.booking_status not null default 'pending',
  contact_name           text not null,
  contact_email          text,
  contact_phone          text,
  note                   text,
  -- set null: cancelling the job must not erase the customer's request.
  work_order_id          uuid references public.work_orders (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint bookings_contact_name_not_blank check (btrim(contact_name) <> ''),
  -- Minute-of-day, 0..1440 inclusive: 1440 is midnight at the end of the day, which a
  -- half-open [start, end) interval needs in order to express "until close of day".
  constraint bookings_start_minute_range check (requested_start_minute between 0 and 1440),
  constraint bookings_end_minute_range check (requested_end_minute between 0 and 1440),
  constraint bookings_interval_ordered check (requested_end_minute > requested_start_minute)
  -- Deliberately no "must have email or phone" constraint: staff record walk-in
  -- requests with a name only, and the public form's contact requirements are a
  -- product decision that belongs in the Zod schema, not in a migration.
);

alter table public.bookings enable row level security;

-- -----------------------------------------------------------------------------
-- issues — customer-reported faults from the public QR page
-- -----------------------------------------------------------------------------
create table if not exists public.issues (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  device_id      uuid not null references public.devices (id) on delete cascade,
  severity       public.issue_severity not null default 'normal',
  title          text not null,
  description    text,
  reporter_name  text,
  reporter_email text,
  reporter_phone text,
  status         public.issue_status not null default 'open',
  work_order_id  uuid references public.work_orders (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint issues_title_not_blank check (btrim(title) <> ''),
  -- 'converted' means "a job exists for this"; without the link the triage queue
  -- would show a dead end.
  constraint issues_converted_needs_work_order
    check (status <> 'converted' or work_order_id is not null)
);

alter table public.issues enable row level security;

-- -----------------------------------------------------------------------------
-- Close the work_orders <-> bookings/issues cycle.
--
-- `alter table ... add constraint` has no IF NOT EXISTS form, so each is wrapped in a
-- block that swallows only duplicate_object. Any other error still aborts the
-- migration.
-- -----------------------------------------------------------------------------
do $$
begin
  alter table public.work_orders
    add constraint work_orders_source_booking_id_fkey
    foreign key (source_booking_id) references public.bookings (id) on delete set null;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.work_orders
    add constraint work_orders_source_issue_id_fkey
    foreign key (source_issue_id) references public.issues (id) on delete set null;
exception
  when duplicate_object then null;
end
$$;

-- The kind of a job and its provenance must agree, otherwise the dashboard's
-- "where does our work come from" breakdown lies.
do $$
begin
  alter table public.work_orders
    add constraint work_orders_source_matches_kind
    check (
      (kind <> 'booking' or source_issue_id is null)
      and (kind <> 'issue' or source_booking_id is null)
      and (kind <> 'scheduled' or (source_booking_id is null and source_issue_id is null))
    );
exception
  when duplicate_object then null;
end
$$;

-- -----------------------------------------------------------------------------
-- work_order_checklist_results
--
-- The snapshot columns are the record of truth. `item_id` is kept for grouping and
-- for re-running a template, but the FK is DEFERRABLE INITIALLY DEFERRED and NO
-- ACTION on purpose:
--
--   * ON DELETE CASCADE would let a template edit delete the evidence behind a signed
--     report (PLAN.md R10).
--   * ON DELETE RESTRICT is checked immediately, so it would also block deleting an
--     entire organisation — the cascade removes checklist_items and the results in one
--     statement, and RESTRICT cannot see that the referencing rows are on their way out.
--
-- Deferring the check to COMMIT gives both properties: deleting an org succeeds,
-- deleting a single answered checklist item fails.
-- -----------------------------------------------------------------------------
create table if not exists public.work_order_checklist_results (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  work_order_id  uuid not null references public.work_orders (id) on delete cascade,
  item_id        uuid not null references public.checklist_items (id)
                   on delete no action deferrable initially deferred,
  label_snapshot text not null,
  kind_snapshot  public.checklist_item_kind not null,
  position       int not null,
  value_bool     boolean,
  value_num      numeric,
  value_text     text,
  passed         boolean not null default false,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint work_order_checklist_results_label_not_blank check (btrim(label_snapshot) <> ''),
  constraint work_order_checklist_results_position_non_negative check (position >= 0),
  -- One answer per item per job. This is also the conflict target the checklist run
  -- upserts against, which is why technicians never need DELETE on this table.
  constraint work_order_checklist_results_item_key unique (work_order_id, item_id)
);

alter table public.work_order_checklist_results enable row level security;

-- -----------------------------------------------------------------------------
-- reminders
-- -----------------------------------------------------------------------------
create table if not exists public.reminders (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  device_id     uuid not null references public.devices (id) on delete cascade,
  -- The due date this reminder is chasing. Part of the idempotency key, so moving a
  -- due date produces a new ladder rather than mutating the old one.
  due_date      date not null,
  stage         public.reminder_stage not null,
  -- Civil date the message should go out: due_date + STAGE_OFFSETS[stage].
  scheduled_for date not null,
  status        public.reminder_status not null default 'pending',
  sent_at       timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- THE idempotency guarantee (PLAN.md R6). The dispatch job may run twice a day, be
  -- retried by the cron provider, or overlap with itself; the insert simply conflicts
  -- and no customer is mailed twice. Mirrored in TypeScript by reminderKey().
  constraint reminders_device_due_stage_key unique (device_id, due_date, stage),
  constraint reminders_sent_needs_timestamp
    check (status <> 'sent' or sent_at is not null)
);

alter table public.reminders enable row level security;

-- -----------------------------------------------------------------------------
-- service_reports — metadata for a rendered PDF
--
-- The PDF itself is regenerated deterministically from the work order and its
-- checklist results, so only the identity of the document is stored here.
-- -----------------------------------------------------------------------------
create table if not exists public.service_reports (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  work_order_id  uuid not null references public.work_orders (id) on delete cascade,
  -- SR-YYYY-NNNN; shares the work order's sequence (formatReportNumber()).
  number         text not null,
  generated_at   timestamptz not null default now(),
  signed_by_name text,
  total_minutes  int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint service_reports_number_key unique (org_id, number),
  constraint service_reports_total_minutes_range
    check (total_minutes is null or total_minutes between 0 and 10080)
);

alter table public.service_reports enable row level security;

-- -----------------------------------------------------------------------------
-- business_hours — one row per weekday, per organisation
-- -----------------------------------------------------------------------------
create table if not exists public.business_hours (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  -- 0 = Sunday … 6 = Saturday, matching JavaScript's Date#getDay() and weekdayOf().
  weekday      int not null,
  is_open      boolean not null default true,
  open_minute  int not null default 480,
  close_minute int not null default 1020,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint business_hours_org_weekday_key unique (org_id, weekday),
  constraint business_hours_weekday_range check (weekday between 0 and 6),
  constraint business_hours_open_minute_range check (open_minute between 0 and 1440),
  constraint business_hours_close_minute_range check (close_minute between 0 and 1440),
  -- Strictly greater: a zero-length window would generate zero slots while still
  -- reading as "open" in the UI.
  constraint business_hours_window_ordered check (close_minute > open_minute)
);

alter table public.business_hours enable row level security;

-- -----------------------------------------------------------------------------
-- blackout_dates — public holidays, shutdowns, anything that closes the calendar
-- -----------------------------------------------------------------------------
create table if not exists public.blackout_dates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  date       date not null,
  reason     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint blackout_dates_org_date_key unique (org_id, date)
);

alter table public.blackout_dates enable row level security;

-- -----------------------------------------------------------------------------
-- audit_log — append-only
--
-- No updated_at column: an audit row that can be updated is not an audit row. Written
-- by the log_change() trigger in 0007, which is SECURITY DEFINER and therefore needs
-- no INSERT policy.
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  -- set null: the log outlives the account that made the change.
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  meta       jsonb,
  created_at timestamptz not null default now(),

  constraint audit_log_action_not_blank check (btrim(action) <> ''),
  constraint audit_log_entity_not_blank check (btrim(entity) <> '')
);

alter table public.audit_log enable row level security;

-- -----------------------------------------------------------------------------
-- work_order_counters + next_work_order_code()
--
-- Per organisation, per year. A plain sequence would not do: sequences are global,
-- non-transactional and cannot be partitioned by tenant, so two organisations would
-- share one numbering line and every rollback would punch a visible hole in a
-- customer-facing document number.
-- -----------------------------------------------------------------------------
create table if not exists public.work_order_counters (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  year       int not null,
  last_value int not null default 0,
  updated_at timestamptz not null default now(),

  constraint work_order_counters_pkey primary key (org_id, year),
  constraint work_order_counters_year_range check (year between 2000 and 9999),
  constraint work_order_counters_last_value_non_negative check (last_value >= 0)
);

alter table public.work_order_counters enable row level security;

-- Allocate the next code for an organisation and year.
--
-- Race-safety comes from `insert ... on conflict do update`: the conflicting insert
-- blocks on the existing row's lock, then re-reads and increments it inside the same
-- statement. Two concurrent callers therefore serialise, and neither can observe a
-- stale last_value. A read-then-write pair would need SERIALIZABLE or an explicit
-- advisory lock to achieve the same thing.
--
-- SECURITY DEFINER so it can touch the counter table without granting tenants write
-- access to it (work_order_counters has no write policy at all).
create or replace function public.next_work_order_code(p_org_id uuid, p_year int)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_next int;
begin
  if p_year is null or p_year < 2000 or p_year > 9999 then
    raise exception 'next_work_order_code: year must be 2000..9999, got %', p_year
      using errcode = '22003';
  end if;

  -- A SECURITY DEFINER function is a hole through RLS, so it re-checks tenancy
  -- itself. auth.uid() is null for the service role (public booking/issue endpoints,
  -- the reminder cron) and during migrations; those callers are already trusted and
  -- are exempt rather than blocked.
  if auth.uid() is not null and not exists (
    select 1
      from public.memberships m
     where m.org_id = p_org_id
       and m.user_id = auth.uid()
  ) then
    raise exception 'next_work_order_code: caller is not a member of organisation %', p_org_id
      using errcode = '42501';
  end if;

  insert into public.work_order_counters as c (org_id, year, last_value)
  values (p_org_id, p_year, 1)
  on conflict (org_id, year) do update
    set last_value = c.last_value + 1
  returning c.last_value into v_next;

  -- Must stay byte-identical to formatWorkOrderCode() in src/domain/work-order.ts.
  --
  -- The CASE is not decoration: lpad() *truncates* when its input is longer than the
  -- target width, so lpad('10000', 4, '0') is '1000' — the same string as sequence
  -- 1000. An organisation crossing 9999 jobs in a year would start minting duplicate
  -- codes and hitting work_orders_code_key. JavaScript's padStart() never truncates,
  -- and parseWorkOrderCode() already accepts \d{4,}, so widening past four digits is
  -- the correct behaviour on both sides.
  --
  -- p_year needs no padding: the range check above guarantees four digits.
  return 'WO-' || p_year::text || '-' ||
         case
           when v_next < 10000 then lpad(v_next::text, 4, '0')
           else v_next::text
         end;
end;
$fn$;

revoke all on function public.next_work_order_code(uuid, int) from public;
grant execute on function public.next_work_order_code(uuid, int) to authenticated, service_role;
