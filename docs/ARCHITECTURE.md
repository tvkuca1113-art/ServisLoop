# Arhitektura

---

## 1. Oblik sistema

**Modularni monolit.** Jedna Next.js aplikacija, jedna PostgreSQL baza,
bez mikroservisa i bez reda čekanja.

Zašto: osnivač bez programerskog iskustva mora moći razumjeti i održavati
sistem. Pet servisa koji komuniciraju preko reda čekanja je pet mjesta koja
mogu pasti i pet stvari koje treba nadzirati. Jedna aplikacija ima jedan log,
jedan deploy i jedno mjesto za grešku.

```
                         ┌──────────────────────────┐
      preglednik  ─────► │   Next.js na Vercelu     │
                         │  ┌────────────────────┐  │
                         │  │ server komponente  │  │
                         │  │ serverske akcije   │  │
                         │  │ rute (API)         │  │
                         │  └─────────┬──────────┘  │
                         └────────────┼─────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              ┌──────────┐     ┌────────────┐    ┌───────────┐
              │ Supabase │     │   Resend   │    │  Vercel   │
              │ Postgres │     │  e-pošta   │    │   Cron    │
              │ Auth     │     └────────────┘    └───────────┘
              │ Storage  │
              └──────────┘
```

---

## 2. Slojevi

```
app/            rute — koje stranice postoje
components/     izgled — bez poslovne logike
services/       orkestracija — transakcije, e-pošta, propagacija
domains/        poslovna logika — čista, bez I/O, potpuno testabilna
repositories/   pristup bazi — jedini sloj koji zna za SQL
lib/            infrastruktura — auth, mail, PDF, QR, sigurnost
schemas/        Zod sheme — dijele ih klijent i server
```

### Pravila koja drže sistem jednostavnim

| Pravilo                                       | Zašto                                                    |
| --------------------------------------------- | -------------------------------------------------------- |
| Komponenta ne piše SQL                        | inače se upiti raspu po cijelom kodu                     |
| Ruta ne računa datume                         | inače se ista logika pojavi na pet mjesta, s pet grešaka |
| `domains/` ne dodiruje mrežu                  | inače se ne može testirati bez baze                      |
| Novac, rokovi i dozvole žive u `domains/`     | tamo imaju testove                                       |
| `organization_id` nikad ne dolazi od klijenta | osnovno sigurnosno pravilo                               |

Prvo pravilo je i mehanički osigurano — ESLint zabranjuje uvoz iz
`repositories/` u komponente.

---

## 3. Zašto `domains/` postoji odvojeno

Ovo je najvažnija arhitektonska odluka u projektu.

Cijela logika koja odlučuje **kada ide podsjetnik**, **koji je sljedeći rok**,
**koji su termini slobodni** i **ko šta smije** napisana je kao čiste funkcije
bez pristupa bazi i mreži.

```ts
// domains/reminders/schedule.ts
export function planRemindersForDay(input: {
  today: PlainDate
  rules: readonly ReminderRule[]
  candidates: readonly ReminderCandidate[]
  existingKeys: ReadonlySet<string>
}): PlanningResult
```

Posljedice:

- **154 jedinična testa** rade za 2 sekunde, bez baze;
- ponašanje motora podsjetnika može se dokazati bez pokretanja ičega;
- greška u SQL upitu ne može tiho promijeniti poslovno pravilo;
- pravilo se čita kao tekst, a ne kao rekonstrukcija iz upita.

Servis samo dovuče podatke, pozove čistu funkciju i upiše rezultat.

---

## 4. Datumi

Najčešći uzrok grešaka u ovakvim sistemima. Riješeno strogo:

| Pojam                     | Tip                          | Zašto                  |
| ------------------------- | ---------------------------- | ---------------------- |
| Rok servisa               | `PlainDate` (`'2027-03-15'`) | izjava o **kalendaru** |
| Datum ugradnje, garancija | `PlainDate`                  | isto                   |
| Termin rezervacije        | `timestamptz`                | izjava o **trenutku**  |
| Vrijeme slanja poruke     | `timestamptz`                | isto                   |

„Sljedeći servis 15.03.2027.“ ne smije se pomjeriti zato što server radi u
drugoj zoni. Zato je to string, ne `Date`.

Zona ulazi u igru na **tačno jednom mjestu**:

```ts
const today = todayInTimeZone(organization.timezone, now)
```

Testovi se pokreću s procesnom zonom namjerno postavljenom na
`America/Los_Angeles`. Ako se igdje potkrade oslanjanje na zonu servera,
test odmah padne.

---

## 5. Pristup podacima

Tri klijenta, tri namjene:

