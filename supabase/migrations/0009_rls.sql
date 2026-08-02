-- =============================================================================
-- 0009 — Row-level security
-- =============================================================================
-- Ovo je najvažnija sigurnosna granica u sistemu.
--
-- Načelo: aplikacija NIKAD ne vjeruje `organization_id` koji dolazi od klijenta.
-- Čak i kad bi neko poslao tuđi ID, baza odbija red jer korisnik nije član te
-- organizacije. Sakrivanje dugmadi u sučelju je udobnost, a ne kontrola.
--
-- Tri vrste pristupa:
--   1. `authenticated` — prijavljeni korisnik, ograničen politikama ispod;
--   2. `service_role`  — serverske rute (cron, javni QR, admin). Zaobilazi RLS,
--                        pa svaka takva ruta MORA sama provjeriti ovlaštenje;
--   3. `anon`          — nema pristup nijednoj tabeli. Javne stranice se
--                        isključivo poslužuju kroz server, nikad direktno.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pomoćne funkcije (ovdje jer sada postoje tabele koje čitaju)
-- -----------------------------------------------------------------------------
-- Sve su SECURITY DEFINER: politika nad `organization_members` koja poziva
-- funkciju koja opet čita `organization_members` ušla bi u beskonačnu rekurziju
-- da funkcija nije izuzeta od RLS-a.
--
-- `search_path` je prazan i sve je potpuno kvalifikovano, da niko ne može
-- podmetnuti vlastitu tabelu preko izmijenjene putanje pretrage.
-- -----------------------------------------------------------------------------

create or replace function app.current_org_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function app.is_org_member(target_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
$$;

create or replace function app.has_org_role(target_org uuid, allowed_roles text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  )
$$;

create or replace function app.is_org_staff(target_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.has_org_role(target_org, array['owner', 'dispatcher'])
$$;

create or replace function app.is_org_owner(target_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.has_org_role(target_org, array['owner'])
$$;

create or replace function app.current_technician_id(target_org uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select t.id from public.technicians t
  where t.organization_id = target_org
    and t.user_id = auth.uid()
    and t.is_active
  limit 1
$$;

/** Je li radni nalog dodijeljen trenutnom korisniku kao tehničaru? */
create or replace function app.is_assigned_technician(order_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.work_orders w
    join public.technicians t on t.id = w.assigned_technician_id
    where w.id = order_id
      and t.user_id = auth.uid()
      and t.is_active
  )
$$;

grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

-- =============================================================================
-- Uključivanje RLS-a na SVIM tabelama
-- =============================================================================
-- `force row level security` znači da politike važe i za vlasnika tabele.
-- Bez toga bi veza koja se poveže kao vlasnik šeme vidjela sve.
-- =============================================================================

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'profiles', 'organizations', 'organization_settings', 'organization_members', 'invitations',
    'customers', 'customer_contacts', 'locations', 'technicians', 'device_types', 'devices',
    'device_documents', 'qr_tokens', 'service_plan_templates', 'device_service_plans',
    'reminder_rules', 'reminder_campaigns', 'reminder_events', 'email_messages',
    'booking_settings', 'bookings', 'booking_tokens', 'issue_reports', 'issue_attachments',
    'rate_limits', 'checklist_templates', 'checklist_template_items', 'work_orders',
    'work_order_checklist_results', 'work_order_materials', 'work_order_attachments',
    'service_records', 'service_reports', 'report_tokens', 'document_counters',
    'import_jobs', 'import_mappings', 'import_rows', 'notification_events',
    'notification_preferences', 'plan_definitions', 'organization_subscriptions',
    'usage_counters', 'analytics_events', 'audit_events', 'cron_runs', 'schema_migrations'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('alter table public.%I force row level security', target_table);
  end loop;
end
$$;

-- =============================================================================
-- Politike
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — korisnik vidi sebe i članove svojih organizacija
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.user_id = public.profiles.id
        and m.status = 'active'
        and m.organization_id in (select app.current_org_ids())
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select app.current_org_ids()));

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (app.is_org_owner(id))
  with check (app.is_org_owner(id));

-- Kreiranje organizacije ide kroz serversku rutu koja odmah dodaje i vlasnika
-- u istoj transakciji. Direktan `insert` iz preglednika nije dopušten jer bi
-- ostavio organizaciju bez ijednog člana.
drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (app.is_org_owner(id));

-- -----------------------------------------------------------------------------
-- Generator politika za tabele koje imaju `organization_id`
-- -----------------------------------------------------------------------------
-- Većina tabela dijeli isti obrazac. Umjesto 40 puta ponovljenog SQL-a,
-- politike se generišu u petlji — manje mjesta za ljudsku grešku.
-- -----------------------------------------------------------------------------

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      -- (tabela, ko smije mijenjati)
      ('organization_settings',   'owner'),
      ('customers',               'staff'),
      ('customer_contacts',       'staff'),
      ('locations',               'staff'),
      ('device_types',            'staff'),
      ('devices',                 'staff'),
      ('device_documents',        'staff'),
      ('qr_tokens',               'staff'),
      ('service_plan_templates',  'staff'),
      ('device_service_plans',    'staff'),
      ('reminder_rules',          'staff'),
      ('booking_settings',        'staff'),
      ('bookings',                'staff'),
      ('issue_reports',           'staff'),
      ('checklist_templates',     'staff'),
      ('checklist_template_items','staff'),
      ('import_jobs',             'staff'),
      ('import_mappings',         'staff'),
      ('import_rows',             'staff'),
      ('invitations',             'owner'),
      ('technicians',             'owner')
    ) as t(table_name, write_role)
  loop
    -- Čitanje: svaki aktivan član organizacije.
    execute format('drop policy if exists %I on public.%I', spec.table_name || '_select', spec.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (app.is_org_member(organization_id))',
      spec.table_name || '_select', spec.table_name
    );

    -- Pisanje: vlasnik, ili vlasnik i dispečer.
    execute format('drop policy if exists %I on public.%I', spec.table_name || '_write', spec.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
      spec.table_name || '_write',
      spec.table_name,
      case spec.write_role
        when 'owner' then 'app.is_org_owner(organization_id)'
        else 'app.is_org_staff(organization_id)'
      end,
      case spec.write_role
        when 'owner' then 'app.is_org_owner(organization_id)'
        else 'app.is_org_staff(organization_id)'
      end
    );
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- organization_members — posebno, jer se tiče samog članstva
-- -----------------------------------------------------------------------------
drop policy if exists org_members_select on public.organization_members;
create policy org_members_select on public.organization_members
  for select to authenticated
  using (user_id = auth.uid() or app.is_org_member(organization_id));

drop policy if exists org_members_write on public.organization_members;
create policy org_members_write on public.organization_members
  for all to authenticated
  using (app.is_org_owner(organization_id))
  with check (app.is_org_owner(organization_id));

-- -----------------------------------------------------------------------------
-- Podsjetnici i e-pošta — čitanje svi članovi, pisanje samo server
-- -----------------------------------------------------------------------------
-- Događaje podsjetnika kreira i mijenja ISKLJUČIVO cron posao preko
-- `service_role`. Da klijent može mijenjati status, mogao bi lažno označiti
-- poruku kao poslanu i time pokvariti garanciju „tačno jednom“.
-- -----------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'reminder_campaigns', 'reminder_events', 'email_messages',
    'service_records', 'service_reports', 'usage_counters', 'audit_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (app.is_org_member(organization_id))',
      table_name || '_select', table_name
    );
  end loop;
