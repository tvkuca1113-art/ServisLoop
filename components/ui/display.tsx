'use client'

import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { Check, ChevronRight, Copy, TrendingDown, TrendingUp } from 'lucide-react'
import { cn, colorIndexFor, initials as computeInitials } from '@/lib/utils'
import { Tooltip } from './tooltip'

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

export const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator({ className, orientation = 'horizontal', decorative = true, ...props }, ref) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-line',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
})

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function Progress({
  value,
  max = 100,
  className,
  tone = 'primary',
  label,
}: {
  value: number
  max?: number
  className?: string
  tone?: 'primary' | 'success' | 'warning' | 'danger'
  label?: string
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const toneClass = {
    primary: 'bg-primary',
    success: 'bg-positive',
    warning: 'bg-caution',
    danger: 'bg-critical',
  }[tone]

  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      aria-label={label}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-muted', className)}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', toneClass)}
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

const AVATAR_TONES = [
  'bg-brand-500/15 text-brand-700 dark:text-brand-300',
  'bg-electric-500/15 text-electric-700 dark:text-electric-300',
  'bg-service-500/15 text-service-700 dark:text-service-300',
  'bg-positive/15 text-positive-strong dark:text-positive',
  'bg-ink-500/15 text-ink-700 dark:text-ink-300',
] as const

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClass = {
    xs: 'size-6 text-[0.625rem]',
    sm: 'size-8 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-14 text-base',
  }[size]

  const tone = AVATAR_TONES[colorIndexFor(name, AVATAR_TONES.length)]

  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full ring-1 ring-line',
        sizeClass,
        className,
      )}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          alt=""
          className="aspect-square size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        className={cn('flex size-full items-center justify-center font-semibold', tone)}
        delayMs={src ? 300 : 0}
      >
        <span aria-hidden="true">{computeInitials(name)}</span>
        <span className="sr-only">{name}</span>
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

// ---------------------------------------------------------------------------
// StatCard — metrika na dashboardu
// ---------------------------------------------------------------------------

export interface StatCardProps {
  label: string
  value: React.ReactNode
  /** Kratko objašnjenje ispod vrijednosti. */
  caption?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
  /** Promjena u odnosu na prethodni period, npr. `+12 %`. */
  trend?: { direction: 'up' | 'down' | 'flat'; label: string; positive?: boolean }
  /** Pretvara karticu u link ka listi koja stoji iza broja. */
  href?: string
  /** Objašnjenje kako se broj računa — transparentnost je zahtjev proizvoda. */
  help?: string
  className?: string
}

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'neutral',
  trend,
  href,
  help,
  className,
}: StatCardProps) {
  const toneRing = {
    neutral: 'text-fg-subtle bg-surface-muted',
    primary: 'text-primary bg-primary-soft',
    success: 'text-positive-strong dark:text-positive bg-positive/12',
    warning: 'text-caution-strong dark:text-caution bg-caution/15',
    danger: 'text-critical-strong dark:text-critical bg-critical/12',
  }[tone]

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[0.8125rem] font-medium text-fg-muted">{label}</p>
            {help ? (
              <Tooltip content={help}>
                <button
                  type="button"
                  aria-label={`Kako se računa: ${help}`}
                  className="text-fg-subtle hover:text-fg-muted"
                >
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 110 2 1 1 0 010-2zm1 8H7V7h2v5z" />
                  </svg>
                </button>
              </Tooltip>
            ) : null}
          </div>
          <p className="tabular text-2xl leading-none font-semibold text-fg">{value}</p>
        </div>
        {Icon ? (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', toneRing)}>
            <Icon className="size-4.5" />
          </span>
        ) : null}
      </div>

      {(caption || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {trend ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium',
                trend.positive === false
                  ? 'text-critical-strong dark:text-critical'
                  : trend.direction === 'flat'
                    ? 'text-fg-muted'
                    : 'text-positive-strong dark:text-positive',
              )}
            >
              {trend.direction === 'up' ? (
                <TrendingUp className="size-3.5" aria-hidden="true" />
              ) : trend.direction === 'down' ? (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              ) : null}
              {trend.label}
            </span>
          ) : null}
          {caption ? <span className="text-fg-muted">{caption}</span> : null}
        </div>
      )}
    </>
  )

  const baseClass = cn(
    'rounded-card border border-line bg-surface p-5 shadow-card',
    href && 'group transition-shadow hover:shadow-raised',
    className,
  )

  if (href) {
    return (
      <a href={href} className={cn(baseClass, 'block focus-visible:ring-2 focus-visible:ring-ring')}>
        {content}
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
          Otvori listu
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </a>
    )
  }

  return <div className={baseClass}>{content}</div>
}

// ---------------------------------------------------------------------------
// KeyValue — parovi podataka na detaljnim stranicama
// ---------------------------------------------------------------------------

export function KeyValueList({
  className,
  columns = 2,
  ...props
}: React.HTMLAttributes<HTMLDListElement> & { columns?: 1 | 2 | 3 }) {
  const gridClass = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns]
  return <dl className={cn('grid gap-x-6 gap-y-4', gridClass, className)} {...props} />
}

export function KeyValue({
  label,
  children,
  className,
  mono = false,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <dt className="text-xs font-medium tracking-wide text-fg-subtle uppercase">{label}</dt>
      <dd className={cn('text-sm break-words text-fg', mono && 'font-mono tabular')}>{children}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------

export function CopyButton({
  value,
  label = 'Kopiraj',
  copiedLabel = 'Kopirano',
  className,
}: {
  value: string
  label?: string
  copiedLabel?: string
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API zna biti blokiran (nesiguran kontekst, dozvole).
      // Tada nudimo ručno kopiranje umjesto tihe greške.
      window.prompt('Kopirajte ručno:', value)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
        'text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
      aria-live="polite"
    >
      {copied ? (
        <Check className="size-3.5 text-positive-strong dark:text-positive" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      {copied ? copiedLabel : label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// SectionHeading — naslov sekcije unutar stranice
// ---------------------------------------------------------------------------

export function SectionHeading({
  title,
  description,
  actions,
  className,
  as: Comp = 'h2',
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1">
        <Comp className="text-lg leading-tight font-semibold text-fg">{title}</Comp>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
