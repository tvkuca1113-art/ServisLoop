import { HardHat, Headset, ShieldCheck } from 'lucide-react'
import { Section, SectionIntro } from './section'

const ROLES = [
  {
    icon: ShieldCheck,
    role: 'Vlasnik',
    focus: 'Vidi novac i postavke',
    can: [
      'prihod: potencijalni, rezervisani i završeni',
      'uvoz i izvoz cijele baze',
      'članovi tima, uloge i pozivnice',
      'servisni intervali i cijene',
      'plan, limiti i brisanje podataka',
    ],
    cannot: [],
  },
  {
    icon: Headset,
    role: 'Dispečer',
    focus: 'Vodi dan',
    can: [
      'kupci, lokacije i uređaji',
      'rezervacije i dodjela tehničara',
      'kreiranje i praćenje radnih naloga',
      'ručno slanje podsjetnika',
      'operativni izvještaji',
    ],
    cannot: ['ne mijenja plan i naplatu', 'ne briše organizaciju', 'ne prenosi vlasništvo'],
  },
  {
    icon: HardHat,
    role: 'Tehničar',
    focus: 'Radi na terenu',
    can: [
      'svoji radni nalozi za danas',
      'cijela historija uređaja',
      'čeklist, materijali i mjerenja',
      'fotografije prije i poslije',
      'potpis kupca i zatvaranje naloga',
    ],
    cannot: ['ne vidi naplatu ni plan', 'ne upravlja timom', 'ne izvozi bazu kupaca'],
  },
] as const

export function TeamWorkflowSection() {
  return (
    <Section tone="raised">
      <SectionIntro
        eyebrow="Tim"
        title="Svako vidi tačno ono što mu treba"
        description="Podjela uloga nije samo sakrivanje dugmadi. Dozvole se provjeravaju na serveru i u samoj bazi, pa tehničar ne može doći do finansijskih podataka ni preko direktnog linka."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {ROLES.map((role) => (
          <div key={role.role} className="rounded-panel border-line bg-surface/60 border p-6">
            <div className="flex items-center gap-3">
              <span className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-xl">
                <role.icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-fg text-base font-semibold">{role.role}</h3>
                <p className="text-fg-subtle text-xs">{role.focus}</p>
              </div>
            </div>

            <ul className="mt-5 space-y-2">
              {role.can.map((item) => (
                <li key={item} className="text-fg-muted flex items-start gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
                  />
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>

            {role.cannot.length > 0 ? (
              <ul className="border-line mt-5 space-y-2 border-t pt-4">
                {role.cannot.map((item) => (
                  <li key={item} className="text-fg-subtle flex items-start gap-2 text-xs">
                    <span
                      aria-hidden="true"
                      className="bg-critical/50 mt-1.5 size-1.5 shrink-0 rounded-full"
                    />
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-panel border-line bg-surface/40 mt-8 border p-6">
        <h3 className="text-fg text-sm font-semibold">
          Tehničar na terenu, u pregledniku telefona
        </h3>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'Otvori nalog za danas i pokrene rad',
            'Prođe čeklist za tu vrstu opreme',
            'Upiše materijale i uslika prije/poslije',
            'Kupac potpiše, nalog se zatvara i šalje PDF',
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="tabular bg-surface-muted text-fg-muted flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                {index + 1}
              </span>
              <span className="text-fg-muted text-sm leading-snug">{step}</span>
            </li>
          ))}
        </ol>
        <p className="border-line text-fg-subtle mt-5 border-t pt-4 text-xs leading-relaxed">
          Bez instalacije native aplikacije. Radi u pregledniku telefona, s velikim poljima za dodir
          i sa što manje kucanja.
        </p>
      </div>
    </Section>
  )
}