end
$$;

-- `email_messages` može imati organization_id = NULL (npr. pozivnica prije
-- nego što je nalog kreiran). Takve poruke ne vidi niko osim servera.
drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages
  for select to authenticated
  using (organization_id is not null and app.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- Radni nalozi — tehničar vidi SAMO svoje
-- -----------------------------------------------------------------------------
drop policy if exists work_orders_select on public.work_orders;
create policy work_orders_select on public.work_orders
  for select to authenticated
  using (
    app.is_org_staff(organization_id)
    or (
      app.is_org_member(organization_id)
      and assigned_technician_id is not null
      and assigned_technician_id = app.current_technician_id(organization_id)
    )
  );

drop policy if exists work_orders_insert on public.work_orders;
create policy work_orders_insert on public.work_orders
  for insert to authenticated
  with check (app.is_org_staff(organization_id));

-- Tehničar smije mijenjati nalog koji mu je dodijeljen (unos rada, zatvaranje),
-- ali ne smije nalog preuzeti sebi ni dodijeliti drugome — zato `with check`
-- traži da dodjela ostane na njemu.
drop policy if exists work_orders_update on public.work_orders;
create policy work_orders_update on public.work_orders
  for update to authenticated
  using (
    app.is_org_staff(organization_id)
    or (
      app.is_org_member(organization_id)
      and assigned_technician_id = app.current_technician_id(organization_id)
    )
  )
  with check (
    app.is_org_staff(organization_id)
    or assigned_technician_id = app.current_technician_id(organization_id)
  );

drop policy if exists work_orders_delete on public.work_orders;
create policy work_orders_delete on public.work_orders
  for delete to authenticated
  using (app.is_org_staff(organization_id));

-- Djeca radnog naloga prate pristup roditelju.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'work_order_checklist_results', 'work_order_materials', 'work_order_attachments'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format($pol$
      create policy %I on public.%I for select to authenticated
      using (
        app.is_org_staff(organization_id)
        or (app.is_org_member(organization_id) and app.is_assigned_technician(work_order_id))
      )
    $pol$, table_name || '_select', table_name);

    execute format('drop policy if exists %I on public.%I', table_name || '_write', table_name);
    execute format($pol$
      create policy %I on public.%I for all to authenticated
      using (
        app.is_org_staff(organization_id)
        or (app.is_org_member(organization_id) and app.is_assigned_technician(work_order_id))
      )
      with check (
        app.is_org_staff(organization_id)
        or (app.is_org_member(organization_id) and app.is_assigned_technician(work_order_id))
      )
    $pol$, table_name || '_write', table_name);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Obavijesti
-- -----------------------------------------------------------------------------
drop policy if exists notifications_select on public.notification_events;
create policy notifications_select on public.notification_events
  for select to authenticated
  using (
    app.is_org_member(organization_id)
    and (user_id is null or user_id = auth.uid())
  );

-- Korisnik smije samo označiti obavijest kao pročitanu.
drop policy if exists notifications_update on public.notification_events;
create policy notifications_update on public.notification_events
  for update to authenticated
  using (app.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()))
  with check (app.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));

