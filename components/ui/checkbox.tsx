'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group/checkbox peer size-4 shrink-0 rounded-sm border border-border-strong bg-surface shadow-sm transition-colors',
        'hover:border-brand-600',
        'data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600 data-[state=checked]:text-white',
        'data-[state=indeterminate]:border-brand-600 data-[state=indeterminate]:bg-brand-600 data-[state=indeterminate]:text-white',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-state-overdue',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {/* Both marks are rendered and swapped by state, so an uncontrolled checkbox
            starting out indeterminate still shows the right glyph. */}
        <Check
          aria-hidden="true"
          className="size-3.5 group-data-[state=indeterminate]/checkbox:hidden"
          strokeWidth={3}
        />
        <Minus
          aria-hidden="true"
          className="hidden size-3.5 group-data-[state=indeterminate]/checkbox:block"
          strokeWidth={3}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
