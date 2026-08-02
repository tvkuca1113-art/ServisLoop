import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'

/**
 * Marketing sajt koristi tamnu temu. Klasa `.dark` postavlja semantičke tokene
 * na navy paletu za cijelo podstablo — aplikacija ostaje svijetla.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark bg-canvas text-fg flex min-h-dvh flex-col">
      <SiteNav />
      <main id="glavni-sadrzaj" className="flex-1 pt-16 lg:pt-18">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
