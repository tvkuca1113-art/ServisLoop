'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from './button'

// ---------------------------------------------------------------------------
// Dialog — modalni prozor
// ---------------------------------------------------------------------------

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const overlayClasses =
  'sl-overlay fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-[2px]'

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Sakriva ugao za zatvaranje kad dijalog ima vlastita dugmad. */
    hideClose?: boolean
  }
>(function DialogContent({ className, children, size = 'md', hideClose, ...props }, ref) {
  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size]

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'sl-pop fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto scroll-slim',
          'rounded-panel border border-line bg-surface shadow-float',
          sizeClass,
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close
            className={cn(
              'absolute top-4 right-4 rounded-md p-1.5 text-fg-subtle transition-colors',
              'hover:bg-surface-muted hover:text-fg',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Zatvori</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1.5 px-6 pt-6 pb-4', className)} {...props} />
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('pr-8 text-lg leading-tight font-semibold text-fg', className)}
      {...props}
    />
  )
})

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm leading-relaxed text-fg-muted', className)}
      {...props}
    />
  )
})

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 pb-2', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 px-6 py-5 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Sheet — bočna/donja ladica (mobilna navigacija, filteri)
// ---------------------------------------------------------------------------

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: 'left' | 'right' | 'bottom'
    hideClose?: boolean
  }
>(function SheetContent({ className, children, side = 'right', hideClose, ...props }, ref) {
  const sideClasses = {
    right: 'sl-sheet-right inset-y-0 right-0 h-dvh w-[min(24rem,calc(100vw-3rem))] border-l',
    left: 'sl-sheet-left inset-y-0 left-0 h-dvh w-[min(20rem,calc(100vw-3rem))] border-r',
    bottom: 'sl-sheet-bottom inset-x-0 bottom-0 max-h-[85dvh] rounded-t-panel border-t',
  }[side]

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 overflow-y-auto scroll-slim border-line bg-surface shadow-float',
          sideClasses,
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close
            className={cn(
              'absolute top-4 right-4 rounded-md p-1.5 text-fg-subtle transition-colors',
              'hover:bg-surface-muted hover:text-fg',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Zatvori</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export const SheetTitle = DialogTitle
export const SheetDescription = DialogDescription
export const SheetHeader = DialogHeader
export const SheetFooter = DialogFooter

// ---------------------------------------------------------------------------
// ConfirmDialog — potvrda destruktivne radnje
// ---------------------------------------------------------------------------

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void | Promise<void>
  /**
   * Kad je zadano, korisnik mora upisati tačno ovaj tekst da bi potvrdio.
   * Koristi se za brisanje organizacije i druge nepovratne radnje.
   */
  confirmationPhrase?: string
}

/**
 * Potvrda prije nepovratne radnje.
 *
 * Koristi `AlertDialog` (ne obični `Dialog`) jer taj primitiv ne dozvoljava
 * zatvaranje klikom izvan prozora ni tipkom Escape bez svjesnog izbora —
 * upravo ono što treba za brisanje podataka.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Potvrdi',
  cancelLabel = 'Odustani',
  tone = 'danger',
  loading = false,
  onConfirm,
  confirmationPhrase,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('')
  const phraseOk = !confirmationPhrase || typed.trim() === confirmationPhrase

  React.useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={overlayClasses} />
        <AlertDialogPrimitive.Content
          className={cn(
            'sl-pop fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md',
            '-translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface p-6 shadow-float',
          )}
        >
          <AlertDialogPrimitive.Title className="text-lg leading-tight font-semibold text-fg">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-fg-muted">{description}</div>
          </AlertDialogPrimitive.Description>

          {confirmationPhrase ? (
            <div className="mt-4 space-y-2">
              <label htmlFor="confirm-phrase" className="block text-sm font-medium text-fg">
                Za potvrdu upišite:{' '}
                <span className="font-mono text-critical">{confirmationPhrase}</span>
              </label>
              <input
                id="confirm-phrase"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                className={cn(
                  'h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm',
                  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:outline-none',
                )}
              />
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel
              className={cn(buttonVariants({ variant: 'secondary' }))}
              disabled={loading}
            >
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              disabled={!phraseOk}
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