| Klijent                   | Gdje       | RLS              | Kada                             |
| ------------------------- | ---------- | ---------------- | -------------------------------- |
| `createClient()`          | preglednik | ✅ aktivan       | interaktivne komponente          |
| `createServerSupabase()`  | server     | ✅ aktivan       | **sve što pripada organizaciji** |
| `createServiceSupabase()` | server     | ❌ **zaobilazi** | cron, javni QR, admin, seed      |

Servisni klijent se koristi samo tamo gdje prijavljenog korisnika nema, a
pristup je ipak legitiman. **Svaka takva ruta mora sama dokazati ovlaštenje**
prije prvog upita — i u kodu ima komentar koji objašnjava kako.

---

## 6. Sigurnost u tri sloja

```
1. Sučelje    skriva ono što korisnik ne smije     (udobnost)
2. Server     provjerava prije radnje              (kontrola)
3. Baza (RLS) odbija red bez obzira na sve         (garancija)
```

Detaljno: [`SECURITY.md`](SECURITY.md). Dokaz da radi:
`npm run db:verify-rls` → 32/32.

---

## 7. Garancije u bazi, ne u kodu

Pravila koja **moraju** vrijediti implementirana su kao ograničenja u
PostgreSQL-u. Aplikacijska logika može imati grešku; jedinstveni indeks ne može.

| Pravilo                                | Mehanizam                                              |
| -------------------------------------- | ------------------------------------------------------ |
| Kupac ne dobija isti podsjetnik dvaput | `unique (device_id, rule_id, due_date)`                |
| Dva kupca ne mogu uzeti isti termin    | `unique (organization_id, starts_at, slot_index)`      |
| Tehničar nije na dva mjesta odjednom   | `unique (assigned_technician_id, starts_at)`           |
| Posao se ne pokreće dvaput dnevno      | `unique (job, run_date)`                               |
| Organizacija ne ostaje bez vlasnika    | okidač `app.enforce_last_owner`                        |
| Poslana poruka ima vrijeme slanja      | `check (status <> 'sent' or sent_at is not null)`      |
| Neuspjela poruka ima razlog            | `check (status <> 'failed' or last_error is not null)` |
| Broj dokumenta je jedinstven           | `app.next_document_number()` — atomarni upsert         |

Provjera: `npm run test:integration` (20 testova).

---

## 8. Rasporedni poslovi

Bez Redisa i bez reda čekanja. Vercel Cron poziva HTTP rutu:

```
06:00 UTC  →  /api/cron/podsjetnici    (slanje podsjetnika)
02:30 UTC  →  /api/cron/odrzavanje     (čišćenje, obavijesti)
```

Zaštita: `Authorization: Bearer <CRON_SECRET>`, poređenje `timingSafeEqual`.

Idempotentnost: opisana u [`REMINDER_ENGINE.md`](REMINDER_ENGINE.md).

**Kad ovo prestane biti dovoljno:** iznad ~400 organizacija posao bi trebalo
podijeliti na više poziva. Do tada je jednostavnost vrednija od skalabilnosti
koja se ne koristi.

---

## 9. Odluke i njihovi kompromisi

| Odluka                      | Dobili smo                        | Izgubili smo                                        |
| --------------------------- | --------------------------------- | --------------------------------------------------- |
| Monolit                     | jednostavnost, jedan deploy       | horizontalno skaliranje po dijelovima               |
| RLS kao glavna zaštita      | sigurnost i kad kod pogriješi     | politike su teže za otklanjanje grešaka             |
| `PlainDate` kao string      | nema grešaka sa zonama            | ne može se koristiti `Date` aritmetika direktno     |
| Bez reda čekanja            | nema infrastrukture za održavanje | dugi poslovi traže dijeljenje                       |
| Čiste domenske funkcije     | brzi testovi, čitljiva pravila    | malo više koda za prenos podataka                   |
| Generisani tipovi baze      | tipovi uvijek odgovaraju šemi     | treba pokrenuti `npm run gen:types` nakon migracije |
| Vlastiti pokretač migracija | bez Dockera                       | bez Supabase CLI pogodnosti                         |
| 3D hero                     | jak prvi dojam                    | ~150 kB dodatnog JS-a, učitan odvojeno              |

---

## 10. Šta bi trebalo promijeniti kad sistem naraste

| Prag                             | Šta promijeniti                                         |
| -------------------------------- | ------------------------------------------------------- |
| ~400 organizacija                | podijeliti cron posao na više poziva                    |
| ~50 zahtjeva/s na javnim formama | prebaciti ograničavanje pristupa s tabele na Redis      |
| ~10.000 uređaja po firmi         | dodati particionisanje `reminder_events` po godini      |
| velike datoteke za uvoz          | uvesti pravi red čekanja (npr. Supabase Edge Functions) |
| više zemalja                     | prevesti sučelje (trenutno samo bosanski)               |

Nijedna od ovih promjena ne traži prepisivanje sistema — samo zamjenu jednog
dijela.
