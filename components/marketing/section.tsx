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
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow ? (
        <p className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">{eyebrow}</p>
      ) : null}
      <Heading className="text-display-md text-fg sm:text-display-lg mt-3">{title}</Heading>
      {description ? (
        <p className="text-fg-muted mt-4 text-base leading-relaxed">{description}</p>
      ) : null}
    </div>
  )
}

/** Oznaka da je sadržaj primjer, a ne stvarni podatak o kupcu. */
export function DemoTag({
  className,
  label = 'Demo podaci',
}: {
  className?: string
  label?: string
}) {
  return (
    <span
      className={cn(
        'border-service-400/35 bg-service-400/12 inline-flex items-center gap-1.5 rounded-md border',
        'text-service-300 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase',
        className,
      )}
    >
      <span aria-hidden="true" className="bg-service-400 size-1.5 rounded-full" />
      {label}
    </span>
  )
}
