'use client';

import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { ToastContext, useToast, useToastState, type ToastRecord } from './use-toast';

const toastVariants = cva(
  'pointer-events-auto flex items-start gap-3 rounded-card border border-l-4 border-border-base bg-surface-raised p-4 text-ink shadow-lg',
  {
    variants: {
      variant: {
        default: 'border-l-border-strong',
        success: 'border-l-state-ok',
        warning: 'border-l-state-soon',
        destructive: 'border-l-state-overdue',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/**
 * Holds the toast queue and renders the viewport. Mount once, high in the tree:
 *
 * ```tsx
 * <ToastProvider>{children}</ToastProvider>
 * ```
 */
export function ToastProvider({ children }: { children?: React.ReactNode }) {
  const value = useToastState();

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

/**
 * The live region. It is rendered permanently and empty, which is what makes screen
 * readers announce toasts as they are appended — a region created at the same moment as
 * its content is unreliable. Politeness is fixed at `polite`; anything urgent enough to
 * interrupt belongs in an inline `<Alert variant="destructive">`, not a toast.
 */
export function ToastViewport({ className, ...props }: React.ComponentProps<'ol'>) {
  const { toasts, dismiss } = useToast();

  return (
    <ol
      data-slot="toast-viewport"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
      tabIndex={-1}
      className={cn(
        'pointer-events-none fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4',
        className,
      )}
      {...props}
    >
      {toasts.map((record) => (
        <Toast key={record.id} toast={record} onDismiss={dismiss} />
      ))}
    </ol>
  );
}

export interface ToastProps {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [paused, setPaused] = useState(false);
  const { id, duration, title, description, action } = toast;

  // Hover, focus or touch pauses the countdown, so a toast can never time out while it
  // is being read or interacted with.
  useEffect(() => {
    if (paused || duration === null) return;

    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [paused, duration, id, onDismiss]);

  return (
    <li
      data-slot="toast"
      data-variant={toast.variant}
      className={toastVariants({ variant: toast.variant })}
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocusCapture={() => {
        setPaused(true);
      }}
      onBlurCapture={() => {
        setPaused(false);
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p data-slot="toast-title" className="text-sm font-medium leading-tight text-ink">
          {title}
        </p>
        {description !== undefined ? (
          <p data-slot="toast-description" className="text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
        {action !== undefined ? <div className="pt-1">{action}</div> : null}
      </div>

      <button
        type="button"
        data-slot="toast-close"
        onClick={() => {
          onDismiss(id);
        }}
        className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <X aria-hidden="true" className="size-4" />
        <span className="sr-only">Dismiss notification</span>
      </button>
    </li>
  );
}

export { toastVariants };
