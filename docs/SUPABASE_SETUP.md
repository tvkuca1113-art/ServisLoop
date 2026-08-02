# Postavljanje Supabase-a

Supabase daje tri stvari: bazu podataka, prijavu korisnika i pohranu datoteka.
Besplatan plan je dovoljan za validaciju.

**Vrijeme: oko 15 minuta.**

---

## 1. Napravite projekt

1. Otvorite [supabase.com](https://supabase.com) i prijavite se (GitHub nalog je
   najbrži).
2. Kliknite **New project**.
3. Popunite:
   - **Name:** `servisloop` (ili `servisloop-prod`)
   - **Database Password:** kliknite **Generate a password** i
     **odmah je sačuvajte** u menadžer lozinki. Prikazuje se samo jednom.
   - **Region:** ⚠️ **odaberite `Central EU (Frankfurt)`**
     Podaci vaših kupaca time ostaju u EU. Ovo se kasnije **ne može promijeniti**
     bez seljenja cijelog projekta.
   - **Pricing Plan:** Free
4. **Create new project.** Priprema traje 1–2 minute.

---

## 2. Prepišite ključeve

Otvorite **Project Settings** (zupčanik dolje lijevo) → **API**.

| Na ekranu piše          | Kopirajte u `.env.local` kao    |
| ----------------------- | ------------------------------- |
| Project URL             | `NEXT_PUBLIC_SUPABASE_URL`      |
| `anon` `public`         | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY`     |

> ### ⚠️ O `service_role` ključu
>
> Taj ključ **zaobilazi sve sigurnosne provjere**. Ko ga ima, može pročitati i
> promijeniti podatke svih firmi.
>
> - nikad ga ne šaljite porukom ni e-poštom;
> - nikad ga ne stavljajte u kod ni u git;
> - nikad ga ne koristite u pregledniku.
>
> Ako mislite da je procurio: **Project Settings → API → Reset service key**.

---

## 3. Prepišite vezu na bazu

**Project Settings → Database → Connection string → URI**

Dobijete nešto ovakvo:

```
postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

Zamijenite `[YOUR-PASSWORD]` lozinkom iz koraka 1 i upišite u `.env.local` kao
`DATABASE_URL`.

> **Napomena:** `DATABASE_URL` koriste **samo** migracije, seed i testovi.
> Aplikacija u radu ne koristi direktnu vezu — ide preko Supabase API-ja.
> Zato ovu varijablu **ne treba** postavljati na Vercelu.

Ako lozinka sadrži posebne znakove (`@`, `#`, `:`, `/`), morate ih kodirati:

```bash
node -e "console.log(encodeURIComponent('vaša#lozinka@123'))"
```

---

## 4. Napravite tabele

```bash
npm run db:migrate
```

Očekivani ispis:

```
ServisLoop — migracije
  Baza: postgresql://postgres.***@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
  → 0001_foundation.sql … ok
  → 0002_identity.sql … ok
  …
  → 0010_owner_guard_fix.sql … ok

  Primijenjeno migracija: 10
```

### Provjerite da je uspjelo

Otvorite **Table Editor** u Supabase-u. Trebate vidjeti oko 46 tabela
(`organizations`, `customers`, `devices`, `reminder_events` …).

Otvorite **Authentication → Policies**. Svaka tabela mora imati oznaku
**RLS enabled**. Ako neka nema — migracije nisu prošle do kraja.

---

## 5. Provjerite izolaciju firmi

**Ovo je najvažniji korak.** Provjerava da jedna firma stvarno ne može vidjeti
podatke druge.

```bash
npm run db:verify-rls
```

> ⚠️ Ova naredba **briše i ponovo pravi šemu**. Pokrenite je na **testnoj** bazi,
> ne na onoj s pravim podacima. Skript odbija da radi na Supabase URL-u bez
> eksplicitne potvrde.
>
> Za odvojenu testnu bazu napravite drugi besplatan Supabase projekt i njegov
> URL upišite u `TEST_DATABASE_URL`.

Očekivani kraj ispisa:

