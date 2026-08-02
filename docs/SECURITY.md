# Sigurnosni model

Evidencija opreme govori ko šta ima ugrađeno, koliko je to vrijedno i kada
nikoga nema kod kuće. Prema tim podacima se odnosimo u skladu s tim.

---

## 1. Osnovno načelo

> **Aplikacija nikad ne vjeruje podacima koji dolaze od klijenta —
> posebno ne oznaci organizacije.**

Klijent može poslati bilo koji `organization_id`. Mi ga ignorišemo i koristimo
onaj koji je vezan za provjerenu sesiju. Čak i da negdje pogriješimo, baza odbija
red jer korisnik nije član te organizacije.

**Sakrivanje dugmeta u sučelju nikad se ne smatra sigurnosnom mjerom.**

---

## 2. Tri sloja odbrane

```
1. Sučelje       skriva ono što korisnik ne smije     (udobnost)
2. Server        provjerava ovlaštenje prije radnje   (kontrola)
3. Baza (RLS)    odbija red bez obzira na sve         (garancija)
```

Sloj 3 je jedini koji stvarno štiti. Prva dva postoje da korisnik dobije jasnu
poruku umjesto nerazumljive greške.

### Sloj 3 u praksi

Svaka tenant tabela ima:

```sql
alter table public.devices enable row level security;
alter table public.devices force row level security;
```

`force` znači da politike vrijede **i za vlasnika tabele**. Bez toga bi veza
koja se poveže kao vlasnik šeme vidjela sve.

Politike koriste funkcije iz šeme `app`:

```sql
create policy devices_select on public.devices
  for select to authenticated
  using (app.is_org_member(organization_id));
```

Te funkcije su `security definer` sa `set search_path = ''` — jer politika nad
`organization_members` koja poziva funkciju koja čita `organization_members`
ušla bi u beskonačnu rekurziju, a prazna putanja pretrage sprječava podmetanje
tabele s istim imenom.

---

## 3. Dokaz da izolacija radi

Nije dovoljno napisati politike — treba ih pokušati probiti.

```bash
npm run db:verify-rls
```

Skript pravi **dvije stvarne organizacije**, prijavljuje se kao korisnik prve i
pokušava:

- čitati kupce, uređaje, naloge, postavke i dnevnike druge firme;
- izmijeniti i obrisati tuđe zapise;
- upisati novi red u tuđu organizaciju;
- kao tehničar vidjeti nalog kolege;
- kao tehničar preuzeti tuđi nalog;
- kao tehničar promijeniti plan pretplate;
- kao tehničar postaviti sebe za vlasnika;
- kao dispečer obrisati organizaciju;
- čitati tabele tokena, brojača i historije poslova;
- ukloniti posljednjeg vlasnika.

**Rezultat: 32 od 32 provjere prolaze.** Svaki pokušaj probijanja pada.

---

## 4. Uloge

| Uloga        | Smije                                                        | Ne smije                                            |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------- |
| **Vlasnik**  | sve u svojoj organizaciji                                    | ništa izvan nje                                     |
| **Dispečer** | kupci, uređaji, rezervacije, nalozi, izvještaji              | naplata, tim, brisanje firme, prenos vlasništva     |
| **Tehničar** | **samo svoji** nalozi, historija uređaja, zatvaranje servisa | tuđi nalozi, naplata, izvoz baze, upravljanje timom |

Ograničenje tehničara je i u RLS politici, ne samo u kodu:

```sql
create policy work_orders_select on public.work_orders
  for select to authenticated
  using (
    app.is_org_staff(organization_id)
    or (app.is_org_member(organization_id)
        and assigned_technician_id = app.current_technician_id(organization_id))
  );
```

Tehničar smije **mijenjati** dodijeljeni nalog, ali `with check` traži da dodjela
ostane na njemu — ne može nalog preuzeti ni proslijediti drugome.

---

## 5. Javni tokeni

QR kodovi, linkovi za rezervaciju i linkovi ka izvještajima moraju raditi bez
prijave. Zato:

