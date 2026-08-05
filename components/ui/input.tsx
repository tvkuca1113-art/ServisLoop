import { cn } from '@/lib/utils';

/**
 * Set `aria-invalid` (not just a red class) when a field fails validation — the styling
 * hangs off that attribute, so the visual and the accessible state can never disagree.
 */
export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-border-base bg-surface px-3 py-1 text-sm text-ink shadow-sm transition-colors',
        'placeholder:text-ink-subtle',
        'hover:border-border-strong',
        'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60',
        'read-only:bg-surface-muted',
        'aria-invalid:border-state-overdue',
        'file:mr-3 file:h-7 file:cursor-pointer file:rounded file:border-0 file:bg-surface-muted file:px-2 file:text-xs file:font-medium file:text-ink',
        className,
      )}
      {...props}
    />
  );
}
