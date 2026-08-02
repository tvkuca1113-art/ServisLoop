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
          <div key={role.role} className="rounded-panel border border-line bg-surface/60 p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <role.icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-fg">{role.role}</h3>
                <p className="text-xs text-fg-subtle">{role.focus}</p>
              </div>
            </div>

            <ul className="mt-5 space-y-2">
              {role.can.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-fg-muted">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                  />
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>

            {role.cannot.length > 0 ? (
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {role.cannot.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-fg-subtle">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-critical/50"
                    />
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-panel border border-line bg-surface/40 p-6">
        <h3 className="text-sm font-semibold text-fg">Tehničar na terenu, u pregledniku telefona</h3>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'Otvori nalog za danas i pokrene rad',
            'Prođe čeklist za tu vrstu opreme',
            'Upiše materijale i uslika prije/poslije',
            'Kupac potpiše, nalog se zatvara i šalje PDF',
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-xs font-semibold text-fg-muted">
                {index + 1}
              </span>
              <span className="text-sm leading-snug text-fg-muted">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
          Bez instalacije native aplikacije. Radi u pregledniku telefona, s velikim poljima za
          dodir i sa što manje kucanja.
        </p>
      </div>
    </Section>
  )
}