| Mjera                 | Detalj                                               |
| --------------------- | ---------------------------------------------------- |
| **Izvor slučajnosti** | `crypto.randomBytes` — nikad brojač, vrijeme ni ID   |
| **Entropija**         | 22–32 znaka iz abecede od 55 znakova (~128–190 bita) |
| **Pohrana**           | u bazi je SAMO `sha256(PUBLIC_TOKEN_SECRET + token)` |
| **Poređenje**         | `timingSafeEqual` — vrijeme odgovora ništa ne odaje  |
| **Rotacija**          | stari token se deaktivira, izda se novi              |
| **Gašenje**           | `devices.public_page_enabled = false`                |
| **Istek**             | linkovi za rezervaciju vrijede 120 dana              |
| **Indeksiranje**      | `X-Robots-Tag: noindex, nofollow, noarchive`         |

Abeceda namjerno izostavlja `0/O` i `1/l/I` jer se token ponekad prepisuje rukom
s naljepnice.

**Ako promijenite `PUBLIC_TOKEN_SECRET`, svi postojeći QR kodovi i linkovi
prestaju raditi.** To je namjerno — cijeli sistem tokena može se poništiti
jednim potezom.

---

## 6. Šta kupac vidi na javnoj stranici

| Prikazano                                 | Skriveno                 |
| ----------------------------------------- | ------------------------ |
| vrsta uređaja, proizvođač, model          | cijena servisa           |
| **maskiran** serijski broj (`AT12••••04`) | pun serijski broj        |
| datum ugradnje, status garancije          | interne bilješke osoblja |
| sljedeći rok servisa                      | puna adresa kupca        |
| sažeta historija servisa                  | privitci radnih naloga   |
| kontakt servisne firme                    | podaci drugih kupaca     |

---

## 7. Datoteke

| Mjera        | Detalj                                                          |
| ------------ | --------------------------------------------------------------- |
| Bucket       | privatan; nema javnog čitanja                                   |
| Pristup      | isključivo preko potpisanih linkova ograničenog trajanja        |
| Putanja      | `{organization_id}/{entitet}/{id}/{nasumično_ime}`              |
| Ime datoteke | **generisano**, nikad ono koje je poslao korisnik               |
| Tip          | provjera MIME tipa **i** ekstenzije, u bazi `check` ograničenje |
| Veličina     | 25 MB po datoteci (`check` ograničenje)                         |
| Dozvoljeno   | JPEG, PNG, WebP, HEIC, MP4 (prijave), PDF (nalozi)              |

Ime datoteke koje pošalje korisnik nikad ne dolazi na disk — spriječeno je
i prelaženje putanje (`../`) i izvršni sadržaj s pogrešnom ekstenzijom.

---

## 8. Ograničavanje pristupa

| Ruta                   | Ograničenje                       |
| ---------------------- | --------------------------------- |
| javna stranica uređaja | 60 zahtjeva / 10 min po IP        |
| prijava kvara          | 5 / sat po IP, 3 / sat po uređaju |
| rezervacija            | 10 / sat po IP                    |
| pretraga               | 60 / min po korisniku             |
| cron                   | samo s ispravnim `CRON_SECRET`    |

Brojači su u tabeli `rate_limits`. IP adresa se **ne pohranjuje** — čuva se
skraćeni heš, dovoljan da prepozna ponovljeni izvor.

---

## 9. Rasporedni poslovi

`/api/cron/*` traži `Authorization: Bearer <CRON_SECRET>`.

Poređenje ide preko SHA-256 heševa (izjednačava dužine) i `timingSafeEqual`, pa
ni dužina ni sadržaj tajne ne cure kroz vrijeme odgovora.

Bez ove zaštite bilo ko s internetom mogao bi pokrenuti slanje podsjetnika svim
kupcima svih firmi.

---

## 10. Tajne

| Tajna                           | Gdje smije biti                 |
| ------------------------------- | ------------------------------- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | preglednik (RLS ga ograničava)  |
| `SUPABASE_SERVICE_ROLE_KEY`     | **samo server** — zaobilazi RLS |
| `CRON_SECRET`                   | samo server                     |
| `PUBLIC_TOKEN_SECRET`           | samo server                     |
| `RESEND_API_KEY`                | samo server                     |

