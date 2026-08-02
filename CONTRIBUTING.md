# Doprinos projektu

## Prije nego što počnete

```bash
npm install
cp .env.example .env.local     # popunite Supabase ključeve
npm run db:migrate
npm run db:seed
npm run dev
```

Detaljno u [`README.md`](README.md), a arhitektura u
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Pravila koja drže sistem jednostavnim

Ovih pet pravila nisu stil — o njima ovisi da li se sistem može održavati.

| Pravilo                                           | Zašto                                                       |
| ------------------------------------------------- | ----------------------------------------------------------- |
| Komponenta **ne piše SQL**                        | inače se upiti raspu po cijelom kodu (ESLint ovo i provodi) |
| Ruta **ne računa datume**                         | inače se ista logika pojavi na pet mjesta, s pet grešaka    |
| `domains/` **ne dodiruje mrežu ni bazu**          | inače se ne može testirati bez baze                         |
| Novac, rokovi i dozvole žive **u `domains/`**     | tamo imaju testove                                          |
| `organization_id` **nikad ne dolazi od klijenta** | osnovno sigurnosno pravilo                                  |

---

## Gdje šta ide

```
domains/      čista poslovna logika — bez I/O, potpuno testabilna
services/     orkestracija: transakcije, e-pošta, propagacija
repositories/ pristup bazi — jedini sloj koji zna za SQL
lib/          infrastruktura (auth, mail, PDF, QR, sigurnost)
components/   izgled — bez poslovne logike
app/          rute
```

**Novo poslovno pravilo** (npr. „servis se pomjera ako pada na praznik“) piše
se kao čista funkcija u `domains/` i dobija jedinični test. Ne u komponenti,
ne u ruti.

```ts
// ✅ testabilno bez ičega
export function nextServiceDateAfterService(
  servicedOn: PlainDate,
  intervalMonths: number,
): PlainDate

// ❌ traži bazu, sporo, teško za testiranje
export async function updateNextServiceDate(deviceId: string): Promise<void>
```

---

## Datumi

Ovo je najčešći izvor grešaka u ovakvom sistemu, pa je pravilo strogo:

| Pojam                              | Tip                          |
| ---------------------------------- | ---------------------------- |
| Rok servisa, ugradnja, garancija   | `PlainDate` (`'2027-03-15'`) |
| Termin rezervacije, vrijeme slanja | `timestamptz`                |

„Sljedeći servis 15.03.2027.“ je izjava o **kalendaru**, ne o trenutku. Ne smije
se pomjeriti zato što server radi u drugoj zoni.

**Vrijeme se uvijek prosljeđuje kao argument**, nikad ne čita unutar funkcije:

```ts
// ✅ deterministički
export function evaluateServiceDue(date: PlainDate, today: PlainDate)

// ❌ test će jednog dana pasti
export function evaluateServiceDue(date: PlainDate) {
  const today = new Date()
}
```

Testovi se pokreću s vremenskom zonom procesa namjerno postavljenom na
`America/Los_Angeles`. Ako se igdje potkrade oslanjanje na zonu servera, test
odmah padne.

---

## Migracije

- Migracija koja je **jednom objavljena se ne mijenja.** Ispravka ide kao nova
  migracija (primjer: `0010_owner_guard_fix.sql`).
- Nakon svake migracije pokrenite `npm run gen:types` i commitajte rezultat.
  CI provjerava da tipovi odgovaraju šemi.
- Pravilo koje **mora** vrijediti implementirajte kao ograničenje u bazi, ne u
  aplikaciji. Aplikacijska logika može imati grešku; jedinstveni indeks ne može.
- Svako novo ograničenje dobija test u `tests/integration/` koji **pokušava ga
  prekršiti** i očekuje grešku.

---

## Sigurnost

Prije nego što pošaljete promjenu koja dira podatke:

- [ ] Nova tabela ima `organization_id` i RLS politiku
- [ ] Nova politika je pokrivena u `scripts/verify-rls.ts`
- [ ] `npm run db:verify-rls` i dalje daje **32/32** (ili više, ako ste dodali provjere)
- [ ] Nijedan modul s tajnama se ne uvozi u klijentsku komponentu
      (moduli s tajnama počinju sa `import 'server-only'`)
- [ ] Nova varijabla okruženja je dodana u `.env.example` **s objašnjenjem**

Servisni Supabase klijent (`createServiceSupabase()`) zaobilazi RLS. Svaka
njegova upotreba mora imati komentar koji objašnjava kako ruta dokazuje
ovlaštenje prije prvog upita.

---

## Prije slanja pull requesta

```bash
npm run verify          # format → lint → typecheck → testovi → build
npm run test:integration
npm run db:verify-rls
```

Sve tri moraju proći.

---

## Stil

Većinu odrađuju Prettier i ESLint. Ono što alat ne hvata:

- **Komentari objašnjavaju zašto, ne šta.** Kod već kaže šta radi.
- **Poruke o grešci su na bosanskom** i kažu korisniku šta da uradi.
- **Bez `any`.** Koristite `unknown` + Zod.
- **Bez tihih `catch` blokova.** Ako greška nije bitna, komentar mora objasniti zašto.
- **Bez dugmadi koja ništa ne rade.** Ako radnja nije implementirana, dugmeta nema.

---

## Poruke commita

Na bosanskom, u imperativu, prva linija do 72 znaka:

```
Dodaj provjeru duplikata pri uvozu uređaja

Uvoz je do sada tiho preskakao redove s postojećim serijskim brojem.
Sada se red označava kao duplikat i vidi se u izvještaju o uvozu.
```

---

## Šta NE prihvatamo

| Ne                                                             | Zašto                                         |
| -------------------------------------------------------------- | --------------------------------------------- |
| AI koji određuje datume, dozvole, novac ili dostupnost termina | mora biti provjerljivo i ponovljivo           |
| Lažni podaci izvan jasno označenog demo načina                 | proizvod mora govoriti istinu o svom stanju   |
| „Uspješno“ kad radnja nije uspjela                             | posebno kod slanja podsjetnika                |
| Izmjena već objavljene migracije                               | dodajte novu                                  |
| Nova zavisnost bez obrazloženja                                | svaka je trošak održavanja i sigurnosni rizik |
