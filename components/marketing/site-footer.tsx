/**
 * Marketing footer. Server-rendered; every link points at a route that exists, so the
 * columns deliberately mix pages with in-page anchors rather than inventing placeholders.
 */

import Link from 'next/link';

import { slugify } from '@/lib/utils';

import { LoopMark } from './logo';
import { Container } from './section';

interface FooterColumn {
  readonly title: string;
  readonly links: readonly { readonly href: string; readonly label: string }[];
}

const COLUMNS: readonly FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Capabilities',
    links: [
      { href: '/features#qr-device-pages', label: 'QR device pages' },
      { href: '/features#reminders', label: 'Service reminders' },
      { href: '/features#booking', label: 'Customer booking' },
      { href: '/features#reports', label: 'PDF service reports' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/contact', label: 'Contact' },
      { href: '/sign-in', label: 'Sign in' },
      { href: '/sign-up', label: 'Start free' },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border-base bg-surface-muted">
      <Container className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <LoopMark className="size-7 shrink-0" />
              <span className="text-base font-semibold tracking-tight text-ink">ServisLoop</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-ink-muted">
              Maintenance scheduling for teams who service equipment in the field. Every device
              tracked, every due date computed, every visit documented.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav
              key={column.title}
              aria-labelledby={`footer-${slugify(column.title)}`}
              className="flex flex-col gap-3"
            >
              <h2 id={`footer-${slugify(column.title)}`} className="text-sm font-semibold text-ink">
                {column.title}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-sm text-ink-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border-base pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            © {year} ServisLoop. Field service maintenance software.
          </p>
          <p className="text-xs text-ink-subtle">
            Pre-launch site. Pricing, company details and customer names shown here are
            illustrative.
          </p>
        </div>
      </Container>
    </footer>
  );
}
