-- =============================================================================
-- 0008 — Zadane vrijednosti za novu organizaciju
-- =============================================================================
-- Nova firma mora moći raditi odmah nakon registracije, bez ijednog ručnog
-- podešavanja. Ova migracija donosi funkciju koja popunjava razumne početne
-- vrijednosti: vrste opreme, servisne planove, pravila podsjetnika, radno
-- vrijeme i čeklistu za klima uređaje.
-- =============================================================================

-- Definicije planova (ogledalo `domains/billing/plans.ts`).
insert into public.plan_definitions (code, name, tagline, monthly_price_km, trial_days, limits, features, is_public, sort_order)
values
  ('demo', 'Demo', 'Pogledajte kako sistem radi na pripremljenim podacima.', null, 0,
   '{"maxActiveDevices":200,"maxTechnicians":4,"maxTeamMembers":6,"maxImportRows":200,"maxMonthlyEmails":0}',
   '{"emailReminders":false,"qrPages":true,"qrLabelSheets":false,"workOrders":true,"pdfReports":true,"advancedReports":true,"customReminderTemplates":false,"dataExport":false,"multipleDispatchers":false,"aiAssist":false}',
   false, 0),

  ('trial', 'Probni period', '30 dana da provjerite vraća li vam se servis sam.', 0, 30,
   '{"maxActiveDevices":50,"maxTechnicians":1,"maxTeamMembers":3,"maxImportRows":500,"maxMonthlyEmails":300}',
   '{"emailReminders":true,"qrPages":true,"qrLabelSheets":false,"workOrders":true,"pdfReports":true,"advancedReports":false,"customReminderTemplates":false,"dataExport":false,"multipleDispatchers":false,"aiAssist":false}',
   true, 1),

  ('start', 'Start', 'Za firmu koja vodi servis za nekoliko stotina uređaja.', 59, 0,
   '{"maxActiveDevices":300,"maxTechnicians":2,"maxTeamMembers":5,"maxImportRows":2000,"maxMonthlyEmails":2000}',
   '{"emailReminders":true,"qrPages":true,"qrLabelSheets":true,"workOrders":true,"pdfReports":true,"advancedReports":false,"customReminderTemplates":false,"dataExport":true,"multipleDispatchers":false,"aiAssist":false}',
   true, 2),

  ('growth', 'Growth', 'Za firmu s više tehničara i redovnim ugovorima o održavanju.', 149, 0,
   '{"maxActiveDevices":1500,"maxTechnicians":5,"maxTeamMembers":12,"maxImportRows":10000,"maxMonthlyEmails":10000}',
   '{"emailReminders":true,"qrPages":true,"qrLabelSheets":true,"workOrders":true,"pdfReports":true,"advancedReports":true,"customReminderTemplates":true,"dataExport":true,"multipleDispatchers":false,"aiAssist":true}',
   true, 3),

  ('pro', 'Pro', 'Za servisne kuće s velikom instaliranom bazom.', 299, 0,
   '{"maxActiveDevices":5000,"maxTechnicians":15,"maxTeamMembers":30,"maxImportRows":25000,"maxMonthlyEmails":40000}',
   '{"emailReminders":true,"qrPages":true,"qrLabelSheets":true,"workOrders":true,"pdfReports":true,"advancedReports":true,"customReminderTemplates":true,"dataExport":true,"multipleDispatchers":true,"aiAssist":true}',
   true, 4)
on conflict (code) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  monthly_price_km = excluded.monthly_price_km,
  trial_days = excluded.trial_days,
  limits = excluded.limits,
  features = excluded.features,
  is_public = excluded.is_public,
  sort_order = excluded.sort_order,
  updated_at = now();

/**
 * Popunjava novu organizaciju zadanim vrijednostima.
 *
 * Pozvana je iz servisa za kreiranje organizacije, unutar iste transakcije.
 * Idempotentna je — ponovni poziv ništa ne duplira.
 */
