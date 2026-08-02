# Pet pretpostavki koje morate provjeriti sa stvarnim kupcima

Kod je napisan. Sad slijedi teži dio: provjeriti da li iko ovo želi.

Ovo su pretpostavke na kojima cijeli proizvod stoji, poredane po tome koliko
bole ako su pogrešne. Svaka ima **jasan test** i **jasan prag**.

---

## Rizik 1 — Da li kupci uopšte odgovaraju na podsjetnik?

**Pretpostavka:** kad kupac dobije poruku „servis vaše klime dospijeva
15.04.“, značajan dio njih rezerviše termin.

**Zašto je najveći rizik:** cijeli proizvod je izgrađen oko ovoga. Ako je
stopa odgovora 3 %, ServisLoop ne rješava ništa — firma i dalje mora zvati.

**Kako provjeriti — bez pisanja ijedne linije koda:**

1. Nađite jednu servisnu firmu spremnu na saradnju.
2. Uzmite 100 njihovih kupaca kojima servis dospijeva u sljedećih 60 dana.
3. Pošaljite im poruku **ručno**, tekstom iz ServisLoop predloška.
4. Brojite koliko ih odgovori u 14 dana.

**Prag:**

| Rezultat    | Značenje                                                |
| ----------- | ------------------------------------------------------- |
| **> 25 %**  | proizvod ima smisla, nastavite                          |
| **10–25 %** | ima smisla, ali poruka i vrijeme slanja trebaju rad     |
| **< 10 %**  | preispitajte cijelu premisu prije nego što uložite više |

**Ovo možete testirati ove sedmice, prije nego što iko instalira sistem.**

---

## Rizik 2 — Ima li firma uopšte upotrebljivu bazu?

**Pretpostavka:** HVAC firme imaju popis ugrađene opreme s kupcem, datumom i
kontaktom — barem u Excelu.

**Zašto boli ako je pogrešno:** bez baze nema šta da se prati. Ako firma ima
samo papirne radne naloge iz pet godina, unos je posao od nekoliko sedmica
koji niko neće platiti.

**Kako provjeriti:**

Pitajte pet firmi tačno ovo:

> „Možete li mi za pet minuta pokazati popis klima koje ste ugradili prošle
> godine, s imenom kupca i brojem telefona?“

**Prag:**

| Rezultat          | Značenje                                                         |
| ----------------- | ---------------------------------------------------------------- |
| **4–5 od 5 može** | uvoz je izvediv, nastavite                                       |
| **2–3 od 5**      | treba ponuditi uslugu unosa kao dodatak                          |
| **0–1 od 5**      | proizvod traži rješenje za unos prije nego što donese vrijednost |

**Ako je odgovor loš:** razmislite da prvi korak bude „ubacite uređaj pri
ugradnji“, a ne „uvezite postojeću bazu“. To mijenja poziciju proizvoda.

---

## Rizik 3 — Da li 59 KM mjesečno izgleda skupo?

**Pretpostavka:** firma koja od jednog servisa zaradi 70–180 KM smatra
59 KM mjesečno jeftinim.

**Zašto boli ako je pogrešno:** matematika je očigledna nama, ali firma koja
nikad nije plaćala softver često ima psihološku granicu oko 20–30 KM.

**Kako provjeriti:**

Pitajte, prije nego što kažete cijenu:

> „Koliko biste mjesečno platili za nešto što vam vrati 5 servisa mjesečno
> koje inače ne biste odradili?“

Slušajte broj koji sami kažu. Tek onda recite cijenu.

**Prag:**

| Rezultat               | Značenje                                                     |
| ---------------------- | ------------------------------------------------------------ |
| **Sami kažu > 100 KM** | cijena je preniska, razmislite o povećanju                   |
| **Kažu 40–100 KM**     | cjenovnik je dobar                                           |
| **Kažu < 30 KM**       | ili je vrijednost nejasna, ili tržište ne podnosi ovu cijenu |

