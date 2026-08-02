'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg',
    'font-medium transition-[background-color,color,box-shadow,border-color,transform] duration-150',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'focus-visible:ring-offset-canvas',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:translate-y-px',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-fg shadow-subtle hover:bg-brand-500 dark:hover:bg-brand-300',
        secondary:
          'border border-line bg-surface text-fg shadow-subtle hover:bg-surface-muted hover:border-line-strong',
        ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
        danger: 'bg-critical text-white shadow-subtle hover:bg-critical-strong',
        accent: 'bg-accent text-accent-fg shadow-subtle hover:brightness-110',
        subtle: 'bg-primary-soft text-primary hover:brightness-95 dark:hover:brightness-125',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
        outlineDanger:
          'border border-critical/40 text-critical hover:bg-critical/10 hover:border-critical/70',
      },
      size: {
        sm: 'h-8 px-3 text-[0.8125rem]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[0.9375rem]',
        icon: 'size-10 p-0',
        iconSm: 'size-8 p-0',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renderuje stilove na djetetu umjesto na `<button>` (npr. za `<Link>`). */
  asChild?: boolean
  /** Prikazuje spinner i onemogućava dugme. */
  loading?: boolean
  /** Tekst koji čitač ekrana najavljuje dok traje radnja. */
  loadingLabel?: string
}

/**
 * Osnovno dugme.
 *
 * Pravilo proizvoda: svako dugme mora obavljati stvarnu radnju. Dugme bez
 * `onClick`, `type="submit"` ili `asChild` linka je greška u implementaciji.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    asChild = false,
    loading = false,
    loadingLabel = 'Učitavanje…',
    disabled,
    children,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span className="sr-only">{loadingLabel}</span>
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
})

export { buttonVariants }