create or replace function app.seed_organization_defaults(target_org uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ac_type_id uuid;
  heat_pump_type_id uuid;
  boiler_type_id uuid;
  ventilation_type_id uuid;
  fridge_type_id uuid;
  ac_checklist_id uuid;
begin
  -- --- Postavke ------------------------------------------------------------
  insert into public.organization_settings (organization_id)
  values (target_org)
  on conflict (organization_id) do nothing;

  insert into public.booking_settings (organization_id)
  values (target_org)
  on conflict (organization_id) do nothing;

  -- --- Pretplata: probni period od 30 dana --------------------------------
  insert into public.organization_subscriptions
    (organization_id, plan_code, status, trial_ends_on, current_period_start, current_period_end)
  values
    (target_org, 'trial', 'trialing', current_date + 30, current_date, current_date + 30)
  on conflict (organization_id) do nothing;

  -- --- Vrste opreme -------------------------------------------------------
  insert into public.device_types (organization_id, code, name, default_interval_months, sort_order)
  values
    (target_org, 'klima_uredaj',      'Klima uređaj',        12, 1),
    (target_org, 'toplotna_pumpa',    'Toplotna pumpa',      12, 2),
    (target_org, 'kotao',             'Kotao',               12, 3),
    (target_org, 'ventilaciona_jedinica', 'Ventilaciona jedinica', 6, 4),
    (target_org, 'rashladni_uredaj',  'Rashladni uređaj',     6, 5),
    (target_org, 'solarni_inverter',  'Solarni inverter',    24, 6),
    (target_org, 'druga_oprema',      'Druga oprema',        12, 7)
  on conflict (organization_id, code) do nothing;

  select id into ac_type_id from public.device_types
    where organization_id = target_org and code = 'klima_uredaj';
  select id into heat_pump_type_id from public.device_types
    where organization_id = target_org and code = 'toplotna_pumpa';
  select id into boiler_type_id from public.device_types
    where organization_id = target_org and code = 'kotao';
  select id into ventilation_type_id from public.device_types
    where organization_id = target_org and code = 'ventilaciona_jedinica';
  select id into fridge_type_id from public.device_types
    where organization_id = target_org and code = 'rashladni_uredaj';

  -- --- Servisni planovi ---------------------------------------------------
  if not exists (select 1 from public.service_plan_templates where organization_id = target_org) then
    insert into public.service_plan_templates
      (organization_id, device_type_id, name, interval_months, price, estimated_minutes, is_default)
    values
      (target_org, ac_type_id,          'Godišnji servis klime',        12, 70,  60, true),
      (target_org, heat_pump_type_id,   'Godišnji servis toplotne pumpe', 12, 180, 120, true),
      (target_org, boiler_type_id,      'Godišnji servis kotla',        12, 95,  90, true),
      (target_org, ventilation_type_id, 'Polugodišnji servis ventilacije', 6, 120, 90, true),
      (target_org, fridge_type_id,      'Polugodišnji servis rashladne opreme', 6, 140, 90, true);
  end if;

  -- --- Pravila podsjetnika ------------------------------------------------
  if not exists (select 1 from public.reminder_rules where organization_id = target_org) then
    insert into public.reminder_rules
      (organization_id, name, offset_days, template_key, sort_order, is_active)
    values
      (target_org, '30 dana prije servisa', -30, 'service_reminder',       1, true),
      (target_org, '14 dana prije servisa', -14, 'service_reminder',       2, true),
      (target_org, '3 dana prije servisa',   -3, 'service_reminder_final', 3, true),
      (target_org, 'Na dan servisa',          0, 'service_reminder_final', 4, true),
      -- Podsjetnik za kašnjenje je isključen dok ga firma svjesno ne uključi.
      (target_org, '14 dana nakon roka',     14, 'service_overdue',        5, false);
  end if;

  -- --- Čeklista za klima uređaje -----------------------------------------
  if not exists (select 1 from public.checklist_templates where organization_id = target_org) then
    insert into public.checklist_templates (organization_id, device_type_id, name, description, is_default)
    values (target_org, ac_type_id, 'Redovni servis klima uređaja',
            'Standardni obim radova pri godišnjem servisu split klima uređaja.', true)
    returning id into ac_checklist_id;

    insert into public.checklist_template_items
      (organization_id, template_id, label, item_type, unit, is_required, sort_order, help_text)
    values
      (target_org, ac_checklist_id, 'Vizuelni pregled unutrašnje i vanjske jedinice', 'checkbox', null, true, 1, null),
      (target_org, ac_checklist_id, 'Čišćenje filtera',                    'checkbox',  null, true,  2, null),
      (target_org, ac_checklist_id, 'Pregled isparivača',                  'pass_fail', null, true,  3, null),
      (target_org, ac_checklist_id, 'Pregled kondenzatora',                'pass_fail', null, true,  4, null),
      (target_org, ac_checklist_id, 'Provjera odvoda kondenzata',          'pass_fail', null, true,  5,
       'Začepljen odvod je najčešći uzrok curenja vode iz unutrašnje jedinice.'),
      (target_org, ac_checklist_id, 'Provjera električnih spojeva',        'pass_fail', null, true,  6, null),
      (target_org, ac_checklist_id, 'Temperatura na izlazu',               'number',    '°C',  true,  7,
       'Izmjeriti nakon 10 minuta rada u režimu hlađenja.'),
      (target_org, ac_checklist_id, 'Provjera neuobičajenih zvukova',      'pass_fail', null, true,  8, null),
      (target_org, ac_checklist_id, 'Napomena o rashladnom sredstvu',      'short_text', null, false, 9,
       'Upisati samo zapažanje. Dopuna se evidentira kao zaseban zahvat.'),
      (target_org, ac_checklist_id, 'Završni test rada',                   'checkbox',  null, true, 10, null),
      (target_org, ac_checklist_id, 'Fotografija nakon servisa',           'photo',     null, false, 11, null),
      (target_org, ac_checklist_id, 'Upute date korisniku',                'checkbox',  null, false, 12, null);
  end if;
end;
$$;

comment on function app.seed_organization_defaults(uuid) is
  'Popunjava novu organizaciju zadanim vrstama opreme, planovima, podsjetnicima i čeklistom. Idempotentna.';
