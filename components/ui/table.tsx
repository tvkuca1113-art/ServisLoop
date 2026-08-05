import { cn } from '@/lib/utils';

export interface TableProps extends React.ComponentProps<'table'> {
  /** Classes for the scroll container wrapping the table. */
  containerClassName?: string;
}

export function Table({ className, containerClassName, ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      className={cn('relative w-full overflow-x-auto', containerClassName)}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom border-collapse text-sm text-ink', className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b [&_tr]:border-border-base', className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-border-base bg-surface-muted font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border-base transition-colors hover:bg-ink/5 data-[state=selected]:bg-brand-600/10',
        className,
      )}
      {...props}
    />
  );
}

export interface TableHeadProps extends React.ComponentProps<'th'> {
  /** Right-align and lock the column to tabular figures so digits line up. */
  numeric?: boolean;
}

export function TableHead({ className, numeric = false, scope, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      scope={scope ?? 'col'}
      className={cn(
        'h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-ink-muted',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends React.ComponentProps<'td'> {
  /** Right-align and lock the cell to tabular figures so digits line up. */
  numeric?: boolean;
}

export function TableCell({ className, numeric = false, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-3 py-2.5 align-middle',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-3 text-left text-sm text-ink-muted', className)}
      {...props}
    />
  );
}
