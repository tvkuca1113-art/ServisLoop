import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { LoopMark } from '@/components/marketing/logo';

/**
 * Shell for sign-in and sign-up.
 *
 * Deliberately not the marketing chrome and not the app shell: at this point the visitor
 * has exactly one job, and a sidebar they cannot use or a nav bar full of pricing links
 * only gets in the way. One centred column, the wordmark, and a way back to the public
 * site.
 *
 * Owns `<main id="main">` — the skip link in the root layout targets it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <header className="px-4 py-6 sm:px-6">
        <Link
          href="/"
          className="mx-auto flex w-fit items-center gap-2 rounded-md text-ink transition-colors hover:text-brand-700"
        >
          <LoopMark className="size-8 shrink-0" />
          <span className="text-lg font-semibold tracking-tight">ServisLoop</span>
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="border-t border-border-base bg-surface px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to the ServisLoop site
          </Link>
          <Link
            href="/contact"
            className="rounded-md text-ink-muted transition-colors hover:text-ink"
          >
            Need help?
          </Link>
        </div>
      </footer>
    </div>
  );
}
