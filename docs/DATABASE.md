# Baza podataka

PostgreSQL 15+ (Supabase). **46 tabela**, 10 migracija.

---

## 1. Migracije

```bash
npm run db:migrate      # primijeni nove
npm run db:reset        # obriši sve i primijeni iznova (SAMO razvoj)
npm run gen:types       # osvježi TypeScript tipove iz šeme
```

Svaka migracija ide u vlastitoj transakciji — ili prođe cijela ili ništa.
Primijenjene se pamte u `schema_migrations`, s kontrolnom sumom koja upozorava
ako je već primijenjena migracija naknadno izmijenjena.

**Migracija koja je jednom objavljena ne mijenja se.** Ispravka ide kao nova
migracija (vidi `0010_owner_guard_fix.sql` kao primjer).

---

## 2. Grupe tabela

| Grupa            | Tabele                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identitet        | `profiles`, `organizations`, `organization_settings`, `organization_members`, `invitations`                                                                                           |
| Baza kupaca      | `customers`, `customer_contacts`, `locations`, `technicians`                                                                                                                          |
| Oprema           | `device_types`, `devices`, `device_documents`, `qr_tokens`                                                                                                                            |
| Servisna pravila | `service_plan_templates`, `device_service_plans`                                                                                                                                      |
| Podsjetnici      | `reminder_rules`, `reminder_campaigns`, `reminder_events`, `email_messages`                                                                                                           |
| Rezervacije      | `booking_settings`, `bookings`, `booking_tokens`                                                                                                                                      |
| Prijave kvara    | `issue_reports`, `issue_attachments`                                                                                                                                                  |
| Rad na terenu    | `checklist_templates`, `checklist_template_items`, `work_orders`, `work_order_checklist_results`, `work_order_materials`, `work_order_attachments`                                    |
| Izvještaji       | `service_records`, `service_reports`, `report_tokens`, `document_counters`                                                                                                            |
| Uvoz             | `import_jobs`, `import_mappings`, `import_rows`                                                                                                                                       |
| Platforma        | `notification_events`, `notification_preferences`, `plan_definitions`, `organization_subscriptions`, `usage_counters`, `analytics_events`, `audit_events`, `cron_runs`, `rate_limits` |

---

## 3. Ključne odluke

### 3.1 `organization_id` na svakoj tenant tabeli

Čak i tamo gdje bi se mogao izvesti preko roditelja (npr.
`work_order_materials` → `work_orders` → organizacija).

**Zašto:** RLS politika tada je jednostavna i brza (`app.is_org_member(organization_id)`)
umjesto spajanja kroz dvije tabele pri svakom redu. Mala redundansa u zamjenu
za sigurnost koja se lako čita i provjerava.

### 3.2 Rokovi su `date`, termini su `timestamptz`

| Kolona                      | Tip           | Zašto                               |
| --------------------------- | ------------- | ----------------------------------- |
| `devices.next_service_date` | `date`        | „15.03.2027.“ je izjava o kalendaru |
| `bookings.starts_at`        | `timestamptz` | „09:00 po sarajevskom“ je trenutak  |

Da je rok `timestamptz`, isti zapis bi u Sarajevu bio 15. marta, a u Los
Angelesu 14. marta.

### 3.3 Meko brisanje samo tamo gdje je opravdano

`deleted_at` imaju: `organizations`, `customers`, `locations`, `devices`.

**Zašto baš te:** obrisan uređaj i dalje mora biti povezan sa servisnom
historijom. Izvještaj koji je kupac dobio mora ostati tačan.

Ostale tabele se brišu trajno.

### 3.4 Generisane kolone za pretragu

```sql
search_text text generated always as (
  app.normalize_search(coalesce(name,'') || ' ' || coalesce(company_name,'') || …)
) stored
```

Uz `gin_trgm_ops` indeks daje brzu pretragu bez razlike u dijakritici —
„Hodžić“ i „hodzic“ daju isti rezultat. Održava je baza, ne aplikacija.

### 3.5 Djelimični indeksi

```sql
create unique index uq_bookings_slot
  on public.bookings (organization_id, starts_at, slot_index)
  where status in ('pending', 'confirmed', 'rescheduled');
```

Uslov `where` znači da otkazana rezervacija oslobađa termin, bez ijedne linije
aplikacijskog koda.

---

## 4. Kritična ograničenja

