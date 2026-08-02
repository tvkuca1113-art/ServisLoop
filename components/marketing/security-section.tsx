import Link from 'next/link'
import { DatabaseZap, Eye, FileLock2, KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { Section, SectionIntro } from './section'
import { Button } from '@/components/ui/button'

const MEASURES = [
  {
    icon: DatabaseZap,
    title: 'Odvojenost firmi u samoj bazi',
    description:
      'Svaki red podataka nosi oznaku firme, a PostgreSQL pravila (row-level security) sprječavaju čitanje tuđih podataka i kada bi aplikacija imala grešku.',
  },
  {
    icon: KeyRound,
    title: 'Javni linkovi bez baznih ID-eva',
    description:
      'QR kod i link za rezervaciju koriste nasumične tokene od 32 bajta. U bazi se čuva samo njihov heš, a mogu se poništiti i ponovo izdati.',
  },
  {
    icon: Eye,
    title: 'Kupac ne vidi vaše interne podatke',
    description:
      'Javna stranica uređaja prikazuje maskiran serijski broj i sažetu historiju. Cijene, interne bilješke i privitci ostaju samo vama.',
  },
  {
    icon: FileLock2,
    title: 'Datoteke u privatnom prostoru',
    description:
      'Fotografije i dokumenti idu u privatni bucket. Pristup je moguć samo preko potpisanih linkova ograničenog trajanja.',
  },
  {
    icon: ShieldCheck,
    title: 'Zapis o tome ko je šta uradio',
    description:
      'Promjene rokova, brisanja i slanja podsjetnika bilježe se u revizijski dnevnik s korisnikom i vremenom.',
  },
  {
    icon: Trash2,
    title: 'Brisanje na zahtjev',
    description:
      'Nalog i cijela organizacija mogu se obrisati, a podaci izvesti prije brisanja. Postupak je opisan korak po korak u dokumentaciji.',
  },
] as const

export function SecuritySection() {
  return (
    <Section id="sigurnost" tone="edge">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
        <div>
          <SectionIntro
            eyebrow="Sigurnost i privatnost"
            title="Podaci vaših kupaca su poslovna tajna, ne sadržaj"
            description="Evidencija opreme govori ko šta ima ugrađeno i kad nije kod kuće. Prema tim podacima se odnosimo u skladu s tim."
          />

          <div className="mt-8 rounded-panel border border-caution/30 bg-caution/8 p-5">
            <p className="text-sm leading-relaxed text-fg">
              <strong className="font-semibold">Iskreno o usklađenosti:</strong> ServisLoop
              primjenjuje tehničke mjere opisane ovdje, ali ne tvrdi da je time zagarantovana
              pravna usklađenost s GDPR-om ni sa Zakonom o zaštiti ličnih podataka BiH.
              Popis stavki koje treba pregledati pravnik nalazi se u dokumentaciji.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/sigurnost">Detalji o sigurnosti</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/politika-privatnosti">Politika privatnosti</Link>
            </Button>
          </div>
        </div>

        <ul className="grid gap-6 sm:grid-cols-2">
          {MEASURES.map((measure) => (
            <li
              key={measure.title}
              className="rounded-card border border-line bg-surface/50 p-5"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <measure.icon className="size-4.5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-fg">{measure.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">{measure.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
