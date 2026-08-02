# Poznata ograničenja

> Ovaj dokument postoji da nikad ne obećate kupcu nešto što sistem ne radi.
> Čitajte ga prije svake prodajne prezentacije.

Stanje: **MVP za kontrolisano testiranje.** Sistem radi, ali nije prošao rad s
velikim brojem stvarnih firmi.

---

## 1. Šta NIJE implementirano

| Funkcija                                       | Stanje        | Šta postoji umjesto toga                                                                                                                                          |
| ---------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Naplata karticom**                           | ❌ nije       | Pretplata se postavlja ručno. Adapter za vanjskog obrađivača plaćanja je pripremljen (`domains/billing/`), ali nije povezan. **Nema lažnog „plaćanje uspješno“.** |
| **SMS podsjetnici**                            | ❌ nije       | Sučelje `MessageProvider` (`lib/email/provider.ts`) je pripremljeno. Dodavanje traži novu implementaciju, bez ijedne izmjene u logici podsjetnika.                |
| **Viber / WhatsApp**                           | ❌ nije       | Isto kao SMS.                                                                                                                                                     |
| **Sinhronizacija s Google/Outlook kalendarom** | ❌ nije       | Termini postoje samo u ServisLoop-u.                                                                                                                              |
| **Optimizacija ruta tehničara**                | ❌ nije       | Raspored je ručni. Adresa ima link na vanjsku mapu.                                                                                                               |
| **Automatski proračun vremena putovanja**      | ❌ nije       | Razmak između posjeta je fiksan (podesiv u postavkama).                                                                                                           |
| **Native mobilna aplikacija**                  | ❌ nije       | Web aplikacija radi u pregledniku telefona i prilagođena je dodiru.                                                                                               |
| **Dinamički cjenovnik**                        | ❌ nije       | Cijena je po uređaju ili po servisnom planu.                                                                                                                      |
| **Fakturisanje i fiskalizacija**               | ❌ nije       | ServisLoop nije knjigovodstveni program. Servisni izvještaj nije račun.                                                                                           |
| **Skladište i stanje dijelova**                | ❌ nije       | Materijali se upisuju po nalogu, bez praćenja zaliha.                                                                                                             |
| **Više organizacija po korisniku**             | ⚠️ djelimično | Baza i sučelje podržavaju, ali MVP korisnika veže za jednu firmu.                                                                                                 |

---

## 2. Ograničenja koja postoje u onome što JESTE implementirano

### Uvoz podataka

- Maksimalna veličina datoteke: **15 MB**.
- Maksimalan broj redova po uvozu ovisi o planu (500 na probnom, 25.000 na Pro).
- Obrada ide u serijama kroz serverski zahtjev; **nema pravog reda čekanja u pozadini**.
  Vrlo velik fajl može premašiti vremensko ograničenje Vercel funkcije. Rješenje:
  podijelite ga na više manjih.
- Prepoznaju se `.csv` i `.xlsx`. **`.xls` (stari Excel format) nije podržan** —
  otvorite ga u Excelu i sačuvajte kao `.xlsx`.

### E-pošta

- Besplatni plan Resenda: **3.000 poruka mjesečno, 100 dnevno**. Firma sa 300 uređaja
  i četiri podsjetnika po roku lako pređe dnevni limit u vršnim danima.
- Domena mora biti verifikovana kod Resenda, inače poruke idu u neželjenu poštu.
- **Nema praćenja otvaranja poruka.** Znamo je li poruka predana pružaocu usluge,
  ne i je li je kupac pročitao.

### Rezervacije

- Termini su na fiksnoj mreži (trajanje + razmak). Nema proizvoljnog vremena.
- Kapacitet se broji po vremenu početka, ne po tehničaru pojedinačno.
- **Nema liste čekanja** kad su svi termini popunjeni.
- Otkazivanje od strane firme ne nudi automatski zamjenski termin.

### Podsjetnici

- Šalju se **jednom dnevno**, u sat koji je firma podesila. Nije trenutno.
- Ako je kupac naveden bez e-mail adrese, podsjetnik se **ne šalje** i uređaj se
  pojavljuje u listi „Kupci bez kontakt podataka“.
- Podsjetnik ide na **primarnu adresu kupca**, ne na više adresa odjednom.

### PDF izvještaji

- Generišu se na zahtjev, pri prvom otvaranju. Prvi otvor traje nekoliko sekundi.
- Ugrađen je font DejaVu Sans (podržava č, ć, ž, š, đ). **Ćirilica i drugi pisma
  nisu testirani.**
