import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Proxy (u ranijim verzijama Next.js-a zvao se "middleware") ima dvije uloge:
 *
 *   1. Osvježava Supabase sesiju i upisuje obnovljene kolačiće. Serverske
 *      komponente ne smiju pisati kolačiće, pa bi bez ovoga korisnik bio
 *      odjavljen čim istekne pristupni token.
 *
 *   2. Sprječava da neprijavljeni korisnik uopšte dođe do `/app/*`.
 *      To je UDOBNOST, a ne sigurnost — prava zaštita su provjere na serveru
 *      (`requireOrgContext`) i RLS u bazi. Proxy samo štedi korisniku
 *      prazan ekran i preusmjerava ga na prijavu.
 */

const PROTECTED_PREFIX = '/app'
const AUTH_ROUTES = ['/prijava', '/registracija', '/zaboravljena-lozinka']

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Bez konfiguracije puštamo zahtjev dalje — stranica će sama prikazati
  // jasnu poruku o nedostajućim varijablama umjesto da ovdje pukne.
  if (!supabaseUrl || !supabaseKey) return response

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Obavezno `getUser()`, ne `getSession()` — samo prvi provjerava token.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  if (!user && pathname.startsWith(PROTECTED_PREFIX)) {
    const loginUrl = new URL('/prijava', request.url)
    loginUrl.searchParams.set('nastavi', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  // Prijavljen korisnik nema šta tražiti na stranici za prijavu.
  if (user && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL('/app/pregled', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Sve rute osim statičkih datoteka i slika.
     *
     * `/api/cron/*` je namjerno izuzet: te rute se štite `CRON_SECRET`
     * zaglavljem, nemaju korisničku sesiju, i nepotrebno osvježavanje
     * sesije bi im samo dodalo latenciju.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
