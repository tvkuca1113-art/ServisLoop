-- =============================================================================
-- 0002 — Identitet: profili, organizacije, članstva, pozivnice
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — javni podaci korisnika, 1:1 s `auth.users`
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  full_name text,
  phone text,
  avatar_url text,
  locale text not null default 'bs',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_email_not_blank check (length(trim(email::text)) > 0),
  constraint profiles_locale_valid check (locale in ('bs', 'hr', 'sr', 'en', 'de'))
);

create index if not exists idx_profiles_email on public.profiles (email);

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

comment on table public.profiles is
  'Profil korisnika. Nastaje automatski nakon registracije preko okidača na auth.users.';

-- -----------------------------------------------------------------------------
-- organizations — nosilac svih podataka jednog klijenta (tenant)
-- -----------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  legal_name text,
  tax_id text,

  email citext,
  phone text,
  website text,

  address text,
  city text,
  postal_code text,
  country text not null default 'BA',

  logo_path text,

  -- Vremenska zona je po organizaciji. Cron posao za podsjetnike koristi
  -- ISKLJUČIVO ovu vrijednost, nikad zonu servera.
  timezone text not null default 'Europe/Sarajevo',
  currency text not null default 'BAM',
  locale text not null default 'bs',

  onboarding_step smallint not null default 0,
  onboarding_completed_at timestamptz,

  -- Demo organizacije nikad ne šalju stvarne poruke.
  is_demo boolean not null default false,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint organizations_name_not_blank check (length(trim(name)) > 0),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$'),
  constraint organizations_onboarding_step_range check (onboarding_step between 0 and 11),
  constraint organizations_country_format check (country ~ '^[A-Z]{2}$')
);

create unique index if not exists uq_organizations_slug
  on public.organizations (slug)
  where deleted_at is null;

create index if not exists idx_organizations_created_by on public.organizations (created_by);
create index if not exists idx_organizations_active on public.organizations (id) where deleted_at is null;

drop trigger if exists trg_organizations_touch on public.organizations;
create trigger trg_organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

comment on column public.organizations.timezone is
  'IANA zona (npr. Europe/Sarajevo). Jedini izvor istine za rokove i podsjetnike.';

-- -----------------------------------------------------------------------------
-- organization_settings — 1:1 postavke rada
-- -----------------------------------------------------------------------------
create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,

  default_service_interval_months smallint not null default 12,
  default_service_price numeric(12, 2),

  -- Sat (u zoni organizacije) u kojem se šalju podsjetnici.
  reminder_send_hour smallint not null default 8,
  reminder_from_name text,
  reminder_reply_to citext,
  reminders_paused boolean not null default false,

  report_footer_text text,
  report_disclaimer text default
    'Izvještaj potvrđuje izvršene radove na navedenom uređaju. Ne zamjenjuje zakonom propisane preglede.',

  require_customer_signature boolean not null default true,
  require_technician_signature boolean not null default false,
  require_completion_photos boolean not null default false,

  -- Koliko dugo se čuvaju zatvoreni zapisi prije ponude za brisanje.
  data_retention_months smallint,

  -- Sve AI funkcije su isključene dok ih organizacija svjesno ne uključi.
  ai_features_enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint org_settings_interval_range check (default_service_interval_months between 1 and 120),
  constraint org_settings_send_hour_range check (reminder_send_hour between 0 and 23),
  constraint org_settings_price_positive check (default_service_price is null or default_service_price >= 0),
  constraint org_settings_retention_range check (data_retention_months is null or data_retention_months between 1 and 240)
);

drop trigger if exists trg_org_settings_touch on public.organization_settings;
create trigger trg_org_settings_touch before update on public.organization_settings
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- organization_members — ko pripada kojoj organizaciji i s kojom ulogom
-- -----------------------------------------------------------------------------
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  role text not null,
  status text not null default 'active',

  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint org_members_role_valid check (role in ('owner', 'dispatcher', 'technician')),
  constraint org_members_status_valid check (status in ('active', 'suspended')),
  constraint uq_org_members_user unique (organization_id, user_id)
);

create index if not exists idx_org_members_user on public.organization_members (user_id, status);
create index if not exists idx_org_members_org on public.organization_members (organization_id, role) where status = 'active';

drop trigger if exists trg_org_members_touch on public.organization_members;
create trigger trg_org_members_touch before update on public.organization_members
  for each row execute function app.touch_updated_at();

/**
 * Organizacija mora imati barem jednog aktivnog vlasnika.
 *
 * Bez ove provjere jedan pogrešan klik ostavlja firmu bez ikoga ko može
 * mijenjati postavke ili pozvati nove članove — stanje iz kojeg se ne može
 * izaći bez ručne intervencije u bazi.
 */
create or replace function app.enforce_last_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
  affected_org uuid;
begin
  affected_org := coalesce(old.organization_id, new.organization_id);

  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  if old.role <> 'owner' or old.status <> 'active' then
    return coalesce(new, old);
  end if;

  select count(*) into remaining_owners
  from public.organization_members m
  where m.organization_id = affected_org
    and m.role = 'owner'
    and m.status = 'active'
    and m.id <> old.id;

  if remaining_owners = 0 then
    raise exception 'Organizacija mora imati barem jednog aktivnog vlasnika.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_org_members_last_owner on public.organization_members;
create trigger trg_org_members_last_owner
  before update or delete on public.organization_members
  for each row execute function app.enforce_last_owner();

-- -----------------------------------------------------------------------------
-- invitations — poziv novom članu tima
-- -----------------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email citext not null,
  role text not null,

  -- U bazi stoji samo heš. Sirovi token postoji jedino u poslanom linku.
  token_hash text not null,

  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,

  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invitations_role_valid check (role in ('owner', 'dispatcher', 'technician')),
  constraint invitations_status_valid check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint invitations_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create unique index if not exists uq_invitations_token on public.invitations (token_hash);
create unique index if not exists uq_invitations_pending
  on public.invitations (organization_id, email)
  where status = 'pending';
create index if not exists idx_invitations_org on public.invitations (organization_id, status);

drop trigger if exists trg_invitations_touch on public.invitations;
create trigger trg_invitations_touch before update on public.invitations
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Automatsko kreiranje profila nakon registracije
-- -----------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Okidač se veže samo ako `auth.users` ima kolonu `raw_user_meta_data`
-- (dakle na stvarnom Supabase-u). Lokalna zamjenska tabela je nema,
-- pa se profil u testovima kreira eksplicitno.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_user_meta_data'
  ) then
    drop trigger if exists trg_auth_user_created on auth.users;
    create trigger trg_auth_user_created
      after insert on auth.users
      for each row execute function app.handle_new_user();
  end if;
end
$$;
