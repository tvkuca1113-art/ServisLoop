-- =============================================================================
-- 0007 — Uvoz, obavijesti, planovi, analitika i revizijski dnevnik
-- =============================================================================

-- -----------------------------------------------------------------------------
-- import_jobs
-- -----------------------------------------------------------------------------
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,

  entity text not null,
  file_name text not null,
  file_size integer not null,
  mime_type text not null,
  sheet_name text,
  delimiter text,
  encoding text not null default 'utf-8',

  status text not null default 'uploaded',

  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  imported_rows integer not null default 0,
  updated_rows integer not null default 0,
  skipped_rows integer not null default 0,
  processed_rows integer not null default 0,

  -- Veza kolone iz fajla na polje u sistemu: { "Telefon": "phone", … }
  mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,

  error_text text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint import_jobs_entity_valid
    check (entity in ('customers', 'locations', 'devices', 'combined')),
  constraint import_jobs_status_valid
    check (status in ('uploaded', 'mapping', 'validating', 'ready', 'processing',
                      'completed', 'completed_with_errors', 'failed', 'cancelled')),
  constraint import_jobs_size_positive check (file_size > 0),
  constraint import_jobs_size_limit check (file_size <= 15728640)
);

create index if not exists idx_import_jobs_org on public.import_jobs (organization_id, created_at desc);
create index if not exists idx_import_jobs_active
  on public.import_jobs (organization_id)
  where status in ('uploaded', 'mapping', 'validating', 'ready', 'processing');

drop trigger if exists trg_import_jobs_touch on public.import_jobs;
create trigger trg_import_jobs_touch before update on public.import_jobs
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- import_mappings — sačuvano mapiranje za ponovnu upotrebu
-- -----------------------------------------------------------------------------
create table if not exists public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  entity text not null,
  mapping jsonb not null,
  options jsonb not null default '{}'::jsonb,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint import_mappings_entity_valid
    check (entity in ('customers', 'locations', 'devices', 'combined')),
  constraint import_mappings_name_not_blank check (length(trim(name)) > 0),
  constraint uq_import_mappings_name unique (organization_id, entity, name)
);

drop trigger if exists trg_import_mappings_touch on public.import_mappings;
create trigger trg_import_mappings_touch before update on public.import_mappings
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- import_rows — po jedan zapis za SVAKI red iz fajla
-- -----------------------------------------------------------------------------
-- Namjerno čuvamo i neispravne redove. Uvoz koji tiho odbaci 40 redova je
-- gori od uvoza koji odbije cijeli fajl — korisnik mora vidjeti šta je ispalo
-- i moći to preuzeti kao CSV, ispraviti i ponovo uvesti.
-- -----------------------------------------------------------------------------
create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,

  row_number integer not null,
  raw jsonb not null,
  normalized jsonb,

  status text not null default 'pending',
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,

  entity_id uuid,
  duplicate_of uuid,

  created_at timestamptz not null default now(),

  constraint import_rows_status_valid
    check (status in ('pending', 'valid', 'invalid', 'imported', 'updated', 'skipped', 'failed', 'duplicate')),
  constraint uq_import_rows_number unique (import_job_id, row_number)
);

create index if not exists idx_import_rows_job on public.import_rows (import_job_id, status);
create index if not exists idx_import_rows_invalid
  on public.import_rows (import_job_id, row_number)
  where status in ('invalid', 'failed');

-- -----------------------------------------------------------------------------
-- notification_events — obavijesti unutar aplikacije
-- -----------------------------------------------------------------------------
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- NULL znači: vide je svi članovi organizacije koji imaju pravo na sadržaj.
  user_id uuid references public.profiles(id) on delete cascade,

  type text not null,
  title text not null,
  body text,
  link_path text,
  severity text not null default 'info',

  entity_type text,
  entity_id uuid,

  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notification_severity_valid check (severity in ('info', 'success', 'warning', 'critical')),
  constraint notification_type_valid
    check (type in ('reminder_failed', 'booking_created', 'booking_cancelled', 'issue_reported',
                    'issue_urgent', 'work_order_unassigned', 'work_order_overdue',
                    'device_missing_interval', 'import_completed', 'import_failed',
                    'invitation_accepted', 'report_failed', 'trial_ending'))
);

create index if not exists idx_notifications_org_unread
  on public.notification_events (organization_id, created_at desc)
  where not is_read;
create index if not exists idx_notifications_user
  on public.notification_events (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- notification_preferences
-- -----------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  type text not null,
  in_app boolean not null default true,
  email boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_notification_prefs unique (organization_id, user_id, type)
);

