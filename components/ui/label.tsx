'use client';

import * as LabelPrimitive from '@radix-ui/react-label';

import { cn } from '@/lib/utils';

export interface LabelProps extends React.ComponentProps<typeof LabelPrimitive.Root> {
  /** Appends a required marker that is also exposed to screen readers. */
  required?: boolean;
}

export function Label({ className, required = false, children, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex select-none items-center gap-1 text-sm font-medium leading-none text-ink',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-state-overdue">
          <span aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </span>
      ) : null}
    </LabelPrimitive.Root>
  );
}
