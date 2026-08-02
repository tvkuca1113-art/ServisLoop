-- =============================================================================
-- 0001 — Temelj: ekstenzije, pomoćne funkcije i kompatibilnost
-- =============================================================================
-- Ova migracija mora raditi na DVA mjesta:
--   1. Supabase (gdje `auth` šema i `auth.uid()` već postoje);
--   2. običan PostgreSQL (gdje ih nema) — jer se integracijski testovi i
--      provjera RLS izolacije pokreću na lokalnoj bazi bez Supabase-a.
-- Zato se sve što Supabase već ima kreira uslovno.
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid(), digest()
create extension if not exists "citext";        -- e-mail bez razlike u veličini slova
create extension if not exists "pg_trgm";       -- brza pretraga po dijelu teksta
create extension if not exists "btree_gist";    -- ograničenja preklapanja termina
create extension if not exists "unaccent";      -- pretraga bez dijakritike

-- -----------------------------------------------------------------------------
-- Kompatibilnost sa Supabase autentifikacijom
-- -----------------------------------------------------------------------------

create schema if not exists auth;

-- Na Supabase-u ova tabela postoji i ovo je bez efekta.
-- Lokalno pravi minimalnu zamjenu da strani ključevi imaju na šta pokazivati.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- `auth.uid()` vraća ID prijavljenog korisnika iz JWT-a.
-- Supabase ima svoju implementaciju; ovdje je pravimo samo ako ne postoji.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid() returns uuid
      language sql stable
      as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim.sub', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
        )::uuid
      $body$;
    $fn$;
  end if;
end
$$;

-- Uloge koje Supabase koristi. Lokalno ih pravimo da politike imaju smisla.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Šema `app` — pomoćne funkcije koje koriste RLS politike
-- -----------------------------------------------------------------------------

create schema if not exists app;

/**
 * Zajednički okidač koji održava `updated_at`.
 * Vrijeme izmjene nikad ne dolazi od klijenta.
 */
create or replace function app.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

/**
 * Heširanje javnog tokena.
 *
 * U bazi NIKAD ne stoji sirovi token iz QR koda ili linka za rezervaciju.
 * Ako neko dobije pristup dumpu baze, ne može rekonstruisati linkove.
 * Tajna (`PUBLIC_TOKEN_SECRET`) se dodaje na aplikacijskom sloju prije poziva.
 */
create or replace function app.hash_token(raw_token text) returns text
language sql
immutable
strict
as $$
  select encode(digest(raw_token, 'sha256'), 'hex')
$$;

/**
 * Normalizacija teksta za pretragu: mala slova, bez dijakritike.
 * "Hodžić" i "hodzic" moraju dati isti rezultat.
 */
create or replace function app.normalize_search(input text) returns text
language sql
immutable
as $$
  select lower(public.unaccent(coalesce(input, '')))
$$;

/**
 * Normalizacija telefonskog broja za poređenje i traženje duplikata.
 * Zadržava samo cifre i vodeći plus.
 */
create or replace function app.normalize_phone(input text) returns text
language sql
immutable
as $$
  select nullif(
    case
      when input is null then null
      when left(regexp_replace(input, '[^0-9+]', '', 'g'), 1) = '+'
        then '+' || regexp_replace(input, '[^0-9]', '', 'g')
      else regexp_replace(input, '[^0-9]', '', 'g')
    end,
    ''
  )
$$;

-- -----------------------------------------------------------------------------
-- Napomena: funkcije za provjeru pripadnosti organizaciji (`app.is_org_member`,
-- `app.has_org_role`, …) definisane su u migraciji 0009_rls.sql. Moraju doći
-- NAKON tabela koje čitaju, jer PostgreSQL provjerava tijelo `language sql`
-- funkcije već pri kreiranju.
-- -----------------------------------------------------------------------------

comment on schema app is
  'Pomoćne funkcije za RLS i normalizaciju. Nikad se ne poziva direktno iz klijenta.';
