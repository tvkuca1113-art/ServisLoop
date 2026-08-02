# Motor podsjetnika

Ovo je srce ServisLoop-a. Sve ostalo postoji da bi ovaj dio radio pouzdano.

---

## 1. Šta radi

Jednom dnevno sistem provjeri sve uređaje svih firmi i pošalje poruku kupcima
kojima se bliži rok servisa. Kupac iz poruke otvara siguran link i sam bira
termin — bez otvaranja naloga i bez telefonskog poziva.

```
06:00 UTC   Vercel Cron  →  GET /api/cron/podsjetnici
                              ↓
                         provjera CRON_SECRET
                              ↓
                    za svaku firmu, u NJENOJ vremenskoj zoni:
                              ↓
              koji je danas dan? → koji rokovi padaju pod pravila?
                              ↓
                  dovuci uređaje s tim rokovima
                              ↓
                    odluči šta ide (čista funkcija)
                              ↓
              upiši podsjetnik → pošalji poruku → zapiši ishod
```

---

## 2. Tri garancije

### Garancija 1: kupac nikad ne dobije istu poruku dvaput

Osigurana **u bazi**, ne u kodu:

```sql
create unique index uq_reminder_events_dedupe
  on public.reminder_events (device_id, rule_id, due_date);
```

Za jedan uređaj, jedno pravilo i jedan rok može postojati **tačno jedan** zapis.
Drugi pokušaj upisa fizički ne prolazi — bez obzira zašto se desio:

- cron je pokrenut dvaput,
- Vercel je ponovio zahtjev nakon greške,
- neko je kliknuo „Pokreni sada“ dok je posao već radio,
- dvije instance funkcije rade paralelno.

Postoje još dvije brane iznad ove:

| Nivo       | Ograničenje                                          | Efekt                               |
| ---------- | ---------------------------------------------------- | ----------------------------------- |
| Posao      | `cron_runs (job, run_date)`                          | drugi poziv istog dana odmah izlazi |
| Kampanja   | `reminder_campaigns (organization_id, run_date)`     | jedna kampanja po firmi po danu     |
| **Poruka** | **`reminder_events (device_id, rule_id, due_date)`** | **konačna brana**                   |

**Provjera:**

```bash
npm run test:integration
```

### Garancija 2: neuspjeh se nikad ne prikaže kao uspjeh

Ako slanje ne prođe, zapis ostaje u stanju `failed`, s razlogom i brojem
pokušaja. Nikad `sent`.

Baza to i provjerava:

```sql
constraint reminder_events_sent_needs_time
  check (status <> 'sent' or sent_at is not null),
constraint reminder_events_failed_needs_reason
  check (status <> 'failed' or last_error is not null)
```

Lažno „poslano“ je gore od vidljive greške: firma bi mislila da je kupac
obaviješten, a kupac ne bi znao da mu servis ističe.

Neuspjeh se odmah vidi:

- kao obavijest u aplikaciji,
- kao crveni red na početnoj stranici,
- u listi na `/app/podsjetnici`.

### Garancija 3: rezervacija zaustavlja niz

Čim kupac rezerviše termin, preostali podsjetnici za taj rok se otkazuju.
Kupac ne dobija poruku za nešto što je već dogovorio.

Već **poslana** poruka se ne dira — ona je historijska činjenica, ne plan.

---

## 3. Pravila podsjetnika

Nova firma dobija ovaj raspored:

| Pomak    | Naziv                 | Predložak                | Uključeno     |
| -------- | --------------------- | ------------------------ | ------------- |
| −30 dana | 30 dana prije servisa | `service_reminder`       | ✅            |
| −14 dana | 14 dana prije servisa | `service_reminder`       | ✅            |
| −3 dana  | 3 dana prije servisa  | `service_reminder_final` | ✅            |
| 0        | Na dan servisa        | `service_reminder_final` | ✅            |
| +14 dana | 14 dana nakon roka    | `service_overdue`        | ❌ isključeno |