drop policy if exists notification_prefs_all on public.notification_preferences;
create policy notification_prefs_all on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid() and app.is_org_member(organization_id))
  with check (user_id = auth.uid() and app.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- Pretplata i planovi
-- -----------------------------------------------------------------------------
drop policy if exists org_subscriptions_select on public.organization_subscriptions;
create policy org_subscriptions_select on public.organization_subscriptions
  for select to authenticated
  using (app.is_org_member(organization_id));

-- Promjena pretplate ide isključivo preko servera (ručno postavljanje ili,
-- kasnije, webhook obrađivača plaćanja). Klijent je ne može mijenjati.

drop policy if exists plan_definitions_select on public.plan_definitions;
create policy plan_definitions_select on public.plan_definitions
  for select to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- Analitika — samo upis vlastitog događaja, bez čitanja tuđih
-- -----------------------------------------------------------------------------
drop policy if exists analytics_insert on public.analytics_events;
create policy analytics_insert on public.analytics_events
  for insert to authenticated
  with check (organization_id is null or app.is_org_member(organization_id));

drop policy if exists analytics_select on public.analytics_events;
create policy analytics_select on public.analytics_events
  for select to authenticated
  using (organization_id is not null and app.is_org_owner(organization_id));

-- -----------------------------------------------------------------------------
-- Tabele bez ikakvog pristupa za prijavljene korisnike
-- -----------------------------------------------------------------------------
-- Za ove tabele NE postoji nijedna politika. U PostgreSQL-u to znači da je
-- pristup potpuno onemogućen svima osim rolama koje zaobilaze RLS
-- (`service_role`). Tokeni, brojači i historija poslova time nikad ne mogu
-- procuriti kroz klijentski upit.
--
--   qr_tokens (samo select politika iznad), booking_tokens, report_tokens,
--   rate_limits, document_counters, cron_runs, schema_migrations,
--   issue_attachments
-- -----------------------------------------------------------------------------

-- Osoblje mora vidjeti privitke prijave kvara da bi moglo obraditi zahtjev.
drop policy if exists issue_attachments_select on public.issue_attachments;
create policy issue_attachments_select on public.issue_attachments
  for select to authenticated
  using (app.is_org_member(organization_id));

-- Tokeni: osoblje smije vidjeti da token postoji i kad je zadnji put korišten,
-- ali `token_hash` je beskoristan bez sirovog tokena, pa curenje nije moguće.
drop policy if exists booking_tokens_select on public.booking_tokens;
create policy booking_tokens_select on public.booking_tokens
  for select to authenticated
  using (app.is_org_staff(organization_id));

drop policy if exists report_tokens_select on public.report_tokens;
create policy report_tokens_select on public.report_tokens
  for select to authenticated
  using (app.is_org_staff(organization_id));

-- -----------------------------------------------------------------------------
-- Dozvole na nivou šeme
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- `anon` namjerno NEMA pristup nijednoj tabeli. Javne stranice uređaja idu
-- kroz serverske rute koje same provjeravaju token i biraju šta smiju vratiti.
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Nove tabele automatski dobijaju iste dozvole.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
