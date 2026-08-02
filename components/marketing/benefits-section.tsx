import {
  BellRing,
  FileText,
  History,
  Repeat,
  Smartphone,
  Timer,
  Upload,
  Users,
} from 'lucide-react'
import { Section, SectionIntro } from './section'

const BENEFITS = [
  {
    icon: Repeat,
    title: 'Ponovljeni prihod iz postojeće baze',
    description:
      'Uređaji koje ste već ugradili sami se vraćaju u kalendar. Ne trebate nove kupce da biste imali više servisa.',
  },
  {
    icon: Timer,
    title: 'Manje administracije',
    description:
      'Nema ručnog prolaska kroz sveske i tabele. Sistem sam zna ko je na redu i javlja mu se prije nego što rok istekne.',
  },
  {
    icon: BellRing,
    title: 'Nijedan zaboravljen kupac',
    description:
      'Podsjetnik ide 30, 14 i 3 dana prije roka, a kasnjenja se jasno vide u listi. Neuspjelo slanje nikad se ne prikazuje kao poslano.',
  },
  {
    icon: History,
    title: 'Kompletna historija uređaja',
    description:
      'Svaki servis, materijal, mjerenje i fotografija ostaju uz uređaj. Kad se javi kvar, tehničar odmah vidi šta je ranije rađeno.',
  },
  {
    icon: Smartphone,
    title: 'Kupac bez aplikacije i naloga',
    description:
      'QR kod na uređaju otvara stranicu s garancijom, historijom i dugmadima za rezervaciju i prijavu kvara.',
  },
  {
    icon: Upload,
    title: 'Uvoz postojeće baze',
    description:
      'Excel ili CSV s kupcima i uređajima uvozi se uz mapiranje kolona, provjeru grešaka i preuzimanje odbijenih redova.',
  },
  {
    icon: FileText,
    title: 'Profesionalan izvještaj',
    description:
      'Nakon svakog servisa nastaje PDF s čeklistom, materijalima, potpisima i QR kodom — spreman za kupca i za arhivu.',
  },
  {
    icon: Users,
    title: 'Jasna podjela uloga',
    description:
      'Vlasnik vidi prihod i postavke, dispečer raspoređuje naloge, tehničar vidi samo svoje zadatke i historiju uređaja.',
  },
] as const

export function BenefitsSection() {
  return (
    <Section id="funkcije" tone="raised">
      <SectionIntro
        eyebrow="Šta dobijate"
        title="Osam stvari koje mijenjaju sedmicu servisne firme"
        description="Ovo nije generalni CRM ni sistem za sve. Svaka funkcija postoji zato što skraćuje put od ugrađenog uređaja do naplaćenog servisa."
      />

      <ul className="mt-12 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((benefit) => (
          <li key={benefit.title}>
            <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-primary">
              <benefit.icon className="size-4.5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-[0.9375rem] leading-snug font-semibold text-fg">
              {benefit.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{benefit.description}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
