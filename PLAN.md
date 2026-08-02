# ServisLoop — Plan izgradnje

> **Proizvod:** ServisLoop — _Servis koji se vraća sam._
> **Cilj:** SaaS platforma koja instaliranu opremu pretvara u ponovljeni servisni prihod.
> **Tržište 1:** Bosna i Hercegovina, HVAC firme (klima, toplotne pumpe, kotlovi, ventilacija, rashladna oprema).

---

## 1. Jedan tok koji definiše proizvod

```
Ugrađen uređaj
   → pohranjen rok servisa
      → automatski podsjetnik
         → kupac rezerviše (bez naloga)
            → radni nalog
               → završen servis
                  → PDF izvještaj
                     → novi rok servisa
                        → (petlja se ponavlja)
```

Sve ostalo u proizvodu postoji samo da bi ovaj tok radio pouzdano. Funkcija koja
ne služi ovoj petlji ne ulazi u MVP.

---

## 2. Arhitektonske odluke (i zašto)

| Odluka             | Izbor                                                                                                                                            | Obrazloženje                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Aplikacijski okvir | Next.js 16 (App Router), React 19, TypeScript strict                                                                                             | Jedan repozitorij, server komponente, deploy bez servera na Vercelu.                                             |
| Stil               | Tailwind CSS v4 + vlastiti sistem komponenti nad Radix primitivama                                                                               | Tokeni u CSS-u (`@theme`), pristupačne primitive, bez teškog UI framework-a.                                     |
| Baza               | Supabase PostgreSQL                                                                                                                              | Managed Postgres + Auth + Storage u jednom, besplatan tier pokriva validaciju.                                   |
| Autorizacija       | RLS u bazi **+** provjera na serveru                                                                                                             | Dvostruka odbrana. UI sakrivanje nikad nije jedina kontrola.                                                     |
| Pristup podacima   | `@supabase/ssr` (korisnički klijent, RLS aktivan) za tenant podatke; service-role klijent samo u serverskim rutama za javne tokene, cron i admin | Klijent nikad ne vidi service-role ključ.                                                                        |
| Validacija         | Zod v4 na svakoj granici (forme, server akcije, rute, env, AI izlaz)                                                                             | Jedan izvor istine za tipove i runtime provjeru.                                                                 |
| Datumi             | `date-fns` + `date-fns-tz`, sve deterministički na serveru                                                                                       | Rokovi servisa i podsjetnici nikad ne smiju ovisiti o vremenskoj zoni pretraživača.                              |
| Vremenska zona     | Pohranjena po organizaciji, default `Europe/Sarajevo`                                                                                            | Cron radi u 03:00 lokalno po organizaciji.                                                                       |
| E-pošta            | Resend + React Email, iza `EmailProvider` interfejsa                                                                                             | Jeftino, a interfejs omogućava SMS/Viber kasnije bez prepravke logike podsjetnika.                               |
| PDF                | `pdf-lib` + `@pdf-lib/fontkit` + ugrađeni DejaVu Sans                                                                                            | Radi u Node runtime-u na Vercelu, bez headless preglednika. Podržava č ć ž š đ.                                  |
| XLSX               | `exceljs`                                                                                                                                        | Održavan, dostupan na npm-u. (SheetJS `xlsx@0.18.5` na npm-u ima poznat CVE — vidi `docs/KNOWN_LIMITATIONS.md`.) |
| CSV                | Vlastiti parser (`lib/imports/csv.ts`)                                                                                                           | Potpuna kontrola nad `;` vs `,`, BOM-om, navodnicima i decimalnim zarezom. Manje ovisnosti.                      |
| QR                 | `qrcode` (čisti JS)                                                                                                                              | Server-side SVG/PNG, bez native ovisnosti.                                                                       |
| 3D                 | React Three Fiber + Drei, dinamički učitan                                                                                                       | Proceduralna geometrija — nula vanjskih modela, nula problema s licencama.                                       |
| Raspored poslova   | Vercel Cron → `/api/cron/*` sa `CRON_SECRET`                                                                                                     | Bez Redisa, bez reda čekanja, bez vlastitog servera.                                                             |
| Idempotentnost     | `UNIQUE` ključ deduplikacije u `reminder_events`                                                                                                 | Baza, ne aplikacija, garantuje "tačno jednom".                                                                   |

### Šta namjerno **ne** radimo u MVP-u

Bez Dockera, Kubernetesa, Redisa, mikroservisa, reda čekanja, optimizacije ruta,
sinhronizacije vanjskih kalendara, naplate kartica, dinamičkog cjenovnika i
native mobilne aplikacije. Svaka od ovih stavki dodaje trošak ili operativni
teret koji validacija s ~300 € ne podnosi.

---

## 3. Slojevi koda

```
app/                 rute (server komponente po defaultu)
  (marketing)/       javni sajt
  (auth)/            prijava / registracija
  app/               autentificirana aplikacija
  u/[publicToken]/   javna stranica uređaja (QR)
  api/               rute: cron, javne forme, preuzimanja
components/          UI — bez poslovne logike
domains/             čista domenska logika, bez I/O, potpuno testabilna
services/            orkestracija: transakcije, autorizacija, propagacija
repositories/        pristup bazi, jedini sloj koji zna za SQL/Supabase
lib/                 infrastruktura (auth, mail, pdf, qr, csv, rate-limit …)
schemas/             Zod sheme, dijeljene između klijenta i servera
supabase/migrations/ SQL migracije i RLS politike
```

