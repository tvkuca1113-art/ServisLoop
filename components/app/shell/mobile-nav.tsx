'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LoopMark } from '@/components/marketing/logo';
import { Button, Dialog, DialogContent, DialogTrigger } from '@/components/ui';

import { NavList } from './sidebar';
import type { NavItem } from './nav-items';
import { OrgSwitcher, type OrgOption } from './org-switcher';

/**
 * Navigation for narrow screens: a dialog anchored to the left edge, opened from the
 * header.
 *
 * Radix's dialog is the right primitive rather than a hand-rolled drawer — it traps focus,
 * restores it to the trigger on close, and closes on Escape. Those are exactly the things
 * a bespoke slide-out panel forgets, and a technician navigating one-handed on a phone in
 * a plant room is the person who pays for it.
 */

export interface MobileNavProps {
  items: readonly NavItem[];
  organizations: readonly OrgOption[];
  activeOrgId: string;
  organizationName: string;
}

export function MobileNav({
  items,
  organizations,
  activeOrgId,
  organizationName,
}: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A route change means the visitor got where they were going; the panel should not be
  // sitting on top of the page they asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Navigation"
        hideTitle
        showCloseButton={false}
        className="left-0 top-0 h-dvh w-[17rem] max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none rounded-r-card border-l-0 p-0"
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-col gap-3 border-b border-border-base p-3">
            <Link
              href="/app"
              onClick={() => {
                setOpen(false);
              }}
              className="flex items-center gap-2 rounded-md text-ink"
            >
              <LoopMark className="size-7 shrink-0" />
              <span className="text-base font-semibold tracking-tight">ServisLoop</span>
            </Link>

            <OrgSwitcher organizations={organizations} activeId={activeOrgId} />
          </div>

          <nav aria-label="Product" className="flex-1 overflow-y-auto p-3">
            <NavList
              items={items}
              pathname={pathname}
              onNavigate={() => {
                setOpen(false);
              }}
            />
          </nav>

          <p className="border-t border-border-base px-4 py-3 text-xs text-ink-subtle">
            {organizationName}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
