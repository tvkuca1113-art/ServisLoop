import Link from 'next/link'
import { Logo } from '@/components/marketing/logo'
import { SITE } from '@/lib/site'

/**
 * Okvir stranica za prijavu i registraciju.
 *
 * Lijeva strana nosi poruku proizvoda (zašto bih ovo koristio), desna obrazac.
 * Na mobitelu ostaje samo obrazac — u tom trenutku korisnik je već odlučio.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-dvh bg-canvas text-fg lg:grid lg:grid-cols-2">
      {/* Poruka proizvoda */}
      <div className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(48rem 32rem at 20% 0%, rgba(24,199,181,0.14), transparent 62%),' +
              'radial-gradient(36rem 24rem at 90% 90%, rgba(94,139,255,0.12), transparent 60%)',
          }}
        />
        <div className="grid-backdrop radial-fade pointer-events-none absolute inset-0 opacity-60" />

        <Link href="/" className="relative rounded-lg focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-display-sm text-fg">{SITE.heroHeadline}</h2>
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">{SITE.heroSubheadline}</p>

          <ul className="mt-8 space-y-3">
            {[
              'Automatski podsjetnici 30, 14 i 3 dana prije roka',
              'Kupac rezerviše sam, bez naloga i poziva',
              'PDF izvještaj i novi rok nakon svakog servisa',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-fg-muted">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-fg-subtle">
          © {new Date().getFullYear()} ServisLoop · {SITE.tagline}
        </p>
      </div>

      {/* Obrazac */}
      <div className="flex min-h-dvh flex-col justify-center px-5 py-12 sm:px-8 lg:min-h-0 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link
            href="/"
            className="mb-10 inline-block rounded-lg focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Logo />
          </Link>
          {children}
        </div>
      </div>
    </div>
  )
}
