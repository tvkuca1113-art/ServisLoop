import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-card border border-border-base bg-surface-raised py-5 text-ink shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 px-5', className)}
      {...props}
    />
  );
}

export interface CardTitleProps extends React.ComponentProps<'h3'> {
  /** Heading level. Pick the one that fits the page outline; defaults to `h3`. */
  as?: 'h2' | 'h3' | 'h4';
}

export function CardTitle({ className, as = 'h3', ...props }: CardTitleProps) {
  const Heading = as;

  return (
    <Heading
      data-slot="card-title"
      className={cn('text-base font-semibold leading-tight text-ink', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-ink-muted', className)}
      {...props}
    />
  );
}

/** Top-right slot for a header action (menu, link, button). */
export function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('flex items-center gap-2', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-border-base px-5 pt-4', className)}
      {...props}
    />
  );
}
