import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getServerEnv } from '@/lib/env'

/**
 * Zaštita rasporednih (cron) ruta.
 *
 * Vercel Cron šalje `Authorization: Bearer <CRON_SECRET>`. Bez ove provjere
 * bilo ko s internetom mogao bi pokrenuti slanje podsjetnika svim kupcima.
 *
 * Poređenje ide preko heševa iste dužine i `timingSafeEqual` da vrijeme
 * odgovora ne oda koliko se znakova poklapa.
 */

export type CronAuthResult = { ok: true } | { ok: false; status: 401 | 500; message: string }

export function verifyCronRequest(request: NextRequest): CronAuthResult {
  let secret: string
  try {
    secret = getServerEnv().CRON_SECRET
  } catch {
    return {
      ok: false,
      status: 500,
      message: 'CRON_SECRET nije postavljen. Rasporedni poslovi su onemogućeni.',
    }
  }

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!provided) {
    return { ok: false, status: 401, message: 'Nedostaje autorizacija.' }
  }

  // Heširanje izjednačava dužine, pa `timingSafeEqual` ne baca grešku i
  // ne otkriva dužinu tajne.
  const providedHash = createHash('sha256').update(provided).digest()
  const expectedHash = createHash('sha256').update(secret).digest()

  if (!timingSafeEqual(providedHash, expectedHash)) {
    return { ok: false, status: 401, message: 'Neispravna autorizacija.' }
  }

  return { ok: true }
}

/**
 * Ista provjera, ali dopušta i ručno pokretanje iz aplikacije od strane
 * vlasnika. Koristi se za dugme „Pokreni sada“ na stranici podsjetnika.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  return verifyCronRequest(request).ok
}