```
  Ukupno provjera: 32 · prošlo: 32 · palo: 0
  Izolacija organizacija je potvrđena.
```

**Ako bilo koja provjera padne, ne puštajte sistem u rad.**

---

## 6. Podesite prijavu korisnika

**Authentication → Providers → Email**

- **Enable Email provider:** uključeno
- **Confirm email:** uključeno (preporučeno za produkciju)
- **Secure email change:** uključeno

**Authentication → URL Configuration**

- **Site URL:** `https://vasa-domena.ba` (lokalno: `http://localhost:3000`)
- **Redirect URLs:** dodajte
  ```
  http://localhost:3000/**
  https://vasa-domena.ba/**
  https://*.vercel.app/**
  ```

**Authentication → Rate Limits** — ostavite zadane vrijednosti; štite od
pogađanja lozinki.

---

## 7. Napravite prostor za datoteke

**Storage → New bucket**

Napravite tri bucketa, **svi privatni** (`Public bucket` isključeno):

| Naziv              | Za šta                             |
| ------------------ | ---------------------------------- |
| `device-photos`    | fotografije uređaja                |
| `work-order-files` | fotografije prije/poslije, potpisi |
| `reports`          | PDF servisni izvještaji            |

> Ako bucket označite kao javan, bilo ko s linkom vidi sve datoteke svih firmi.
> **Ostavite ih privatnim.** Aplikacija pristupa preko potpisanih linkova
> ograničenog trajanja.

---

## 8. Demo korisnici

Skripta `npm run db:seed` pravi redove u bazi, ali **ne postavlja lozinke** —
lozinke su u Supabase Auth sistemu.

Da biste se prijavili kao demo korisnik:

1. **Authentication → Users → Add user → Create new user**
2. Upišite e-mail iz ispisa seed skripte (npr.
   `vlasnik@termoplus.primjer.ba`), postavite lozinku i uključite
   **Auto Confirm User**.
3. Kopirajte **UID** novog korisnika.
4. Otvorite **SQL Editor** i pokrenite:

```sql
-- Poveži novog auth korisnika s postojećim demo profilom.
update public.profiles
set id = '<UID-iz-koraka-3>'
where email = 'vlasnik@termoplus.primjer.ba';
```

Jednostavnija alternativa: otvorite `/registracija` i napravite vlastiti nalog,
pa demo podatke koristite samo za pregled.

---

## 9. Sigurnosne kopije

**Free plan:** dnevna kopija, čuva se 7 dana.
**Pro plan (25 $/mj):** 7 dana + kopije u vremenskoj tački.

Detaljno: [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).

**Napravite ručnu kopiju odmah**, prije nego što unesete prve stvarne podatke:

```bash
pg_dump "$DATABASE_URL" -Fc -f servisloop-$(date +%Y%m%d).dump
```

---

## 10. Lista provjere

- [ ] Projekt je u **EU regiji**
- [ ] Lozinka baze je sačuvana u menadžeru lozinki
- [ ] Sva tri ključa su u `.env.local`
- [ ] `npm run db:migrate` prošao (10 migracija)
- [ ] Table Editor prikazuje ~46 tabela
- [ ] Sve tabele imaju **RLS enabled**
- [ ] `npm run db:verify-rls` daje 32/32
- [ ] Tri bucketa napravljena, **svi privatni**
- [ ] Redirect URL-ovi podešeni
- [ ] Prva ručna sigurnosna kopija napravljena

---

## Česti problemi

**`password authentication failed`**
Lozinka u `DATABASE_URL` je pogrešna ili nije kodirana. Vidi korak 3.

**`relation "public.organizations" does not exist`**
Migracije nisu pokrenute. Pokrenite `npm run db:migrate`.

**`permission denied for schema public`**
Koristite `anon` ključ umjesto `DATABASE_URL`. Migracije trebaju direktnu vezu.

**Prijava radi lokalno, ne radi na Vercelu**
Redirect URL-ovi ne sadrže produkcijsku domenu. Vidi korak 6.

**`Invalid API key`**
Ključ je nepotpuno kopiran. Supabase ključevi su dugački — provjerite da nije
odsječen.
