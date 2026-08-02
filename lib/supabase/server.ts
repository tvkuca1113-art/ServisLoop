import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'
import { publicEnv } from '@/lib/env'

/**
 * Supabase klijent za serverske komponente i serverske akcije.
 *
 * Radi u ime PRIJAVLJENOG korisnika: sesija se čita iz kolačića, a svaki upit
 * prolazi kroz RLS. To je ono što želimo za sve podatke koji pripadaju
 * organizaciji — čak i da negdje u kodu zaboravimo filtrirati po
 * `organization_id`, baza neće vratiti tuđe redove.
 *
 * Za cron poslove, javne QR rute i administraciju koristi se
 * `lib/supabase/service.ts`, uz vlastitu provjeru ovlaštenja.
 */
export async function createServerSupabase() {
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase nije konfigurisan. Provjerite NEXT_PUBLIC_SUPABASE_URL i ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY u .env.local (uzor: .env.example).',
    )
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Serverske komponente ne smiju pisati kolačiće. Osvježavanje
            // sesije tada obavlja `middleware.ts`, pa je ovo očekivano
            // stanje, a ne greška koju treba prijaviti.
          }
        },
      },
    },
  )
}
