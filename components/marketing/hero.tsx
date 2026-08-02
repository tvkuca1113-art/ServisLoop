import Link from 'next/link'
import { ArrowRight, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeroVisual } from '@/components/three/hero-visual'
import { SITE } from '@/lib/site'

/**
 * Hero sekcija.
 *
 * Naslov, podnaslov i dugmad su serverski renderovani i vidljivi odmah —
 * ne čekaju JavaScript ni WebGL. 3D scena je odvojena klijentska komponenta
 * koja se dodaje kasnije i nikad ne blokira ovaj tekst.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Pozadinski sjaj */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(70rem 40rem at 15% -10%, rgba(24,199,181,0.16), transparent 60%),' +
            'radial-gradient(50rem 32rem at 90% 10%, rgba(94,139,255,0.14), transparent 62%)',
        }}
      />

      <div className="container-marketing grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-20 xl:py-24">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1.5 text-xs font-medium text-fg-muted">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-400" />
            </span>
            {SITE.tagline}
          </p>

          <h1 className="mt-5 text-display-lg text-fg sm:text-display-xl">
            Svaki uređaj koji ste ugradili može vam{' '}
            <span className="text-gradient-brand">ponovo donijeti prihod</span>.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
            {SITE.heroSubheadline}
          </p>

          <p className="mt-4 text-sm font-medium text-fg-muted">{SITE.hook}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/demo">
                {SITE.primaryCta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="#kako-radi">
                <PlayCircle className="size-4" aria-hidden="true" />
                {SITE.secondaryCta}
              </Link>
            </Button>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
            {[
              { term: 'Podsjetnici', detail: '30, 14 i 3 dana prije roka' },
              { term: 'Rezervacija', detail: 'bez otvaranja naloga' },
              { term: 'Izvještaj', detail: 'PDF nakon svakog servisa' },
            ].map((item) => (
              <div key={item.term}>
                <dt className="text-[0.8125rem] font-semibold text-fg">{item.term}</dt>
                <dd className="mt-1 text-xs leading-relaxed text-fg-muted">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroVisual />
      </div>
    </section>
  )
}
