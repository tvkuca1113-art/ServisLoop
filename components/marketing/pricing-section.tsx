import Link from 'next/link'
import { Check, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Section, SectionIntro } from './section'
import { PUBLIC_PLANS } from '@/domains/billing/plans'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PricingSection() {
  return (
    <Section id="cijene" tone="raised">
      <SectionIntro
        align="center"
        eyebrow="Cijene"
        title="Plaćate prema veličini instalirane baze"
        description="Cijene su u KM mjesečno, bez PDV-a. Počnite s probnim periodom — kartica se ne traži."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-4">
        {PUBLIC_PLANS.map((plan) => (
          <div
            key={plan.code}
            className={cn(
              'relative flex flex-col rounded-panel border p-6',
              plan.recommended
                ? 'border-primary/45 bg-surface shadow-glow-brand'
                : 'border-line bg-surface/50',
            )}
          >
            {plan.recommended ? (
              <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[0.6875rem] font-semibold tracking-wide text-primary-fg uppercase">
                Najčešći izbor
              </span>
            ) : null}

            <h3 className="text-base font-semibold text-fg">{plan.name}</h3>
            <p className="mt-1.5 min-h-10 text-xs leading-relaxed text-fg-muted">{plan.tagline}</p>

            <p className="mt-5 flex items-baseline gap-1.5">
              {plan.monthlyPriceKm === 0 ? (
                <span className="text-display-sm text-fg">Besplatno</span>
              ) : (
                <>
                  <span className="tabular text-display-sm text-fg">{plan.monthlyPriceKm}</span>
                  <span className="text-sm font-medium text-fg-muted">KM / mjesec</span>
                </>
              )}
            </p>
            {plan.trialDays > 0 ? (
              <p className="mt-1 text-xs text-primary">{plan.trialDays} dana probnog perioda</p>
            ) : (
              <p className="mt-1 text-xs text-fg-subtle">bez PDV-a</p>
            )}

            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2.5 text-sm text-fg-muted">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="leading-snug">{highlight}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-6 space-y-1.5 border-t border-line pt-4 text-xs text-fg-subtle">
              <div className="flex justify-between gap-2">
                <dt>Aktivnih uređaja</dt>
                <dd className="tabular font-medium text-fg-muted">
                  {plan.limits.maxActiveDevices === null
                    ? 'bez ograničenja'
                    : formatCount(plan.limits.maxActiveDevices)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Tehničara</dt>
                <dd className="tabular font-medium text-fg-muted">
                  {plan.limits.maxTechnicians === null ? '—' : plan.limits.maxTechnicians}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Redova po uvozu</dt>
                <dd className="tabular font-medium text-fg-muted">
                  {formatCount(plan.limits.maxImportRows)}
                </dd>
              </div>
            </dl>

            <Button
              asChild
              className="mt-6"
              variant={plan.recommended ? 'primary' : 'secondary'}
              block
            >
              <Link href="/registracija">
                {plan.monthlyPriceKm === 0 ? 'Počni besplatno' : `Odaberi ${plan.name}`}
              </Link>
            </Button>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-10 flex max-w-3xl items-start gap-3 rounded-card border border-line bg-surface/50 p-5">
        <Info className="mt-0.5 size-4.5 shrink-0 text-fg-subtle" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-fg-muted">
          <strong className="font-semibold text-fg">Kako se plaća u ovoj fazi:</strong> naplata
          karticom još nije uključena. Pretplata se dogovara direktno, a u aplikaciji se vidi
          trenutni plan, iskorištenost limita i datum isteka. Kada se naplata uključi, koristit
          će se vanjski obrađivač plaćanja — podaci o kartici nikad neće prolaziti kroz ServisLoop.
        </p>
      </div>
    </Section>
  )
}
