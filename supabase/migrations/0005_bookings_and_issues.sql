-- =============================================================================
-- 0005 — Rezervacije, javni tokeni i prijave kvara
-- =============================================================================

-- -----------------------------------------------------------------------------
-- booking_settings — pravila dostupnosti termina
-- -----------------------------------------------------------------------------
create table if not exists public.booking_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,

  -- ISO dani u sedmici: 1 = ponedjeljak … 7 = nedjelja.
  business_days smallint[] not null default '{1,2,3,4,5}',
  business_hours_start time not null default '08:00',
  business_hours_end time not null default '16:00',
  break_start time,
  break_end time,

  slot_duration_minutes smallint not null default 60,
  buffer_minutes smallint not null default 15,

  -- Koliko sati unaprijed se najranije može rezervisati.
  min_notice_hours smallint not null default 24,
  -- Koliko dana unaprijed se najkasnije može rezervisati.
  max_horizon_days smallint not null default 90,
  -- Koliko termina firma može opsluživati istovremeno.
  max_concurrent_bookings smallint not null default 1,

  holidays date[] not null default '{}',
  booking_enabled boolean not null default true,
  booking_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_settings_hours_order check (business_hours_end > business_hours_start),
  constraint booking_settings_break_order
    check ((break_start is null and break_end is null) or (break_end > break_start)),
  constraint booking_settings_slot_range check (slot_duration_minutes between 15 and 480),
  constraint booking_settings_buffer_range check (buffer_minutes between 0 and 240),
  constraint booking_settings_notice_range check (min_notice_hours between 0 and 720),
  constraint booking_settings_horizon_range check (max_horizon_days between 1 and 365),
  constraint booking_settings_concurrent_range check (max_concurrent_bookings between 1 and 20),
  constraint booking_settings_days_valid
    check (business_days <@ array[1,2,3,4,5,6,7]::smallint[] and array_length(business_days, 1) >= 1)
);

drop trigger if exists trg_booking_settings_touch on public.booking_settings;
create trigger trg_booking_settings_touch before update on public.booking_settings
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,

  code text not null,
  service_type text not null default 'redovni_servis',

  -- Termin je apsolutni trenutak (`timestamptz`), za razliku od roka servisa
  -- koji je kalendarski datum. Ovdje vrijeme ZAISTA ima značenje.
  starts_at timestamptz not null,
  ends_at timestamptz not null,

  /*
   * Redni broj termina unutar istog vremena, 0 .. (max_concurrent - 1).
   *
   * Sprječavanje duple rezervacije radi ovako: termini se generišu na fiksnoj
   * mreži, pa svaka rezervacija počinje tačno na početku nekog termina.
   * Servis unutar transakcije zauzme najniži slobodan indeks, a jedinstveni
   * indeks ispod garantuje da dva istovremena zahtjeva ne mogu dobiti isti.
   * Provjera je time u bazi, a ne u aplikacijskoj logici koja bi mogla
   * izgubiti utrku.
   */
  slot_index smallint not null default 0,

  status text not null default 'pending',
  source text not null default 'public',

  reminder_event_id uuid references public.reminder_events(id) on delete set null,
  assigned_technician_id uuid references public.technicians(id) on delete set null,

  contact_name text,
  contact_email citext,
  contact_phone text,
  customer_note text,
  internal_note text,

  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  rescheduled_from timestamptz,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_status_valid
    check (status in ('pending', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show')),
  constraint bookings_source_valid
    check (source in ('reminder', 'qr', 'issue_report', 'staff', 'public')),
  constraint bookings_time_order check (ends_at > starts_at),
  constraint bookings_slot_index_range check (slot_index between 0 and 19),
  constraint bookings_cancelled_needs_time
    check (status <> 'cancelled' or cancelled_at is not null)
);

-- Statusi koji zauzimaju termin.
create unique index if not exists uq_bookings_slot
  on public.bookings (organization_id, starts_at, slot_index)
  where status in ('pending', 'confirmed', 'rescheduled');

-- Isti tehničar ne može biti na dva mjesta u isto vrijeme.
create unique index if not exists uq_bookings_technician_slot
  on public.bookings (assigned_technician_id, starts_at)
  where assigned_technician_id is not null
    and status in ('pending', 'confirmed', 'rescheduled');

create unique index if not exists uq_bookings_code on public.bookings (organization_id, code);
create index if not exists idx_bookings_org_time on public.bookings (organization_id, starts_at);
create index if not exists idx_bookings_customer on public.bookings (customer_id, starts_at desc);
create index if not exists idx_bookings_device on public.bookings (device_id, starts_at desc);
create index if not exists idx_bookings_unassigned
  on public.bookings (organization_id, starts_at)
  where assigned_technician_id is null and status in ('pending', 'confirmed');

drop trigger if exists trg_bookings_touch on public.bookings;
create trigger trg_bookings_touch before update on public.bookings
  for each row execute function app.touch_updated_at();

comment on index public.uq_bookings_slot is
  'Sprječava duplu rezervaciju istog termina na nivou baze, čak i kod istovremenih zahtjeva.';

-- -----------------------------------------------------------------------------
-- booking_tokens — sigurni linkovi za kupca
-- -----------------------------------------------------------------------------
create table if not exists public.booking_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Token izdan uz podsjetnik pokazuje na uređaj (rezervacija još ne postoji);
  -- token izdan nakon rezervacije pokazuje na nju (izmjena i otkazivanje).
  device_id uuid references public.devices(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,

  token_hash text not null,
  purpose text not null default 'book',

  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0,

  created_at timestamptz not null default now(),

  constraint booking_tokens_purpose_valid check (purpose in ('book', 'manage')),
  constraint booking_tokens_target_present
    check (device_id is not null or booking_id is not null)
);

create unique index if not exists uq_booking_tokens_hash on public.booking_tokens (token_hash);
create index if not exists idx_booking_tokens_booking on public.booking_tokens (booking_id);
create index if not exists idx_booking_tokens_device on public.booking_tokens (device_id);

-- Veza podsjetnika prema tokenu (deklarisana ovdje jer tabela sada postoji).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'reminder_events_booking_token_fk'
      and table_schema = 'public'
  ) then
    alter table public.reminder_events
      add constraint reminder_events_booking_token_fk
      foreign key (booking_token_id) references public.booking_tokens(id) on delete set null;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- issue_reports — prijava kvara s javne stranice uređaja
