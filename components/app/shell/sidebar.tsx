'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LoopMark } from '@/components/marketing/logo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';

import { NavIcon, isActiveNav, type NavItem } from './nav-items';
import { OrgSwitcher, type OrgOption } from './org-switcher';

/**
 * The desktop sidebar.
 *
 * Collapses to an icon rail, and remembers that choice per browser — a dispatcher who
 * lives in the work-order board all day wants the width back, and should not have to ask
 * for it again every morning.
 *
 * `items` arrives already filtered by permission from the server. This component decides
 * how the navigation *looks*; it does not decide what is in it.
 */

const COLLAPSE_STORAGE_KEY = 'servisloop:sidebar-collapsed';

export interface SidebarProps {
  items: readonly NavItem[];
  organizations: readonly OrgOption[];
  activeOrgId: string;
}

export function Sidebar({ items, organizations, activeOrgId }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount rather than during render: the server has no localStorage, and
  // initialising from it directly would hydrate against different markup.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true');
  }, []);

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border-base bg-surface-muted lg:flex',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className={cn('flex flex-col gap-3 p-3', collapsed && 'items-center px-2')}>
        <Link
          href="/app"
          className={cn(
            'flex items-center gap-2 rounded-md text-ink',
            collapsed && 'justify-center',
          )}
        >
          <LoopMark className="size-7 shrink-0" />
          {collapsed ? (
            <span className="sr-only">ServisLoop dashboard</span>
          ) : (
            <span className="text-base font-semibold tracking-tight">ServisLoop</span>
          )}
        </Link>

        <OrgSwitcher
          organizations={organizations}
          activeId={activeOrgId}
          compact={collapsed}
          className="w-full"
        />
      </div>

      <nav
        aria-label="Product"
        className={cn('flex-1 overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}
      >
        <NavList items={items} pathname={pathname} collapsed={collapsed} />
      </nav>

      <div className={cn('border-t border-border-base p-2', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={collapsed}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink',
            collapsed ? 'justify-center' : 'w-full',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-4" />
          )}
          {collapsed ? (
            <span className="sr-only">Expand the sidebar</span>
          ) : (
            <span>Collapse</span>
          )}
        </button>
      </div>
    </aside>
  );
}

export interface NavListProps {
  items: readonly NavItem[];
  pathname: string;
  collapsed?: boolean;
  /** Called after a link is followed — the mobile sheet uses it to close itself. */
  onNavigate?: () => void;
}

/**
 * The link list, shared by the sidebar and the mobile sheet.
 *
 * The current page is marked with `aria-current="page"` as well as a colour change, so the
 * highlight is not carried by contrast alone.
 */
export function NavList({ items, pathname, collapsed = false, onNavigate }: NavListProps) {
  const list = (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActiveNav(pathname, item);

        const link = (
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              active
                ? 'bg-brand-600/10 text-brand-700'
                : 'text-ink-muted hover:bg-ink/5 hover:text-ink',
            )}
          >
            <NavIcon name={item.icon} className="size-4 shrink-0" />
            {collapsed ? <span className="sr-only">{item.label}</span> : <span>{item.label}</span>}
          </Link>
        );

        return (
          <li key={item.href}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                  <span className="font-medium">{item.label}</span>
                  <span className="block text-ink-muted">{item.hint}</span>
                </TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );

  // Tooltips are only reachable on a pointer device, so they exist only in the collapsed
  // rail — where the label they repeat is the one thing that has been taken away.
  return collapsed ? <TooltipProvider>{list}</TooltipProvider> : list;
}
