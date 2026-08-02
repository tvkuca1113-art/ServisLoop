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
          ? 'border-line bg-surface-muted gap-1 rounded-xl border p-1'
          : 'border-line gap-1 border-b',
        'scroll-slim max-w-full overflow-x-auto',
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
        'focus-visible:ring-ring focus-visible:ring-offset-canvas focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        variant === 'pill'
          ? [
              'text-fg-muted rounded-lg px-3 py-1.5',
              'hover:text-fg',
              'data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-subtle',
            ]
          : [
              'text-fg-muted -mb-px border-b-2 border-transparent px-3 py-2.5',
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
        'focus-visible:ring-ring mt-4 outline-none focus-visible:ring-2 focus-visible:ring-offset-4',
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
      className={cn('border-line border-b last:border-b-0', className)}
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
          'text-fg text-[0.9375rem] font-medium transition-colors',
          'hover:text-primary',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className="text-fg-subtle size-5 shrink-0 transition-transform duration-250 group-data-[state=open]:rotate-180"
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
      <div className={cn('text-fg-muted pb-5 text-sm leading-relaxed', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
})