- Vrlo dugačke bilješke se prelamaju, ali izuzetno duge tabele materijala mogu
  preći na sljedeću stranicu na mjestu koje nije idealno.

### Pretraga

- Traži po imenu, e-pošti, telefonu, modelu, serijskom broju i broju dokumenta.
- **Ne traži** po sadržaju bilješki ni po tekstu prijava kvara.
- Vraća najviše 5 rezultata po vrsti.

### Javna stranica uređaja

- Radi bez prijave, preko tokena. **Ko ima link, ima pristup toj stranici.**
  Zato stranica ne prikazuje cijene, interne bilješke ni punu adresu.
- Token se može poništiti, ali tada **prestaje raditi i naljepnica na uređaju**.

---

## 3. Tehnička ograničenja

### Ograničavanje pristupa javnim formama

Brojači se čuvaju u tabeli `rate_limits` u PostgreSQL-u, ne u Redisu. To je dovoljno
za promet MVP-a, ali:

- pri vrlo velikom prometu upisi u tu tabelu postaju usko grlo;
- brojanje je po IP adresi, pa korisnici iza istog mrežnog izlaza dijele kvotu.

**Kad ovo postane problem:** iznad ~50 zahtjeva u sekundi na javnim formama.

### Vremenska zona

Rokovi servisa su kalendarski datumi (`date`), bez vremena. Zona firme se koristi
samo da se odredi „koji je danas dan“. Firma koja radi u dvije vremenske zone
morala bi imati dvije organizacije.

### Vrijeme izvršavanja

Cron posao ima ograničenje od 300 sekundi (`maxDuration`). Pri vrlo velikom broju
organizacija posao bi trebalo podijeliti u više poziva. **Trenutna granica: oko
200–400 organizacija po pokretanju**, ovisno o broju uređaja.

### Softversko brisanje

Kupci, lokacije i uređaji se „mekano“ brišu (`deleted_at`), pa ostaju u bazi.
Trajno brisanje opisano je u [`DATA_DELETION.md`](DATA_DELETION.md).

---

## 4. Odluke o zavisnostima

| Odluka                          | Razlog                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ExcelJS umjesto SheetJS**     | Verzija SheetJS-a dostupna na npm-u (`xlsx@0.18.5`) ima poznatu ranjivost, a novije verzije se distribuiraju izvan npm registra, što otežava reviziju zavisnosti. ExcelJS je na npm-u i pokriva sve što nam treba. |
| **Vlastiti CSV parser**         | Potpuna kontrola nad `;` vs `,`, BOM-om, navodnicima i decimalnim zarezom — sve su to stvarni problemi domaćih izvoza.                                                                                             |
| **Vlastiti predlošci e-pošte**  | Paket `@react-email/components` je na npm-u označen kao nepodržan. Zadržali smo `@react-email/render` (održavan) i sami napisali elemente.                                                                         |
| **Bez `tailwindcss-animate`**   | Nekoliko keyframe animacija je jeftinije od još jedne zavisnosti.                                                                                                                                                  |
| **Vlastiti pokretač migracija** | Supabase CLI lokalno traži Docker, a uslov projekta je da osnivač ne mora instalirati Docker.                                                                                                                      |

---

## 5. Šta nije testirano

- Rad s **više od 5.000 uređaja** u jednoj organizaciji.
- Rad s **više od 50 organizacija** istovremeno.
- Isporuka e-pošte na domaće poštanske servere u većem obimu.
- Ponašanje pri **djelimičnom ispadu Supabase-a**.
- Vraćanje podataka iz sigurnosne kopije **pod pritiskom** (probajte to prije nego
  što zatreba — vidi [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md)).

---

## 6. Šta NIKAD nećemo raditi automatski

Ovo su svjesne odluke, ne propusti:

| Nikad                                  | Zašto                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------- |
| AI ne određuje datume servisa          | Rok je obaveza prema kupcu. Mora biti provjerljiv i ponovljiv.            |
| AI ne odlučuje o dozvolama             | Pristup podacima ne smije ovisiti o vjerovatnoći.                         |
| AI ne računa novac                     | Isto.                                                                     |
| AI ne procjenjuje sigurnosne kvarove   | Dim, plin i gorenje traže čovjeka i nadležnu službu, ne prijedlog modela. |
| AI ne određuje status garancije        | To je pravno pitanje s jasnim datumima.                                   |
| Sistem ne daje upute za popravku kupcu | Kupac nije serviser. Uputa koja izgleda korisno može biti opasna.         |

Sve AI funkcije su **opcione**, isključene po defaultu i rade samo kao pomoć pri
pisanju teksta — uvijek uz ljudsku potvrdu.