Podsjetnik za kašnjenje je isključen dok ga firma svjesno ne uključi — neke
firme ga smatraju nametljivim.

Pravila se mijenjaju na `/app/podsjetnici`. Jedinstveni indeks sprječava dva
pravila s istim pomakom, pa firma ne može slučajno poslati kupcu dvije iste
poruke istog dana.

---

## 4. Kako se bira ko dobija poruku

Odluku donosi **čista funkcija bez pristupa bazi**:
`domains/reminders/schedule.ts → planRemindersForDay()`

Zato se cijelo ponašanje motora testira bez baze i bez mreže.

Redoslijed provjera (namjeran — prvo ono što je najvažnije za kupca):

| #   | Provjera                                     | Ako padne            |
| --- | -------------------------------------------- | -------------------- |
| 1   | Je li uređaj aktivan?                        | `device_inactive`    |
| 2   | Jesu li podsjetnici uključeni za uređaj?     | `reminders_disabled` |
| 3   | Je li kupac pristao na servisne podsjetnike? | `no_consent`         |
| 4   | Postoji li već rezervacija za ovaj rok?      | `already_booked`     |
| 5   | Ima li kupac ispravnu e-mail adresu?         | `missing_contact`    |
| 6   | Je li podsjetnik već kreiran?                | `already_exists`     |

Svaki preskočeni slučaj se broji i vidi u sažetku posla — ništa ne nestaje tiho.

---

## 5. Vremenske zone

Ovo je najčešći uzrok grešaka s datumima, pa je riješeno strogo:

- Rok servisa je **kalendarski datum** (`date`), bez vremena.
  „Sljedeći servis 15.03.2027.“ je izjava o kalendaru, ne o trenutku.
- Zona ulazi u igru na **tačno jednom mjestu**: `todayInTimeZone(org.timezone)`.
- Firma iz Sarajeva i firma iz Beča dobijaju svoj „danas“, iako posao pokreće
  isti server u isto vrijeme.

```ts
// Ovo je JEDINA funkcija koja spaja trenutak i kalendar.
const today = todayInTimeZone(organization.timezone, now)
```

Testovi za ovo pokreću se s vremenskom zonom procesa namjerno postavljenom na
`America/Los_Angeles` — ako se bilo gdje potkrade oslanjanje na zonu servera,
test odmah padne.

---

## 6. Slanje

```
planiranje → upis zapisa (pending) → sastavljanje poruke → slanje → upis ishoda
```

Zapis se kreira **prije** slanja. Ako upis padne zbog jedinstvenog indeksa,
poruka se ne šalje — znači da je već obrađena.

| Ishod                                        | Status             | Dalje                             |
| -------------------------------------------- | ------------------ | --------------------------------- |
| Poruka poslana                               | `sent` + `sent_at` | brojač potrošnje +1               |
| Slanje nije uspjelo (privremeno)             | `failed` + razlog  | ponovni pokušaj (do 3)            |
| Slanje nije uspjelo (trajno)                 | `failed` + razlog  | bez ponavljanja                   |
| Slanje onemogućeno (demo, istekla pretplata) | `skipped`          | poruka je pripremljena i vidljiva |

Razmak između pokušaja: **5 min → 30 min → 2 h**.

Trajne greške (`invalid recipient`, `unsubscribed`, `bounced`) se ne ponavljaju —
samo bi trošile kvotu.

---

## 7. Pregled način rada

Kad `RESEND_API_KEY` nije postavljen ili je `EMAIL_DRY_RUN=1`:

- nijedna poruka **ne odlazi**;
- cijeli sadržaj se pohranjuje u `email_messages.preview_html`;
- vidi se u aplikaciji.

To znači da **cijeli motor podsjetnika možete testirati bez plaćenog naloga** i
bez rizika da poruka ode stvarnom kupcu iz razvojnog okruženja.

Demo organizacije su uvijek u ovom načinu — bez obzira na konfiguraciju.

---

## 8. Pokretanje

### Automatski (Vercel Cron)

`vercel.json`:

