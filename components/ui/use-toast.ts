'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastVariant = 'default' | 'success' | 'warning' | 'destructive';

export interface ToastOptions {
  /** Short, specific headline. This — not the colour — is what carries the meaning. */
  title: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. `null` keeps the toast until it is dismissed. */
  duration?: number | null;
  /** Optional action element, e.g. an "Undo" `<Button size="sm" variant="ghost">`. */
  action?: ReactNode;
}

export interface ToastRecord extends ToastOptions {
  id: string;
  variant: ToastVariant;
  duration: number | null;
}

export interface ToastContextValue {
  toasts: readonly ToastRecord[];
  /** Queue a toast; returns its id so it can be dismissed programmatically. */
  toast: (options: ToastOptions) => string;
  /** Dismiss one toast, or all of them when called without an id. */
  dismiss: (id?: string) => void;
}

export const DEFAULT_TOAST_DURATION_MS = 5000;

/** Oldest toasts fall off once this many are on screen. */
export const TOAST_LIMIT = 4;

export const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

function nextToastId(): string {
  toastCounter += 1;
  return `toast-${toastCounter}`;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast() must be used inside <ToastProvider>.');
  }
  return context;
}

/**
 * Owns the toast queue. Internal to `<ToastProvider>` — components call {@link useToast}.
 * Each toast owns its own dismissal timer (see `toast.tsx`) so hovering pauses it.
 */
export function useToastState(): ToastContextValue {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);

  const dismiss = useCallback((id?: string) => {
    setToasts((current) =>
      id === undefined ? [] : current.filter((candidate) => candidate.id !== id),
    );
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const record: ToastRecord = {
      ...options,
      id: nextToastId(),
      variant: options.variant ?? 'default',
      duration: options.duration === undefined ? DEFAULT_TOAST_DURATION_MS : options.duration,
    };
    setToasts((current) => [...current, record].slice(-TOAST_LIMIT));
    return record.id;
  }, []);

  return useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);
}
