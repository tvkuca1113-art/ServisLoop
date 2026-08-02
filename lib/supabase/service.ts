import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { getServerEnv, publicEnv } from '@/lib/env'

/**
 * Supabase klijent sa `service_role` ključem.
 *
 * ★ OVAJ KLIJENT ZAOBILAZI SVE RLS POLITIKE. ★
 *
 * Smije se koristiti samo tamo gdje prijavljenog korisnika nema, a pristup je
 * ipak legitiman:
 *
 *   • cron poslovi (podsjetnici, čišćenje) — nema korisnika;
 *   • javne stranice uređaja `/u/[token]` — kupac nema nalog, pristup se
 *     dokazuje tokenom koji ruta sama provjerava;
 *   • javne forme (prijava kvara, rezervacija) — isto;
 *   • administratorska operativna stranica — uz provjeru popisa e-adresa;
 *   • migracije i seed skripte.
 *
 * PRAVILO: svaka ruta koja koristi ovaj klijent MORA sama dokazati ovlaštenje
 * prije prvog upita. Ako to ne radi, curenje podataka je pitanje vremena.
 * Zato svaka upotreba u kodu ima komentar koji objašnjava provjeru.
 */

let serviceClient: ReturnType<typeof createClient<Database>> | null = null

export function createServiceSupabase() {
  if (serviceClient) return serviceClient

  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv()

  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Nedostaje NEXT_PUBLIC_SUPABASE_URL — vidi .env.example')
  }

  serviceClient = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // Servisni klijent nema sesiju i ne smije je pokušavati čuvati.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { 'X-Client-Info': 'servisloop-service' },
      },
    },
  )

  return serviceClient
}

/** Samo za testove — briše keširanog klijenta. */
export function resetServiceClient(): void {
  serviceClient = null
}
