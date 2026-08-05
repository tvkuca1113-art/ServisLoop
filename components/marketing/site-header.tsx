'use client';

/**
 * Sticky marketing header.
 *
 * Client-side for two reasons that are both real: the current route drives the `aria-current`
 * state on the nav, and the small-screen menu is a disclosure that has to close itself on
 * navigation. Everything else on the marketing site stays server-rendered.
 */

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

import { SiteLogo } from './logo';
import { Container } from './section';

const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  // Route changes close the menu; the panel is not a portal, so it would otherwise
  // survive the navigation and cover the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-base bg-surface/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <SiteLogo />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const current = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  current ? 'text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Start free</Link>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
      </Container>

      <div
        id={menuId}
        hidden={!open}
        className="border-t border-border-base bg-surface md:hidden"
      >
        <Container className="flex flex-col gap-1 py-4">
          <nav aria-label="Main" className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? 'page' : undefined}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-2 flex flex-col gap-2">
            <Button asChild variant="secondary">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Start free</Link>
            </Button>
          </div>
        </Container>
      </div>
    </header>
  );
}
