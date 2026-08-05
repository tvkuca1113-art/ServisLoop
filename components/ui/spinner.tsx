import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const spinnerVariants = cva('animate-spin text-current', {
  variants: {
    size: {
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-8',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export interface SpinnerProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof spinnerVariants> {
  /**
   * Announced to screen readers. Pass an empty string when a surrounding live region
   * already reports the loading state — the spinner then becomes purely decorative.
   */
  label?: string;
}

export function Spinner({ className, size, label = 'Loading…', ...props }: SpinnerProps) {
  const announces = label.length > 0;

  return (
    <span
      data-slot="spinner"
      role={announces ? 'status' : undefined}
      aria-hidden={announces ? undefined : true}
      className={cn('inline-flex items-center gap-2 text-ink-muted', className)}
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className={spinnerVariants({ size })}
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {announces ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export { spinnerVariants };
