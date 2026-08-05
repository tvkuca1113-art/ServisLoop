/**
 * The ServisLoop wordmark: a broken ring with a marker sitting on it, the same motif the
 * 3D hero animates. Kept out of `site-header.tsx` so the footer can use it without
 * pulling the header's client bundle in.
 */

import Link from 'next/link';

import { cn } from '@/lib/utils';

export function LoopMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle
        cx="16"
        cy="16"
        r="11"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="50 20"
        transform="rotate(-104 16 16)"
        className="stroke-brand-600"
      />
      <circle cx="16" cy="5" r="3.4" className="fill-brand-500" />
    </svg>
  );
}

export function SiteLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex w-fit items-center gap-2 rounded-md text-ink', className)}>
      <LoopMark className="size-7 shrink-0" />
      <span className="text-base font-semibold tracking-tight">ServisLoop</span>
    </Link>
  );
}
