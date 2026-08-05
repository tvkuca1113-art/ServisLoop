/**
 * Home page hero. Server component: the only client code it mounts is the animated copy
 * (`Reveal`) and the lifecycle visual, which manages its own loading and fallbacks.
 */

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui';

import { Reveal } from './reveal';
import { Container } from './section';
import { LifecycleHero } from './three/lifecycle-hero';

/**
 * Note the absence of `overflow-hidden` on the section: the hover labels in the 3D scene
 * are DOM nodes that can reach past the canvas box, so clipping lives on the decorative
 * wash wrapper instead, and `<main>` carries `overflow-x-clip` as the outer guard.
 */
export function Hero() {
  return (
    <section className="relative border-b border-border-base">
      {/* Two soft brand washes behind the fold. Purely decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -right-24 -top-40 size-[36rem] rounded-full bg-brand-500/8 blur-3xl" />
        <div className="absolute -bottom-56 -left-32 size-[32rem] rounded-full bg-brand-600/6 blur-3xl" />
      </div>

      <Container className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:py-24">
        <div className="flex flex-col items-start gap-6">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border-base bg-surface-raised px-3 py-1 text-xs font-medium text-ink-muted">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-state-ok" />
              Preventive maintenance, scheduled by the system
            </span>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="text-balance text-4xl font-semibold leading-[1.06] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Never miss a service date again
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="max-w-xl text-pretty text-lg leading-relaxed text-ink-muted">
              ServisLoop keeps every device you maintain on a schedule. It reminds the customer
              before the date falls due, lets them book from your real availability, walks the
              technician through the checklist, and issues a signed PDF report. Then it sets the
              next date on its own.
            </p>
          </Reveal>

          <Reveal delay={0.15} className="w-full">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Start free
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/features">See how it works</Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="text-sm text-ink-subtle">
              No credit card. Import your devices from CSV or XLSX and print the QR sheet on day
              one.
            </p>
          </Reveal>
        </div>

        <LifecycleHero className="mx-auto aspect-square w-full max-w-lg" />
      </Container>
    </section>
  );
}
