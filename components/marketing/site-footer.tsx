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
            <p className="text-fg-muted max-w-xs text-sm leading-relaxed">{SITE.positioning}</p>

            <ul className="text-fg-muted space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5">
                <Mail className="text-fg-subtle size-4 shrink-0" aria-hidden="true" />
                <a href={`mailto:${SITE.supportEmail}`} className="hover:text-fg transition-colors">
                  {SITE.supportEmail}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="text-fg-subtle size-4 shrink-0" aria-hidden="true" />
                <span>{SITE.phone}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <MapPin className="text-fg-subtle size-4 shrink-0" aria-hidden="true" />
                <span>{SITE.address}</span>
              </li>
            </ul>
          </div>

          {FOOTER_NAV.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-fg-muted hover:text-fg focus-visible:ring-ring rounded text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-line mt-12 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-fg-subtle text-xs">
            © {year} {SITE.name}. Sva prava zadržana.
          </p>
          <p className="text-fg-subtle max-w-lg text-xs leading-relaxed">
            ServisLoop je alat za organizaciju servisa. Ne zamjenjuje stručnu procjenu ovlaštenog
            servisera niti obaveze propisane zakonom.
          </p>
        </div>
      </div>
    </footer>
  )
}
