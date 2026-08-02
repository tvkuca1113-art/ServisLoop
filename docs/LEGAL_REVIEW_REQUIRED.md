# Šta mora pregledati pravnik (i računovođa)

> **Ovo nije pravni savjet.** Ovo je popis stvari koje smo tehnički postavili, a
> koje netko s pravnom kvalifikacijom mora pregledati prije nego što naplatite
> prvom kupcu.

ServisLoop primjenjuje tehničke mjere zaštite opisane u
[`SECURITY.md`](SECURITY.md). **Ne tvrdimo** da je time zagarantovana usklađenost
s GDPR-om, sa Zakonom o zaštiti ličnih podataka BiH ni s bilo kojim drugim propisom.

---

## 1. Za pravnika — prioritet VISOK

### 1.1 Uloga u obradi podataka

Sistem podrazumijeva sljedeću podjelu:

- **Servisna firma** (vaš kupac) = kontrolor podataka svojih kupaca.
- **ServisLoop** (vi) = obrađivač koji obrađuje podatke po nalogu firme.

**Za provjeru:**

- [ ] Je li ta podjela ispravna u BiH pravnom okviru?
- [ ] Treba li vam **ugovor o obradi podataka** sa svakom servisnom firmom?
- [ ] Nacrt takvog ugovora ne postoji — treba ga napisati.

### 1.2 Pravni osnov za slanje podsjetnika

Sistem šalje poruku kupcu servisne firme o roku servisa njegovog uređaja.

**Za provjeru:**

- [ ] Je li to legitimni interes, izvršenje ugovora ili traži pristanak?
- [ ] Sistem razdvaja **pristanak na servisne podsjetnike** od **marketinškog
      pristanka** (polja `reminder_consent` i `marketing_consent`). Je li ta
      podjela dovoljna?
- [ ] Polje `consent_source` bilježi odakle pristanak dolazi. Koje vrijednosti su
      pravno prihvatljive?

### 1.3 Politika privatnosti i uslovi korištenja

U repozitoriju postoje **nacrti** na stranicama `/politika-privatnosti` i
`/uslovi-koristenja`.

- [ ] **Nacrte je napisao programer, ne pravnik.** Moraju se prepisati.
- [ ] Treba navesti stvarne primaoce podataka: Supabase (baza, EU regija),
      Vercel (hosting), Resend (e-pošta).
- [ ] Treba navesti stvarne rokove čuvanja.
- [ ] Treba opisati postupak za pristup, ispravku i brisanje podataka.

### 1.4 Prenos podataka izvan EU

- **Supabase** — regija se bira pri kreiranju projekta. **Odaberite EU regiju**
  (npr. Frankfurt). Provjerite da je odabrana.
- **Vercel** — `vercel.json` postavlja regiju `fra1` (Frankfurt).
- **Resend** — provjerite gdje se obrađuju poruke.

**Za provjeru:**

- [ ] Je li potreban mehanizam za prenos podataka i koji?
- [ ] Ima li BiH poseban zahtjev koji se razlikuje od GDPR-a?

### 1.5 Prava kupaca krajnjih korisnika

Kupac servisne firme (npr. vlasnik klime) ima podatke u sistemu, ali **nema
korisnički nalog**.

- [ ] Kako takva osoba ostvaruje pravo na pristup i brisanje?
- [ ] Trenutno se mora obratiti servisnoj firmi. Je li to dovoljno?
- [ ] Javna stranica uređaja prikazuje maskiran serijski broj i sažetu historiju.
      Je li obim prikazanih podataka prihvatljiv?

---

## 2. Za pravnika — prioritet SREDNJI

### 2.1 Servisni izvještaj

- [ ] Ima li PDF izvještaj bilo kakvu pravnu težinu (dokaz o izvršenoj usluzi)?
- [ ] Je li elektronski potpis prstom na ekranu dovoljan?
- [ ] Sistem čuva ime potpisnika i vrijeme potpisa. Treba li više?
- [ ] Tekst odricanja na dnu izvještaja podesiv je u postavkama — **treba ga
      napisati pravnik**.

