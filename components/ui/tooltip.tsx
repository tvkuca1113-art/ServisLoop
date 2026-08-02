'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider

/**
 * Tooltip za objašnjenje pojmova.
 *
 * Pravilo pristupačnosti: tooltip smije nositi SAMO dopunsku informaciju.
 * Ništa što je neophodno za obavljanje zadatka ne smije biti dostupno jedino
 * preko prelaska mišem — korisnik tastature i dodira to ne bi vidio.
 * Radix zato otvara tooltip i na fokus.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 200,
  className,
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  delayDuration?: number
  className?: string
}) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'sl-pop z-50 max-w-xs rounded-lg border border-line-strong bg-ink-900 px-3 py-2',
            'text-xs leading-relaxed text-ink-50 shadow-float',
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-ink-900" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
