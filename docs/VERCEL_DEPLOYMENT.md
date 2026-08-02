# Objavljivanje na Vercel

Vercel pokreće aplikaciju na internetu i sam pokreće dnevne poslove.
Besplatan plan je dovoljan za validaciju.

**Vrijeme: oko 20 minuta.**

---

## 1. Prije nego što počnete

- [ ] Kod je na GitHubu
- [ ] Supabase je postavljen ([`SUPABASE_SETUP.md`](SUPABASE_SETUP.md))
- [ ] Lokalno prolazi:

```bash
npm run verify
```

Ako ova naredba ne prođe, **ne objavljujte**. Vercel gradi isti kod i pašće isto.

---

## 2. Uvezite projekt

1. [vercel.com](https://vercel.com) → prijava GitHub nalogom
2. **Add New… → Project**
3. Odaberite repozitorij `servisloop` → **Import**
4. Vercel sam prepoznaje Next.js. **Ne mijenjajte** postavke gradnje.
5. **Nemojte još kliknuti Deploy** — prvo varijable okruženja.

---

## 3. Unesite varijable okruženja

**Settings → Environment Variables**

Unesite za sva tri okruženja (**Production**, **Preview**, **Development**),
osim gdje je drukčije naznačeno:

| Naziv                           | Vrijednost                           | Napomena                                 |
| ------------------------------- | ------------------------------------ | ---------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | `https://vasa-domena.ba`             | bez kose crte na kraju                   |
| `NEXT_PUBLIC_SUPABASE_URL`      | iz Supabase-a                        |                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | iz Supabase-a                        |                                          |
| `SUPABASE_SERVICE_ROLE_KEY`     | iz Supabase-a                        | ⚠️ tajna                                 |
| `CRON_SECRET`                   | `openssl rand -base64 32`            | ⚠️ tajna                                 |
| `PUBLIC_TOKEN_SECRET`           | `openssl rand -base64 48`            | ⚠️ tajna, **nikad ne mijenjati kasnije** |
| `RESEND_API_KEY`                | iz Resenda                           | ⚠️ tajna                                 |
| `EMAIL_FROM`                    | `ServisLoop <servis@vasa-domena.ba>` |                                          |
| `EMAIL_REPLY_TO`                | `podrska@vasa-domena.ba`             |                                          |
| `EMAIL_DRY_RUN`                 | `0` u Production, `1` u Preview      | **važno**                                |
| `SUPER_ADMIN_EMAILS`            | vaša e-mail adresa                   |                                          |
| `NEXT_PUBLIC_DEMO_MODE`         | `1`                                  |                                          |
| `REPORT_NUMBER_PREFIX`          | `SL` ili oznaka firme                |                                          |

**NE unosite na Vercel:**

- `DATABASE_URL` — koriste ga samo migracije, lokalno
- `TEST_DATABASE_URL` — samo testovi

> ### ⚠️ `EMAIL_DRY_RUN` u Preview okruženju
>
> Postavite `EMAIL_DRY_RUN=1` za Preview. Bez toga bi svaka grana koju
> objavite mogla poslati stvarne poruke stvarnim kupcima iz testne verzije.

> ### ⚠️ `PUBLIC_TOKEN_SECRET`
>
> Ako ga ikad promijenite, **svi QR kodovi na svim uređajima prestaju raditi**
> i sve naljepnice treba ponovo štampati. Postavite ga jednom i sačuvajte u
> menadžeru lozinki.

---

## 4. Objavite

Kliknite **Deploy**. Prva gradnja traje 2–4 minute.

Kad završi, aplikacija je na `https://vas-projekt.vercel.app`.

---

## 5. Pripremite produkcijsku bazu

Migracije se pokreću **lokalno**, prema produkcijskoj bazi:

```bash
DATABASE_URL="postgresql://postgres.xxx:LOZINKA@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  npm run db:migrate
```

Provjerite:

```bash
curl https://vas-projekt.vercel.app/api/health
```

Očekivano: `{"ok": true, ...}`

---

## 6. Uključite dnevne poslove

`vercel.json` već sadrži raspored:

```json
{
  "crons": [
    { "path": "/api/cron/podsjetnici", "schedule": "0 6 * * *" },
    { "path": "/api/cron/odrzavanje", "schedule": "30 2 * * *" }
  ]
}
```

Nakon objave provjerite: **Settings → Cron Jobs**. Trebate vidjeti oba posla.

> **Besplatan plan Vercela dopušta 2 cron posla, jednom dnevno.** To je tačno
> koliko nam treba.

### Ručna provjera

```bash
curl -H "Authorization: Bearer VAS_CRON_SECRET" \
     https://vas-projekt.vercel.app/api/cron/podsjetnici
```

**Pokrenite dvaput.** Drugi put mora vratiti:

```json
{
  "ok": true,
  "message": "Posao je za današnji dan već obavljen. Ništa nije poslano ponovo."
}
```

Ako drugi poziv pošalje poruke — nešto nije u redu, **javite se prije nego što
sistem pusti stvarnim kupcima**.

### Vremena

`0 6 * * *` = 06:00 UTC = 07:00 zimi / 08:00 ljeti po sarajevskom vremenu.

Sat u kojem se poruke stvarno šalju podesiv je po firmi
(`organization_settings.reminder_send_hour`).

---

## 7. Povežite domenu

1. **Settings → Domains → Add**
2. Upišite `servisloop.ba` (i `www.servisloop.ba`)
3. Vercel prikaže DNS zapise — dodajte ih kod registrara:

| Tip     | Naziv | Vrijednost             |
| ------- | ----- | ---------------------- |
| `A`     | `@`   | `76.76.21.21`          |
| `CNAME` | `www` | `cname.vercel-dns.com` |

4. HTTPS certifikat se izdaje sam, obično za par minuta.

### Nakon što domena proradi

1. Promijenite `NEXT_PUBLIC_APP_URL` na Vercelu u novu domenu.
2. Dodajte domenu u Supabase → **Authentication → URL Configuration**.
3. Ponovo objavite (**Deployments → … → Redeploy**).

> Ako preskočite korak 1, linkovi u e-porukama i QR kodovi pokazivat će na
> `vercel.app` adresu.

---

## 8. Praćenje

### Ugrađeno

| Gdje                   | Šta pokazuje                                        |
| ---------------------- | --------------------------------------------------- |
| `/api/health`          | stanje aplikacije i konfiguracije                   |
| `/app/admin`           | neuspjeli poslovi, poruke, uvozi (samo super-admin) |
| `/app/podsjetnici`     | status svakog podsjetnika                           |
| Vercel → **Logs**      | serverski logovi                                    |
| Vercel → **Cron Jobs** | historija pokretanja                                |

### Opciono: Sentry

Nije obavezan i **ne treba ga u fazi validacije**. Ako ga kasnije uvedete:

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Besplatan plan: 5.000 grešaka mjesečno.

---

## 9. Ako nešto pođe po zlu

### Vraćanje na prethodnu verziju

**Deployments** → nađite verziju koja je radila → **⋯ → Promote to Production**

Traje nekoliko sekundi. **Baza se time ne mijenja** — ako je problem u
migraciji, vraćanje koda neće pomoći.

### Gradnja pada

1. Pročitajte log gradnje na Vercelu.
2. Ponovite lokalno: `npm run build`.
3. Najčešći uzrok: nedostaje varijabla okruženja.

### Aplikacija radi, ali baza ne odgovara

1. Supabase → **Project Settings → Database** — je li projekt aktivan?
   (Besplatan plan pauzira projekt nakon 7 dana bez prometa.)
2. Provjerite ključeve na Vercelu.
3. `curl https://vasa-domena.ba/api/health`

---

## 10. Lista provjere

- [ ] `npm run verify` prolazi lokalno
- [ ] Sve varijable unesene za Production
- [ ] `EMAIL_DRY_RUN=1` za Preview
- [ ] Prva gradnja prošla
- [ ] Migracije primijenjene na produkcijsku bazu
- [ ] `/api/health` vraća `ok: true`
- [ ] Cron poslovi vidljivi u Settings → Cron Jobs
- [ ] Cron pokrenut dvaput — drugi put ništa nije poslano
- [ ] Domena povezana, HTTPS radi
- [ ] `NEXT_PUBLIC_APP_URL` pokazuje na pravu domenu
- [ ] Supabase redirect URL-ovi ažurirani
- [ ] Registracija radi na produkciji
- [ ] Probna e-poruka stigla u dolazne
- [ ] Javna stranica uređaja se otvara skeniranjem QR koda
