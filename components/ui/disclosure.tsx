'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: 'pill' | 'underline'
  }
>(function TabsList({ className, variant = 'pill', ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex items-center',
        variant === 'pill'
          ? 'gap-1 rounded-xl border border-line bg-surface-muted p-1'
          : 'gap-1 border-b border-line',
        'max-w-full overflow-x-auto scroll-slim',
        className,
      )}
      data-variant={variant}
      {...props}
    />
  )
})

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: 'pill' | 'underline'
  }
>(function TabsTrigger({ className, variant = 'pill', ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap',
        'transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:pointer-events-none disabled:opacity-50',
        "[&_svg]:size-4 [&_svg]:shrink-0",
        variant === 'pill'
          ? [
              'rounded-lg px-3 py-1.5 text-fg-muted',
              'hover:text-fg',
              'data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-subtle',
            ]
          : [
              '-mb-px border-b-2 border-transparent px-3 py-2.5 text-fg-muted',
              'hover:border-line-strong hover:text-fg',
              'data-[state=active]:border-primary data-[state=active]:text-fg',
            ],
        className,
      )}
      {...props}
    />
  )
})

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4',
        className,
      )}
      {...props}
    />
  )
})

// ---------------------------------------------------------------------------
// Accordion
// ---------------------------------------------------------------------------

export const Accordion = AccordionPrimitive.Root

export const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn('border-b border-line last:border-b-0', className)}
      {...props}
    />
  )
})

export const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          'group flex flex-1 items-center justify-between gap-4 py-5 text-left',
          'text-[0.9375rem] font-medium text-fg transition-colors',
          'hover:text-primary',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className="size-5 shrink-0 text-fg-subtle transition-transform duration-250 group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
})

export const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content className="sl-accordion overflow-hidden" ref={ref} {...props}>
      <div className={cn('pb-5 text-sm leading-relaxed text-fg-muted', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
})
