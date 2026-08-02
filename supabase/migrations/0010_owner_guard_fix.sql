-- =============================================================================
-- 0010 — Ispravka zaštite posljednjeg vlasnika pri brisanju organizacije
-- =============================================================================
-- Problem:
--   Okidač `app.enforce_last_owner` sprječava uklanjanje posljednjeg vlasnika.
--   To je ispravno kad se briše ČLAN. Ali kad se briše CIJELA organizacija,
--   strani ključ kaskadno briše i članove — okidač tada opravdano vidi da
--   nestaje zadnji vlasnik i odbija brisanje. Rezultat: organizacija se ne
--   može obrisati, iako je to legitimna radnja vlasnika (i zahtjev za
--   brisanje podataka po propisima o zaštiti ličnih podataka).
--
-- Rješenje:
--   Ako organizacija u tom trenutku više ne postoji, brisanje člana je
--   posljedica kaskade, a ne pokušaj uklanjanja vlasnika. Tada propuštamo.
--   Isto vrijedi za organizaciju označenu kao obrisanu (soft delete).
-- =============================================================================

create or replace function app.enforce_last_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
  affected_org uuid;
  org_exists boolean;
begin
  affected_org := coalesce(old.organization_id, new.organization_id);

  -- Kaskadno brisanje: organizacija je već nestala ili je označena kao obrisana.
  select exists (
    select 1 from public.organizations o
    where o.id = affected_org and o.deleted_at is null
  ) into org_exists;

  if not org_exists then
    return coalesce(new, old);
  end if;

  -- Izmjena koja ostavlja aktivnog vlasnika je uvijek u redu.
  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  -- Red koji ionako nije bio aktivan vlasnik ne može ostaviti organizaciju bez njega.
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
      using errcode = 'check_violation',
            hint = 'Prvo dodijelite ulogu vlasnika drugom članu tima, pa tek onda uklonite ovog.';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function app.enforce_last_owner() is
  'Sprječava uklanjanje posljednjeg vlasnika, ali propušta kaskadno brisanje cijele organizacije.';
