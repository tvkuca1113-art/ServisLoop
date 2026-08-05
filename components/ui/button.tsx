'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * The focus ring is declared once, globally, in `globals.css`
 * (`:focus-visible { outline: 2px solid var(--color-brand-600) }`). Components must not
 * re-declare it — a utility would sit in Tailwind's `utilities` layer and silently win
 * over the base rule, which is how focus rings drift apart.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-sm font-medium leading-none transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
        secondary:
          'border border-border-base bg-surface-muted text-ink hover:bg-ink/5 active:bg-ink/10',
        outline:
          'border border-border-strong bg-transparent text-ink hover:bg-ink/5 active:bg-ink/10',
        ghost: 'bg-transparent text-ink hover:bg-ink/5 active:bg-ink/10',
        destructive:
          'bg-state-overdue text-white hover:bg-state-overdue/90 active:bg-state-overdue/80',
        link: 'bg-transparent text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-11 rounded-lg px-6 text-base',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `<button>` (e.g. a `next/link` anchor). */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp: React.ElementType = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
