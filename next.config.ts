import type { NextConfig } from 'next'

/**
 * Sigurnosna zaglavlja se primjenjuju na svaki odgovor.
 *
 * CSP je namjerno pisan bez `unsafe-eval` u produkciji. `unsafe-inline` za
 * stilove je nužan jer Next.js i Framer Motion ubacuju inline stilove.
 * Za skripte koristimo `strict-dynamic` u produkciji uz nonce koji dodaje
 * `middleware.ts`.
 */
const isDev = process.env.NODE_ENV === 'development'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `exceljs`, `pdf-lib` i `qrcode` rade samo u Node runtime-u.
  serverExternalPackages: ['exceljs', 'pdf-lib', '@pdf-lib/fontkit', 'qrcode'],

  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', '@react-three/drei'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Supabase Storage javni bucket (logotipi organizacija).
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? [
            {
              protocol: 'https' as const,
              hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : []),
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Izvještaji i javne stranice uređaja ne smiju biti indeksirani.
        source: '/izvjestaj/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/u/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/rezervacija/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/app/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },

  // U developmentu dopuštamo `unsafe-eval` zbog React Refresh-a.
  env: {
    NEXT_PUBLIC_CSP_DEV: isDev ? '1' : '0',
  },
}

export default nextConfig
