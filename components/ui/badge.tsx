import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-surface-muted text-fg-muted',
        brand: 'border-brand-500/25 bg-brand-500/10 text-brand-700 dark:text-brand-300',
        info: 'border-electric-500/25 bg-electric-500/10 text-electric-700 dark:text-electric-300',
        success: 'border-positive/30 bg-positive/12 text-positive-strong dark:text-positive',
        warning: 'border-caution/35 bg-caution/15 text-caution-strong dark:text-caution',
        danger: 'border-critical/30 bg-critical/12 text-critical-strong dark:text-critical',
        service: 'border-service-400/35 bg-service-400/15 text-service-700 dark:text-service-300',
        outline: 'border-line-strong bg-transparent text-fg-muted',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[0.6875rem]',
        md: 'px-2 py-0.5 text-xs',
        lg: 'px-2.5 py-1 text-[0.8125rem]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /**
   * Tačka u boji ispred teksta. Status se NIKAD ne prenosi samo bojom —
   * tekst uvijek nosi značenje (zahtjev pristupačnosti).
   */
  dot?: boolean
}

export function Badge({ className, tone, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot ? (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />
      ) : null}
      {children}
    </span>
  )
}

export { badgeVariants }
