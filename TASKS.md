# ServisLoop — status izgradnje

> Legenda: ✅ gotovo i provjereno · 🔄 djelimično · ⬜ nije počelo
> Faza je gotova tek kad prođu `typecheck`, `lint`, testovi i `build`.

**Zadnja provjera:** `npm run verify` ✅ · `npm run db:verify-rls` 32/32 ✅ ·
174 testa ✅ (154 jedinična + 20 integracijskih)

---

## ✅ Faza 1 — Temelj i dizajn sistem

| Stavka                                                       | Status        |
| ------------------------------------------------------------ | ------------- |
| Next.js 16 + React 19 + TS strict + Tailwind v4              | ✅            |
| ESLint (native flat config) / Prettier / Vitest / Playwright | ✅            |
| Provjera env varijabli s jasnim porukama                     | ✅            |
| Dizajn tokeni (svijetla za app, tamna za marketing)          | ✅            |
| UI komponente nad Radix primitivama (17 datoteka)            | ✅            |
| `PlainDate` domen bez ovisnosti o zoni servera               | ✅ 35 testova |
| Bosansko formatiranje (datum, KM, množina)                   | ✅            |

## ✅ Faza 2 — Baza i sigurnost

| Stavka                                                         | Status                       |
| -------------------------------------------------------------- | ---------------------------- |
| 10 SQL migracija, 46 tabela                                    | ✅ na stvarnom PostgreSQL 16 |
| Pokretač migracija bez Dockera                                 | ✅                           |
| Generator TS tipova iz šeme (646 kolona)                       | ✅                           |
| Ključ deduplikacije podsjetnika                                | ✅                           |
| Sprječavanje duple rezervacije                                 | ✅                           |
| Zaštita posljednjeg vlasnika (+ ispravka za kaskadno brisanje) | ✅                           |
| RLS na svim tabelama (`force row level security`)              | ✅                           |
| **Provjera izolacije organizacija**                            | ✅ **32/32**                 |

## ✅ Faza 3 — Domenska logika i infrastruktura

| Stavka                                                 | Status |
| ------------------------------------------------------ | ------ |
| Rokovi servisa, garancija, zatvaranje ciklusa          | ✅     |
| Raspoređivanje podsjetnika + deduplikacija             | ✅     |
| Generisanje i provjera termina                         | ✅     |
| Dozvole po ulogama                                     | ✅     |
| Planovi, limiti, stanje pretplate                      | ✅     |
| Brojevi dokumenata, procjena prihoda                   | ✅     |
| Supabase klijenti (preglednik / server / service-role) | ✅     |
| Sesija i kontekst organizacije                         | ✅     |
| Sistem e-pošte + 11 predložaka + pregled način         | ✅     |
| Generisanje QR kodova (server-side)                    | ✅     |
| Sigurni tokeni (32 bajta, SHA-256, rotacija)           | ✅     |

## ✅ Faza 4 — Marketing, motor podsjetnika, okvir aplikacije

| Stavka                                                   | Status |
| -------------------------------------------------------- | ------ |
| Početna stranica — svih 15 sekcija                       | ✅     |
| 3D hero (R3F, SVG fallback, reduced-motion, pristupačan) | ✅     |
| Kalkulator prihoda, pregled proizvoda, QR putovanje      | ✅     |
| Motor podsjetnika (trostruka idempotentnost)             | ✅     |
| Cron rute + zaštita `CRON_SECRET`                        | ✅     |
| Prijava i registracija                                   | ✅     |
| Okvir aplikacije: navigacija, ⌘K paleta, obavijesti      | ✅     |
| Dashboard s razdvojenim prihodom                         | ✅     |
| Serverska pretraga ograničena na organizaciju            | ✅     |
| Demo podaci (44 kupca, 126 uređaja, 60 servisa)          | ✅     |
| `/api/health` + noćno održavanje                         | ✅     |
| 404 i 500 stranice                                       | ✅     |

## ✅ Faza 5 — Dokumentacija (12 od 21 dokumenta)

Napisano: `README.md`, `ARCHITECTURE`, `DATABASE`, `SECURITY`,
`REMINDER_ENGINE`, `SUPABASE_SETUP`, `EMAIL_SETUP`, `VERCEL_DEPLOYMENT`,
`TESTING`, `COSTS`, `KNOWN_LIMITATIONS`, `LEGAL_REVIEW_REQUIRED`,
`RISK_ASSUMPTIONS`.

---

## 🔄 PREOSTALO — sljedeći koraci

> Ovo je iskren popis onoga što JOŠ NIJE napisano. Temelj, baza, sigurnost i
> motor podsjetnika su gotovi i provjereni; nedostaju ekrani koji te dijelove
> spajaju u svakodnevni rad.

