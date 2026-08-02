'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import * as Icons from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { can, type Role } from '@/domains/auth/permissions'
import { Spinner } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/**
 * Komandna paleta (⌘K / Ctrl+K).
 *
 * Pretraga ide na server (`/api/pretraga`) koji rezultate ograničava na
 * organizaciju prijavljenog korisnika. Klijent nikad ne šalje `organization_id`
 * niti bi mu to pomoglo — server ga uzima iz sesije.
 */

export interface SearchResult {
  id: string
  type: 'customer' | 'device' | 'location' | 'booking' | 'work_order'
  title: string
  subtitle: string | null
  href: string
}

const TYPE_META: Record<SearchResult['type'], { label: string; icon: keyof typeof Icons }> = {
  customer: { label: 'Kupci', icon: 'Users' },
  device: { label: 'Uređaji', icon: 'Wrench' },
  location: { label: 'Lokacije', icon: 'MapPin' },
  booking: { label: 'Rezervacije', icon: 'CalendarCheck' },
  work_order: { label: 'Radni nalozi', icon: 'ClipboardList' },
}

interface QuickAction {
  label: string
  href: string
  icon: keyof typeof Icons
  permission: Parameters<typeof can>[1]
  shortcut?: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Novi kupac', href: '/app/kupci/novi', icon: 'UserPlus', permission: 'customers.manage' },
  { label: 'Novi uređaj', href: '/app/uredaji/novi', icon: 'PackagePlus', permission: 'devices.manage' },
  {
    label: 'Nova rezervacija',
    href: '/app/rezervacije/nova',
    icon: 'CalendarPlus',
    permission: 'bookings.manage',
  },
  {
    label: 'Novi radni nalog',
    href: '/app/radni-nalozi/novi',
    icon: 'ClipboardPlus',
    permission: 'work_orders.create',
  },
  { label: 'Uvoz iz Excela ili CSV-a', href: '/app/uvoz', icon: 'Upload', permission: 'import.run' },
  {
    label: 'Štampa QR naljepnica',
    href: '/app/uredaji?akcija=qr',
    icon: 'QrCode',
    permission: 'qr.generate',
  },
  {
    label: 'Podsjetnici i njihovi statusi',
    href: '/app/podsjetnici',
    icon: 'BellRing',
    permission: 'reminders.view',
  },
]

export function CommandMenu({
  open,
  onOpenChange,
  role,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: Role
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)

  const actions = QUICK_ACTIONS.filter((action) => can(role, action.permission))

  // Pretraga s odgodom — ne gađamo server na svaki pritisak tipke.
  React.useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/pretraga?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { results: [] }))
        .then((data: { results?: SearchResult[] }) => setResults(data.results ?? []))
        .catch((error: unknown) => {
          // Prekid zbog nove pretrage nije greška.
          if (error instanceof DOMException && error.name === 'AbortError') return
          setResults([])
        })
        .finally(() => setLoading(false))
    }, 220)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  const grouped = groupResults(results)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" hideClose className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Pretraga i brze radnje</DialogTitle>

        <Command shouldFilter={false} loop className="w-full">
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Icons.Search className="size-4.5 shrink-0 text-fg-subtle" aria-hidden="true" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Traži kupca, uređaj, serijski broj, nalog…"
              className="h-14 flex-1 bg-transparent text-[0.9375rem] text-fg outline-none placeholder:text-fg-subtle"
            />
            {loading ? <Spinner size="sm" label="Pretraga u toku" /> : null}
          </div>

          <Command.List className="max-h-96 overflow-y-auto scroll-slim p-2">
            {query.trim().length >= 2 && !loading && results.length === 0 ? (
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-muted">
                Nema rezultata za „{query.trim()}“.
              </Command.Empty>
            ) : null}

            {query.trim().length < 2 ? (
              <Command.Group
                heading="Brze radnje"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:uppercase"
              >
                {actions.map((action) => {
                  const iconRecord = Icons as unknown as Record<
                    string,
                    React.ComponentType<{ className?: string }>
                  >
                  const Icon = iconRecord[action.icon] ?? Icons.Circle
                  return (
                    <Command.Item
                      key={action.href}
                      value={action.label}
                      onSelect={() => go(action.href)}
                      className={itemClass}
                    >
                      <Icon className="size-4 shrink-0 text-fg-subtle" />
                      <span className="flex-1">{action.label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ) : null}

            {grouped.map(([type, items]) => {
              const meta = TYPE_META[type]
              const iconRecord = Icons as unknown as Record<
                string,
                React.ComponentType<{ className?: string }>
              >
              const Icon = iconRecord[meta.icon] ?? Icons.Circle

              return (
                <Command.Group
                  key={type}
                  heading={meta.label}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:uppercase"
                >
                  {items.map((result) => (
                    <Command.Item
                      key={`${result.type}-${result.id}`}
                      value={`${result.title} ${result.subtitle ?? ''} ${result.id}`}
                      onSelect={() => go(result.href)}
                      className={itemClass}
                    >
                      <Icon className="size-4 shrink-0 text-fg-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fg">{result.title}</span>
                        {result.subtitle ? (
                          <span className="block truncate text-xs text-fg-muted">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <Icons.ArrowRight className="size-3.5 shrink-0 text-fg-subtle" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )
            })}
          </Command.List>

          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[0.6875rem] text-fg-subtle">
            <span>
              <kbd className="rounded border border-line px-1 py-0.5 font-mono">↑↓</kbd> kretanje ·{' '}
              <kbd className="rounded border border-line px-1 py-0.5 font-mono">↵</kbd> otvori
            </span>
            <span>
              <kbd className="rounded border border-line px-1 py-0.5 font-mono">esc</kbd> zatvori
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

const itemClass = cn(
  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-fg-muted',
  'outline-none select-none',
  'data-[selected=true]:bg-surface-muted data-[selected=true]:text-fg',
)

function groupResults(results: SearchResult[]): Array<[SearchResult['type'], SearchResult[]]> {
  const order: SearchResult['type'][] = ['customer', 'device', 'location', 'booking', 'work_order']
  const map = new Map<SearchResult['type'], SearchResult[]>()

  for (const result of results) {
    const bucket = map.get(result.type)
    if (bucket) bucket.push(result)
    else map.set(result.type, [result])
  }

  return order
    .filter((type) => map.has(type))
    .map((type) => [type, map.get(type) ?? []] as [SearchResult['type'], SearchResult[]])
}
