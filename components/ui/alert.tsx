import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-card border px-4 py-3 text-sm text-ink', {
  variants: {
    variant: {
      default: 'border-border-base bg-surface-muted',
      info: 'border-brand-600/30 bg-brand-600/10',
      success: 'border-state-ok/30 bg-state-ok/10',
      warning: 'border-state-soon/40 bg-state-soon/10',
      destructive: 'border-state-overdue/40 bg-state-overdue/10',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const alertIconVariants = cva('mt-0.5 shrink-0 [&_svg]:size-4', {
  variants: {
    variant: {
      default: 'text-ink-muted',
      info: 'text-brand-600',
      success: 'text-state-ok',
      warning: 'text-state-soon',
      destructive: 'text-state-overdue',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

export interface AlertProps extends React.ComponentProps<'div'>, VariantProps<typeof alertVariants> {
  /** Decorative leading icon. Meaning must also be carried by the title text. */
  icon?: React.ReactNode;
}

/**
 * `role` defaults to `status` (polite) and to `alert` (assertive) for the destructive
 * variant. Pass `role` explicitly when the alert is rendered statically on page load and
 * should not be announced at all.
 */
export function Alert({ className, variant, icon, role, children, ...props }: AlertProps) {
  const resolved: AlertVariant = variant ?? 'default';

  return (
    <div
      data-slot="alert"
      role={role ?? (resolved === 'destructive' ? 'alert' : 'status')}
      className={cn(alertVariants({ variant: resolved }), 'flex items-start gap-3', className)}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className={alertIconVariants({ variant: resolved })}>
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    </div>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="alert-title"
      className={cn('font-medium leading-tight text-ink', className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-sm text-ink-muted [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { alertVariants };
