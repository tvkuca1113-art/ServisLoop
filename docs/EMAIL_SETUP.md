# Postavljanje e-pošte

Bez e-pošte ServisLoop i dalje radi — samo se poruke ne šalju nego pripremaju i
prikazuju u aplikaciji. To je **pregled način rada** i savršen je za testiranje.

**Vrijeme: oko 30 minuta** (uključujući čekanje na DNS).

---

## 1. Prvo probajte bez ičega

Ostavite `RESEND_API_KEY` prazan u `.env.local`:

```bash
RESEND_API_KEY=
EMAIL_DRY_RUN=1
```

Sada:

- nijedna poruka **ne odlazi**;
- cijeli sadržaj se pohranjuje i vidi na `/app/podsjetnici`;
- motor podsjetnika radi **potpuno normalno**.

Tako možete uvesti bazu, pokrenuti podsjetnike i vidjeti tačno šta bi kupci
dobili — bez ijedne poslane poruke i bez ijedne marke troška.

**Preporuka:** ostanite u ovom načinu dok ne budete sigurni da su rokovi i
kontakti ispravni.

---

## 2. Napravite Resend nalog

1. [resend.com](https://resend.com) → **Sign up** (besplatno).
2. Besplatan plan: **3.000 poruka mjesečno, 100 dnevno.**

> **Računica:** firma sa 300 uređaja i četiri podsjetnika po roku šalje oko
> 100 poruka mjesečno po jednom krugu servisa. Besplatan plan pokriva
> nekoliko takvih firmi. Prvi plaćeni plan je 20 $/mj za 50.000 poruka.

---

## 3. Verifikujte domenu

**Ovo je najvažniji korak.** Bez verifikovane domene poruke završavaju u
neželjenoj pošti.

1. Resend → **Domains** → **Add Domain**
2. Upišite svoju domenu, npr. `servisloop.ba`
3. Resend prikaže DNS zapise koje treba dodati:

| Tip   | Naziv               | Vrijednost                              | Čemu služi                      |
| ----- | ------------------- | --------------------------------------- | ------------------------------- |
| `MX`  | `send`              | `feedback-smtp.eu-west-1.amazonses.com` | povratne informacije            |
| `TXT` | `send`              | `v=spf1 include:amazonses.com ~all`     | SPF — ko smije slati u vaše ime |
| `TXT` | `resend._domainkey` | (dugačak ključ)                         | DKIM — digitalni potpis poruke  |

4. Dodajte ih kod registrara domene (gdje ste je kupili).
5. Kliknite **Verify**. Obično traje 5–30 minuta, ponekad do 24 sata.

### Dodajte i DMARC (preporučeno)

| Tip   | Naziv    | Vrijednost                                         |
| ----- | -------- | -------------------------------------------------- |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@vasadomena.ba` |

`p=none` znači „samo prati, ništa ne odbacuj“. Nakon mjesec dana bez problema
možete pooštriti na `p=quarantine`.

### Ako nemate domenu

Za testiranje koristite Resendovu domenu:

```bash
EMAIL_FROM=ServisLoop <onboarding@resend.dev>
```

⚠️ Radi **samo za slanje na vašu vlastitu adresu**. Za stvarne kupce domena je
obavezna.

---

## 4. Napravite API ključ

1. Resend → **API Keys** → **Create API Key**
2. **Name:** `servisloop-produkcija`
3. **Permission:** `Sending access` (ne `Full access` — ne treba nam više)
4. **Domain:** odaberite svoju domenu
5. Kopirajte ključ (počinje sa `re_`) — **prikazuje se samo jednom**

U `.env.local`:

```bash
RESEND_API_KEY=re_vas_kljuc_ovdje
EMAIL_FROM=ServisLoop <servis@servisloop.ba>
EMAIL_REPLY_TO=podrska@servisloop.ba
EMAIL_DRY_RUN=0
```

> `EMAIL_FROM` mora koristiti **verifikovanu** domenu, inače Resend odbija slanje.
>
> `EMAIL_REPLY_TO` je adresa na koju stiže odgovor kupca. Neka to bude adresa
> koju stvarno čitate — kupci odgovaraju na podsjetnike.

---

## 5. Provjerite da radi

```bash
npm run dev
```

Otvorite `/app/podsjetnici` i kliknite **Pošalji probnu poruku**. Stiže na
vašu adresu.

Ako ne stigne:

1. Provjerite neželjenu poštu.
2. Resend → **Logs** — vidi se svaki pokušaj i razlog neuspjeha.
3. U aplikaciji `/app/podsjetnici` — status i poruka o grešci.

---

## 6. Koje poruke sistem šalje

| Predložak                   | Kada                       | Kome        |
| --------------------------- | -------------------------- | ----------- |
| `service_reminder`          | 30 i 14 dana prije roka    | kupcu       |
| `service_reminder_final`    | 3 dana prije i na dan roka | kupcu       |
| `service_overdue`           | nakon isteka (opciono)     | kupcu       |
| `booking_confirmation`      | nakon rezervacije          | kupcu       |
| `booking_rescheduled`       | nakon pomjeranja termina   | kupcu       |
| `booking_cancelled`         | nakon otkazivanja          | kupcu       |
| `issue_report_confirmation` | nakon prijave kvara        | kupcu       |
| `work_order_assigned`       | pri dodjeli naloga         | tehničaru   |
| `service_completed`         | nakon zatvaranja servisa   | kupcu       |
| `service_report_delivery`   | uz PDF izvještaj           | kupcu       |
| `team_invitation`           | pri pozivu u tim           | novom članu |

Svi tekstovi su na bosanskom i nalaze se u `components/emails/templates.tsx`.

Svaka poruka ima:

- HTML i **čisti tekst** (neki klijenti prikazuju samo tekst);
- logo i kontakt firme;
- link za odjavu gdje je primjenjivo (`List-Unsubscribe` zaglavlje).

---

## 7. Isporučivost — praktični savjeti

| Savjet                                                | Zašto                                           |
| ----------------------------------------------------- | ----------------------------------------------- |
| Šaljite s **poddomene** (`servis@mail.servisloop.ba`) | reputacija glavne domene ostaje netaknuta       |
| Nemojte odmah slati stotine poruka                    | novi šiljalac s velikim obimom izgleda sumnjivo |
| Prvih sedam dana šaljite manje                        | postepeno zagrijavanje domene                   |
| Odgovarajte na odgovore kupaca                        | interakcija podiže reputaciju                   |
| Uklonite adrese koje se stalno vraćaju                | visok postotak vraćanja šteti svima             |
| Provjerite Resend **Logs** sedmično                   | rani znak problema                              |

---

## 8. Dodavanje SMS-a ili Vibera kasnije

Motor podsjetnika **ne zna** za Resend. Zna samo za sučelje `MessageProvider`
(`lib/email/provider.ts`):

```ts
export interface MessageProvider {
  readonly name: string
  readonly channel: MessageChannel // 'email' | 'sms' | 'viber' | 'whatsapp'
  readonly isLive: boolean
  send(message: OutgoingMessage): Promise<SendResult>
}
```

Za dodavanje SMS-a:

1. Napišite klasu koja implementira ovo sučelje.
2. Dodajte je u `getProviderForChannel()`.
3. U pravilu podsjetnika promijenite kanal na `sms`.

Baza već podržava sve kanale (`reminder_rules.channel`). **Logika podsjetnika,
deduplikacija i ponovni pokušaji ostaju netaknuti.**

---

## 9. Lista provjere

- [ ] Domena verifikovana kod Resenda (zeleni status)
- [ ] SPF, DKIM i DMARC zapisi dodani
- [ ] API ključ ima samo `Sending access`
- [ ] `EMAIL_FROM` koristi verifikovanu domenu
- [ ] `EMAIL_REPLY_TO` je adresa koju stvarno čitate
- [ ] `EMAIL_DRY_RUN=0` u produkciji
- [ ] Probna poruka stigla u dolazne, ne u neželjene
- [ ] Probna poruka je čitljiva na telefonu
- [ ] Bosanska slova (č, ć, ž, š, đ) se ispravno prikazuju
