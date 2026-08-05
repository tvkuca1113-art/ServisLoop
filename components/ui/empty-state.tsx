import { cn } from '@/lib/utils';

export interface EmptyStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  /** Decorative icon; the title must still say what is empty. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary call to action — usually a `<Button>`. */
  action?: React.ReactNode;
  /** Heading level, so the empty state slots into the page outline. Defaults to `h2`. */
  titleAs?: 'h2' | 'h3' | 'h4';
}

/**
 * The "nothing here yet" panel used by every list page. Renders a real heading so the
 * page outline stays intact when a list is empty.
 */
export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  titleAs = 'h2',
  children,
  ...props
}: EmptyStateProps) {
  const Heading = titleAs;

  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border-base bg-surface-muted px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-surface-raised text-ink-subtle shadow-sm [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}

      <Heading data-slot="empty-state-title" className="text-base font-semibold text-ink">
        {title}
      </Heading>

      {description ? (
        <p
          data-slot="empty-state-description"
          className="max-w-prose text-pretty text-sm text-ink-muted"
        >
          {description}
        </p>
      ) : null}

      {children}

      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