### 2.2 Odgovornost za propušten servis

- [ ] Šta ako podsjetnik ne stigne (kupac promijenio adresu, poruka u neželjenoj
      pošti), a uređaj se pokvari?
- [ ] Uslovi korištenja moraju jasno reći da ServisLoop **organizuje** servis, a
      ne **garantuje** da će kupac biti obaviješten.

### 2.3 Prijava kvara i sigurnost

Kad kupac označi dim, plin ili gorenje, sistem prikazuje upozorenje da prestane
koristiti uređaj i pozove nadležnu službu.

- [ ] Je li formulacija upozorenja pravno dovoljna?
- [ ] Treba li navesti konkretne brojeve nadležnih službi?
- [ ] Sistem **nikad** ne daje upute za popravku. Potvrdite da je to ispravno.

### 2.4 Uslovi pretplate

- [ ] Otkazni rok, povrat sredstava, promjena cijene.
- [ ] Šta se dešava s podacima nakon prestanka pretplate?
      Tehnički: podaci ostaju dostupni za čitanje i izvoz, prestaje samo slanje.
      **Je li to pravno prihvatljivo i kako dugo?**

---

## 3. Za računovođu

- [ ] **PDV** — je li SaaS pretplata oporeziva i po kojoj stopi?
- [ ] **Prodaja izvan BiH** (Hrvatska, Srbija, Njemačka) — kako se tretira?
- [ ] **Fakturisanje** — ServisLoop ne izdaje račune. Kako ćete ih izdavati?
- [ ] **Fiskalizacija** — vrijedi li obaveza za digitalne usluge?
- [ ] **Oblik firme** — obrt, d.o.o. ili nešto treće?
- [ ] **Priznavanje prihoda** — mjesečna pretplata naplaćena godišnje.
- [ ] **Trošak alata** — Vercel, Supabase, Resend su inozemne usluge.

---

## 4. Šta je tehnički već pripremljeno

Ovo **ne znači usklađenost**, ali olakšava posao pravniku:

| Mjera                                        | Gdje                                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Odvojen pristanak za podsjetnike i marketing | `customers.reminder_consent`, `customers.marketing_consent` |
| Izvor i vrijeme pristanka                    | `customers.consent_source`, `consent_recorded_at`           |
| Link za odjavu u svakoj poruci               | `List-Unsubscribe` zaglavlje + link u podnožju              |
| Zapis o svakoj poslanoj poruci               | tabela `email_messages`                                     |
| Revizijski dnevnik izmjena                   | tabela `audit_events`                                       |
| Izolacija podataka između firmi              | RLS politike, provjereno s 32 testa                         |
| Maskiranje serijskog broja i e-pošte javno   | `lib/format.ts`                                             |
| Heširanje IP adrese umjesto pohrane          | `lib/security/tokens.ts`                                    |
| Podesiv rok čuvanja podataka                 | `organization_settings.data_retention_months`               |
| Postupak brisanja                            | [`DATA_DELETION.md`](DATA_DELETION.md)                      |
| Postupak izvoza                              | [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md)            |

---

## 5. Šta reći kupcu dok pravni pregled nije gotov

Iskreno i kratko:

> „ServisLoop tehnički štiti podatke: svaka firma vidi samo svoje, podaci su u
> EU, poruke imaju link za odjavu, a sve izmjene se bilježe. Pravni pregled
> usklađenosti je u toku. Ako vam treba potpisan ugovor o obradi podataka,
> javite — pripremamo ga.“

**Nemojte reći:** „usklađeni smo s GDPR-om“, „sve je po zakonu“, „garantujemo
zaštitu podataka“. Dok pravnik ne potvrdi, to nije istina koju možete braniti.