Svaki modul koji dodiruje tajne počinje sa `import 'server-only'`. Ako neko
slučajno uveze takav modul u klijentsku komponentu, **build pada** — greška se
vidi odmah, a ne u produkciji.

`.env.local` je u `.gitignore`. U repozitoriju je samo `.env.example`, bez ijedne
stvarne vrijednosti.

---

## 11. Zaglavlja

Postavlja ih `next.config.ts` na svaki odgovor:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Cross-Origin-Opener-Policy: same-origin
```

`camera=(self)` je dopuštena jer tehničar slika uređaj s telefona.

Rute `/u/*`, `/rezervacija/*`, `/izvjestaj/*` i `/app/*` dodatno nose
`X-Robots-Tag: noindex`.

---

## 12. Izvoz u CSV

Ćelija koja počinje sa `=`, `+`, `-`, `@`, tabom ili povratom nosioca dobija
prefiks `'`. Bez toga Excel bi je izvršio kao formulu — poznat napad kojim se
kroz naizgled bezopasan izvoz pokreće kod na računaru primaoca.

---

## 13. Lozinke i sesije

- Lozinke obrađuje **Supabase Auth** — mi ih nikad ne vidimo ni ne pohranjujemo.
- Minimalna dužina: **10 znakova**, bez zahtjeva za posebnim znakovima.
  Takva pravila u praksi vode na `Lozinka1!` — kraću i predvidiviju od duže
  obične fraze.
- Sesija se čuva u `httpOnly` kolačiću.
- Provjera ide preko `getUser()` (provjerava token kod Supabase servera), nikad
  preko `getSession()` (čita kolačić bez provjere).
- Poruke o grešci pri prijavi ne otkrivaju postoji li nalog s tom adresom.
- Preusmjeravanje nakon prijave prihvata **isključivo** relativne putanje unutar
  aplikacije — nema otvorenog redirecta.

---

## 14. Zapisi

| Tabela             | Šta bilježi                                            |
| ------------------ | ------------------------------------------------------ |
| `audit_events`     | ko je šta promijenio, kad, s koje IP (heširano)        |
| `email_messages`   | svaka poruka: primalac, predmet, ishod                 |
| `reminder_events`  | svaki podsjetnik i njegov status                       |
| `cron_runs`        | svako pokretanje rasporednog posla                     |
| `analytics_events` | interna analitika bez podataka koji identifikuju kupce |

**U logove ne idu:** lozinke, tokeni, puni sadržaj poruka kupcima, sadržaj
uploadanih dokumenata. Adresa primaoca se u logovima maskira.

---

## 15. Lista prije komercijalnog rada

- [ ] `npm run db:verify-rls` prolazi 32/32
- [ ] `npm run verify` prolazi bez greške
- [ ] `PUBLIC_TOKEN_SECRET` i `CRON_SECRET` su generisani, ne prepisani iz primjera
- [ ] `SUPABASE_SERVICE_ROLE_KEY` nije nigdje osim u Vercel varijablama
- [ ] Supabase projekt je u **EU regiji**
- [ ] Domena za e-poštu je verifikovana kod Resenda (SPF, DKIM, DMARC)
- [ ] `SUPER_ADMIN_EMAILS` sadrži samo vaše adrese
- [ ] Automatske sigurnosne kopije baze su uključene
- [ ] **Vraćanje iz kopije je isprobano** ([`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md))
- [ ] `npm audit` nema visokih ranjivosti
- [ ] Pravni pregled ([`LEGAL_REVIEW_REQUIRED.md`](LEGAL_REVIEW_REQUIRED.md)) je završen

---

## 16. Prijava sigurnosnog propusta

Ako pronađete propust, pišite na **podrska@servisloop.ba** s opisom i koracima
za ponavljanje. Molimo da propust ne objavljujete javno prije nego što ga
popravimo.
