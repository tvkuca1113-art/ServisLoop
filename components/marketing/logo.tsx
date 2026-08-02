import { cn } from '@/lib/utils'

/**
 * Znak ServisLoop-a: zatvorena petlja s jednom svjetlijom tačkom koja je
 * upravo prošla kroz ciklus. Čista SVG geometrija — bez rasterskih datoteka,
 * savršena na svakoj rezoluciji i u štampi.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8', className)}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="sl-mark-ring"
          x1="4"
          y1="4"
          x2="28"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#18C7B5" />
          <stop offset="1" stopColor="#5E8BFF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" className="fill-ink-900" />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        stroke="url(#sl-mark-ring)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="40 13"
        transform="rotate(-58 16 16)"
      />
      <circle cx="16" cy="7.5" r="2.6" fill="#18C7B5" />
      <circle cx="16" cy="7.5" r="4.6" fill="#18C7B5" fillOpacity="0.18" />
    </svg>
  )
}

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string
  showWordmark?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {showWordmark ? (
        <span className="text-fg text-[1.0625rem] font-semibold tracking-tight">
          Servis<span className="text-primary">Loop</span>
        </span>
      ) : null}
      <span className="sr-only">ServisLoop — početna stranica</span>
    </span>
  )
}
