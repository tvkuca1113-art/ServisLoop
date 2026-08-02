'use client'

import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react'

/**
 * Toast obavijesti.
 *
 * Pravilo: toast potvrđuje da se nešto DESILO. Nikad ne nosi informaciju koju
 * korisnik mora zapamtiti ili pročitati do kraja — takav sadržaj ide u
 * `Alert` ili dijalog, jer toast nestaje.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      expand={false}
      visibleToasts={4}
      closeButton
      offset={16}
      gap={10}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast:
            'group rounded-xl border border-line bg-surface text-fg shadow-float p-4 text-sm w-full',
          title: 'font-semibold text-fg text-sm',
          description: 'text-fg-muted text-xs leading-relaxed mt-0.5',
          actionButton:
            'bg-primary text-primary-fg rounded-md px-2.5 py-1 text-xs font-medium hover:brightness-110',
          cancelButton:
            'bg-surface-muted text-fg-muted rounded-md px-2.5 py-1 text-xs font-medium hover:text-fg',
          closeButton: 'bg-surface border-line text-fg-muted hover:text-fg',
          error: 'border-critical/35',
          success: 'border-positive/35',
          warning: 'border-caution/40',
          info: 'border-electric-500/35',
        },
      }}
      icons={{
        success: (
          <CheckCircle2
            className="text-positive-strong dark:text-positive size-4.5"
            aria-hidden="true"
          />
        ),
        error: (
          <OctagonAlert
            className="text-critical-strong dark:text-critical size-4.5"
            aria-hidden="true"
          />
        ),
        warning: (
          <AlertTriangle
            className="text-caution-strong dark:text-caution size-4.5"
            aria-hidden="true"
          />
        ),
        info: <Info className="text-electric-500 size-4.5" aria-hidden="true" />,
      }}
    />
  )
}

interface ToastOptions {
  description?: string
  duration?: number
  action?: { label: string; onClick: () => void }
}

/**
 * Omotač oko `sonner` s bosanskim tekstovima.
 * Aplikacija zove ISKLJUČIVO ove funkcije — tako sve poruke imaju isti ton
 * i lako ih je promijeniti na jednom mjestu.
 */
export const toast = {
  success(message: string, options?: ToastOptions) {
    return sonnerToast.success(message, options)
  },

  error(message: string, options?: ToastOptions) {
    return sonnerToast.error(message, { duration: 8000, ...options })
  },

  warning(message: string, options?: ToastOptions) {
    return sonnerToast.warning(message, { duration: 7000, ...options })
  },

  info(message: string, options?: ToastOptions) {
    return sonnerToast.info(message, options)
  },

  loading(message: string) {
    return sonnerToast.loading(message)
  },

  dismiss(id?: string | number) {
    sonnerToast.dismiss(id)
  },

  /**
   * Radnja s mogućnošću opoziva.
   * Sama radnja se izvršava odmah; „Poništi“ poziva `onUndo`.
   * Koristi se tamo gdje je opoziv stvarno implementiran na serveru —
   * nikad kao ukras.
   */
  withUndo(message: string, onUndo: () => void | Promise<void>, options?: ToastOptions) {
    return sonnerToast.success(message, {
      ...options,
      duration: 8000,
      action: { label: 'Poništi', onClick: () => void onUndo() },
    })
  },

  /** Prati obećanje i mijenja poruku ovisno o ishodu. */
  promise<T>(
    promise: Promise<T>,
    messages: { loading: string; success: string | ((data: T) => string); error: string },
  ) {
    return sonnerToast.promise(promise, messages)
  },
}