drop trigger if exists trg_notification_prefs_touch on public.notification_preferences;
create trigger trg_notification_prefs_touch before update on public.notification_preferences
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- plan_definitions — ogledalo `domains/billing/plans.ts`
-- -----------------------------------------------------------------------------
create table if not exists public.plan_definitions (
  code text primary key,
  name text not null,
  tagline text,
  monthly_price_km numeric(10, 2),
  trial_days smallint not null default 0,
  limits jsonb not null,
  features jsonb not null,
  is_public boolean not null default true,
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now(),

  constraint plan_definitions_code_valid check (code in ('demo', 'trial', 'start', 'growth', 'pro'))
);

comment on table public.plan_definitions is
  'Sinhronizuje se iz domains/billing/plans.ts skriptom scripts/sync-plans.ts. Kod je izvor istine.';

-- -----------------------------------------------------------------------------
-- organization_subscriptions
-- -----------------------------------------------------------------------------
create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.plan_definitions(code),

  status text not null default 'trialing',
  trial_ends_on date,
  current_period_start date not null default current_date,
  current_period_end date,

  -- U MVP-u se pretplata postavlja ručno. Polja ispod su spremna za kasnije
  -- povezivanje s vanjskim obrađivačem plaćanja, bez izmjene šeme.
  manual_override boolean not null default true,
  override_note text,
  set_by uuid references public.profiles(id) on delete set null,

  provider text,
  provider_customer_id text,
  provider_subscription_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint org_subscriptions_status_valid
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'suspended')),
  constraint org_subscriptions_period_order
    check (current_period_end is null or current_period_end >= current_period_start),
  constraint uq_org_subscriptions_org unique (organization_id)
);

create index if not exists idx_org_subscriptions_trial
  on public.organization_subscriptions (trial_ends_on)
  where status = 'trialing';

drop trigger if exists trg_org_subscriptions_touch on public.organization_subscriptions;
create trigger trg_org_subscriptions_touch before update on public.organization_subscriptions
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- usage_counters — mjesečna potrošnja po organizaciji
-- -----------------------------------------------------------------------------
create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Prvi dan mjeseca na koji se brojač odnosi.
  period_month date not null,
  metric text not null,
  value integer not null default 0,
  updated_at timestamptz not null default now(),

  constraint usage_counters_metric_valid
    check (metric in ('emails_sent', 'reminders_sent', 'bookings_created', 'work_orders_completed',
                      'reports_generated', 'imports_run', 'rows_imported', 'qr_generated')),
  constraint usage_counters_value_positive check (value >= 0),
  constraint uq_usage_counters unique (organization_id, period_month, metric)
);

create index if not exists idx_usage_counters_org
  on public.usage_counters (organization_id, period_month desc);

/** Atomarno povećava mjesečni brojač. */
create or replace function app.bump_usage(
  target_org uuid,
  metric_name text,
  amount integer default 1
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters (organization_id, period_month, metric, value)
  values (target_org, date_trunc('month', current_date)::date, metric_name, amount)
  on conflict (organization_id, period_month, metric)
  do update set value = public.usage_counters.value + amount, updated_at = now();
$$;

-- -----------------------------------------------------------------------------
-- analytics_events — interna analitika, bez vanjskih servisa
-- -----------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,

  event text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),

  constraint analytics_event_not_blank check (length(trim(event)) > 0)
);

create index if not exists idx_analytics_org_time
  on public.analytics_events (organization_id, occurred_at desc);
create index if not exists idx_analytics_event_time
  on public.analytics_events (event, occurred_at desc);

comment on table public.analytics_events is
  'Interna analitika za validaciju proizvoda. Bez podataka koji identifikuju kupce i bez vanjskih alata.';

-- -----------------------------------------------------------------------------
-- audit_events — ko je šta promijenio
-- -----------------------------------------------------------------------------
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,

  actor_user_id uuid references public.profiles(id) on delete set null,
  -- Čitljiva oznaka izvršioca u trenutku radnje ("Amir Hodžić", "sistem: cron").
  actor_label text not null default 'sistem',

  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,

  created_at timestamptz not null default now(),

  constraint audit_action_not_blank check (length(trim(action)) > 0)
);

create index if not exists idx_audit_org_time on public.audit_events (organization_id, created_at desc);
create index if not exists idx_audit_entity on public.audit_events (entity_type, entity_id, created_at desc);

-- -----------------------------------------------------------------------------
-- cron_runs — historija rasporeda poslova
-- -----------------------------------------------------------------------------
create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  run_date date not null,

  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary jsonb not null default '{}'::jsonb,
  error_text text,

  constraint cron_runs_status_valid check (status in ('running', 'completed', 'failed', 'partial')),
  -- Isti posao za isti dan postoji tačno jednom.
  constraint uq_cron_runs unique (job, run_date)
);

create index if not exists idx_cron_runs_recent on public.cron_runs (job, run_date desc);
create index if not exists idx_cron_runs_failed
  on public.cron_runs (started_at desc)
  where status = 'failed';

comment on table public.cron_runs is
  'Historija dnevnih poslova. Jedinstveni (job, run_date) čini ponovno pokretanje bezopasnim.';
