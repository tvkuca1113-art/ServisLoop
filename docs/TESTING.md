# Testiranje

---

## 1. Tri sloja

| Sloj                | Šta provjerava                                         | Treba bazu? | Trajanje |
| ------------------- | ------------------------------------------------------ | ----------- | -------- |
| **Jedinični**       | poslovna logika: rokovi, podsjetnici, termini, dozvole | ne          | ~2 s     |
| **Integracijski**   | ograničenja u bazi, okidači, RLS                       | da          | ~3 s     |
| **Kroz preglednik** | cijeli tok od registracije do izvještaja               | da          | ~2 min   |

---

## 2. Naredbe

```bash
npm test                  # jedinični (svakodnevni rad)
npm run test:watch        # jedinični, prati izmjene
npm run test:integration  # protiv stvarne baze
npm run test:all          # oba skupa
npm run test:coverage     # pokrivenost
npm run e2e               # kroz preglednik
npm run db:verify-rls     # izolacija organizacija
npm run verify            # SVE — pokrenite prije objave
```

---

## 3. Priprema baze za testove

Integracijski testovi **brišu i ponovo prave šemu**. Zato im treba
**odvojena** baza.

### Opcija A — lokalni PostgreSQL

```bash
# Ubuntu / Debian
sudo apt install postgresql

# macOS
brew install postgresql@16 && brew services start postgresql@16

createdb servisloop_test
```

U `.env.local`:

```bash
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/servisloop_test
```

### Opcija B — drugi Supabase projekt

Napravite besplatan projekt `servisloop-test` i njegov connection string
upišite u `TEST_DATABASE_URL`.

> ⚠️ **Nikad ne pokazujte `TEST_DATABASE_URL` na bazu sa stvarnim podacima.**
> Skript odbija rad na Supabase URL-u bez `ALLOW_SUPABASE_RESET=1`, ali ta
> zaštita je zadnja linija, ne prva.

---

## 4. Šta jedinični testovi pokrivaju

**154 testa**, bez baze i bez mreže.

| Datoteka                        | Testira                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| `plain-date.test.ts`            | datumi, prijestupne godine, **prelazak na ljetno vrijeme**, vremenske zone |
| `service-schedule.test.ts`      | rok servisa, pravilo kraja mjeseca, garancija, zatvaranje ciklusa          |
| `reminder-schedule.test.ts`     | ko dobija podsjetnik, deduplikacija, ponovni pokušaji, otkazivanje         |
| `booking-slots.test.ts`         | generisanje termina, dostupnost, provjera zahtjeva, kapacitet              |
| `permissions-and-plans.test.ts` | dozvole po ulogama, limiti plana, brojevi dokumenata, prihod               |

### Zašto je vremenska zona procesa namjerno pogrešna

`tests/setup.ts` postavlja:

```ts
process.env.TZ = 'America/Los_Angeles'
```

Ako se bilo gdje u kodu potkrade oslanjanje na lokalnu zonu servera umjesto na
zonu organizacije, test odmah padne. Ovo je uhvatilo stvarne greške tokom
razvoja.

---

## 5. Šta integracijski testovi pokrivaju

**20 testova**, protiv stvarnog PostgreSQL-a.

Provjeravaju ono što se u kodu **ne može dokazati** — da ograničenja u bazi
zaista drže:

- ★ jedinstveni indeks odbija dupli podsjetnik;
- ★ isti uređaj smije dobiti podsjetnik za drugi rok;
- ★ cron se ne pokreće dvaput istog dana;
- ★ dva kupca ne mogu uzeti isti termin;
- ★ otkazana rezervacija oslobađa termin;
- ★ tehničar nije na dva mjesta odjednom;
- ★ deset **istovremenih** zahtjeva za broj dokumenta daje deset različitih brojeva;
- ★ organizacija ne može ostati bez vlasnika, ali se cijela može obrisati;
- ★ serijski broj jedinstven unutar firme, ne globalno;
- ★ nova firma odmah ima vrste opreme, planove, podsjetnike i čeklistu.

Test istovremenosti koristi **pool s više veza** — jedan klijent bi upite
serijalizovao i test ne bi ništa dokazao.

---

## 6. Provjera izolacije organizacija

```bash
npm run db:verify-rls
```

Skript pravi dvije stvarne organizacije i **pokušava probiti izolaciju**:
čitati tuđe podatke, izmijeniti ih, obrisati, upisati u tuđu organizaciju,
kao tehničar vidjeti tuđi nalog, preuzeti ga, promijeniti plan pretplate,
postaviti sebe za vlasnika…

**Rezultat mora biti 32/32.**

Ovo je najvažniji test u projektu. **Ako padne, ne puštajte sistem u rad.**

---

## 7. Testovi kroz preglednik

```bash
npm run e2e:install    # jednom — preuzima Chromium
npm run e2e            # pokreni
npm run e2e:ui         # s vizualnim sučeljem
```

Prolaze kroz cijeli tok: registracija → onboarding → uvoz → QR → javna stranica
→ rezervacija → dodjela → radni nalog → izvještaj → novi rok → podsjetnik.

Playwright je podešen na `locale: bs-BA` i `timezoneId: Europe/Sarajevo`.

---

## 8. Prije objave

```bash
npm run verify
npm run db:verify-rls
```

`verify` pokreće: format → lint → typecheck → jedinični testovi → build.

**Obje naredbe moraju proći bez greške.**

---

## 9. Kako pisati nove testove

### Poslovna logika → jedinični test

Ako pišete pravilo („servis se pomjera ako je praznik“), napišite ga kao
**čistu funkciju u `domains/`** i testirajte bez baze.

```ts
// ✅ testabilno bez ičega
export function nextServiceDateAfterService(
  servicedOn: PlainDate,
  intervalMonths: number,
): PlainDate

// ❌ traži bazu, sporo, teško za testiranje
export async function updateNextServiceDate(deviceId: string): Promise<void>
```

### Ograničenje u bazi → integracijski test

Ako dodajete jedinstveni indeks ili okidač, dodajte test koji **pokušava
prekršiti** to pravilo i očekuje grešku.

### Vrijeme se uvijek prosljeđuje

```ts
// ✅ deterministički
export function evaluateServiceDue(date: PlainDate, today: PlainDate)

// ❌ rezultat ovisi o trenutku pokretanja
export function evaluateServiceDue(date: PlainDate) {
  const today = new Date() // test će jednog dana pasti
}
```

---

## 10. Česti problemi

**`Nedostaje TEST_DATABASE_URL`**
Dodajte varijablu u `.env.local`. Vidi korak 3.

**`ECONNREFUSED ... :5432`**
PostgreSQL nije pokrenut: `brew services start postgresql@16` ili
`sudo systemctl start postgresql`.

**Integracijski testovi se međusobno ometaju**
Rade serijski (`fileParallelism: false`). Ako ste dodali novi fajl, provjerite
da svaki test pravi **vlastitu** organizaciju preko `createTestOrg()`.

**Testovi prolaze lokalno, padaju u CI-u**
Najčešće vremenska zona. Provjerite da test prosljeđuje `today` umjesto da ga
računa iz `new Date()`.
