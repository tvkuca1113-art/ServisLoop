## Šta ova promjena radi

<!-- Jedna do tri rečenice. Šta se mijenja i zašto — ne kako. -->

## Zašto

<!-- Koji problem rješava? Ako postoji issue, poveži ga: Closes #123 -->

## Kako sam provjerio

<!-- Konkretno. „Testirao sam“ nije provjera. -->

- [ ] `npm run verify` prolazi (format → lint → typecheck → testovi → build)
- [ ] `npm run test:integration` prolazi
- [ ] `npm run db:verify-rls` daje **32/32**
- [ ] Ručno provjereno u pregledniku

## Utiče li na podatke ili sigurnost?

<!-- Odgovori na svako pitanje. Ako je odgovor „da“, objasni. -->

- [ ] Dodaje ili mijenja **SQL migraciju**
- [ ] Mijenja **RLS politiku** ili provjeru dozvola
- [ ] Dodira **javne rute** (`/u/*`, `/rezervacija/*`, `/izvjestaj/*`)
- [ ] Mijenja **logiku podsjetnika** ili računanje rokova
- [ ] Dodaje novu **varijablu okruženja** (dodana i u `.env.example`?)
- [ ] Ništa od navedenog

> Ako mijenjaš migraciju koja je već objavljena — **nemoj**. Dodaj novu.
> Ako mijenjaš logiku podsjetnika — mora imati test koji dokazuje da se
> poruka i dalje ne može poslati dvaput.

## Snimci ekrana

<!-- Za promjene u sučelju: prije i poslije. Uključi i mobilni prikaz. -->

## Napomene za pregledaoca

<!-- Šta da gleda prvo? Ima li nečeg o čemu nisi siguran? -->
