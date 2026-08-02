'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { AlertCircle, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from './tooltip'

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(function Label({ className, required, children, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'text-fg flex items-center gap-1.5 text-sm leading-none font-medium',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-critical" aria-hidden="true" title="Obavezno polje">
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  )
})

export interface FieldProps {
  /** Jedinstveni `id` polja. Povezuje oznaku, opis i grešku. */
  id: string
  label: React.ReactNode
  /** Objašnjenje ispod polja. */
  hint?: React.ReactNode
  /** Objašnjenje nepoznatog pojma u obliku tooltipa uz oznaku. */
  help?: string
  error?: string | null
  required?: boolean
  className?: string
  children: (props: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': boolean | undefined
    'aria-required': boolean | undefined
  }) => React.ReactNode
}

/**
 * Omotač polja u obrascu.
 *
 * Sam povezuje `label`, `aria-describedby` i `aria-invalid` — tako da nijedno
 * polje u aplikaciji ne može ostati bez pravilne oznake ili bez najave greške
 * čitaču ekrana.
 *
 *   <Field id="email" label="E-pošta" error={errors.email?.message}>
 *     {(field) => <Input {...field} {...register('email')} />}
 *   </Field>
 */
export function Field({ id, label, hint, help, error, required, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
        {help ? (
          <Tooltip content={help}>
            <button
              type="button"
              className="text-fg-subtle hover:text-fg-muted transition-colors"
              aria-label={`Pomoć: ${help}`}
            >
              <HelpCircle className="size-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })}

      {hint && !error ? (
        <p id={hintId} className="text-fg-muted text-xs leading-relaxed">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="text-critical flex items-start gap-1.5 text-xs leading-relaxed font-medium"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}

/**
 * Sažetak grešaka na vrhu obrasca.
 * Pristupačnost traži da korisnik koji ne vidi ekran odmah sazna šta nije u
 * redu i može skočiti na problematično polje.
 */
export function FormErrorSummary({
  errors,
  title = 'Obrazac nije poslan',
  className,
}: {
  errors: Array<{ field: string; message: string }>
  title?: string
  className?: string
}) {
  if (errors.length === 0) return null

  return (
    <div
      role="alert"
      tabIndex={-1}
      className={cn('border-critical/35 bg-critical/8 rounded-lg border p-4 text-sm', className)}
    >
      <p className="text-critical-strong dark:text-critical flex items-center gap-2 font-semibold">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        {title}
      </p>
      <ul className="mt-2 space-y-1 pl-6">
        {errors.map((error) => (
          <li key={error.field} className="text-fg-muted marker:text-critical list-disc">
            <a
              href={`#${error.field}`}
              className="decoration-critical/40 hover:text-fg underline underline-offset-2"
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Grupa srodnih polja s naslovom — koristi se u postavkama i onboardingu. */
export function Fieldset({
  legend,
  description,
  children,
  className,
}: {
  legend: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <fieldset className={cn('space-y-4', className)}>
      <div className="space-y-1">
        <legend className="text-fg text-sm font-semibold">{legend}</legend>
        {description ? <p className="text-fg-muted text-xs">{description}</p> : null}
      </div>
      {children}
    </fieldset>
  )
}
