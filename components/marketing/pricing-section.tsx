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
              'rounded-panel relative flex flex-col border p-6',
              plan.recommended
                ? 'border-primary/45 bg-surface shadow-glow-brand'
                : 'border-line bg-surface/50',
            )}
          >
            {plan.recommended ? (
              <span className="bg-primary text-primary-fg absolute -top-3 left-6 rounded-full px-3 py-1 text-[0.6875rem] font-semibold tracking-wide uppercase">
                Najčešći izbor
              </span>
            ) : null}

            <h3 className="text-fg text-base font-semibold">{plan.name}</h3>
            <p className="text-fg-muted mt-1.5 min-h-10 text-xs leading-relaxed">{plan.tagline}</p>

            <p className="mt-5 flex items-baseline gap-1.5">
              {plan.monthlyPriceKm === 0 ? (
                <span className="text-display-sm text-fg">Besplatno</span>
              ) : (
                <>
                  <span className="tabular text-display-sm text-fg">{plan.monthlyPriceKm}</span>
                  <span className="text-fg-muted text-sm font-medium">KM / mjesec</span>
                </>
              )}
            </p>
            {plan.trialDays > 0 ? (
              <p className="text-primary mt-1 text-xs">{plan.trialDays} dana probnog perioda</p>
            ) : (
              <p className="text-fg-subtle mt-1 text-xs">bez PDV-a</p>
            )}

            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.highlights.map((highlight) => (
                <li key={highlight} className="text-fg-muted flex items-start gap-2.5 text-sm">
                  <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="leading-snug">{highlight}</span>
                </li>
              ))}
            </ul>

            <dl className="border-line text-fg-subtle mt-6 space-y-1.5 border-t pt-4 text-xs">
              <div className="flex justify-between gap-2">
                <dt>Aktivnih uređaja</dt>
                <dd className="tabular text-fg-muted font-medium">
                  {plan.limits.maxActiveDevices === null
                    ? 'bez ograničenja'
                    : formatCount(plan.limits.maxActiveDevices)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Tehničara</dt>
                <dd className="tabular text-fg-muted font-medium">
                  {plan.limits.maxTechnicians === null ? '—' : plan.limits.maxTechnicians}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Redova po uvozu</dt>
                <dd className="tabular text-fg-muted font-medium">
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

      <div className="rounded-card border-line bg-surface/50 mx-auto mt-10 flex max-w-3xl items-start gap-3 border p-5">
        <Info className="text-fg-subtle mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
        <p className="text-fg-muted text-xs leading-relaxed">
          <strong className="text-fg font-semibold">Kako se plaća u ovoj fazi:</strong> naplata
          karticom još nije uključena. Pretplata se dogovara direktno, a u aplikaciji se vidi
          trenutni plan, iskorištenost limita i datum isteka. Kada se naplata uključi, koristit će
          se vanjski obrađivač plaćanja — podaci o kartici nikad neće prolaziti kroz ServisLoop.
        </p>
      </div>
    </Section>
  )
}