**Pravilo:** komponenta nikad ne poziva repozitorij. Ruta nikad ne piše SQL.
Domenska funkcija nikad ne dodiruje mrežu. Novac, datumi, dozvole i dostupnost
termina računaju se isključivo u `domains/` ili `services/`, nikad u JSX-u.

---

## 4. Milestones

| Faza | Isporuka                                                                 | Kriterij prolaza                                                |
| ---- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1    | Temelj: konfiguracija, dizajn tokeni, UI sistem, marketing sajt, 3D hero | `typecheck` + `lint` + `build` prolaze; hero radi i bez WebGL-a |
| 2    | Baza: 43 tabele, RLS, auth, organizacije, članstva, pozivnice            | `db:migrate` + `db:verify-rls` prolaze na stvarnom Postgresu    |
| 3    | Kupci, lokacije, uređaji, CSV/XLSX uvoz, QR                              | Uvoz 500 redova s mapiranjem i izvještajem o greškama           |
| 4    | Javni tok: stranica uređaja, prijava kvara, rezervacija                  | Rate-limit i validacija tokena testirani                        |
| 5    | Motor podsjetnika: pravila, cron, e-pošta, deduplikacija                 | Dvostruko pokretanje crona šalje tačno jednu poruku             |
| 6    | Radni nalozi, čeklisti, materijali, potpisi, mobilni tok                 | Tehničar završava nalog na telefonu                             |
| 7    | Servisni zapisi, PDF izvještaj, sljedeći ciklus                          | PDF ima ispravne č/ć/ž/š/đ i QR                                 |
| 8    | Planovi, ograničenja, analitika, admin operativna stranica               | Limit uređaja blokira prekoračenje                              |
| 9    | Testovi, sigurnost, pristupačnost, performanse, dokumentacija            | Cijeli `verify` + Playwright prolaze                            |

---

## 5. Rizici i kako ih rješavamo

| Rizik                                | Ozbiljnost                               | Mjera                                                                                                         |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Cron pošalje duple podsjetnike       | Visoka — direktno šteti povjerenju kupca | `UNIQUE (device_id, rule_id, due_date, offset_days)` u bazi + status mašina `pending → sending → sent/failed` |
| Curenje podataka između organizacija | Kritična                                 | RLS na svakoj tenant tabeli + `scripts/verify-rls.ts` koji stvarno pokušava probiti izolaciju                 |
| Javni QR token pogađan               | Visoka                                   | 32-bajtni token iz `crypto.randomBytes`, SHA-256 pohrana, rotacija, mogućnost gašenja                         |
| Dupla rezervacija istog termina      | Visoka                                   | `UNIQUE` indeks nad (organizacija, početak, tehničar) + provjera unutar transakcije                           |
| Pogrešan datum zbog vremenske zone   | Visoka                                   | Svi rokovi su `date` (bez vremena); pretvorba u zonu organizacije samo pri slanju                             |
| Uvoz tiho odbaci redove              | Srednja                                  | Svaki red dobija zapis u `import_rows` sa statusom i razlogom; odbijeni redovi se preuzimaju kao CSV          |
| Formula injection u CSV izvozu       | Srednja                                  | Prefiks `'` za ćelije koje počinju s `= + - @ TAB CR`                                                         |
| 3D hero ubije Core Web Vitals        | Srednja                                  | Dinamički import, SVG fallback, pauza van viewporta, `prefers-reduced-motion`, mobilna scena                  |
| Resend nedostupan                    | Srednja                                  | Podsjetnik ostaje `failed` s razlogom i brojem pokušaja; nikad se ne označava kao poslan                      |
| Osnivač ne razumije sistem           | Visoka — proizvod bez korisnika          | Dokumentacija na bosanskom, admin stranica sa svim neuspjelim poslovima, demo podaci                          |

---

## 6. Budžet validacije (~300 €)

| Stavka                  | Trošak/mj  | Napomena                                                |
| ----------------------- | ---------- | ------------------------------------------------------- |
| Vercel Hobby            | 0 €        | Dovoljno za validaciju; Pro (20 $) tek kad krene promet |
| Supabase Free           | 0 €        | 500 MB baza, 1 GB storage — pokriva ~50 organizacija    |
| Resend Free             | 0 €        | 3.000 poruka/mjesec, 100/dan                            |
| Domena `.ba` ili `.com` | ~1–5 €/mj  | Jednokratno godišnje                                    |
| **Ukupno mjesečno**     | **~2–5 €** | Ostatak budžeta ostaje za marketing i pravni pregled    |

Detaljna projekcija za 10 / 100 / 1.000 organizacija: `docs/COSTS.md`.

---

## 7. Definicija gotovog

Scenarij iz specifikacije (registracija → onboarding → XLSX uvoz → QR → javna
stranica → rezervacija → dodjela → radni nalog → čeklist → potpis → PDF →
novi rok → cron podsjetnik tačno jednom → dashboard → izolacija organizacija)
prolazi od početka do kraja, uz `npm run verify` i Playwright bez grešaka.
