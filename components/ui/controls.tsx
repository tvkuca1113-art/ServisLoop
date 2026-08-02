'use client'

import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer border-line-strong bg-surface size-4.5 shrink-0 rounded-[5px] border',
        'transition-colors outline-none',
        'focus-visible:ring-ring focus-visible:ring-offset-canvas focus-visible:ring-2 focus-visible:ring-offset-2',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-fg',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-fg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})

/** Checkbox s oznakom i opisom — česta kombinacija u postavkama i pristancima. */
export function CheckboxField({
  id,
  label,
  description,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
}) {
  const descriptionId = description ? `${id}-desc` : undefined
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <Checkbox id={id} aria-describedby={descriptionId} className="mt-0.5" {...props} />
      <div className="min-w-0 space-y-1">
        <label
          htmlFor={id}
          className="text-fg block cursor-pointer text-sm leading-snug font-medium"
        >
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-fg-muted text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
        'border-2 border-transparent transition-colors outline-none',
        'focus-visible:ring-ring focus-visible:ring-offset-canvas focus-visible:ring-2 focus-visible:ring-offset-2',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-line-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'shadow-subtle pointer-events-none block size-5 rounded-full bg-white ring-0',
          'transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  )
})

/** Prekidač s oznakom i opisom — glavni obrazac u postavkama obavijesti. */
export function SwitchField({
  id,
  label,
  description,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
}) {
  const descriptionId = description ? `${id}-desc` : undefined
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1">
        <label htmlFor={id} className="text-fg block cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-fg-muted text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <Switch id={id} aria-describedby={descriptionId} className="mt-0.5 shrink-0" {...props} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Radio group
// ---------------------------------------------------------------------------

export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-3', className)} {...props} />
})

export const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupItem({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'border-line-strong bg-surface aspect-square size-4.5 shrink-0 rounded-full border',
        'transition-colors outline-none',
        'focus-visible:ring-ring focus-visible:ring-offset-canvas focus-visible:ring-2 focus-visible:ring-offset-2',
        'data-[state=checked]:border-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <span className="bg-primary size-2 rounded-full" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})

/**
 * Radio kao velika kartica — koristi se u onboardingu i biranju vrste servisa.
 * Cijela kartica je klikabilna i ima jasno stanje fokusa.
 */
export function RadioCard({
  value,
  id,
  title,
  description,
  icon: Icon,
  className,
}: {
  value: string
  id: string
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'group rounded-card border-line bg-surface relative flex cursor-pointer items-start gap-3 border p-4',
        'hover:border-line-strong hover:shadow-subtle transition-all duration-150',
        'has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary-soft',
        'has-[button:focus-visible]:ring-ring has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-offset-2',
        className,
      )}
    >
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <span className="text-fg flex items-center gap-2 text-sm font-medium">
          {Icon ? <Icon className="text-fg-subtle size-4" /> : null}
          {title}
        </span>
        {description ? (
          <span className="text-fg-muted block text-xs leading-relaxed">{description}</span>
        ) : null}
      </div>
    </label>
  )
}
