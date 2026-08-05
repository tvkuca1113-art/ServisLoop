-- =============================================================================
-- 0002_core_tables.sql — enumerated types + the tenant/directory tables
--
-- Every enum below mirrors a frozen tuple in `src/domain/types.ts` label-for-label.
-- If you add a value here, add it there in the same commit: the TypeScript union is
-- what the repository adapters cast Postgres rows into, and a value that exists in
-- only one of the two places surfaces as an unreachable UI state rather than an error.
--
-- Table order in this file is dependency order — nothing references a table that
-- appears further down.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enumerated types
--
-- One DO block rather than twelve, guarded with to_regtype() so a replay is a
-- no-op. `create type ... if not exists` does not exist in PostgreSQL, and
-- swallowing duplicate_object exceptions would also swallow a genuine typo.
-- -----------------------------------------------------------------------------
do $$
begin
  -- src/domain/types.ts → ROLES
  if to_regtype('public.user_role') is null then
    create type public.user_role as enum ('owner', 'admin', 'technician', 'viewer');
  end if;

  -- DEVICE_STATUSES
  if to_regtype('public.device_status') is null then
    create type public.device_status as enum ('active', 'paused', 'retired');
  end if;

  -- WORK_ORDER_STATUSES
  if to_regtype('public.work_order_status') is null then
    create type public.work_order_status as enum
      ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled');
  end if;

  -- WORK_ORDER_KINDS — every job traces back to what created it.
  if to_regtype('public.work_order_kind') is null then
    create type public.work_order_kind as enum ('scheduled', 'issue', 'booking');
  end if;

  -- PRIORITIES
  if to_regtype('public.priority') is null then
    create type public.priority as enum ('low', 'normal', 'high', 'urgent');
  end if;

  -- BOOKING_STATUSES
  if to_regtype('public.booking_status') is null then
    create type public.booking_status as enum
      ('pending', 'confirmed', 'declined', 'cancelled');
  end if;

  -- ISSUE_STATUSES
  if to_regtype('public.issue_status') is null then
    create type public.issue_status as enum ('open', 'triaged', 'converted', 'closed');
  end if;

  -- ISSUE_SEVERITIES
  if to_regtype('public.issue_severity') is null then
    create type public.issue_severity as enum ('low', 'normal', 'high', 'critical');
  end if;

  -- REMINDER_STATUSES
  if to_regtype('public.reminder_status') is null then
    create type public.reminder_status as enum ('pending', 'sent', 'skipped', 'failed');
  end if;

  -- REMINDER_STAGES — the ladder is fixed; STAGE_OFFSETS in src/domain/reminders.ts
  -- maps each label to its day offset from the due date.
  if to_regtype('public.reminder_stage') is null then
    create type public.reminder_stage as enum ('T_30', 'T_7', 'T_0', 'OVERDUE');
  end if;

  -- CHECKLIST_ITEM_KINDS
  if to_regtype('public.checklist_item_kind') is null then
    create type public.checklist_item_kind as enum ('boolean', 'number', 'text', 'select');
  end if;

  -- INTERVAL_ANCHORS — 'completion' lets the cadence drift with reality,
  -- 'schedule' keeps a regulated inspection on its anniversary.
  if to_regtype('public.interval_anchor') is null then
    create type public.interval_anchor as enum ('completion', 'schedule');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- organizations — the tenant root
-- -----------------------------------------------------------------------------
create table if not exists public.organizations (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text not null,
  timezone                 text not null default 'UTC',
  -- Window before the due date in which a device reads as "due soon".
  reminder_lead_days       int not null default 30,
  default_interval_anchor  public.interval_anchor not null default 'completion',
  slot_minutes             int not null default 120,
  booking_lead_hours       int not null default 24,
  booking_horizon_days     int not null default 60,
  is_demo                  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint organizations_slug_key unique (slug),
  constraint organizations_name_not_blank check (btrim(name) <> ''),
  -- Slugs appear in URLs, so they are constrained at the database rather than
  -- trusted from the form layer.
  constraint organizations_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 63),
  constraint organizations_timezone_not_blank check (btrim(timezone) <> ''),
  constraint organizations_reminder_lead_days_range
    check (reminder_lead_days between 0 and 365),
  -- A bookable slot shorter than a quarter hour or longer than a working day is a
  -- data-entry mistake, not a business model.
  constraint organizations_slot_minutes_range check (slot_minutes between 15 and 480),
  constraint organizations_booking_lead_hours_range
    check (booking_lead_hours between 0 and 8760),
  constraint organizations_booking_horizon_days_range
    check (booking_horizon_days between 1 and 365)
);

-- RLS is switched on at creation time, not in 0006. A table with RLS enabled and no
-- policy denies everything, so the schema is closed by default even if a later
-- migration in the same deploy fails halfway.
alter table public.organizations enable row level security;

-- -----------------------------------------------------------------------------
-- profiles — application-visible mirror of auth.users
--
-- auth.users is owned by GoTrue and is not readable through PostgREST. Everything the
-- UI needs about a person (name on a work order, assignee picker) lives here, and the
-- row is created by the handle_new_user() trigger in 0007.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- -----------------------------------------------------------------------------
-- memberships — the multi-tenancy join, and the sole source of authority
--
-- Every RLS policy in 0006 resolves, directly or through a helper, to "is there a row
-- here for (this org, auth.uid())".
-- -----------------------------------------------------------------------------
create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  -- Cascade from profiles (and therefore from auth.users): deleting an account
  -- removes its access everywhere. Work-order assignment uses `on delete set null`
  -- instead, so a departing technician never deletes job history.
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint memberships_org_user_key unique (org_id, user_id)
);

