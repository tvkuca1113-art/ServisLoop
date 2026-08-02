-- =============================================================================
-- 0004 — Servisni planovi i motor podsjetnika
-- =============================================================================

-- -----------------------------------------------------------------------------
-- service_plan_templates — pravilo održavanja po vrsti opreme
-- -----------------------------------------------------------------------------
create table if not exists public.service_plan_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_type_id uuid references public.device_types(id) on delete set null,

  name text not null,
  description text,
  interval_months smallint not null,
  price numeric(12, 2),
  estimated_minutes smallint not null default 60,

  is_default boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_plan_templates_name_not_blank check (length(trim(name)) > 0),
  constraint service_plan_templates_interval_range check (interval_months between 1 and 120),
  constraint service_plan_templates_price_positive check (price is null or price >= 0),
  constraint service_plan_templates_minutes_range check (estimated_minutes between 5 and 1440)
);

create index if not exists idx_service_plan_templates_org
  on public.service_plan_templates (organization_id) where is_active;
create unique index if not exists uq_service_plan_templates_default
  on public.service_plan_templates (organization_id, device_type_id)
  where is_default and is_active;

drop trigger if exists trg_service_plan_templates_touch on public.service_plan_templates;
create trigger trg_service_plan_templates_touch before update on public.service_plan_templates
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- device_service_plans — plan primijenjen na konkretan uređaj
-- -----------------------------------------------------------------------------
create table if not exists public.device_service_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  template_id uuid references public.service_plan_templates(id) on delete set null,

  interval_months smallint not null,
  price numeric(12, 2),
  starts_on date not null default current_date,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint device_service_plans_interval_range check (interval_months between 1 and 120),
  constraint device_service_plans_price_positive check (price is null or price >= 0)
);

create unique index if not exists uq_device_service_plans_active
  on public.device_service_plans (device_id)
  where is_active;
create index if not exists idx_device_service_plans_org on public.device_service_plans (organization_id);

drop trigger if exists trg_device_service_plans_touch on public.device_service_plans;
create trigger trg_device_service_plans_touch before update on public.device_service_plans
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- reminder_rules — kada se šalje podsjetnik u odnosu na rok
-- -----------------------------------------------------------------------------
create table if not exists public.reminder_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name text not null,
  -- Negativno = prije roka, 0 = na dan roka, pozitivno = nakon roka.
  offset_days smallint not null,
  channel text not null default 'email',
  template_key text not null default 'service_reminder',

  is_active boolean not null default true,
  sort_order smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reminder_rules_name_not_blank check (length(trim(name)) > 0),
  constraint reminder_rules_offset_range check (offset_days between -365 and 365),
  -- Kanal je pripremljen za SMS/Viber, ali MVP šalje samo e-poštu.
  constraint reminder_rules_channel_valid check (channel in ('email', 'sms', 'viber', 'whatsapp')),
  constraint reminder_rules_template_valid
    check (template_key in ('service_reminder', 'service_reminder_final', 'service_overdue'))
);

-- Jedno pravilo po pomaku — sprječava da firma slučajno napravi dva
-- podsjetnika za „30 dana ranije“ i pošalje kupcu dvije iste poruke.
create unique index if not exists uq_reminder_rules_offset
  on public.reminder_rules (organization_id, offset_days)
  where is_active;
create index if not exists idx_reminder_rules_org on public.reminder_rules (organization_id, sort_order);

drop trigger if exists trg_reminder_rules_touch on public.reminder_rules;
create trigger trg_reminder_rules_touch before update on public.reminder_rules
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- reminder_campaigns — jedno pokretanje dnevnog posla za jednu organizaciju
-- -----------------------------------------------------------------------------
create table if not exists public.reminder_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Datum u zoni organizacije za koji je posao pokrenut.
  run_date date not null,
  status text not null default 'running',

  devices_scanned integer not null default 0,
  events_created integer not null default 0,
  events_sent integer not null default 0,
  events_failed integer not null default 0,
  events_skipped integer not null default 0,

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_text text,

  constraint reminder_campaigns_status_valid
    check (status in ('running', 'completed', 'failed', 'partial'))
);

-- Ključ idempotentnosti na nivou kampanje: dnevni posao za istu organizaciju
-- i isti datum postoji tačno jednom, bez obzira koliko puta cron krene.
create unique index if not exists uq_reminder_campaigns_run
  on public.reminder_campaigns (organization_id, run_date);
