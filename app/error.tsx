'use client'

import * as React from 'react'
import Link from 'next/link'
import { Home, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/marketing/logo'

/**
 * Stranica za neočekivanu grešku.
 *
 * Korisniku NIKAD ne prikazujemo poruku iz baze ni stack trace — to zbunjuje
 * i može odati podatke o strukturi sistema. Umjesto toga prikazujemo šta se
 * desilo, šta može uraditi i identifikator koji može poslati podršci.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Detalj ide u serverski log, ne na ekran.
    console.error('[greška]', error.digest ?? error.message)
  }, [error])

  return (
    <div className="dark bg-canvas text-fg flex min-h-dvh flex-col">
      <div className="container-marketing flex flex-1 flex-col justify-center py-16">
        <Link
          href="/"
          className="focus-visible:ring-ring mb-16 inline-block w-fit rounded-lg focus-visible:ring-2"
        >
          <Logo />
        </Link>

        <div className="max-w-lg">
          <p className="text-critical font-mono text-sm tracking-widest">NEOČEKIVANA GREŠKA</p>
          <h1 className="text-display-md text-fg sm:text-display-lg mt-4">Nešto je pošlo po zlu</h1>
          <p className="text-fg-muted mt-4 text-base leading-relaxed">
            Greška je zabilježena. Vaši podaci nisu izgubljeni. Pokušajte ponovo — ako se problem
            ponovi, javite nam se i navedite oznaku ispod.
          </p>

          {error.digest ? (
            <p className="border-line bg-surface/50 text-fg-muted mt-6 rounded-lg border px-4 py-3 font-mono text-xs">
              Oznaka greške: {error.digest}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={reset}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Pokušaj ponovo
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/">
                <Home className="size-4" aria-hidden="true" />
                Na početnu
              </Link>
            </Button>
          </div>

          <p className="border-line text-fg-muted mt-12 border-t pt-6 text-sm">
            Ako se greška ponavlja, provjerite{' '}
            <Link href="/api/health" className="text-primary underline underline-offset-4">
              stanje sistema
            </Link>{' '}
            ili nam pišite na{' '}
            <a
              href="mailto:podrska@servisloop.ba"
              className="text-primary underline underline-offset-4"
            >
              podrska@servisloop.ba
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