-- -----------------------------------------------------------------------------
create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,

  code text not null,
  category text not null default 'other',
  description text not null,
  error_code text,
  started_on date,
  still_operating boolean,
  preferred_contact_time text,

  is_urgent boolean not null default false,
  /*
   * Kupac je označio da postoji dim, miris plina, gorenje ili curenje rashladnog
   * sredstva. Sistem tada NE nudi nikakav savjet za popravku — prikazuje jasno
   * upozorenje da prestane koristiti uređaj i pozove nadležnu službu, a prijavu
   * odmah označava kao hitnu za dispečera.
   */
  safety_risk boolean not null default false,

  contact_name text,
  contact_email citext,
  contact_phone text,

  status text not null default 'new',
  source text not null default 'public',

  booking_id uuid references public.bookings(id) on delete set null,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  resolution_note text,

  -- Heš IP adrese, za ograničavanje zloupotrebe. Sirova adresa se ne čuva.
  ip_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,

  constraint issue_reports_status_valid
    check (status in ('new', 'in_review', 'converted', 'closed', 'spam')),
  constraint issue_reports_source_valid check (source in ('public', 'staff', 'phone')),
  constraint issue_reports_category_valid
    check (category in ('no_cooling', 'no_heating', 'noise', 'leak', 'smell', 'error_code',
                        'power', 'remote_control', 'maintenance', 'other')),
  constraint issue_reports_description_length
    check (length(trim(description)) between 5 and 4000)
);

create unique index if not exists uq_issue_reports_code on public.issue_reports (organization_id, code);
create index if not exists idx_issue_reports_org_status
  on public.issue_reports (organization_id, status, created_at desc);
create index if not exists idx_issue_reports_device on public.issue_reports (device_id, created_at desc);
create index if not exists idx_issue_reports_urgent
  on public.issue_reports (organization_id, created_at desc)
  where is_urgent and status in ('new', 'in_review');

drop trigger if exists trg_issue_reports_touch on public.issue_reports;
create trigger trg_issue_reports_touch before update on public.issue_reports
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- issue_attachments
-- -----------------------------------------------------------------------------
create table if not exists public.issue_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  issue_report_id uuid not null references public.issue_reports(id) on delete cascade,

  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,

  created_at timestamptz not null default now(),

  -- Dozvoljeni tipovi se provjeravaju i u aplikaciji; ovdje je zadnja brana.
  constraint issue_attachments_mime_valid
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4')),
  constraint issue_attachments_size_positive check (size_bytes > 0),
  constraint issue_attachments_size_limit check (size_bytes <= 26214400)
);

create index if not exists idx_issue_attachments_report on public.issue_attachments (issue_report_id);

-- -----------------------------------------------------------------------------
-- rate_limits — ograničavanje javnih formi
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  hit_count integer not null default 1,
  expires_at timestamptz not null,

  primary key (bucket_key, window_start)
);

create index if not exists idx_rate_limits_expiry on public.rate_limits (expires_at);

comment on table public.rate_limits is
  'Brojači za ograničavanje javnih formi. Bez Redisa — dovoljno za MVP promet. Stari zapisi se brišu dnevnim poslom.';
