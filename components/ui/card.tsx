import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Kartica — osnovna površina za grupisanje sadržaja.
 * Namjerno bez ugrađenog razmaka: `CardHeader` / `CardBody` / `CardFooter`
 * nose vertikalni ritam da bi ostao dosljedan kroz cijelu aplikaciju.
 */
export function Card({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface shadow-card',
        interactive &&
          'transition-shadow duration-200 hover:shadow-raised focus-within:shadow-raised',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 px-5 pt-5 pb-4 sm:px-6 sm:pt-6', className)}
      {...props}
    />
  )
}

export function CardTitle({
  className,
  as: Comp = 'h3',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }) {
  return (
    <Comp className={cn('text-base leading-tight font-semibold text-fg', className)} {...props} />
  )
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-relaxed text-fg-muted', className)} {...props} />
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-line px-5 py-4 sm:px-6',
        className,
      )}
      {...props}
    />
  )
}

/** Zaglavlje s naslovom lijevo i radnjama desno — najčešći raspored u aplikaciji. */
export function CardHeaderRow({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <CardHeader className={cn('flex-row items-start justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1.5">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </CardHeader>
  )
}
