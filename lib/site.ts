/**
 * Jedan izvor istine za marketinške tekstove i navigaciju.
 *
 * Tekst se drži ovdje (a ne raspršen po komponentama) da bi osnivač mogao
 * promijeniti poruku na jednom mjestu, bez diranja JSX-a.
 */

export const SITE = {
  name: 'ServisLoop',
  tagline: 'Servis koji se vraća sam.',
  heroHeadline: 'Svaki uređaj koji ste ugradili može vam ponovo donijeti prihod.',
  heroSubheadline:
    'ServisLoop automatski prati rokove servisa, podsjeća kupce, prima rezervacije i pretvara instaliranu opremu u organizovan izvor ponovljenog prihoda.',
  hook: 'Bez ručnih kalendara. Bez zaboravljenih kupaca. Bez izgubljenih servisnih rokova.',
  primaryCta: 'Pokreni besplatni demo',
  secondaryCta: 'Pogledaj kako radi',
  positioning: 'Automatski servisni podsjetnici, rezervacije i servisna historija za HVAC firme.',
  supportEmail: 'podrska@servisloop.ba',
  salesEmail: 'prodaja@servisloop.ba',
  phone: '+387 33 000 000',
  address: 'Sarajevo, Bosna i Hercegovina',
} as const

export const MARKETING_NAV = [
  { href: '/kako-radi', label: 'Kako radi' },
  { href: '/funkcije', label: 'Funkcije' },
  { href: '/cijene', label: 'Cijene' },
  { href: '/sigurnost', label: 'Sigurnost' },
  { href: '/demo', label: 'Demo' },
] as const

export const FOOTER_NAV = [
  {
    title: 'Proizvod',
    links: [
      { href: '/kako-radi', label: 'Kako radi' },
      { href: '/funkcije', label: 'Funkcije' },
      { href: '/cijene', label: 'Cijene' },
      { href: '/demo', label: 'Demo' },
    ],
  },
  {
    title: 'Povjerenje',
    links: [
      { href: '/sigurnost', label: 'Sigurnost podataka' },
      { href: '/politika-privatnosti', label: 'Politika privatnosti' },
      { href: '/uslovi-koristenja', label: 'Uslovi korištenja' },
    ],
  },
  {
    title: 'Kompanija',
    links: [
      { href: '/kontakt', label: 'Kontakt' },
      { href: '/prijava', label: 'Prijava' },
      { href: '/registracija', label: 'Otvori nalog' },
    ],
  },
] as const

/** Četiri koraka petlje — koriste ih 3D hero, sekcija toka i dokumentacija. */
export const LIFECYCLE_STEPS = [
  {
    id: 'installed',
    order: 1,
    label: 'Uređaj instaliran',
    short: 'Instaliran',
    description:
      'Uređaj se upisuje jednom — ručno ili uvozom iz Excela. Dobija QR kod i rok sljedećeg servisa.',
    benefit:
      'Cijela instalirana baza na jednom mjestu, s garancijama i historijom, umjesto po sveskama i telefonima.',
  },
  {
    id: 'due',
    order: 2,
    label: 'Servis dospijeva',
    short: 'Dospijeva',
    description:
      'ServisLoop svaki dan provjerava rokove i priprema podsjetnike 30, 14 i 3 dana ranije.',
    benefit: 'Nijedan rok ne prolazi neopaženo, čak i kad je gužva na terenu.',
  },
  {
    id: 'booked',
    order: 3,
    label: 'Kupac rezervisao',
    short: 'Rezervisano',
    description:
      'Kupac dobija poruku sa sigurnim linkom i bira termin — bez otvaranja naloga i bez telefonskog poziva.',
    benefit: 'Manje poziva u kancelariji, više potvrđenih termina u kalendaru.',
  },
  {
    id: 'completed',
    order: 4,
    label: 'Servis završen',
    short: 'Završeno',
    description:
      'Tehničar zatvara nalog na telefonu, kupac dobija PDF izvještaj, a sistem odmah upisuje novi rok.',
    benefit: 'Petlja se zatvara sama — završen servis odmah postaje sljedeći zakazani servis.',
  },
] as const

export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number]
