-- =============================================================================
-- 0003 — Kupci, lokacije, tehničari, vrste opreme, uređaji, QR tokeni
-- =============================================================================

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  customer_type text not null default 'individual',
  name text not null,
  company_name text,
  tax_id text,

  email citext,
  phone text,
  phone_secondary text,
  phone_normalized text generated always as (app.normalize_phone(phone)) stored,

  preferred_language text not null default 'bs',
  preferred_contact_method text not null default 'email',

  -- Tri odvojena pristanka. Servisni podsjetnik NIJE marketinška poruka i
  -- gašenje marketinga ne smije ugasiti obavijest o roku servisa.
  reminder_consent boolean not null default true,
  service_message_consent boolean not null default true,
  marketing_consent boolean not null default false,
  consent_source text,
  consent_recorded_at timestamptz,

  notes text,
  is_active boolean not null default true,

  -- Stabilan identifikator iz sistema kupca — omogućava ponovljeni uvoz
  -- koji ažurira postojeće zapise umjesto da pravi duplikate.
  external_ref text,

  search_text text generated always as (
    app.normalize_search(
      coalesce(name, '') || ' ' ||
      coalesce(company_name, '') || ' ' ||
      coalesce(email::text, '') || ' ' ||
      coalesce(phone, '')
    )
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint customers_type_valid check (customer_type in ('individual', 'company')),
  constraint customers_name_not_blank check (length(trim(name)) > 0),
  constraint customers_contact_method_valid
    check (preferred_contact_method in ('email', 'phone', 'sms')),
  constraint customers_language_valid check (preferred_language in ('bs', 'hr', 'sr', 'en', 'de')),
  constraint customers_email_format
    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint customers_company_needs_name
    check (customer_type <> 'company' or coalesce(trim(company_name), '') <> '')
);

create index if not exists idx_customers_org on public.customers (organization_id) where deleted_at is null;
create index if not exists idx_customers_search on public.customers using gin (search_text gin_trgm_ops);
create index if not exists idx_customers_email on public.customers (organization_id, email) where deleted_at is null;
create index if not exists idx_customers_phone on public.customers (organization_id, phone_normalized) where deleted_at is null;
create unique index if not exists uq_customers_external_ref
  on public.customers (organization_id, external_ref)
  where external_ref is not null and deleted_at is null;

drop trigger if exists trg_customers_touch on public.customers;
create trigger trg_customers_touch before update on public.customers
  for each row execute function app.touch_updated_at();

comment on column public.customers.reminder_consent is
  'Pristanak na servisne podsjetnike. Odvojen od marketinškog pristanka.';

-- -----------------------------------------------------------------------------
-- customer_contacts — dodatne osobe za kontakt kod pravnih lica
-- -----------------------------------------------------------------------------
create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,

  name text not null,
  role_label text,
  email citext,
  phone text,
  is_primary boolean not null default false,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_contacts_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists idx_customer_contacts_customer on public.customer_contacts (customer_id);
create unique index if not exists uq_customer_contacts_primary
  on public.customer_contacts (customer_id)
  where is_primary;

drop trigger if exists trg_customer_contacts_touch on public.customer_contacts;
create trigger trg_customer_contacts_touch before update on public.customer_contacts
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- locations — mjesta na kojima je oprema ugrađena
-- -----------------------------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,

  label text not null default 'Glavna lokacija',
  address text,
  city text,
  postal_code text,
  country text not null default 'BA',

  latitude numeric(9, 6),
  longitude numeric(9, 6),

  access_notes text,
  parking_notes text,
  contact_person text,
  phone text,

  is_active boolean not null default true,
  external_ref text,

  search_text text generated always as (
    app.normalize_search(
      coalesce(label, '') || ' ' || coalesce(address, '') || ' ' || coalesce(city, '')
    )
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint locations_label_not_blank check (length(trim(label)) > 0),
  constraint locations_country_format check (country ~ '^[A-Z]{2}$'),
  constraint locations_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint locations_longitude_range check (longitude is null or longitude between -180 and 180)
);

create index if not exists idx_locations_org on public.locations (organization_id) where deleted_at is null;
create index if not exists idx_locations_customer on public.locations (customer_id) where deleted_at is null;
create index if not exists idx_locations_search on public.locations using gin (search_text gin_trgm_ops);
create unique index if not exists uq_locations_external_ref
  on public.locations (organization_id, external_ref)
  where external_ref is not null and deleted_at is null;

drop trigger if exists trg_locations_touch on public.locations;
create trigger trg_locations_touch before update on public.locations
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- technicians
-- -----------------------------------------------------------------------------
create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Tehničar može postojati u rasporedu i prije nego što dobije nalog za prijavu.
  user_id uuid references public.profiles(id) on delete set null,

  full_name text not null,
  email citext,
  phone text,
  color text not null default '#5E8BFF',
  specialties text[] not null default '{}',
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint technicians_name_not_blank check (length(trim(full_name)) > 0),
  constraint technicians_color_format check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index if not exists idx_technicians_org on public.technicians (organization_id) where is_active;
create unique index if not exists uq_technicians_user
  on public.technicians (organization_id, user_id)
  where user_id is not null;

