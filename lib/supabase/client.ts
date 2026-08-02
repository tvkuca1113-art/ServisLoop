'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'
import { publicEnv } from '@/lib/env'

/**
 * Supabase klijent za preglednik.
 *
 * Koristi ISKLJUČIVO javni (`anon`) ključ. Taj ključ sam po sebi ne daje
 * pristup ničemu — svaki upit prolazi kroz RLS politike, pa korisnik vidi
 * samo podatke organizacija čiji je aktivan član.
 *
 * `service_role` ključ nikad, ni pod kojim uslovima, ne ulazi u ovaj fajl
 * niti u bilo koji drugi modul koji završi u klijentskom paketu.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (browserClient) return browserClient

  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase nije konfigurisan. Provjerite NEXT_PUBLIC_SUPABASE_URL i ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY u .env.local (uzor: .env.example).',
    )
  }

  browserClient = createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  return browserClient
}
