'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as Icons from 'lucide-react'
import { APP_NAV, SETTINGS_NAV, type NavItem } from '@/lib/app-nav'
import { can, type Role } from '@/domains/auth/permissions'
import { LogoMark } from '@/components/marketing/logo'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'

export interface SidebarCounts {
  bookings: number
  issues: number
  workOrders: number
  failedReminders: number
}

/**
 * Bočna navigacija.
 *
 * Sklapa se u uski traku s ikonama. Stanje se pamti u `localStorage` da
 * korisnik ne mora ponovo namještati pri svakoj prijavi.
 */
export function Sidebar({
  role,
  counts,
  organizationName,
  collapsed,
  onToggle,
}: {
  role: Role
  counts: SidebarCounts
  organizationName: string
  collapsed: boolean
  onToggle: () => void
}) {
  const pathname = usePathname()

  return (
    <aside
      data-app-sidebar
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface lg:flex',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center border-b border-line',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-4',
        )}
      >
        <Link
          href="/app/pregled"
          className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LogoMark className="size-8 shrink-0" />
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-sm leading-tight font-semibold text-fg">
                {organizationName}
              </span>
              <span className="block text-[0.6875rem] text-fg-subtle">ServisLoop</span>
            </span>
          ) : null}
        </Link>
      </div>

      <nav
        aria-label="Glavna navigacija aplikacije"
        className="flex-1 space-y-6 overflow-y-auto scroll-slim px-2 py-4"
      >
        {APP_NAV.map((group) => {
          const visible = group.items.filter((item) => can(role, item.permission))
          if (visible.length === 0) return null

          return (
            <div key={group.label ?? 'root'}>
              {group.label && !collapsed ? (
                <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-wide text-fg-subtle uppercase">
                  {group.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {visible.map((item) => (
                  <li key={item.href}>
                    <SidebarLink
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      count={item.badgeKey ? counts[item.badgeKey] : 0}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line px-2 py-3">
        {SETTINGS_NAV.filter((item) => can(role, item.permission))
          .slice(0, 1)
          .map((item) => (
            <SidebarLink
              key={item.href}
              item={{ ...item, href: '/app/postavke', label: 'Postavke', icon: 'Settings' }}
              pathname={pathname}
              collapsed={collapsed}
              count={0}
            />
          ))}

        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Proširi navigaciju' : 'Skupi navigaciju'}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
            'text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            collapsed && 'justify-center px-0',
          )}
        >
          <Icons.PanelLeftClose
            className={cn('size-4.5 shrink-0 transition-transform', collapsed && 'rotate-180')}
            aria-hidden="true"
          />
          {!collapsed ? <span>Skupi</span> : null}
        </button>
      </div>
    </aside>
  )
}

function SidebarLink({
  item,
  pathname,
  collapsed,
  count,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  count: number
}) {
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)

  // Ikone se biraju po imenu iz konfiguracije navigacije.
  const iconRecord = Icons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  >
  const Icon = iconRecord[item.icon] ?? Icons.Circle

  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active
          ? 'bg-primary-soft text-primary'
          : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className="size-4.5 shrink-0" aria-hidden={true} />
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {count > 0 ? (
            <span
              className={cn(
                'tabular shrink-0 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold',
                active ? 'bg-primary text-primary-fg' : 'bg-surface-muted text-fg-muted',
              )}
            >
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </>
      ) : count > 0 ? (
        <span className="absolute top-1.5 right-2 size-2 rounded-full bg-critical" />
      ) : null}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip content={count > 0 ? `${item.label} (${count})` : item.label} side="right">
        <span className="relative block">{link}</span>
      </Tooltip>
    )
  }

  return link
}
