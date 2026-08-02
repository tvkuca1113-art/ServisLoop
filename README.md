# ServisLoop

> **Servis koji se vraća sam.**
> Automatski servisni podsjetnici, rezervacije i servisna historija za HVAC firme.

ServisLoop pretvara instaliranu opremu u ponovljeni servisni prihod. Sistem prati rok
servisa svakog uređaja, sam javlja kupcu prije isteka, prima rezervaciju bez otvaranja
naloga, vodi radni nalog, izdaje PDF izvještaj i odmah upisuje sljedeći rok — pa petlja
kreće ispočetka.

```
Ugrađen uređaj → rok servisa → automatski podsjetnik → kupac rezerviše
   → radni nalog → završen servis → PDF izvještaj → novi rok → (ponovo)
```

---

## Sadržaj

1. [Šta vam treba prije početka](#1-šta-vam-treba-prije-početka)
2. [Pokretanje lokalno — korak po korak](#2-pokretanje-lokalno--korak-po-korak)
3. [Sve naredbe](#3-sve-naredbe)
4. [Struktura projekta](#4-struktura-projekta)
5. [Kako radi motor podsjetnika](#5-kako-radi-motor-podsjetnika)
6. [Objavljivanje na internet](#6-objavljivanje-na-internet)
7. [Troškovi](#7-troškovi)
8. [Dokumentacija](#8-dokumentacija)
9. [Prije nego što naplatite prvom kupcu](#9-prije-nego-što-naplatite-prvom-kupcu)

---

## 1. Šta vam treba prije početka

| Stavka                       | Zašto                                      | Cijena                                       |
| ---------------------------- | ------------------------------------------ | -------------------------------------------- |
| **Node.js 20.11 ili noviji** | pokreće aplikaciju                         | besplatno — [nodejs.org](https://nodejs.org) |
| **Nalog na Supabase**        | baza podataka, prijava korisnika, datoteke | besplatan plan                               |
| **Nalog na Vercel**          | objavljivanje aplikacije na internet       | besplatan plan                               |
| **Nalog na Resend**          | slanje e-pošte kupcima                     | besplatan plan (3.000 poruka/mjesec)         |
| **Domena**                   | npr. `servisloop.ba`                       | ~30–60 KM godišnje                           |

**Ne treba vam:** Docker, vlastiti server, Redis, Kubernetes ni bilo šta što se
mora održavati. Sve radi na servisima koji se sami brinu o sebi.

Provjerite da imate Node:

```bash
node --version
```

Ako ispiše broj koji počinje s `v20`, `v22` ili više — spremni ste.

---

## 2. Pokretanje lokalno — korak po korak

### Korak 1: Preuzmite kod i instalirajte zavisnosti

```bash
git clone https://github.com/tvkuca1113-art/servisloop.git
cd servisloop
npm install
```

Instalacija traje 1–2 minute.

### Korak 2: Napravite datoteku s postavkama

```bash
cp .env.example .env.local
```

Otvorite `.env.local` u bilo kojem uređivaču teksta. U njoj su objašnjenja uz svaku
vrijednost. Za sada popunite samo ovo:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=<zalijepite ovdje rezultat naredbe ispod>
PUBLIC_TOKEN_SECRET=<zalijepite ovdje rezultat druge naredbe>
```

Tajne generišite ovako (svaku naredbu pokrenite posebno):

```bash
openssl rand -base64 32     # za CRON_SECRET
openssl rand -base64 48     # za PUBLIC_TOKEN_SECRET
```

> Ako nemate `openssl` (Windows bez Git Bash-a), koristite:
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```

### Korak 3: Povežite Supabase

Detaljno uputstvo sa slikama: **[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)**

Ukratko:

1. Otvorite [supabase.com](https://supabase.com) i napravite besplatan projekt.
2. Otvorite **Project Settings → API** i prepišite u `.env.local`:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` ključ → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` ključ → `SUPABASE_SERVICE_ROLE_KEY`
3. Otvorite **Project Settings → Database → Connection string → URI** i prepišite
   ga u `DATABASE_URL`. Zamijenite `[YOUR-PASSWORD]` lozinkom koju ste postavili
   pri kreiranju projekta.

> **Upozorenje:** `service_role` ključ zaobilazi sve sigurnosne provjere.
> Nikad ga ne dijelite, ne stavljajte u poruke i ne commitajte u git.

### Korak 4: Napravite tabele u bazi

```bash
npm run db:migrate
```

Ispis treba završiti s `Primijenjeno migracija: 10`.

### Korak 5: Ubacite demo podatke (preporučeno)

```bash
npm run db:seed
```

Dobijate izmišljenu firmu **TermoPlus Servis d.o.o.** sa 44 kupca, 126 uređaja,
60 obavljenih servisa, rezervacijama, prijavama kvara i podsjetnicima —
uključujući i nekoliko neuspjelih, da vidite kako sistem izgleda kad nešto pođe po zlu.

### Korak 6: Pokrenite aplikaciju

```bash
npm run dev
```

Otvorite [http://localhost:3000](http://localhost:3000).

- Marketing sajt: `http://localhost:3000`
- Prijava: `http://localhost:3000/prijava`
- Javna stranica uređaja (QR): `http://localhost:3000/u/demo`

### Korak 7: Napravite svoj nalog

Otvorite `/registracija` i upišite podatke svoje firme. Nalog se kreira odmah,
zajedno s vrstama opreme, servisnim planovima i pravilima podsjetnika.

---

## 3. Sve naredbe

### Svakodnevni rad

| Naredba         | Šta radi                                   |
| --------------- | ------------------------------------------ |
| `npm run dev`   | pokreće aplikaciju za razvoj na portu 3000 |
| `npm run build` | pravi produkcijsku verziju                 |
| `npm start`     | pokreće produkcijsku verziju lokalno       |

### Baza podataka

| Naredba                      | Šta radi                                        |
| ---------------------------- | ----------------------------------------------- |
| `npm run db:migrate`         | primjenjuje nove migracije                      |
| `npm run db:reset`           | **briše sve** i pravi bazu iznova               |
| `npm run db:seed`            | ubacuje demo podatke                            |
| `npm run db:seed -- --reset` | briše postojeće demo podatke pa ih pravi iznova |
| `npm run gen:types`          | osvježava TypeScript tipove iz šeme baze        |
| `npm run db:verify-rls`      | **provjerava da firme ne vide tuđe podatke**    |

### Provjera kvaliteta

| Naredba                    | Šta radi                                  |
| -------------------------- | ----------------------------------------- |
| `npm run typecheck`        | provjerava tipove                         |
| `npm run lint`             | provjerava stil i česte greške            |
| `npm test`                 | jedinični testovi (brzo, bez baze)        |
| `npm run test:integration` | testovi protiv stvarne baze               |
| `npm run test:all`         | oba skupa                                 |
| `npm run e2e`              | testovi kroz pravi preglednik             |
| `npm run verify`           | **sve odjednom — pokrenite prije objave** |

### Prije prve objave

```bash
npm run verify
npm run db:verify-rls
```

Obje naredbe moraju proći bez greške.

---

## 4. Struktura projekta

```
app/                        rute (Next.js App Router)
  (marketing)/              javni sajt — tamna tema
  (auth)/                   prijava i registracija
  app/                      aplikacija nakon prijave — svijetla tema
  u/[publicToken]/          javna stranica uređaja (QR kod)
  rezervacija/[token]/      rezervacija iz podsjetnika
  izvjestaj/[token]/        PDF servisni izvještaj
  api/cron/                 dnevni poslovi (Vercel Cron)

components/
  ui/                       osnovne komponente (dugme, polje, tabela…)
  marketing/                sekcije javnog sajta
  app/                      okvir aplikacije, navigacija, pretraga
  three/                    3D animacija na početnoj stranici
  emails/                   predlošci e-poruka

domains/                    ČISTA POSLOVNA LOGIKA — bez baze i mreže
  shared/plain-date.ts      datumi bez vremenske zone
  devices/                  rokovi servisa, garancija
  reminders/                kad koji podsjetnik ide
  bookings/                 slobodni termini
  auth/                     dozvole po ulogama
  billing/                  planovi i ograničenja
  analytics/                procjena prihoda

services/                   orkestracija: baza + logika + e-pošta
repositories/               pristup bazi
lib/                        infrastruktura (auth, e-pošta, QR, sigurnost…)
schemas/                    Zod sheme (dijele ih klijent i server)

supabase/
  migrations/               SQL migracije i RLS politike
  seed/                     demo podaci

tests/unit/                 brzi testovi bez baze
tests/integration/          testovi protiv stvarne baze
e2e/                        testovi kroz preglednik
docs/                       dokumentacija
scripts/                    alati (migracije, seed, provjera RLS-a)
```

**Pravilo koje drži sistem jednostavnim:**
komponenta nikad ne piše SQL, ruta nikad ne računa datume, a novac, rokovi i
dozvole žive isključivo u `domains/` — gdje imaju testove.

---

## 5. Kako radi motor podsjetnika

Ovo je srce proizvoda. Detaljno: **[`docs/REMINDER_ENGINE.md`](docs/REMINDER_ENGINE.md)**

Jednom dnevno Vercel pozove `/api/cron/podsjetnici`. Za svaku firmu sistem:

1. izračuna koji je danas datum **u vremenskoj zoni te firme**;
2. nađe uređaje kojima rok pada pod neko pravilo (30, 14, 3 dana prije, na dan roka);
3. preskoči one bez pristanka, bez ispravne adrese ili s već dogovorenim terminom;
4. upiše podsjetnik u bazu, pa tek onda pošalje poruku;
5. zapiše ishod — poslano, neuspjelo (s razlogom) ili preskočeno.

### Tri garancije

| Garancija                                    | Kako je osigurana                                                 |
| -------------------------------------------- | ----------------------------------------------------------------- |
| **Kupac nikad ne dobije istu poruku dvaput** | jedinstveni indeks `(uređaj, pravilo, rok)` u bazi — ne u kodu    |
| **Neuspjeh se nikad ne prikaže kao uspjeh**  | poruka ostaje `failed` s razlogom dok je čovjek ne riješi         |
| **Rezervacija zaustavlja niz**               | čim kupac rezerviše, preostali podsjetnici za taj rok se otkazuju |

Zbog toga je **potpuno bezopasno** pokrenuti posao dva puta, ručno ili greškom.

Provjerite sami:

```bash
npm run test:integration
```

---

## 6. Objavljivanje na internet

Detaljno: **[`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md)**

Ukratko:

1. Pošaljite kod na GitHub.
2. Na [vercel.com](https://vercel.com) uvezite repozitorij.
3. U **Settings → Environment Variables** unesite sve iz `.env.local`
   (osim `DATABASE_URL` i `TEST_DATABASE_URL` — oni trebaju samo lokalno).
4. Kliknite **Deploy**.
5. Cron se uključuje sam iz `vercel.json` — provjerite ga u **Settings → Cron Jobs**.

Migracije na produkcijsku bazu pokrenite jednom, lokalno:

```bash
DATABASE_URL="<produkcijski URL>" npm run db:migrate
```

---

## 7. Troškovi

Detaljna projekcija: **[`docs/COSTS.md`](docs/COSTS.md)**

| Faza                    | Mjesečno  |
| ----------------------- | --------- |
| Validacija (1–10 firmi) | **0–5 €** |
| 100 firmi               | ~45 €     |
| 1.000 firmi             | ~370 €    |

U fazi validacije praktično sve staje u besplatne planove. Jedini siguran trošak
je domena.

---

## 8. Dokumentacija

### Za osnivača (na bosanskom)

| Dokument                                                   | O čemu je                             |
| ---------------------------------------------------------- | ------------------------------------- |
| [`docs/ADMIN_GUIDE_BS.md`](docs/ADMIN_GUIDE_BS.md)         | vođenje sistema iz dana u dan         |
| [`docs/USER_GUIDE_BS.md`](docs/USER_GUIDE_BS.md)           | uputstvo za vaše zaposlene            |
| [`docs/IMPORT_GUIDE.md`](docs/IMPORT_GUIDE.md)             | prebacivanje postojeće baze iz Excela |
| [`docs/BACKUP_AND_RESTORE.md`](docs/BACKUP_AND_RESTORE.md) | sigurnosne kopije                     |
| [`docs/DATA_DELETION.md`](docs/DATA_DELETION.md)           | brisanje podataka na zahtjev          |

### Za postavljanje

| Dokument                                                 | O čemu je                |
| -------------------------------------------------------- | ------------------------ |
| [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)       | baza i prijava korisnika |
| [`docs/EMAIL_SETUP.md`](docs/EMAIL_SETUP.md)             | slanje e-pošte           |
| [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md) | objavljivanje i cron     |

### Za programera

| Dokument                                             | O čemu je                     |
| ---------------------------------------------------- | ----------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)       | kako je sistem složen i zašto |
| [`docs/DATABASE.md`](docs/DATABASE.md)               | tabele i odluke o šemi        |
| [`docs/SECURITY.md`](docs/SECURITY.md)               | sigurnosni model              |
| [`docs/REMINDER_ENGINE.md`](docs/REMINDER_ENGINE.md) | motor podsjetnika             |
| [`docs/TESTING.md`](docs/TESTING.md)                 | testovi                       |

### Prije komercijalnog rada

| Dokument                                                                     | O čemu je                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md)                     | **šta sistem NE radi**                       |
| [`docs/LEGAL_REVIEW_REQUIRED.md`](docs/LEGAL_REVIEW_REQUIRED.md)             | šta mora pregledati pravnik                  |
| [`docs/COMMERCIAL_LAUNCH_CHECKLIST.md`](docs/COMMERCIAL_LAUNCH_CHECKLIST.md) | lista prije naplate                          |
| [`docs/SMOKE_TEST.md`](docs/SMOKE_TEST.md)                                   | desetominutna provjera da sve radi           |
| [`docs/RISK_ASSUMPTIONS.md`](docs/RISK_ASSUMPTIONS.md)                       | pretpostavke koje treba provjeriti s kupcima |

---

## 9. Prije nego što naplatite prvom kupcu

Pročitajte ova tri dokumenta. Nisu dugi, ali su važni:

1. **[`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md)** — da ne obećate ono
   što sistem još ne radi.
2. **[`docs/LEGAL_REVIEW_REQUIRED.md`](docs/LEGAL_REVIEW_REQUIRED.md)** — ServisLoop
   primjenjuje tehničke mjere zaštite, ali **ne tvrdi** da je time zagarantovana pravna
   usklađenost s GDPR-om ni sa Zakonom o zaštiti ličnih podataka BiH.
3. **[`docs/COMMERCIAL_LAUNCH_CHECKLIST.md`](docs/COMMERCIAL_LAUNCH_CHECKLIST.md)** —
   konkretna lista koraka.

---

## Tehnologije

Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS v4 · Supabase (PostgreSQL,
Auth, Storage) · Zod · React Three Fiber · Resend · pdf-lib · ExcelJS · Vitest ·
Playwright · Vercel

## Licenca

Vlasnički kod. Sva prava zadržana.
