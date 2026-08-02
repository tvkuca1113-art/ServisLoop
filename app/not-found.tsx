import Link from 'next/link'
import { ArrowLeft, Home, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/marketing/logo'

export const metadata = {
  title: 'Stranica nije pronađena',
  robots: { index: false, follow: false },
}

export default function NotFound() {
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
          <p className="text-primary font-mono text-sm tracking-widest">GREŠKA 404</p>
          <h1 className="text-display-md text-fg sm:text-display-lg mt-4">
            Ova stranica ne postoji
          </h1>
          <p className="text-fg-muted mt-4 text-base leading-relaxed">
            Link je možda zastario, pogrešno prepisan ili je stranica premještena. Ako ste došli
            skeniranjem QR koda s uređaja, moguće je da je kod poništen — javite se servisnoj firmi.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/">
                <Home className="size-4" aria-hidden="true" />
                Na početnu
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/app/pregled">
                <ArrowLeft className="size-4" aria-hidden="true" />U aplikaciju
              </Link>
            </Button>
          </div>

          <div className="border-line mt-12 border-t pt-6">
            <p className="text-fg-muted flex items-center gap-2 text-sm">
              <Search className="text-fg-subtle size-4 shrink-0" aria-hidden="true" />
              Tražite nešto konkretno?{' '}
              <Link href="/kontakt" className="text-primary underline underline-offset-4">
                Javite nam se
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