drop trigger if exists trg_technicians_touch on public.technicians;
create trigger trg_technicians_touch before update on public.technicians
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- device_types — vrste opreme, podesive po organizaciji
-- -----------------------------------------------------------------------------
create table if not exists public.device_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  code text not null,
  name text not null,
  default_interval_months smallint not null default 12,
  default_price numeric(12, 2),
  icon text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint device_types_code_format check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint device_types_name_not_blank check (length(trim(name)) > 0),
  constraint device_types_interval_range check (default_interval_months between 1 and 120),
  constraint device_types_price_positive check (default_price is null or default_price >= 0),
  constraint uq_device_types_code unique (organization_id, code)
);

create index if not exists idx_device_types_org on public.device_types (organization_id, sort_order);

drop trigger if exists trg_device_types_touch on public.device_types;
create trigger trg_device_types_touch before update on public.device_types
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- devices — srce sistema
-- -----------------------------------------------------------------------------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  device_type_id uuid references public.device_types(id) on delete set null,

  manufacturer text,
  model text,
  serial_number text,
  asset_number text,

  installed_at date,
  installer_name text,

  warranty_start date,
  warranty_end date,

  -- Interval i rok su `date` (bez vremena) — kalendarski pojmovi, ne trenuci.
  service_interval_months smallint,
  next_service_date date,
  last_service_date date,

  default_service_price numeric(12, 2),
  currency text not null default 'BAM',

  status text not null default 'active',
  notes text,
  photo_path text,

  public_page_enabled boolean not null default true,
  reminders_enabled boolean not null default true,

  external_ref text,

  search_text text generated always as (
    app.normalize_search(
      coalesce(manufacturer, '') || ' ' ||
      coalesce(model, '') || ' ' ||
      coalesce(serial_number, '') || ' ' ||
      coalesce(asset_number, '')
    )
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint devices_status_valid
    check (status in ('active', 'inactive', 'removed', 'replaced', 'out_of_service')),
  constraint devices_interval_range
    check (service_interval_months is null or service_interval_months between 1 and 120),
  constraint devices_price_positive
    check (default_service_price is null or default_service_price >= 0),
  constraint devices_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint devices_warranty_order
    check (warranty_start is null or warranty_end is null or warranty_end >= warranty_start),
  constraint devices_install_before_warranty_end
    check (installed_at is null or warranty_end is null or warranty_end >= installed_at)
);

create index if not exists idx_devices_org on public.devices (organization_id) where deleted_at is null;
create index if not exists idx_devices_customer on public.devices (customer_id) where deleted_at is null;
create index if not exists idx_devices_location on public.devices (location_id) where deleted_at is null;
create index if not exists idx_devices_search on public.devices using gin (search_text gin_trgm_ops);

-- Najvažniji indeks u sistemu: dnevni posao podsjetnika traži uređaje kojima
-- rok servisa pada u zadani raspon. Bez njega bi svaki dan išao pun sken.
create index if not exists idx_devices_next_service
  on public.devices (organization_id, next_service_date)
  where deleted_at is null and status = 'active' and reminders_enabled;

create unique index if not exists uq_devices_serial
  on public.devices (organization_id, upper(serial_number))
  where serial_number is not null and deleted_at is null;

create unique index if not exists uq_devices_external_ref
  on public.devices (organization_id, external_ref)
  where external_ref is not null and deleted_at is null;

drop trigger if exists trg_devices_touch on public.devices;
create trigger trg_devices_touch before update on public.devices
  for each row execute function app.touch_updated_at();

comment on column public.devices.next_service_date is
  'Kalendarski datum sljedećeg servisa. Računa ga server; AI nikad ne određuje datume.';

-- -----------------------------------------------------------------------------
-- device_documents
-- -----------------------------------------------------------------------------
create table if not exists public.device_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,

  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  kind text not null default 'other',

  -- Privitci su privatni po defaultu. Javna stranica uređaja ih ne prikazuje
  -- osim ako je ovo eksplicitno uključeno.
  is_public boolean not null default false,

  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint device_documents_kind_valid
    check (kind in ('manual', 'warranty', 'invoice', 'photo', 'certificate', 'other')),
  constraint device_documents_size_positive check (size_bytes > 0),
  constraint device_documents_size_limit check (size_bytes <= 26214400)
);

create index if not exists idx_device_documents_device on public.device_documents (device_id);

-- -----------------------------------------------------------------------------
-- qr_tokens — javni pristup stranici uređaja
-- -----------------------------------------------------------------------------
create table if not exists public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,

  -- Samo heš. Sirovi token postoji jedino u QR kodu i u linku.
  token_hash text not null,
  -- Prvih nekoliko znakova, isključivo za prepoznavanje u listi ("••ab12cd").
  token_hint text not null,

  is_active boolean not null default true,
  rotated_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint qr_tokens_hint_length check (length(token_hint) between 4 and 12)
);

create unique index if not exists uq_qr_tokens_hash on public.qr_tokens (token_hash);
-- Uređaj u svakom trenutku ima najviše jedan aktivan token.
create unique index if not exists uq_qr_tokens_active_device
  on public.qr_tokens (device_id)
  where is_active;
create index if not exists idx_qr_tokens_org on public.qr_tokens (organization_id);

comment on table public.qr_tokens is
  'Javni tokeni za QR kodove. Rotacija: stari se deaktivira, novi se izda — postojeće naljepnice tada prestaju raditi.';
