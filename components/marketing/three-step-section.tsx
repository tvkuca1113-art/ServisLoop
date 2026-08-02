import { CalendarCheck, ClipboardCheck, QrCode } from 'lucide-react'
import { Section, SectionIntro } from './section'

const STEPS = [
  {
    number: '01',
    icon: QrCode,
    title: 'Unesete opremu jednom',
    description:
      'Uvezete postojeću bazu iz Excela ili unesete uređaj pri ugradnji. Svaki uređaj dobija servisni interval, rok sljedećeg servisa i vlastiti QR kod.',
    detail: 'Uvoz podržava .csv i .xlsx, s pregledom i ispravkom prije upisa.',
  },
  {
    number: '02',
    icon: CalendarCheck,
    title: 'ServisLoop javlja kupcu',
    description:
      'Sistem svaki dan provjerava rokove i šalje podsjetnik 30, 14 i 3 dana ranije. Kupac otvara siguran link i sam bira slobodan termin.',
    detail: 'Bez otvaranja naloga, bez instalacije aplikacije, bez telefonskog poziva.',
  },
  {
    number: '03',
    icon: ClipboardCheck,
    title: 'Servis se zatvara i ponavlja',
    description:
      'Tehničar zatvara nalog na telefonu, kupac dobija PDF izvještaj, a sistem odmah upisuje novi rok i planira sljedeći krug podsjetnika.',
    detail: 'Novi rok se računa na serveru po pravilu firme — bez ručnog upisivanja.',
  },
] as const

export function ThreeStepSection() {
  return (
    <Section id="kako-radi" tone="edge">
      <SectionIntro
        eyebrow="Kako radi"
        title="Tri koraka od ugrađenog uređaja do ponovljenog prihoda"
        description="Cijeli proizvod je izgrađen oko jednog toka. Sve što ne služi tom toku nije ušlo u ServisLoop."
      />

      <ol className="mt-12 grid gap-6 lg:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.number}
            className="relative rounded-panel border border-line bg-surface/60 p-6 transition-colors hover:border-line-strong"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <step.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="font-mono text-sm tracking-wide text-fg-subtle">{step.number}</span>
            </div>

            <h3 className="mt-5 text-lg font-semibold text-fg">{step.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">{step.description}</p>
            <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
              {step.detail}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