**Dodatno pitajte:** „Ko u firmi odlučuje o ovakvom trošku?“ Ako odgovor nije
osoba s kojom pričate, prodajni ciklus je duži nego što mislite.

---

## Rizik 4 — Hoće li tehničari zaista zatvarati naloge na telefonu?

**Pretpostavka:** tehničar će na kraju servisa uzeti telefon, proći čeklistu,
dati kupcu da potpiše i zatvoriti nalog.

**Zašto boli ako je pogrešno:** ako tehničari to ne rade, nema servisnih
zapisa, nema PDF izvještaja i **nema novog roka servisa** — petlja se prekida
i proizvod prestaje raditi nakon prvog kruga.

**Kako provjeriti:**

1. Postavite sistem u jednoj firmi.
2. Pustite dva tehničara da rade dvije sedmice.
3. Mjerite: **koliko posto naloga je zatvoreno na terenu, isti dan?**

**Prag:**

| Rezultat    | Značenje                                                                         |
| ----------- | -------------------------------------------------------------------------------- |
| **> 80 %**  | tok posla je prihvaćen                                                           |
| **50–80 %** | pojednostavite čeklistu i smanjite obavezna polja                                |
| **< 50 %**  | tehničari to ne žele — treba drugačiji pristup (npr. dispečer zatvara po pozivu) |

**Šta gledati dok posmatrate:** koliko puta tehničar mora kucati, koliko dugo
traje zatvaranje, gdje zastane.

---

## Rizik 5 — Rješava li ovo dovoljno veliki problem?

**Pretpostavka:** propušteni servisi su stvaran, osjetan gubitak, a ne sitnica.

**Zašto boli ako je pogrešno:** firma može reći „zanimljivo“ i nikad ne
platiti. Proizvod koji rješava problem koji nikoga ne boli ne prodaje se.

**Kako provjeriti:**

Pitajte:

> „Od 100 klima koje ste ugradili prije dvije godine, koliko ih se vratilo
> na servis?“

Zatim:

> „Šta ste do sada pokušali da to popravite?“

**Prag:**

| Rezultat                                                       | Značenje                                          |
| -------------------------------------------------------------- | ------------------------------------------------- |
| Znaju broj i on je nizak (< 30 %), i **već su nešto pokušali** | problem je stvaran i osjećaju ga                  |
| Znaju broj, nizak je, ali nisu ništa pokušali                  | problem postoji, ali nije prioritet               |
| **Ne znaju broj**                                              | problem nije vidljiv — prvo im ga morate pokazati |

**Najjači signal:** firma koja je već pokušala rješavati ovo (Excel s
podsjetnicima, neko zove kupce jednom godišnje) — ta firma ima problem i
zna da ga ima.

---

## Kako mjeriti u samom sistemu

ServisLoop bilježi ove brojeve u tabeli `analytics_events`:

| Metrika                                     | Odgovara na rizik       |
| ------------------------------------------- | ----------------------- |
| `reminders_sent`                            | 1                       |
| `bookings_created` uz `source = 'reminder'` | **1 — najvažniji broj** |
| `rows_imported` po firmi                    | 2                       |
| `work_orders_completed`                     | 4                       |
| udio naloga zatvorenih isti dan             | 4                       |
| broj firmi aktivnih druge sedmice           | 5                       |

Konverzija podsjetnik → rezervacija vidi se na `/app/izvjestaji`.
**To je broj koji odlučuje o sudbini proizvoda.**

---

## Redoslijed provjere

```
Sedmica 1     Rizik 1 (ručne poruke)     ← bez sistema, najbrži odgovor
Sedmica 1–2   Rizik 2 i 5 (razgovori)    ← pet firmi, sat vremena svaka
Sedmica 3     Rizik 3 (cijena)           ← nakon što znate da problem postoji
Sedmica 4–6   Rizik 4 (jedna firma uživo) ← tek kad prva tri prođu
```

**Ne postavljajte sistem kod deset firmi prije nego što ručno provjerite
Rizik 1.** Jedan popodnevni test s ručno poslanim porukama vrijedi više od
mjeseca razvoja.
