'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as Icons from 'lucide-react'
import { Sidebar, type SidebarCounts } from './sidebar'
import { CommandMenu } from './command-menu'
import { NotificationCenter, type NotificationItem } from './notification-center'
import { UserMenu } from './user-menu'
import { APP_NAV, ROUTE_LABELS } from '@/lib/app-nav'
import { can, type Role } from '@/domains/auth/permissions'
import { LogoMark } from '@/components/marketing/logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

const SIDEBAR_STORAGE_KEY = 'servisloop:sidebar-collapsed'

export interface AppShellProps {
  role: Role
  organizationName: string
  userName: string
  userEmail: string
  isDemo: boolean
  counts: SidebarCounts
  notifications: NotificationItem[]
  banner: { tone: 'info' | 'warning' | 'critical'; text: string } | null
  children: React.ReactNode
}

export function AppShell({
  role,
  organizationName,
  userName,
  userEmail,
  isDemo,
  counts,
  notifications,
  banner,
  children,
}: AppShellProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  // Stanje bočne trake preživljava osvježavanje stranice.
  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1')
    } catch {
      // Privatni način rada blokira localStorage — nije razlog za grešku.
      setCollapsed(false)
    }
  }, [])

  const toggleSidebar = React.useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Bez pohrane stanje vrijedi samo za trenutnu sesiju.
      }
      return next
    })
  }, [])

  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Cmd/Ctrl + K otvara komandnu paletu.
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const crumbs = buildBreadcrumbs(pathname)

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar
        role={role}
        counts={counts}
        organizationName={organizationName}
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-app-nav
          className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md"
        >
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            {/* Mobilna navigacija */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon" aria-label="Otvori meni">
                  <Icons.Menu className="size-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
                  <LogoMark className="size-8" />
                  <SheetTitle className="text-sm">{organizationName}</SheetTitle>
                </div>
                <nav aria-label="Navigacija" className="space-y-5 p-3">
                  {APP_NAV.map((group) => {
                    const visible = group.items.filter((item) => can(role, item.permission))
                    if (visible.length === 0) return null
                    return (
                      <div key={group.label ?? 'root'}>
                        {group.label ? (
                          <p className="mb-1 px-3 text-[0.6875rem] font-semibold tracking-wide text-fg-subtle uppercase">
                            {group.label}
                          </p>
                        ) : null}
                        <ul>
                          {visible.map((item) => {
                            const iconRecord = Icons as unknown as Record<
                              string,
                              React.ComponentType<{ className?: string }>
                            >
                            const Icon = iconRecord[item.icon] ?? Icons.Circle
                            const active = item.exact
                              ? pathname === item.href
                              : pathname.startsWith(item.href)
                            return (
                              <li key={item.href}>
                                <Link
                                  href={item.href}
                                  className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                                    active
                                      ? 'bg-primary-soft text-primary'
                                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                                  )}
                                >
                                  <Icon className="size-4.5" />
                                  {item.label}
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            {/* Mrvice */}
            <nav aria-label="Putanja" className="hidden min-w-0 flex-1 sm:block">
              <ol className="flex items-center gap-1.5 text-sm">
                {crumbs.map((crumb, index) => (
                  <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 ? (
                      <Icons.ChevronRight
                        className="size-3.5 shrink-0 text-fg-subtle"
                        aria-hidden="true"
                      />
                    ) : null}
                    {index === crumbs.length - 1 ? (
                      <span aria-current="page" className="truncate font-medium text-fg">
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        href={crumb.href}
                        className="truncate text-fg-muted transition-colors hover:text-fg"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-line bg-surface-muted/60 px-3 py-2',
                  'text-sm text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                )}
              >
                <Icons.Search className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Pretraži…</span>
                <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[0.625rem] text-fg-subtle sm:inline">
                  ⌘K
                </kbd>
              </button>

              <NotificationCenter notifications={notifications} />
              <UserMenu name={userName} email={userEmail} role={role} />
            </div>
          </div>

          {isDemo ? (
            <div className="border-t border-service-400/25 bg-service-400/10 px-4 py-2 text-center text-xs text-service-700 sm:px-6">
              <strong className="font-semibold">Demo okruženje.</strong> Podaci su izmišljeni,
              podsjetnici se pripremaju ali se ne šalju stvarnim primaocima.
            </div>
          ) : null}
        </header>

        <main id="glavni-sadrzaj" className="flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {banner ? (
            <Alert
              tone={banner.tone === 'critical' ? 'danger' : banner.tone}
              className="mb-6"
              live={banner.tone === 'critical' ? 'assertive' : 'polite'}
            >
              {banner.text}
            </Alert>
          ) : null}
          {children}
        </main>
      </div>

      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} role={role} />
    </div>
  )
}

function buildBreadcrumbs(pathname: string): Array<{ href: string; label: string }> {
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: Array<{ href: string; label: string }> = []

  let href = ''
  for (const segment of segments) {
    href += `/${segment}`
    if (segment === 'app') {
      crumbs.push({ href: '/app/pregled', label: 'Pregled' })
      continue
    }
    // UUID segmente prikazujemo kao „Detalji“ — sirovi ID nikom ništa ne znači.
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment)
    crumbs.push({
      href,
      label: isId ? 'Detalji' : (ROUTE_LABELS[segment] ?? decodeURIComponent(segment)),
    })
  }

  // Prva stavka je uvijek „Pregled“; ako je ruta baš /app/pregled, nema duplog unosa.
  return crumbs.filter(
    (crumb, index, all) => index === 0 || crumb.href !== all[0]?.href,
  )
}
