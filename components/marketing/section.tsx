import * as React from 'react'
import { cn } from '@/lib/utils'

/** Zajednički okvir za sve sekcije marketing sajta — jedinstven vertikalni ritam. */
export function Section({
  id,
  className,
  children,
  tone = 'default',
}: {
  id?: string
  className?: string
  children: React.ReactNode
  tone?: 'default' | 'raised' | 'edge'
}) {
  return (
    <section
      id={id}
      className={cn(
        'py-16 sm:py-20 lg:py-24',
        tone === 'raised' && 'bg-ink-900/40',
        tone === 'edge' && 'hairline-top border-line',
        className,
      )}
    >
      <div className="container-marketing">{children}</div>
    </section>
  )
}

export function SectionIntro({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
  as: Heading = 'h2',
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  align?: 'left' | 'center'
  className?: string
  as?: 'h2' | 'h3'
}) {
  return (
    <div
      className={cn(
        'max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
      ) : null}
      <Heading className="mt-3 text-display-md text-fg sm:text-display-lg">{title}</Heading>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-fg-muted">{description}</p>
      ) : null}
    </div>
  )
}

/** Oznaka da je sadržaj primjer, a ne stvarni podatak o kupcu. */
export function DemoTag({ className, label = 'Demo podaci' }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-service-400/35 bg-service-400/12',
        'px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-service-300 uppercase',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-service-400" />
      {label}
    </span>
  )
}