### Prioritet 1 — javni tok kupca (bez ovoga petlja nije zatvorena)

| Ruta                                                   | Status |
| ------------------------------------------------------ | ------ |
| `/u/[publicToken]` — javna stranica uređaja            | ⬜     |
| `/u/[publicToken]/prijavi-kvar`                        | ⬜     |
| `/u/[publicToken]/rezervisi`                           | ⬜     |
| `/rezervacija/[bookingToken]` — izmjena/otkazivanje    | ⬜     |
| Ograničavanje pristupa javnim formama (tabela postoji) | ⬜     |

### Prioritet 2 — operativni ekrani

| Ruta                                           | Status |
| ---------------------------------------------- | ------ |
| `/app/onboarding` (11 koraka)                  | ⬜     |
| `/app/kupci`, `/app/kupci/[id]`                | ⬜     |
| `/app/uredaji`, `/app/uredaji/[id]`            | ⬜     |
| `/app/lokacije`, `/app/tehnicari`              | ⬜     |
| `/app/rezervacije`, `/app/prijave-kvara`       | ⬜     |
| `/app/radni-nalozi`, `/app/radni-nalozi/[id]`  | ⬜     |
| `/app/podsjetnici` (statusi, ručno slanje)     | ⬜     |
| `/app/servisni-planovi`, `/app/izvjestaji`     | ⬜     |
| `/app/postavke/*` (4 stranice)                 | ⬜     |
| `/app/admin` (super-admin operativna stranica) | ⬜     |

### Prioritet 3 — uvoz i izvještaji

| Stavka                                                 | Status |
| ------------------------------------------------------ | ------ |
| CSV parser (`;` vs `,`, BOM, decimalni zarez)          | ⬜     |
| XLSX čitanje preko ExcelJS                             | ⬜     |
| Mapiranje kolona + prijedlozi + regionalni aliasi      | ⬜     |
| Provjera, duplikati, preuzimanje odbijenih redova      | ⬜     |
| `/app/uvoz` sučelje                                    | ⬜     |
| PDF servisni izvještaj (pdf-lib + DejaVu za č/ć/ž/š/đ) | ⬜     |
| `/izvjestaj/[reportToken]`                             | ⬜     |
| QR naljepnice za štampu (PDF s više naljepnica)        | ⬜     |

### Prioritet 4 — marketing podstranice

`/kako-radi`, `/funkcije`, `/cijene`, `/sigurnost`, `/demo`, `/kontakt`,
`/politika-privatnosti`, `/uslovi-koristenja` — ⬜
(sav sadržaj postoji kao sekcije početne stranice, treba ga razdvojiti)

### Prioritet 5 — testovi i preostala dokumentacija

| Stavka                                         | Status |
| ---------------------------------------------- | ------ |
| Playwright E2E (15 koraka iz specifikacije)    | ⬜     |
| `docs/ADMIN_GUIDE_BS.md`                       | ⬜     |
| `docs/USER_GUIDE_BS.md`                        | ⬜     |
| `docs/IMPORT_GUIDE.md`                         | ⬜     |
| `docs/BACKUP_AND_RESTORE.md`                   | ⬜     |
| `docs/DATA_DELETION.md`                        | ⬜     |
| `docs/COMMERCIAL_LAUNCH_CHECKLIST.md`          | ⬜     |
| `docs/SMOKE_TEST.md`                           | ⬜     |
| `docs/ACCESSIBILITY.md`, `docs/PERFORMANCE.md` | ⬜     |
| Primjeri za uvoz (CSV i XLSX)                  | ⬜     |

---

## Svjesne odluke (nisu propusti)

| Odluka                                | Razlog                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Nema naplate karticom                 | Adapter je pripremljen; lažno „plaćanje uspješno“ ne dolazi u obzir        |
| Nema SMS/Viber kanala                 | `MessageProvider` sučelje je spremno; dodavanje ne dira logiku podsjetnika |
| Nema sinhronizacije kalendara         | Van opsega MVP-a                                                           |
| Nema optimizacije ruta                | Van opsega MVP-a                                                           |
| Nema native mobilne aplikacije        | Web u pregledniku telefona                                                 |
| Pravna usklađenost nije zagarantovana | Vidi `docs/LEGAL_REVIEW_REQUIRED.md`                                       |

---

## Kako nastaviti rad

```bash
npm install
cp .env.example .env.local     # popuni Supabase ključeve
npm run db:migrate
npm run db:seed
npm run dev
```

Provjere prije svake objave:

```bash
npm run verify          # format + lint + typecheck + testovi + build
npm run db:verify-rls   # izolacija organizacija — mora biti 32/32
```
