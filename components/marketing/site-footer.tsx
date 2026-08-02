import Link from 'next/link'
import { Mail, MapPin, Phone } from 'lucide-react'
import { Logo } from './logo'
import { FOOTER_NAV, SITE } from '@/lib/site'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="hairline-top border-line bg-ink-950">
      <div className="container-marketing py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-8">
          <div className="space-y-5">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-fg-muted">{SITE.positioning}</p>

            <ul className="space-y-2.5 text-sm text-fg-muted">
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <a
                  href={`mailto:${SITE.supportEmail}`}
                  className="transition-colors hover:text-fg"
                >
                  {SITE.supportEmail}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <span>{SITE.phone}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <MapPin className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <span>{SITE.address}</span>
              </li>
            </ul>
          </div>

          {FOOTER_NAV.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded text-sm text-fg-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-subtle">
            © {year} {SITE.name}. Sva prava zadržana.
          </p>
          <p className="max-w-lg text-xs leading-relaxed text-fg-subtle">
            ServisLoop je alat za organizaciju servisa. Ne zamjenjuje stručnu procjenu
            ovlaštenog servisera niti obaveze propisane zakonom.
          </p>
        </div>
      </div>
    </footer>
  )
}
