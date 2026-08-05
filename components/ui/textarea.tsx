import { cn } from '@/lib/utils';

export function Textarea({ className, rows = 4, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors',
        'placeholder:text-ink-subtle',
        'hover:border-border-strong',
        'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60',
        'read-only:bg-surface-muted',
        'aria-invalid:border-state-overdue',
        className,
      )}
      {...props}
    />
  );
}