| Ograničenje                           | Tabela               | Šta garantuje                             |
| ------------------------------------- | -------------------- | ----------------------------------------- |
| `uq_reminder_events_dedupe`           | `reminder_events`    | kupac ne dobija isti podsjetnik dvaput    |
| `uq_bookings_slot`                    | `bookings`           | dva kupca ne uzimaju isti termin          |
| `uq_bookings_technician_slot`         | `bookings`           | tehničar nije na dva mjesta               |
| `uq_cron_runs`                        | `cron_runs`          | posao se ne pokreće dvaput dnevno         |
| `uq_reminder_campaigns_run`           | `reminder_campaigns` | jedna kampanja po firmi po danu           |
| `uq_devices_serial`                   | `devices`            | serijski broj jedinstven **unutar firme** |
| `reminder_events_sent_needs_time`     | `reminder_events`    | „poslano“ ima vrijeme slanja              |
| `reminder_events_failed_needs_reason` | `reminder_events`    | „neuspjelo“ ima razlog                    |
| `work_orders_completed_needs_time`    | `work_orders`        | završen nalog ima vrijeme završetka       |
| `service_reports_ready_needs_file`    | `service_reports`    | „spreman“ izvještaj ima PDF               |

Svako od njih ima test u `tests/integration/guarantees.test.ts`.

---

## 5. Funkcije u šemi `app`

| Funkcija                           | Namjena                                     |
| ---------------------------------- | ------------------------------------------- |
| `touch_updated_at()`               | okidač koji održava `updated_at`            |
| `hash_token(text)`                 | SHA-256 heš javnog tokena                   |
| `normalize_search(text)`           | mala slova bez dijakritike                  |
| `normalize_phone(text)`            | samo cifre i vodeći plus                    |
| `current_org_ids()`                | organizacije trenutnog korisnika            |
| `is_org_member(uuid)`              | je li član                                  |
| `has_org_role(uuid, text[])`       | ima li ulogu                                |
| `is_org_staff(uuid)`               | vlasnik ili dispečer                        |
| `is_org_owner(uuid)`               | vlasnik                                     |
| `current_technician_id(uuid)`      | zapis tehničara za korisnika                |
| `is_assigned_technician(uuid)`     | je li nalog njegov                          |
| `enforce_last_owner()`             | okidač: organizacija ne ostaje bez vlasnika |
| `recalculate_materials_total()`    | okidač: zbir materijala na nalogu           |
| `next_document_number(...)`        | atomarni redni broj dokumenta               |
| `bump_usage(...)`                  | atomarno povećanje mjesečnog brojača        |
| `seed_organization_defaults(uuid)` | početne vrijednosti nove firme              |

Sve funkcije za provjeru pripadnosti su `security definer` sa
`set search_path = ''`.

---

## 6. Indeksi koji najviše znače

```sql
-- Dnevni posao podsjetnika. Bez ovoga bi svaki dan išao pun sken.
create index idx_devices_next_service
  on devices (organization_id, next_service_date)
  where deleted_at is null and status = 'active' and reminders_enabled;

-- Pretraga bez dijakritike.
create index idx_customers_search on customers using gin (search_text gin_trgm_ops);
create index idx_devices_search   on devices   using gin (search_text gin_trgm_ops);

-- Redovi čekanja na početnoj stranici.
create index idx_reminder_events_failed
  on reminder_events (organization_id, failed_at desc) where status = 'failed';
create index idx_bookings_unassigned
  on bookings (organization_id, starts_at)
  where assigned_technician_id is null and status in ('pending','confirmed');
```

---

## 7. Tipovi u TypeScriptu

**Ne pišu se ručno.** Generišu se iz stvarne šeme:

```bash
npm run gen:types
```

Skript čita `information_schema` i piše `types/supabase.ts` (46 tabela,
646 kolona). Pokrenite ga nakon svake migracije.

---

## 8. Održavanje

```bash
# Ručna sigurnosna kopija
pg_dump "$DATABASE_URL" -Fc -f servisloop-$(date +%Y%m%d).dump

# Veličina tabela
psql "$DATABASE_URL" -c "
  select relname,
         pg_size_pretty(pg_total_relation_size(relid)) as velicina
  from pg_stat_user_tables
  where schemaname = 'public'
  order by pg_total_relation_size(relid) desc
  limit 15;"

# Neiskorišteni indeksi (nakon nekoliko sedmica rada)
psql "$DATABASE_URL" -c "
  select relname, indexrelname, idx_scan
  from pg_stat_user_indexes
  where idx_scan = 0 and schemaname = 'public'
  order by relname;"
```

Vidi i [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).
