# Procjena troškova

Sve cijene su iz objavljenih cjenovnika i mogu se promijeniti. Provjerite
aktuelne prije nego što računate na njih.

---

## 1. Faza validacije (1–10 firmi)

| Usluga                  | Plan                | Mjesečno   |
| ----------------------- | ------------------- | ---------- |
| Vercel                  | Hobby               | **0 €**    |
| Supabase                | Free                | **0 €**    |
| Resend                  | Free (3.000 poruka) | **0 €**    |
| Domena `.ba` ili `.com` | —                   | **~1–5 €** |
| **Ukupno**              |                     | **~1–5 €** |

Od budžeta od 300 € praktično sve ostaje za marketing i pravni pregled.

### Šta pokriva besplatan plan

| Ograničenje       | Vrijednost        | Koliko je to                  |
| ----------------- | ----------------- | ----------------------------- |
| Supabase baza     | 500 MB            | ~50.000 uređaja s historijom  |
| Supabase datoteke | 1 GB              | ~2.000 fotografija sa servisa |
| Supabase promet   | 5 GB/mj           | dovoljno za desetak firmi     |
| Vercel promet     | 100 GB/mj         | daleko iznad potrebnog        |
| Vercel funkcije   | 100 GB-h/mj       | dovoljno                      |
| Resend poruke     | 3.000/mj, 100/dan | ~7 firmi sa 300 uređaja       |

### Na šta paziti

> **Supabase besplatan plan pauzira projekt nakon 7 dana bez prometa.**
> U fazi validacije to se lako desi. Rješenje: dnevni cron posao ionako gađa
> bazu, pa je projekt aktivan.

> **Resend dnevni limit od 100 poruka.** Firma sa 300 uređaja u vršnom danu
> može ga probiti. Rješenje: rasporedite rokove servisa ili pređite na plaćeni
> plan (20 $/mj).

---

## 2. Deset firmi

| Usluga     | Plan  | Mjesečno |
| ---------- | ----- | -------- |
| Vercel     | Hobby | 0 €      |
| Supabase   | Free  | 0 €      |
| Resend     | Free  | 0 €      |
| Domena     | —     | 3 €      |
| **Ukupno** |       | **~3 €** |

**Prihod pri 10 firmi na planu Start (59 KM ≈ 30 €):** ~300 €/mj.
**Marža: preko 99 %.**

Deset firmi je otprilike:

- 3.000 uređaja,
- 1.000 podsjetnika mjesečno,
- 200 MB baze.

Sve još staje u besplatne planove.

---

## 3. Sto firmi

| Usluga                    | Plan                | Mjesečno        |
| ------------------------- | ------------------- | --------------- |
| Vercel                    | Pro                 | 20 $ ≈ **19 €** |
| Supabase                  | Pro                 | 25 $ ≈ **23 €** |
| Resend                    | Pro (50.000 poruka) | 20 $ ≈ **19 €** |
| Domena                    | —                   | 3 €             |
| Praćenje grešaka (Sentry) | Free                | 0 €             |
| **Ukupno**                |                     | **~64 €**       |

**Prihod pri 100 firmi (prosjek 80 KM ≈ 41 €):** ~4.100 €/mj.
**Marža: ~98 %.**

Sto firmi je otprilike:

- 30.000 uređaja,
- 10.000 podsjetnika mjesečno,
- 2 GB baze,
- 10 GB datoteka.

### Zašto Pro planovi

| Prelazak     | Razlog                                                 |
| ------------ | ------------------------------------------------------ |
| Vercel Pro   | Hobby je licenciran samo za nekomercijalnu upotrebu    |
| Supabase Pro | 8 GB baze, dnevne kopije 7 dana, projekt se ne pauzira |
| Resend Pro   | preko 3.000 poruka mjesečno                            |

---

## 4. Hiljadu firmi

| Usluga                    | Plan                     | Mjesečno   |
| ------------------------- | ------------------------ | ---------- |
| Vercel                    | Pro + promet             | ~**90 €**  |
| Supabase                  | Pro + 50 GB baze         | ~**120 €** |
| Supabase                  | dodatnih 100 GB datoteka | ~**19 €**  |
| Resend                    | Scale (100.000 poruka)   | ~**80 €**  |
| Sentry                    | Team                     | ~**26 €**  |
| Domena i ostalo           | —                        | **5 €**    |
| **Infrastruktura ukupno** |                          | **~340 €** |

Ali pri toj veličini pojavljuju se i troškovi koji nisu serveri:

| Stavka                                             | Mjesečno     |
| -------------------------------------------------- | ------------ |
| Podrška korisnicima (1 osoba, pola radnog vremena) | ~800 €       |
| Računovodstvo                                      | ~150 €       |
| Naknade obrađivača plaćanja (~3 % prihoda)         | ~1.200 €     |
| **Ukupno s ljudima**                               | **~2.500 €** |

**Prihod pri 1.000 firmi (prosjek 80 KM ≈ 41 €):** ~41.000 €/mj.
**Marža nakon svega: ~94 %.**

---

## 5. Sažetak

| Firmi | Infrastruktura | Prihod (procjena) | Marža             |
| ----- | -------------- | ----------------- | ----------------- |
| 1–10  | ~3 €           | ~300 €            | >99 %             |
| 100   | ~64 €          | ~4.100 €          | ~98 %             |
| 1.000 | ~340 €         | ~41.000 €         | ~99 % (bez ljudi) |

**Trošak infrastrukture nije prepreka.** Prepreka je pronaći firme koje plaćaju.

---

## 6. Šta može pokvariti računicu

| Rizik                              | Šta se dešava              | Kako spriječiti                            |
| ---------------------------------- | -------------------------- | ------------------------------------------ |
| Firma uveze 50.000 uređaja         | baza naraste, upiti uspore | limiti po planu su već implementirani      |
| Firma šalje 10.000 poruka mjesečno | probije Resend kvotu       | `maxMonthlyEmails` po planu                |
| Neko zloupotrijebi javne forme     | trošak funkcija            | ograničavanje pristupa je implementirano   |
| Veliki uvoz svaki dan              | trošak funkcija            | `maxImportRows` po planu                   |
| Puno fotografija po servisu        | trošak pohrane             | 25 MB po datoteci, razmislite o kompresiji |

Svi limiti su definisani u `domains/billing/plans.ts` i provjeravaju se na
serveru prije svake radnje koja troši kvotu.

---

## 7. Šta NE plaćati u fazi validacije

| Alat              | Zašto ne                           | Šta umjesto                  |
| ----------------- | ---------------------------------- | ---------------------------- |
| Plaćena analitika | trošak bez odgovora koji vam treba | tabela `analytics_events`    |
| Alat za podršku   | premalo korisnika                  | e-pošta                      |
| CRM               | premalo firmi                      | tabela                       |
| Alat za nadzor    | Vercel logovi su dovoljni          | `/api/health` + `/app/admin` |
| Plaćeni CI        | GitHub Actions ima besplatnu kvotu | GitHub Actions               |
| Dizajner          | proizvod već izgleda profesionalno | —                            |

**Prvi euro koji vrijedi potrošiti izvan infrastrukture je pravni pregled**
([`LEGAL_REVIEW_REQUIRED.md`](LEGAL_REVIEW_REQUIRED.md)), ne alat.
