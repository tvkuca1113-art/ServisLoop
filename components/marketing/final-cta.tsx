import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SITE } from '@/lib/site'

const POINTS = [
  'Demo firma s popunjenim uređajima i servisima',
  'Bez unosa kartice i bez obaveze',
  'Uvoz vaše baze iz Excela kad budete spremni',
] as const

export function FinalCta() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(48rem 26rem at 50% 0%, rgba(24,199,181,0.18), transparent 65%)',
        }}
      />
      <div className="grid-backdrop radial-fade pointer-events-none absolute inset-0 -z-10 opacity-50" />

      <div className="container-marketing">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-display-md text-fg sm:text-display-lg">
            Vaša instalirana baza je već tu.{' '}
            <span className="text-gradient-brand">Neka radi za vas.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-fg-muted">
            Otvorite demo i pogledajte kako izgleda kad rokovi servisa, podsjetnici i rezervacije
            rade bez vašeg svakodnevnog nadzora.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/demo">
                {SITE.primaryCta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/kontakt">Razgovarajmo o vašoj bazi</Link>
            </Button>
          </div>

          <ul className="mx-auto mt-9 flex max-w-2xl flex-col items-center gap-3 text-sm text-fg-muted sm:flex-row sm:justify-center sm:gap-6">
            {POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
