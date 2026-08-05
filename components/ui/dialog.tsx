'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('fixed inset-0 z-50 bg-[var(--overlay)]', className)}
      {...props}
    />
  );
}

export interface DialogContentProps
  extends Omit<React.ComponentProps<typeof DialogPrimitive.Content>, 'title'> {
  /**
   * Accessible name of the dialog — required. Radix labels the dialog with it, so there
   * is no way to ship an unnamed dialog. Set `hideTitle` when the design has no visible
   * heading; the title is then rendered `sr-only` rather than dropped.
   */
  title: React.ReactNode;
  description?: React.ReactNode;
  hideTitle?: boolean;
  /** Show the top-right close button. Defaults to `true`. */
  showCloseButton?: boolean;
  className?: string;
  overlayClassName?: string;
}

export function DialogContent({
  className,
  overlayClassName,
  title,
  description,
  hideTitle = false,
  showCloseButton = true,
  children,
  ...props
}: DialogContentProps) {
  const hasVisibleHeader = !hideTitle || description !== undefined;

  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4',
          'rounded-card border border-border-base bg-surface-raised p-6 text-ink shadow-xl',
          'max-h-[calc(100dvh-4rem)] overflow-y-auto',
          'focus:outline-none',
          className,
        )}
        {...props}
      >
        {hasVisibleHeader ? (
          <div data-slot="dialog-header" className="flex flex-col gap-1.5 pr-8 text-left">
            <DialogPrimitive.Title
              className={cn('text-base font-semibold leading-tight text-ink', hideTitle && 'sr-only')}
            >
              {title}
            </DialogPrimitive.Title>
            {description !== undefined ? (
              <DialogPrimitive.Description className="text-sm text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
        ) : (
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        )}

        {children}

        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute right-4 top-4 rounded-md p-1 text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/** Optional section wrappers for composing dialog bodies. */
export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-section-header"
      className={cn('flex flex-col gap-1.5 text-left', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base font-semibold leading-tight text-ink', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-ink-muted', className)}
      {...props}
    />
  );
}
