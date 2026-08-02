-- =============================================================================
-- 0006 — Čeklisti, radni nalozi, servisni zapisi i izvještaji
-- =============================================================================

-- -----------------------------------------------------------------------------
-- checklist_templates
-- -----------------------------------------------------------------------------
create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_type_id uuid references public.device_types(id) on delete set null,

  name text not null,
  description text,
  is_default boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint checklist_templates_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists idx_checklist_templates_org
  on public.checklist_templates (organization_id) where is_active;
create unique index if not exists uq_checklist_templates_default
  on public.checklist_templates (organization_id, device_type_id)
  where is_default and is_active;

drop trigger if exists trg_checklist_templates_touch on public.checklist_templates;
create trigger trg_checklist_templates_touch before update on public.checklist_templates
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- checklist_template_items
-- -----------------------------------------------------------------------------
create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,

  label text not null,
  help_text text,
  item_type text not null default 'checkbox',
  unit text,
  is_required boolean not null default false,
  sort_order smallint not null default 0,
  min_value numeric(12, 3),
  max_value numeric(12, 3),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint checklist_items_label_not_blank check (length(trim(label)) > 0),
  constraint checklist_items_type_valid
    check (item_type in ('checkbox', 'pass_fail', 'number', 'short_text', 'long_text', 'photo')),
  constraint checklist_items_range_order
    check (min_value is null or max_value is null or max_value >= min_value)
);

create index if not exists idx_checklist_items_template
  on public.checklist_template_items (template_id, sort_order);

drop trigger if exists trg_checklist_items_touch on public.checklist_template_items;
create trigger trg_checklist_items_touch before update on public.checklist_template_items
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- work_orders
-- -----------------------------------------------------------------------------
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  code text not null,

  customer_id uuid not null references public.customers(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  issue_report_id uuid references public.issue_reports(id) on delete set null,
  checklist_template_id uuid references public.checklist_templates(id) on delete set null,

  assigned_technician_id uuid references public.technicians(id) on delete set null,

  priority text not null default 'normal',
  status text not null default 'draft',

  scheduled_start timestamptz,
  scheduled_end timestamptz,
  estimated_minutes smallint,

  service_type text not null default 'redovni_servis',
  customer_description text,
  internal_notes text,
  recommendation text,
  travel_notes text,

  labor_minutes smallint,
  service_price numeric(12, 2),
  materials_total numeric(12, 2) not null default 0,
  currency text not null default 'BAM',

  customer_signature_path text,
  customer_signature_name text,
  customer_signed_at timestamptz,
  technician_signature_path text,
  technician_signature_name text,
  technician_signed_at timestamptz,

  -- Rok sljedećeg servisa koji je nastao zatvaranjem ovog naloga.
  next_service_date date,
  next_service_override_reason text,

  report_status text not null default 'none',

  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_orders_priority_valid check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint work_orders_status_valid
    check (status in ('draft', 'scheduled', 'assigned', 'in_progress', 'waiting_part',
                      'completed', 'cancelled')),
  constraint work_orders_report_status_valid
    check (report_status in ('none', 'generating', 'ready', 'failed')),
  constraint work_orders_schedule_order
    check (scheduled_start is null or scheduled_end is null or scheduled_end > scheduled_start),
  constraint work_orders_price_positive check (service_price is null or service_price >= 0),
  constraint work_orders_materials_positive check (materials_total >= 0),
  constraint work_orders_labor_range check (labor_minutes is null or labor_minutes between 0 and 10080),
  -- Završen nalog mora imati vrijeme završetka. Bez toga izvještaji lažu.
  constraint work_orders_completed_needs_time
    check (status <> 'completed' or completed_at is not null),
  constraint work_orders_cancelled_needs_reason
    check (status <> 'cancelled' or cancel_reason is not null),
  -- Ako je rok pomjeren ručno, razlog je obavezan i upisuje se u revizijski dnevnik.
  constraint work_orders_override_needs_reason
    check (next_service_override_reason is null or length(trim(next_service_override_reason)) >= 3)
);

create unique index if not exists uq_work_orders_code on public.work_orders (organization_id, code);
create index if not exists idx_work_orders_org_status
  on public.work_orders (organization_id, status, scheduled_start);
create index if not exists idx_work_orders_technician
  on public.work_orders (assigned_technician_id, scheduled_start)
  where status in ('assigned', 'in_progress', 'waiting_part');
create index if not exists idx_work_orders_device on public.work_orders (device_id, created_at desc);
create index if not exists idx_work_orders_customer on public.work_orders (customer_id, created_at desc);
create index if not exists idx_work_orders_open
  on public.work_orders (organization_id, scheduled_start)
  where status not in ('completed', 'cancelled');

drop trigger if exists trg_work_orders_touch on public.work_orders;
create trigger trg_work_orders_touch before update on public.work_orders
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- work_order_checklist_results
-- -----------------------------------------------------------------------------
create table if not exists public.work_order_checklist_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  template_item_id uuid references public.checklist_template_items(id) on delete set null,

  -- Naziv i tip se KOPIRAJU u trenutku otvaranja naloga. Kasnija izmjena
  -- predloška ne smije promijeniti kako izgleda već izdati servisni izvještaj.
  label text not null,
  item_type text not null,
  unit text,
  is_required boolean not null default false,
  sort_order smallint not null default 0,

  value_bool boolean,
  value_number numeric(12, 3),
  value_text text,
  photo_path text,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint checklist_results_type_valid
    check (item_type in ('checkbox', 'pass_fail', 'number', 'short_text', 'long_text', 'photo'))
);