alter table public.memberships enable row level security;

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null,
  contact_name text,
  email        text,
  phone        text,
  -- Key from the customer's own ERP/CRM. Carried through the CSV/XLSX importer so a
  -- re-import updates rather than duplicates.
  external_ref text,
  notes        text,
  -- Customers are archived, never deleted, so historical work orders keep their name.
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint customers_name_not_blank check (btrim(name) <> '')
  -- Uniqueness of external_ref is a *partial* unique index in 0004: importers
  -- routinely write '' rather than NULL for a missing key, and a plain unique
  -- constraint would reject the second such row.
);

alter table public.customers enable row level security;

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------
create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  name         text not null,
  address_line text,
  city         text,
  postal_code  text,
  country      text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint locations_name_not_blank check (btrim(name) <> '')
);

alter table public.locations enable row level security;

-- -----------------------------------------------------------------------------
-- checklist_templates
--
-- Templates are versioned and never mutated in place (PLAN.md R10). Editing a live
-- template creates a new version; the old one is archived so signed reports keep
-- pointing at exactly the item set that was used.
-- -----------------------------------------------------------------------------
create table if not exists public.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  version     int not null default 1,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint checklist_templates_name_not_blank check (btrim(name) <> ''),
  constraint checklist_templates_version_positive check (version >= 1),
  constraint checklist_templates_name_version_key unique (org_id, name, version)
);

alter table public.checklist_templates enable row level security;

-- -----------------------------------------------------------------------------
-- checklist_items
-- -----------------------------------------------------------------------------
create table if not exists public.checklist_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  template_id      uuid not null references public.checklist_templates (id) on delete cascade,
  position         int not null,
  label            text not null,
  kind             public.checklist_item_kind not null,
  required         boolean not null default true,
  -- Only meaningful for `select` items; enforced by checklist_items_options_for_select.
  options          text[],
  unit             text,
  min_value        numeric,
  max_value        numeric,
  -- Only meaningful for `boolean` items: which answer counts as a pass.
  -- src/domain/checklist.ts defaults a null expectation to `true`.
  expected_boolean boolean,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint checklist_items_label_not_blank check (btrim(label) <> ''),
  constraint checklist_items_position_non_negative check (position >= 0),
  constraint checklist_items_template_position_key unique (template_id, position),
  -- A `select` with no options renders an empty dropdown that can never be answered,
  -- which would make a required item impossible to satisfy.
  constraint checklist_items_options_for_select
    check (kind <> 'select' or (options is not null and array_length(options, 1) >= 1)),
  constraint checklist_items_range_ordered
    check (min_value is null or max_value is null or min_value <= max_value)
);

alter table public.checklist_items enable row level security;

-- -----------------------------------------------------------------------------
-- device_types — the default interval and checklist for a class of device
-- -----------------------------------------------------------------------------
create table if not exists public.device_types (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  name                  text not null,
  default_interval_days int not null default 365,
  -- set null, not cascade: retiring a checklist template must not delete the device
  -- type (and with it, via the devices FK, the devices themselves).
  checklist_template_id uuid references public.checklist_templates (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint device_types_name_not_blank check (btrim(name) <> ''),
  constraint device_types_name_key unique (org_id, name),
  -- Bounds mirror MIN_INTERVAL_DAYS/MAX_INTERVAL_DAYS in src/domain/service-interval.ts.
  constraint device_types_default_interval_days_range
    check (default_interval_days between 1 and 3650)
);

alter table public.device_types enable row level security;

-- -----------------------------------------------------------------------------
-- devices — the heart of the system
-- -----------------------------------------------------------------------------
create table if not exists public.devices (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  location_id           uuid not null references public.locations (id) on delete cascade,
  -- set null: deleting a device type must not delete the physical kit in the field.
  device_type_id        uuid references public.device_types (id) on delete set null,
  name                  text not null,
  manufacturer          text,
  model                 text,
  serial_number         text,
  installed_on          date,
  -- Null means "inherit from device_types.default_interval_days"; see
  -- effectiveIntervalDays() in src/domain/service-interval.ts.
  service_interval_days int,
  interval_anchor       public.interval_anchor,
  last_service_at       date,
  -- Derived column. Written only from the output of computeNextServiceDue(); there is
  -- no SQL that recomputes it (see 0007 for why).
  next_service_due      date,
  status                public.device_status not null default 'active',
  -- QR target. 32 random bytes, base64url-encoded by the application. Globally unique
  -- rather than per-org, because the public /d/[token] route resolves the org *from*
  -- the token and therefore cannot scope the lookup.
  public_token          text not null,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint devices_name_not_blank check (btrim(name) <> ''),
  constraint devices_public_token_key unique (public_token),
  -- 32 base64url bytes is 43 characters. Anything markedly shorter means the token
  -- was generated by something other than the intended code path, so it is rejected
  -- rather than silently becoming a guessable public URL.
  constraint devices_public_token_length check (char_length(public_token) >= 24),
  constraint devices_service_interval_days_range
    check (service_interval_days is null or service_interval_days between 1 and 3650)
  -- Serial numbers are unique per organisation via a partial unique index in 0004,
  -- for the same reason as customers.external_ref.
);

alter table public.devices enable row level security;

comment on column public.devices.next_service_due is
  'Derived. Computed exclusively by computeNextServiceDue() in src/domain/service-interval.ts and written explicitly by the application. Never hand-edited, never recomputed in SQL.';
comment on column public.devices.public_token is
  'Unguessable QR token. The public device page authenticates by possession of this value alone, so it must never be logged or exposed in a list endpoint.';
