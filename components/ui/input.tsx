'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const baseFieldClasses = [
  'w-full rounded-lg border border-line bg-surface text-fg',
  'placeholder:text-fg-subtle',
  'transition-[border-color,box-shadow] duration-150',
  'outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle',
  'aria-[invalid=true]:border-critical aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-critical/20',
].join(' ')

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Ikona ili oznaka lijevo unutar polja (npr. lupa, „KM“). */
  prefix?: React.ReactNode
  /** Ikona ili oznaka desno unutar polja. */
  suffix?: React.ReactNode
  inputSize?: 'sm' | 'md' | 'lg'
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, prefix, suffix, inputSize = 'md', type = 'text', ...props },
  ref,
) {
  const sizeClasses = {
    sm: 'h-8 px-2.5 text-[0.8125rem]',
    md: 'h-10 px-3 text-sm',
    lg: 'h-12 px-4 text-base',
  }[inputSize]

  const field = (
    <input
      ref={ref}
      type={type}
      className={cn(baseFieldClasses, sizeClasses, prefix && 'pl-9', suffix && 'pr-12', className)}
      {...props}
    />
  )

  if (!prefix && !suffix) return field

  return (
    <div className="relative w-full">
      {prefix ? (
        <span
          className="text-fg-subtle pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 [&_svg]:size-4"
          aria-hidden="true"
        >
          {prefix}
        </span>
      ) : null}
      {field}
      {suffix ? (
        <span
          className="text-fg-muted pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm [&_svg]:size-4"
          aria-hidden="true"
        >
          {suffix}
        </span>
      ) : null}
    </div>
  )
})

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(baseFieldClasses, 'min-h-20 resize-y px-3 py-2.5 text-sm', className)}
      {...props}
    />
  )
})

/**
 * Nativni `<select>`. Za jednostavne liste je bolji od prilagođene komponente:
 * radi bez JavaScripta, savršeno je pristupačan i na mobitelu otvara sistemski
 * birač. Radix `Select` koristimo samo gdje treba pretraga ili bogat sadržaj.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { selectSize?: 'sm' | 'md' | 'lg' }
>(function Select({ className, selectSize = 'md', children, ...props }, ref) {
  const sizeClasses = {
    sm: 'h-8 pl-2.5 text-[0.8125rem]',
    md: 'h-10 pl-3 text-sm',
    lg: 'h-12 pl-4 text-base',
  }[selectSize]

  return (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          baseFieldClasses,
          sizeClasses,
          'cursor-pointer appearance-none pr-9',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="text-fg-subtle pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
})

export { baseFieldClasses }
