'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/dialog'
import { Logo } from './logo'
import { MARKETING_NAV } from '@/lib/site'
import { cn } from '@/lib/utils'

/**
 * Ljepljiva navigacija marketing sajta.
 *
 * Nakon malo skrolanja postaje neprozirnija da tekst ispod nje ostane čitljiv.
 * Stanje se prati preko `scroll` osluškivača s `passive: true` — bez React
 * state ažuriranja na svaki piksel (samo na prelasku praga).
 */
export function SiteNav() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 12
      setScrolled((previous) => (previous === isScrolled ? previous : isScrolled))
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Zatvori mobilni meni kad se promijeni ruta.
  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-line bg-ink-950/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <nav
        aria-label="Glavna navigacija"
        className="container-marketing flex h-16 items-center justify-between gap-6 lg:h-18"
      >
        <Link
          href="/"
          className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-ink-950 focus-visible:outline-none"
        >
          <Logo />
        </Link>

        {/* Desktop navigacija */}
        <ul className="hidden items-center gap-1 lg:flex">
          {MARKETING_NAV.map((item) => {
            const active = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active ? 'text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/prijava">Prijava</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/demo">Pokreni demo</Link>
          </Button>
        </div>

        {/* Mobilna navigacija */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" aria-label="Otvori meni">
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col gap-0 p-0">
            <div className="border-b border-line px-6 py-5">
              <SheetTitle className="text-left">
                <Logo />
              </SheetTitle>
            </div>

            <ul className="flex flex-col gap-1 p-4">
              {MARKETING_NAV.map((item) => (
                <li key={item.href}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      aria-current={pathname === item.href ? 'page' : undefined}
                      className={cn(
                        'block rounded-lg px-3 py-3 text-[0.9375rem] font-medium transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        pathname === item.href
                          ? 'bg-surface-muted text-fg'
                          : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                      )}
                    >
                      {item.label}
                    </Link>
                  </SheetClose>
                </li>
              ))}
            </ul>

            <div className="mt-auto space-y-2 border-t border-line p-4">
              <SheetClose asChild>
                <Button asChild variant="secondary" block>
                  <Link href="/prijava">Prijava</Link>
                </Button>
              </SheetClose>
              <SheetClose asChild>
                <Button asChild block>
                  <Link href="/demo">Pokreni demo</Link>
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  )
}
