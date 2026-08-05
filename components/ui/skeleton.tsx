import { cn } from '@/lib/utils';

/**
 * Placeholder block. Hidden from assistive technology by default — announce loading
 * state with a live region (`<Spinner />` or an `aria-busy` container) instead.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-ink/10', className)}
      {...props}
    />
  );
}
