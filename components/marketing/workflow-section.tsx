'use client'

import * as React from 'react'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  PackagePlus,
  RefreshCw,
} from 'lucide-react'
import { Section, SectionIntro } from './section'
import { cn } from '@/lib/utils'

const FLOW = [
  {
    icon: PackagePlus,
    title: 'Oprema je ugrađena',
    detail: 'Uređaj se zavodi s modelom, serijskim brojem, garancijom i servisnim intervalom.',
    meta: 'Klima 3,5 kW · garancija do 04.2029.',
  },
  {
    icon: CalendarClock,
    title: 'Rok servisa je pohranjen',
    detail: 'Sistem računa sljedeći servis po pravilu firme za tu vrstu opreme.',
    meta: 'Interval 12 mjeseci · sljedeći servis 15.04.2027.',
  },
  {
    icon: BellRing,
    title: 'Podsjetnik ide sam',
    detail: 'Poruka kreće 30, 14 i 3 dana prije roka. Svaka je zapisana s ishodom slanja.',
    meta: '3 pokušaja · status vidljiv u aplikaciji',
  },
  {
    icon: CheckCircle2,
    title: 'Kupac bira termin',
    detail: 'Link iz poruke otvara slobodne termine. Rezervacija nastaje bez naloga i poziva.',
    meta: 'Utorak, 08.04. u 09:00',
  },
  {
    icon: FileCheck2,
    title: 'Tehničar zatvara nalog',
    detail: 'Čeklist, materijali, fotografije i potpis kupca — sve na telefonu, na licu mjesta.',
    meta: 'PDF izvještaj poslan kupcu',
  },
  {
    icon: RefreshCw,
    title: 'Novi rok je već upisan',
    detail: 'Završen servis odmah postaje sljedeći zakazani servis. Petlja se zatvara sama.',
    meta: 'Sljedeći servis 15.04.2028.',
  },
] as const

export function WorkflowSection() {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.85', 'end 0.4'],
  })

  // Linija napretka raste kako korisnik skrola kroz sekciju.
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <Section tone="raised">
      <SectionIntro
        eyebrow="Tok posla"
        title="Šest koraka koji se ponavljaju bez vašeg podsjećanja"
        description="Sadržaj je čitljiv i bez animacije — pokret samo prati čitanje, ne uslovljava ga."
      />

      <div ref={containerRef} className="relative mt-14">
        {/* Vertikalna linija (desktop) */}
        <div
          aria-hidden="true"
          className="bg-line absolute top-0 bottom-0 left-[1.4375rem] hidden w-px lg:block"
        >
          <motion.div
            className="from-brand-400 to-electric-400 w-px origin-top bg-gradient-to-b"
            style={{ scaleY: reducedMotion ? 1 : lineScale, height: '100%' }}
          />
        </div>

        <ol className="space-y-6 lg:space-y-10">
          {FLOW.map((step, index) => (
            <FlowStep
              key={step.title}
              step={step}
              index={index}
              total={FLOW.length}
              progress={scrollYProgress}
              reducedMotion={Boolean(reducedMotion)}
            />
          ))}
        </ol>
      </div>
    </Section>
  )
}

function FlowStep({
  step,
  index,
  total,
  progress,
  reducedMotion,
}: {
  step: (typeof FLOW)[number]
  index: number
  total: number
  progress: MotionValue<number>
  reducedMotion: boolean
}) {
  // Svaki korak se „upali“ kad linija napretka stigne do njega.
  const threshold = index / total
  const opacity = useTransform(progress, [threshold - 0.08, threshold + 0.02], [0.45, 1])
  const markerScale = useTransform(progress, [threshold - 0.05, threshold + 0.02], [0.9, 1])

  return (
    <motion.li
      style={reducedMotion ? undefined : { opacity }}
      className="relative flex gap-5 lg:gap-6"
    >
      <motion.span
        style={reducedMotion ? undefined : { scale: markerScale }}
        className={cn(
          'relative z-10 flex size-11.5 shrink-0 items-center justify-center rounded-xl',
          'border-line bg-surface text-primary shadow-subtle border',
        )}
      >
        <step.icon className="size-5" aria-hidden="true" />
      </motion.span>

      <div className="rounded-card border-line bg-surface/50 min-w-0 flex-1 border p-5 lg:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-fg text-base font-semibold">
            <span className="text-fg-subtle mr-2 font-mono text-xs">
              {String(index + 1).padStart(2, '0')}
            </span>
            {step.title}
          </h3>
          <span className="bg-surface-muted text-fg-muted rounded-md px-2 py-0.5 font-mono text-[0.6875rem]">
            {step.meta}
          </span>
        </div>
        <p className="text-fg-muted mt-2 text-sm leading-relaxed">{step.detail}</p>
      </div>
    </motion.li>
  )
}
