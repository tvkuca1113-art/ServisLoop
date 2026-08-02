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
          <p className="border-line bg-surface/60 text-fg-muted inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
            <span className="relative flex size-1.5">
              <span className="bg-brand-400 absolute inline-flex size-full animate-ping rounded-full opacity-60" />
              <span className="bg-brand-400 relative inline-flex size-1.5 rounded-full" />
            </span>
            {SITE.tagline}
          </p>

          <h1 className="text-display-lg text-fg sm:text-display-xl mt-5">
            Svaki uređaj koji ste ugradili može vam{' '}
            <span className="text-gradient-brand">ponovo donijeti prihod</span>.
          </h1>

          <p className="text-fg-muted mt-5 max-w-xl text-base leading-relaxed sm:text-lg">
            {SITE.heroSubheadline}
          </p>

          <p className="text-fg-muted mt-4 text-sm font-medium">{SITE.hook}</p>

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

          <dl className="border-line mt-10 grid max-w-lg grid-cols-3 gap-4 border-t pt-6">
            {[
              { term: 'Podsjetnici', detail: '30, 14 i 3 dana prije roka' },
              { term: 'Rezervacija', detail: 'bez otvaranja naloga' },
              { term: 'Izvještaj', detail: 'PDF nakon svakog servisa' },
            ].map((item) => (
              <div key={item.term}>
                <dt className="text-fg text-[0.8125rem] font-semibold">{item.term}</dt>
                <dd className="text-fg-muted mt-1 text-xs leading-relaxed">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroVisual />
      </div>
    </section>
  )
}
