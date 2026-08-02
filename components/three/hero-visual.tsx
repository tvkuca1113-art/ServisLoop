'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { LIFECYCLE_STEPS } from '@/lib/site'
import { cn } from '@/lib/utils'
import { useInView, useDocumentVisible } from '@/lib/hooks/use-in-view'
import { usePrefersReducedMotion } from '@/lib/hooks/use-media-query'
import { detectDeviceTier, isWebGLAvailable, prefersReducedData, type DeviceTier } from '@/lib/webgl'
import { HeroFallback } from './hero-fallback'
import { SEQUENCE_PHASES } from './lifecycle-scene'

/**
 * 3D scena se učitava tek na klijentu i tek kad znamo da WebGL radi.
 * `ssr: false` znači da three.js nije ni u serverskom renderu ni u početnom
 * HTML-u — naslov i dugmad se prikažu odmah, a scena stiže naknadno.
 */
const LifecycleScene = dynamic(() => import('./lifecycle-scene'), {
  ssr: false,
  loading: () => null,
})

type Readiness = 'checking' | 'unsupported' | 'loading' | 'ready'

export function HeroVisual({ className }: { className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '200px', threshold: 0.05 })
  const documentVisible = useDocumentVisible()
  const reducedMotion = usePrefersReducedMotion()

  const [readiness, setReadiness] = React.useState<Readiness>('checking')
  const [tier, setTier] = React.useState<DeviceTier>('medium')
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const [phaseIndex, setPhaseIndex] = React.useState(0)

  // Provjera podrške radi se jednom, nakon montiranja.
  React.useEffect(() => {
    if (!isWebGLAvailable()) {
      setReadiness('unsupported')
      return
    }
    // Kad korisnik štedi podatke, ne povlačimo three.js uopšte.
    if (prefersReducedData()) {
      setReadiness('unsupported')
      return
    }
    setTier(detectDeviceTier())
    setReadiness('loading')
  }, [])

  const shouldRender3D = readiness === 'loading' || readiness === 'ready'
  const active = inView && documentVisible

  const detailIndex = selectedIndex ?? hoveredIndex
  const detailStep = detailIndex !== null ? LIFECYCLE_STEPS[detailIndex] : null
  const phase = SEQUENCE_PHASES[phaseIndex] ?? SEQUENCE_PHASES[0]

  const handlePhaseChange = React.useCallback((next: number) => {
    setPhaseIndex(next)
  }, [])

  const handleSelect = React.useCallback((index: number) => {
    setSelectedIndex((current) => (current === index ? null : index))
  }, [])

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        className={cn(
          'relative aspect-4/3 w-full overflow-hidden rounded-hero sm:aspect-16/11',
          'border border-line bg-gradient-to-b from-ink-900/70 to-ink-950/40',
        )}
      >
        {/* Tehnička mreža u pozadini */}
        <div className="grid-backdrop radial-fade pointer-events-none absolute inset-0 opacity-70" />

        {/* Rezervni SVG: vidljiv odmah, gasi se kad scena bude spremna */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-700',
            readiness === 'ready' ? 'opacity-0' : 'opacity-100',
          )}
          aria-hidden={readiness === 'ready'}
        >
          <HeroFallback animated={!reducedMotion && readiness !== 'ready'} />
        </div>

        {shouldRender3D ? (
          <div className="absolute inset-0">
            <LifecycleScene
              active={active}
              reducedMotion={reducedMotion}
              tier={tier}
              selectedIndex={selectedIndex}
              hoveredIndex={hoveredIndex}
              onHover={setHoveredIndex}
              onSelect={handleSelect}
              onPhaseChange={handlePhaseChange}
              onReady={() => setReadiness('ready')}
            />
          </div>
        ) : null}

        {/* Tekstualni opis trenutne faze */}
        {readiness === 'ready' && !reducedMotion ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <AnimatePresence mode="wait">
              <motion.p
                key={phase?.id ?? 'idle'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="glass mx-auto w-fit max-w-full rounded-full px-4 py-2 text-center text-xs text-fg-muted sm:text-[0.8125rem]"
              >
                <span className="mr-2 inline-block size-1.5 rounded-full bg-primary align-middle" />
                {phase?.caption}
              </motion.p>
            </AnimatePresence>
          </div>
        ) : null}

        {/* Poruka kad WebGL nije dostupan */}
        {readiness === 'unsupported' ? (
          <p className="absolute inset-x-0 bottom-0 p-4 text-center text-xs text-fg-subtle">
            Prikazan je pojednostavljen dijagram jer 3D prikaz nije dostupan na ovom uređaju.
          </p>
        ) : null}
      </div>

      {/*
        Pristupačna kontrola istih čvorova.
        3D scena reaguje na miš, ali korisnik tastature i čitača ekrana mora
        imati potpuno ravnopravan način da dobije isti sadržaj — zato su ovo
        prava dugmad, a ne dekoracija.
      */}
      <div className="mt-5">
        <h2 className="sr-only">Koraci servisne petlje</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LIFECYCLE_STEPS.map((step, index) => {
            const isActive = detailIndex === index
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                  aria-pressed={isActive}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-200',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none',
                    isActive
                      ? 'border-primary/50 bg-primary-soft'
                      : 'border-line bg-surface/50 hover:border-line-strong',
                  )}
                >
                  <span className="block text-[0.6875rem] font-semibold tracking-wide text-primary">
                    KORAK {step.order}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-tight font-medium text-fg">
                    {step.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {/* Objašnjenje odabranog koraka */}
        <div aria-live="polite" className="mt-3 min-h-16">
          <AnimatePresence mode="wait">
            {detailStep ? (
              <motion.div
                key={detailStep.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="rounded-lg border border-line bg-surface/60 p-4"
              >
                <p className="text-sm leading-relaxed text-fg">{detailStep.description}</p>
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">{detailStep.benefit}</p>
              </motion.div>
            ) : (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-1 text-xs leading-relaxed text-fg-subtle"
              >
                Odaberite korak da vidite šta se u njemu tačno dešava. Scenu možete blago
                zarotirati povlačenjem.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
