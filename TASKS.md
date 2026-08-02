# ServisLoop — status izgradnje

> Legenda: ✅ gotovo i provjereno · 🔄 u toku · ⬜ nije počelo
> Svaka faza se smatra gotovom tek kad prođu `typecheck`, `lint`, testovi i `build`.

---

## Faza 1 — Temelj i dizajn sistem ✅

| Stavka | Status | Napomena |
| --- | --- | --- |
| Next.js 16 + React 19 + TS strict | ✅ | Turbopack build prolazi |
| ESLint / Prettier / Vitest / Playwright konfiguracija | ✅ | `any` zabranjen pravilom |
| Provjera env varijabli (`lib/env.ts`) | ✅ | Jasna poruka umjesto rušenja |
| Dizajn tokeni (Tailwind v4 `@theme`) | ✅ | Svijetla tema za app, tamna za marketing |
| UI komponente (Radix + vlastiti stilovi) | ✅ | Bez `tailwindcss-animate` |
| `PlainDate` domen (bez zone servera) | ✅ | 35 testova, DST i prijestupne godine |
| Bosansko formatiranje (datum, KM, množina) | ✅ | `lib/format.ts` |
| Marketing sajt — 15 sekcija početne | ✅ | Sve sekcije stvarne, bez lažnih podataka |
| 3D hero (R3F, proceduralna geometrija) | ✅ | SVG fallback, pauza van viewporta, reduced-motion |
| Pristupačne kontrole 3D scene | ✅ | Ista informacija dostupna tastaturom |

**Provjera:** `npm run typecheck && npm test && npm run build` — prolazi.

---

## Faza 2 — Baza i sigurnost ✅

| Stavka | Status | Napomena |
| --- | --- | --- |
| 9 SQL migracija, 47 tabela | ✅ | Primijenjeno na stvarni PostgreSQL 16 |
| Pokretač migracija bez Dockera | ✅ | `scripts/db-migrate.ts`, radi i na Supabase |
| Ključ deduplikacije podsjetnika | ✅ | `uq_reminder_events_dedupe` |
| Sprječavanje duple rezervacije | ✅ | `uq_bookings_slot` u bazi, ne u kodu |
| Zaštita posljednjeg vlasnika | ✅ | Okidač `app.enforce_last_owner` |
| RLS politike na svim tabelama | ✅ | `force row level security` |
| Zadane vrijednosti nove organizacije | ✅ | Vrste opreme, planovi, podsjetnici, čeklista |
| **Provjera izolacije organizacija** | ✅ | **32/32 provjere prolaze** (`npm run db:verify-rls`) |

**Provjera:** `npm run db:migrate && npm run db:verify-rls` — 32/32.

---

## Faza 3 — Domenska logika 🔄

| Stavka | Status |
| --- | --- |
| Računanje sljedećeg roka servisa | ⬜ |
| Raspoređivanje podsjetnika + deduplikacija | ⬜ |
| Generisanje i provjera termina | ⬜ |
| Status garancije | ⬜ |
| Dozvole po ulogama | ⬜ |
| Ograničenja plana | ⬜ |
| Generisanje i heširanje tokena | ⬜ |
| Brojevi dokumenata | ⬜ |
| Normalizacija pri uvozu | ⬜ |

---

## Faza 4 — Pristup podacima i autentifikacija ⬜

## Faza 5 — Aplikacija: kupci, lokacije, uređaji, uvoz, QR ⬜

## Faza 6 — Javni tok kupca (QR, prijava kvara, rezervacija) ⬜

## Faza 7 — Motor podsjetnika i e-pošta ⬜

## Faza 8 — Radni nalozi i tehničar ⬜

## Faza 9 — Servisni zapisi, PDF izvještaj, sljedeći ciklus ⬜

## Faza 10 — Planovi, analitika, admin operativna stranica ⬜

## Faza 11 — Testovi, dokumentacija, priprema za deploy ⬜

---

## Poznata otvorena pitanja

| Pitanje | Odluka |
| --- | --- |
| Naplata karticom | Nije u MVP-u. Adapter i ručno postavljanje pretplate jesu. |
| SMS / Viber | Nije u MVP-u. Sučelje pružaoca je pripremljeno. |
| Sinhronizacija kalendara | Nije u MVP-u. Adapter je pripremljen. |
| Optimizacija ruta | Nije u MVP-u. |
| Pravna usklađenost | Nije zagarantovana — vidi `docs/LEGAL_REVIEW_REQUIRED.md`. |