```json
{ "path": "/api/cron/podsjetnici", "schedule": "0 6 * * *" }
```

06:00 UTC = 07:00 zimi / 08:00 ljeti po sarajevskom vremenu.

### Ručno (za provjeru)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
     https://vasa-aplikacija.vercel.app/api/cron/podsjetnici
```

Odgovor:

```json
{
  "ok": true,
  "runDate": "2027-03-16",
  "durationMs": 2841,
  "totals": { "created": 12, "sent": 11, "failed": 1, "skipped": 4 },
  "organizations": [
    {
      "name": "TermoPlus Servis d.o.o.",
      "devicesScanned": 23,
      "created": 12,
      "sent": 11,
      "failed": 1,
      "skipped": 4,
      "skippedReasons": { "missing_contact": 3, "already_booked": 1 }
    }
  ]
}
```

Pokrenite ga **dva puta zaredom**. Drugi put mora vratiti:

```json
{
  "ok": true,
  "message": "Posao je za današnji dan već obavljen. Ništa nije poslano ponovo."
}
```

---

## 9. Kad nešto pođe po zlu

| Simptom                            | Uzrok                               | Rješenje                              |
| ---------------------------------- | ----------------------------------- | ------------------------------------- |
| Nijedan podsjetnik nije poslan     | nijedan rok ne pada na današnji dan | provjerite rokove na `/app/uredaji`   |
| Svi preskočeni s `missing_contact` | kupci nemaju e-mail                 | dopunite kontakte                     |
| Svi preskočeni s `no_consent`      | pristanak nije zabilježen pri uvozu | provjerite mapiranje kolona pri uvozu |
| Poruke idu u neželjenu poštu       | domena nije verifikovana            | [`EMAIL_SETUP.md`](EMAIL_SETUP.md)    |
| Cron se ne pokreće                 | Vercel Cron nije uključen           | Vercel → Settings → Cron Jobs         |
| 401 na cron ruti                   | `CRON_SECRET` se ne poklapa         | provjerite varijablu na Vercelu       |
| Status `skipped`, razlog o slanju  | demo firma ili istekla pretplata    | provjerite `/app/postavke/pretplata`  |

Neuspjeli poslovi vide se i na administratorskoj stranici `/app/admin`
(dostupna samo adresama iz `SUPER_ADMIN_EMAILS`).

---

## 10. Dodavanje novog kanala (SMS, Viber)

Motor **ne zna** za Resend. Zna samo za sučelje `MessageProvider`:

```ts
export interface MessageProvider {
  readonly name: string
  readonly channel: MessageChannel
  readonly isLive: boolean
  send(message: OutgoingMessage): Promise<SendResult>
}
```

Za dodavanje SMS-a:

1. Napišite klasu koja implementira `MessageProvider`.
2. Dodajte je u `getProviderForChannel()` u `lib/email/provider.ts`.
3. Uključite kanal `sms` u pravilu podsjetnika.

**Nijedna izmjena u logici podsjetnika, deduplikacije ni ponovnih pokušaja
nije potrebna.** Baza već podržava kanale `sms`, `viber` i `whatsapp`.

---

## 11. Gdje je koji dio koda

| Dio                             | Datoteka                                             |
| ------------------------------- | ---------------------------------------------------- |
| Odluka ko dobija poruku (čisto) | `domains/reminders/schedule.ts`                      |
| Orkestracija posla              | `services/reminders/run-reminders.ts`                |
| HTTP ruta                       | `app/api/cron/podsjetnici/route.ts`                  |
| Zaštita rute                    | `lib/security/cron-auth.ts`                          |
| Slanje i zapis                  | `lib/email/send.ts`                                  |
| Pružalac usluge                 | `lib/email/provider.ts`                              |
| Predlošci poruka                | `components/emails/templates.tsx`                    |
| Šema baze                       | `supabase/migrations/0004_service_and_reminders.sql` |
| Testovi logike                  | `tests/unit/reminder-schedule.test.ts`               |
| Testovi garancija               | `tests/integration/guarantees.test.ts`               |
