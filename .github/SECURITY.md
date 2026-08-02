# Prijava sigurnosnog propusta

## Ne otvarajte javni issue

Ako ste pronašli propust koji bi omogućio pristup tuđim podacima, zaobilaženje
prijave ili slanje poruka u tuđe ime — **nemojte ga objaviti javno**.

Javna prijava daje napadaču uputstvo prije nego što stignemo popraviti propust.
Podaci koje ovaj sistem čuva govore ko šta ima ugrađeno kod kuće.

## Kako prijaviti

**E-pošta:** `podrska@servisloop.ba`

Ili preko GitHuba: **Security → Report a vulnerability** (privatno je).

Molimo uključite:

- opis propusta;
- korake za ponavljanje;
- šta ste uspjeli postići (npr. „pročitao sam kupca druge firme“);
- verziju ili commit na kojem ste ga našli.

## Šta možete očekivati

| Kada                     | Šta                                      |
| ------------------------ | ---------------------------------------- |
| U roku od 3 radna dana   | potvrda da smo primili prijavu           |
| U roku od 10 radnih dana | procjena ozbiljnosti i plan ispravke     |
| Nakon ispravke           | obavijest i, ako želite, javno priznanje |

Ovo je proizvod u ranoj fazi s malim timom. Rokovi su iskreni, ne marketinški.

## Šta smatramo propustom

- pristup podacima druge organizacije u bilo kojem obliku;
- zaobilaženje prijave ili preuzimanje tuđe sesije;
- podizanje vlastite uloge (npr. tehničar postaje vlasnik);
- pogađanje ili izvođenje javnih tokena (QR, rezervacija, izvještaj);
- pokretanje rasporednih poslova bez `CRON_SECRET`-a;
- ubacivanje koda kroz uvoz podataka ili prijavu kvara;
- otkrivanje tajni u odgovorima servera ili u paketu koji ide pregledniku.

## Šta ne smatramo propustom

- nedostatak zaglavlja koje nema stvarnog uticaja u ovom kontekstu;
- prijave iz automatskih skenera bez dokaza da se propust može iskoristiti;
- napad koji traži da napadač već ima pristup nalogu žrtve;
- ograničenja koja su svjesno navedena u [`docs/KNOWN_LIMITATIONS.md`](../docs/KNOWN_LIMITATIONS.md);
- to što besplatni plan pauzira bazu nakon 7 dana neaktivnosti.

## Sigurnosni model

Detaljno je opisan u [`docs/SECURITY.md`](../docs/SECURITY.md).

Ukratko: izolacija između firmi počiva na PostgreSQL row-level security
politikama, a ne na aplikacijskoj logici. Provjeru možete pokrenuti i sami:

```bash
npm run db:verify-rls
```

Skript pravi dvije stvarne organizacije i pokušava probiti izolaciju na 32
načina. Ako bilo koji od njih uspije — to je propust i želimo za njega znati.

## Zahvalnost

Ako prijavite propust koji potvrdimo, rado ćemo vas navesti u napomenama uz
izdanje. Nagradnog programa trenutno nema.