create index if not exists idx_checklist_results_order
  on public.work_order_checklist_results (work_order_id, sort_order);

drop trigger if exists trg_checklist_results_touch on public.work_order_checklist_results;
create trigger trg_checklist_results_touch before update on public.work_order_checklist_results
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- work_order_materials
-- -----------------------------------------------------------------------------
create table if not exists public.work_order_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,

  name text not null,
  sku text,
  quantity numeric(12, 3) not null default 1,
  unit text not null default 'kom',
  unit_price numeric(12, 2) not null default 0,
  total_price numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,

  created_at timestamptz not null default now(),

  constraint materials_name_not_blank check (length(trim(name)) > 0),
  constraint materials_quantity_positive check (quantity > 0),
  constraint materials_price_positive check (unit_price >= 0)
);

create index if not exists idx_materials_order on public.work_order_materials (work_order_id);

/** Održava `work_orders.materials_total` u skladu sa stavkama. */
create or replace function app.recalculate_materials_total() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order uuid;
begin
  target_order := coalesce(new.work_order_id, old.work_order_id);

  update public.work_orders w
  set materials_total = coalesce(
    (select sum(m.total_price) from public.work_order_materials m where m.work_order_id = target_order),
    0
  )
  where w.id = target_order;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_materials_total on public.work_order_materials;
create trigger trg_materials_total
  after insert or update or delete on public.work_order_materials
  for each row execute function app.recalculate_materials_total();

-- -----------------------------------------------------------------------------
-- work_order_attachments
-- -----------------------------------------------------------------------------
create table if not exists public.work_order_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,

  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  phase text not null default 'other',
  caption text,

  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint wo_attachments_phase_valid check (phase in ('before', 'after', 'other', 'signature')),
  constraint wo_attachments_mime_valid
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  constraint wo_attachments_size_positive check (size_bytes > 0),
  constraint wo_attachments_size_limit check (size_bytes <= 26214400)
);

create index if not exists idx_wo_attachments_order
  on public.work_order_attachments (work_order_id, phase);

-- -----------------------------------------------------------------------------
-- service_records — nepromjenjiv zapis o izvršenom servisu
-- -----------------------------------------------------------------------------
create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,

  device_id uuid references public.devices(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  technician_id uuid references public.technicians(id) on delete set null,

  service_date date not null,
  service_type text not null,
  summary text,
  work_performed text,
  observations text,
  recommendations text,

  labor_minutes smallint,
  materials_total numeric(12, 2) not null default 0,
  service_price numeric(12, 2),
  currency text not null default 'BAM',

  previous_service_date date,
  next_service_date date,

  created_at timestamptz not null default now(),

  constraint service_records_price_positive check (service_price is null or service_price >= 0)
);

-- Jedan radni nalog daje najviše jedan servisni zapis.
create unique index if not exists uq_service_records_work_order
  on public.service_records (work_order_id);
create index if not exists idx_service_records_device
  on public.service_records (device_id, service_date desc);
create index if not exists idx_service_records_org
  on public.service_records (organization_id, service_date desc);
create index if not exists idx_service_records_technician
  on public.service_records (technician_id, service_date desc);

-- -----------------------------------------------------------------------------
-- service_reports — PDF izvještaj
-- -----------------------------------------------------------------------------
create table if not exists public.service_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_record_id uuid not null references public.service_records(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,

  report_number text not null,
  status text not null default 'pending',

  file_path text,
  file_size integer,
  generated_at timestamptz,
  error_text text,

  emailed_at timestamptz,
  email_message_id uuid references public.email_messages(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_reports_status_valid check (status in ('pending', 'generating', 'ready', 'failed')),
  constraint service_reports_ready_needs_file
    check (status <> 'ready' or (file_path is not null and generated_at is not null))
);

create unique index if not exists uq_service_reports_number
  on public.service_reports (organization_id, report_number);
create unique index if not exists uq_service_reports_record
  on public.service_reports (service_record_id);
create index if not exists idx_service_reports_failed
  on public.service_reports (organization_id, created_at desc)
  where status = 'failed';

drop trigger if exists trg_service_reports_touch on public.service_reports;
create trigger trg_service_reports_touch before update on public.service_reports
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- report_tokens — sigurni link ka PDF izvještaju
-- -----------------------------------------------------------------------------
create table if not exists public.report_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_report_id uuid not null references public.service_reports(id) on delete cascade,

  token_hash text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0,

  created_at timestamptz not null default now()
);

create unique index if not exists uq_report_tokens_hash on public.report_tokens (token_hash);
create index if not exists idx_report_tokens_report on public.report_tokens (service_report_id);

-- -----------------------------------------------------------------------------
-- Brojači dokumenata po organizaciji (radni nalozi, izvještaji, rezervacije…)
-- -----------------------------------------------------------------------------
create table if not exists public.document_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  counter_key text not null,
  period_year smallint not null,
  last_value integer not null default 0,

  primary key (organization_id, counter_key, period_year)
);

/**
 * Sljedeći redni broj dokumenta, atomarno.
 *
 * `insert … on conflict do update … returning` u jednoj naredbi znači da dva
 * istovremena zahtjeva ne mogu dobiti isti broj — bez zaključavanja tabele.
 */
create or replace function app.next_document_number(
  target_org uuid,
  key text,
  year_value smallint
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, period_year, last_value)
  values (target_org, key, year_value, 1)
  on conflict (organization_id, counter_key, period_year)
  do update set last_value = public.document_counters.last_value + 1
  returning last_value into next_value;

  return next_value;
end;
$$;
