import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Badges carry service state, so colour is never the only signal: every state variant
 * renders a dot *and* the label text, and the label keeps full `text-ink` contrast
 * rather than being tinted to match the state colour.
 */
const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-border-base bg-surface-muted text-ink-muted',
        outline: 'border-border-strong bg-transparent text-ink',
        ok: 'border-state-ok/30 bg-state-ok/10 text-ink',
        soon: 'border-state-soon/40 bg-state-soon/15 text-ink',
        due: 'border-state-due/40 bg-state-due/15 text-ink',
        overdue: 'border-state-overdue/40 bg-state-overdue/15 text-ink',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/** Dot colour per state variant. Absent for the non-state variants. */
const STATE_DOT: Partial<Record<BadgeVariant, string>> = {
  ok: 'bg-state-ok',
  soon: 'bg-state-soon',
  due: 'bg-state-due',
  overdue: 'bg-state-overdue',
};

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {
  /** Force the leading dot on or off. State variants show it by default. */
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  const resolved: BadgeVariant = variant ?? 'neutral';
  const stateDot = STATE_DOT[resolved];
  const showDot = dot ?? stateDot !== undefined;

  return (
    <span
      data-slot="badge"
      data-variant={resolved}
      className={cn(badgeVariants({ variant: resolved }), className)}
      {...props}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', stateDot ?? 'bg-current')}
        />
      ) : null}
      {children}
    </span>
  );
}

/**
 * Structurally identical to `ServiceState` in `@/domain/service-interval`, restated here
 * so the primitive library keeps no dependency on the domain layer.
 */
export type ServiceStateLike = 'unscheduled' | 'ok' | 'due_soon' | 'due' | 'overdue';

/** Map a domain service state onto its badge variant. */
export function serviceStateBadgeVariant(state: ServiceStateLike): BadgeVariant {
  switch (state) {
    case 'ok':
      return 'ok';
    case 'due_soon':
      return 'soon';
    case 'due':
      return 'due';
    case 'overdue':
      return 'overdue';
    case 'unscheduled':
      return 'neutral';
  }
}

export { badgeVariants };
