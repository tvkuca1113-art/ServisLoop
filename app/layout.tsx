import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'
import { publicEnv } from '@/lib/env'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: 'ServisLoop — Servis koji se vraća sam',
    template: '%s · ServisLoop',
  },
  description:
    'Automatski servisni podsjetnici, rezervacije i servisna historija za HVAC firme. ' +
    'ServisLoop pretvara instaliranu opremu u organizovan izvor ponovljenog prihoda.',
  applicationName: 'ServisLoop',
  keywords: [
    'servis klima uređaja',
    'servisni podsjetnici',
    'HVAC softver',
    'toplotne pumpe servis',
    'evidencija uređaja',
    'radni nalozi',
    'ServisLoop',
  ],
  authors: [{ name: 'ServisLoop' }],
  openGraph: {
    type: 'website',
    locale: 'bs_BA',
    siteName: 'ServisLoop',
    title: 'ServisLoop — Servis koji se vraća sam',
    description:
      'Svaki uređaj koji ste ugradili može vam ponovo donijeti prihod. ' +
      'Automatski podsjetnici, rezervacije bez naloga i kompletna servisna historija.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ServisLoop — Servis koji se vraća sam',
    description: 'Automatski servisni podsjetnici i rezervacije za HVAC firme.',
  },
  robots: {
    index: true,
    follow: true,
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f8fb' },
    { media: '(prefers-color-scheme: dark)', color: '#07111f' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="bs"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        {/* Preskakanje navigacije — prvi element u redoslijedu tabulatora. */}
        <a
          href="#glavni-sadrzaj"
          className="focus:bg-primary focus:text-primary-fg focus:shadow-float sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:rounded-lg focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold"
        >
          Preskoči na glavni sadržaj
        </a>

        <TooltipProvider delayDuration={200} skipDelayDuration={300}>
          {children}
        </TooltipProvider>

        <div data-toast-region>
          <Toaster />
        </div>
      </body>
    </html>
  )
}
