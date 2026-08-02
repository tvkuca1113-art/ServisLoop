import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, CheckCircle2, Info, Loader2, OctagonAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

const alertVariants = cva('rounded-lg border p-4 text-sm', {
  variants: {
    tone: {
      info: 'border-electric-500/25 bg-electric-500/8 text-fg',
      success: 'border-positive/30 bg-positive/8 text-fg',
      warning: 'border-caution/35 bg-caution/10 text-fg',
      danger: 'border-critical/30 bg-critical/8 text-fg',
      neutral: 'border-line bg-surface-muted text-fg',
    },
  },
  defaultVariants: { tone: 'info' },
})

const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: OctagonAlert,
  neutral: Info,
} as const

const alertIconColors = {
  info: 'text-electric-500 dark:text-electric-300',
  success: 'text-positive-strong dark:text-positive',
  warning: 'text-caution-strong dark:text-caution',
  danger: 'text-critical-strong dark:text-critical',
  neutral: 'text-fg-muted',
} as const

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: React.ReactNode
  /** `assertive` za greške koje prekidaju rad korisnika. */
  live?: 'polite' | 'assertive' | 'off'
  actions?: React.ReactNode
}

export function Alert({
  className,
  tone = 'info',
  title,
  live = 'polite',
  actions,
  children,
  ...props
}: AlertProps) {
  const Icon = alertIcons[tone ?? 'info']

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={live === 'off' ? undefined : live}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <div className="flex gap-3">
        <Icon
          className={cn('mt-0.5 size-4.5 shrink-0', alertIconColors[tone ?? 'info'])}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-1">
          {title ? <p className="leading-snug font-semibold">{title}</p> : null}
          {children ? (
            <div className="text-fg-muted [&_a]:text-primary leading-relaxed [&_a]:underline [&_a]:underline-offset-2">
              {children}
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap gap-2 pt-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skeleton', className)} {...props} />
}

/** Skeleton za tabelu — koristi se u `loading.tsx` granicama. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Učitavanje podataka">
      <span className="sr-only">Učitavanje podataka…</span>
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-5" style={{ opacity: 1 - rowIndex * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Skeleton za mrežu kartica s metrikama. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Učitavanje metrika"
    >
      <span className="sr-only">Učitavanje metrika…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-card border-line bg-surface border p-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function Spinner({
  className,
  label = 'Učitavanje…',
  size = 'md',
}: {
  className?: string
  label?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = { sm: 'size-4', md: 'size-5', lg: 'size-8' }[size]
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <Loader2 className={cn(sizeClass, 'text-primary animate-spin')} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Centrirani spinner preko cijele visine — za `loading.tsx`. */
export function PageSpinner({ label = 'Učitavanje…' }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" label={label} />
        <p className="text-fg-muted text-sm">{label}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  className?: string
  /** Kompaktna varijanta za prazne panele unutar kartice. */
  compact?: boolean
}

/**
 * Prazno stanje.
 *
 * Nikad ne prikazujemo samo „Nema podataka“. Prazan ekran je prilika da se
 * korisniku kaže šta tačno da uradi sljedeće — zato je `action` očekivan dio.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-card border-line-strong bg-surface-muted/40 flex flex-col items-center justify-center border border-dashed text-center',
        compact ? 'gap-2 px-6 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            'bg-surface text-fg-subtle shadow-subtle ring-line flex items-center justify-center rounded-full ring-1',
            compact ? 'size-10' : 'size-14',
          )}
        >
          <Icon className={compact ? 'size-5' : 'size-6'} />
        </div>
      ) : null}

      <h3 className={cn('text-fg font-semibold', compact ? 'text-sm' : 'text-base')}>{title}</h3>

      {description ? (
        <p
          className={cn(
            'text-fg-muted max-w-md leading-relaxed text-balance',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {description}
        </p>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}