create index if not exists idx_reminder_campaigns_org
  on public.reminder_campaigns (organization_id, run_date desc);

-- -----------------------------------------------------------------------------
-- reminder_events — pojedinačna poruka
-- -----------------------------------------------------------------------------
create table if not exists public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.reminder_campaigns(id) on delete set null,

  device_id uuid not null references public.devices(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  rule_id uuid not null references public.reminder_rules(id) on delete cascade,

  -- Rok servisa na koji se podsjetnik odnosi. Dio ključa deduplikacije.
  due_date date not null,
  offset_days smallint not null,
  -- Datum kada poruka treba otići (due_date + offset_days).
  scheduled_for date not null,

  channel text not null default 'email',
  template_key text not null,

  status text not null default 'pending',
  attempt_count smallint not null default 0,
  last_error text,
  provider_message_id text,

  recipient_email citext,
  subject text,
  booking_token_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  constraint reminder_events_status_valid
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  constraint reminder_events_attempts_range check (attempt_count between 0 and 10),
  constraint reminder_events_sent_needs_time
    check (status <> 'sent' or sent_at is not null),
  constraint reminder_events_failed_needs_reason
    check (status <> 'failed' or last_error is not null)
);

/*
 * ★ GARANCIJA „TAČNO JEDNOM“ ★
 *
 * Ovo je najvažnije ograničenje u cijeloj bazi. Za jedan uređaj, jedno pravilo
 * i jedan rok servisa može postojati SAMO JEDAN događaj podsjetnika.
 *
 * Zbog toga ponovno pokretanje dnevnog posla — bilo zbog greške, bilo zbog
 * Vercel retry mehanizma, bilo zbog ručnog klika — fizički ne može poslati
 * kupcu istu poruku dvaput. Zaštita je u bazi, ne u aplikacijskoj logici.
 */
create unique index if not exists uq_reminder_events_dedupe
  on public.reminder_events (device_id, rule_id, due_date);

create index if not exists idx_reminder_events_org_status
  on public.reminder_events (organization_id, status, scheduled_for);
create index if not exists idx_reminder_events_pending
  on public.reminder_events (scheduled_for)
  where status = 'pending';
create index if not exists idx_reminder_events_failed
  on public.reminder_events (organization_id, failed_at desc)
  where status = 'failed';
create index if not exists idx_reminder_events_device on public.reminder_events (device_id, due_date desc);
create index if not exists idx_reminder_events_customer on public.reminder_events (customer_id);

drop trigger if exists trg_reminder_events_touch on public.reminder_events;
create trigger trg_reminder_events_touch before update on public.reminder_events
  for each row execute function app.touch_updated_at();

comment on index public.uq_reminder_events_dedupe is
  'Garancija da kupac nikad ne dobije isti podsjetnik dvaput, bez obzira koliko puta cron krene.';

-- -----------------------------------------------------------------------------
-- email_messages — trag o svakoj poslanoj (ili pripremljenoj) poruci
-- -----------------------------------------------------------------------------
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,

  to_email citext not null,
  from_email citext not null,
  reply_to citext,
  subject text not null,
  template_key text not null,

  status text not null default 'queued',
  provider text not null default 'resend',
  provider_message_id text,
  error_text text,

  -- U razvoju i u demo načinu poruka se ne šalje nego se sadržaj čuva ovdje
  -- da se može pregledati u aplikaciji. Time cijeli motor podsjetnika radi
  -- i bez plaćenog naloga kod pružaoca usluge.
  preview_html text,
  preview_text text,

  entity_type text,
  entity_id uuid,

  created_at timestamptz not null default now(),
  sent_at timestamptz,

  constraint email_messages_status_valid
    check (status in ('queued', 'sent', 'failed', 'preview', 'suppressed')),
  constraint email_messages_provider_valid check (provider in ('resend', 'preview', 'console'))
);

create index if not exists idx_email_messages_org on public.email_messages (organization_id, created_at desc);
create index if not exists idx_email_messages_entity on public.email_messages (entity_type, entity_id);
create index if not exists idx_email_messages_failed
  on public.email_messages (organization_id, created_at desc)
  where status = 'failed';

comment on column public.email_messages.preview_html is
  'Sadržaj poruke u pregled načinu. Omogućava testiranje podsjetnika bez plaćenog e-mail plana.';
