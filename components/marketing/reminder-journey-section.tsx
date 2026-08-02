import { CheckCheck, Clock, MailCheck, RefreshCcw, XCircle } from 'lucide-react'
import { Section, SectionIntro, DemoTag } from './section'
import { Badge } from '@/components/ui/badge'

const SCHEDULE = [
  {
    offset: '30 dana ranije',
    purpose: 'Najava roka i prvi poziv na rezervaciju',
    state: 'poslano',
  },
  {
    offset: '14 dana ranije',
    purpose: 'Podsjetnik kupcima koji nisu rezervisali',
    state: 'poslano',
  },
  { offset: '3 dana ranije', purpose: 'Zadnja prilika prije isteka roka', state: 'zakazano' },
  { offset: 'na dan roka', purpose: 'Obavijest da je servis dospio', state: 'zakazano' },
  { offset: '14 dana kasnije', purpose: 'Opcioni podsjetnik za kašnjenje', state: 'isključeno' },
] as const

const GUARANTEES = [
  {
    icon: CheckCheck,
    title: 'Nikad duplo',
    text: 'Baza ima jedinstveni ključ po uređaju, pravilu i roku. Ponovno pokretanje dnevnog posla ne može poslati istu poruku dvaput.',
  },
  {
    icon: XCircle,
    title: 'Neuspjeh se ne krije',
    text: 'Ako slanje ne prođe, podsjetnik ostaje „neuspješan“ s razlogom i brojem pokušaja — nikad se ne prikazuje kao poslan.',
  },
  {
    icon: RefreshCcw,
    title: 'Rezervacija zaustavlja niz',
    text: 'Čim kupac rezerviše, preostali podsjetnici za taj rok se otkazuju. Kupac ne dobija poruku za nešto što je već dogovorio.',
  },
  {
    icon: Clock,
    title: 'Vaše radno vrijeme',
    text: 'Posao se pokreće u vremenskoj zoni vaše firme. Kupac ne dobija poruku u tri ujutro.',
  },
] as const

export function ReminderJourneySection() {
  return (
    <Section tone="edge">
      <SectionIntro
        eyebrow="Motor podsjetnika"
        title="Srce proizvoda je posao koji radi svaki dan bez vas"
        description="Podsjetnik koji stigne dvaput ili se lažno prikaže kao poslan gori je od nikakvog. Zato je ovaj dio građen oko garancija, ne oko lijepog rasporeda."
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
        {/* Raspored */}
        <div className="rounded-panel border-line bg-surface/60 overflow-hidden border">
          <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
            <h3 className="text-fg text-sm font-semibold">Zadani raspored podsjetnika</h3>
            <DemoTag label="Primjer" />
          </div>

          <ul className="divide-line divide-y">
            {SCHEDULE.map((item) => (
              <li key={item.offset} className="flex items-start gap-4 px-5 py-4">
                <span className="tabular text-fg w-32 shrink-0 text-sm font-medium">
                  {item.offset}
                </span>
                <span className="text-fg-muted min-w-0 flex-1 text-sm leading-relaxed">
                  {item.purpose}
                </span>
                <Badge
                  tone={
                    item.state === 'poslano'
                      ? 'success'
                      : item.state === 'zakazano'
                        ? 'info'
                        : 'neutral'
                  }
                  dot
                >
                  {item.state}
                </Badge>
              </li>
            ))}
          </ul>

          <p className="border-line text-fg-subtle border-t px-5 py-4 text-xs leading-relaxed">
            Raspored je podesiv po firmi. Možete dodati, ukloniti ili pomjeriti bilo koji korak.
          </p>
        </div>

        {/* Primjer poruke */}
        <div className="rounded-panel border-line bg-surface overflow-hidden border">
          <div className="border-line flex items-center gap-2 border-b px-5 py-4">
            <MailCheck className="text-primary size-4" aria-hidden="true" />
            <h3 className="text-fg text-sm font-semibold">Poruka koju kupac dobija</h3>
          </div>

          <div className="space-y-3 p-5 text-sm">
            <p className="text-fg-subtle text-xs">
              <span className="text-fg-muted font-medium">Predmet:</span> Servis vaše klime
              dospijeva 28.03.
            </p>
            <div className="rounded-card bg-canvas/50 text-fg-muted space-y-3 p-4 leading-relaxed">
              <p className="text-fg">Poštovana Amila,</p>
              <p>
                servis vašeg uređaja <strong className="text-fg">AeroTherm ST-12</strong> ugrađenog
                15.04.2024. dospijeva <strong className="text-fg">28.03.2027.</strong>
              </p>
              <p>Termin možete odabrati sami, bez poziva:</p>
              <p className="border-primary/30 bg-primary-soft text-primary rounded-lg border px-3 py-2 text-center text-xs font-semibold">
                Rezerviši termin servisa
              </p>
              <p className="text-xs">
                TermoPlus Servis d.o.o. · 033 000 000
                <br />
                Ako ne želite podsjetnike za ovaj uređaj, možete ih isključiti u jednom kliku.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {GUARANTEES.map((item) => (
          <li key={item.title} className="rounded-card border-line bg-surface/50 border p-5">
            <span className="bg-primary-soft text-primary flex size-9 items-center justify-center rounded-lg">
              <item.icon className="size-4.5" aria-hidden="true" />
            </span>
            <h3 className="text-fg mt-4 text-sm font-semibold">{item.title}</h3>
            <p className="text-fg-muted mt-2 text-xs leading-relaxed">{item.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
