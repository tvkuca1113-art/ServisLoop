/**
 * Shell for the public marketing site.
 *
 * The root layout owns `<html>`, `<body>` and the skip link; this layout owns the chrome
 * around the marketing pages and, critically, the `<main id="main">` the skip link targets.
 *
 * The `<noscript>` rule is the safety net for the scroll reveals: Framer renders those
 * blocks at `opacity: 0` until they scroll into view, so a visitor whose JavaScript never
 * arrives would otherwise be looking at an empty page. A stylesheet `!important` beats a
 * plain inline style, so this resets them without touching the animated path.
 */

import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <noscript>
        <style>{'[data-reveal]{opacity:1 !important;transform:none !important;}'}</style>
      </noscript>
      <SiteHeader />
      {/*
        `overflow-x-clip` rather than `overflow-x-hidden`: clipping does not create a
        scroll container, so the sticky header keeps working. It stops the 3D hero's hover
        labels from ever widening the page on a narrow desktop window.
      */}
      <main id="main" className="flex-1 overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
