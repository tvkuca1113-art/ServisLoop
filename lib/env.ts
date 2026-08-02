import { z } from 'zod'

/**
 * Provjera konfiguracije okruženja.
 *
 * Cilj: ako nešto nedostaje ili je pogrešno, aplikacija to kaže odmah i jasno,
 * umjesto da pukne kasnije s nerazumljivom greškom usred slanja podsjetnika.
 *
 * Dva odvojena skupa:
 *   `publicEnv` — vrijednosti koje smiju u preglednik (NEXT_PUBLIC_*).
 *   `serverEnv` — tajne. Čitaju se lijeno i SAMO na serveru.
 *
 * Vrijednosti NEXT_PUBLIC_* moraju se pisati doslovno (`process.env.NEXT_PUBLIC_X`)
 * jer ih Next.js zamjenjuje u build koraku — dinamički pristup ne bi radio.
 */

// ---------------------------------------------------------------------------
// Javne varijable
// ---------------------------------------------------------------------------

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .min(1, 'NEXT_PUBLIC_APP_URL je obavezan (npr. http://localhost:3000)')
    .refine((v) => /^https?:\/\//.test(v), 'NEXT_PUBLIC_APP_URL mora počinjati sa http:// ili https://')
    .transform((v) => v.replace(/\/+$/, '')),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_URL je obavezan'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY je obavezan'),
  NEXT_PUBLIC_DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  NEXT_PUBLIC_ANALYTICS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== '0' && v !== 'false'),
})

export type PublicEnv = z.infer<typeof publicSchema>

const rawPublic = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_ANALYTICS_ENABLED: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,
}

/**
 * Tokom `next build` stranice se prerenderuju, a Supabase varijable tada
 * ne moraju biti postavljene (npr. build u CI-u bez tajni). Zato javne
 * varijable ne obaraju build — nedostatak se prijavljuje na `/api/health`
 * i u aplikaciji kao jasna poruka.
 */
function parsePublic(): PublicEnv {
  const parsed = publicSchema.safeParse(rawPublic)
  if (parsed.success) return parsed.data
  return {
    NEXT_PUBLIC_APP_URL: (rawPublic.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    ),
    NEXT_PUBLIC_SUPABASE_URL: rawPublic.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: rawPublic.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_DEMO_MODE: rawPublic.NEXT_PUBLIC_DEMO_MODE === '1',
    NEXT_PUBLIC_ANALYTICS_ENABLED: rawPublic.NEXT_PUBLIC_ANALYTICS_ENABLED !== '0',
  }
}

export const publicEnv: PublicEnv = parsePublic()

/** Jesu li javne Supabase varijable postavljene? Koristi se za jasne poruke u UI-u. */
export function isSupabaseConfigured(): boolean {
  return (
    publicEnv.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0
  )
}

// ---------------------------------------------------------------------------
// Serverske varijable
// ---------------------------------------------------------------------------

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY je obavezan na serveru'),
  DATABASE_URL: z.string().optional().default(''),

  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().min(1).optional().default('ServisLoop <servis@servisloop.ba>'),
  EMAIL_REPLY_TO: z.string().optional().default(''),
  EMAIL_DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),

  CRON_SECRET: z
    .string()
    .min(16, 'CRON_SECRET mora imati najmanje 16 znakova — generiši sa: openssl rand -base64 32'),

  PUBLIC_TOKEN_SECRET: z
    .string()
    .min(
      16,
      'PUBLIC_TOKEN_SECRET mora imati najmanje 16 znakova — generiši sa: openssl rand -base64 48',
    ),

  REPORT_NUMBER_PREFIX: z.string().optional().default('SL'),
  REPORT_LINK_TTL_DAYS: z.coerce.number().int().min(0).optional().default(365),

  SUPER_ADMIN_EMAILS: z.string().optional().default(''),

  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().optional().default('claude-haiku-4-5-20251001'),
})

export type ServerEnv = z.infer<typeof serverSchema> & {
  /** Lista super-admin adresa, normalizovana u mala slova. */
  superAdminEmails: string[]
  /** Da li stvarno šaljemo e-poštu ili radimo u pregled načinu. */
  emailEnabled: boolean
}

let cachedServerEnv: ServerEnv | null = null

export class EnvironmentError extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(
      `Nedostaje ili je neispravna konfiguracija okruženja:\n` +
        issues.map((i) => `  • ${i}`).join('\n') +
        `\n\nProvjeri .env.local (uzor: .env.example).`,
    )
    this.name = 'EnvironmentError'
    this.issues = issues
  }
}

/**
 * Vraća provjerene serverske varijable. Baca `EnvironmentError` s popisom
 * konkretnih problema. Poziva se lijeno da build ne pukne kad tajne nisu
 * dostupne (npr. pri statičkoj analizi).
 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv

  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() je pozvan u pregledniku. Serverske tajne nikad ne idu klijentu.')
  }

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new EnvironmentError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    )
  }

  const data = parsed.data
  cachedServerEnv = {
    ...data,
    superAdminEmails: data.SUPER_ADMIN_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    emailEnabled: data.RESEND_API_KEY.length > 0 && !data.EMAIL_DRY_RUN,
  }
  return cachedServerEnv
}

/**
 * Provjera bez bacanja greške — koristi se na `/api/health` i u admin panelu
 * da se vidi šta tačno nedostaje, bez rušenja aplikacije.
 */
export function checkServerEnv(): { ok: boolean; issues: string[] } {
  try {
    getServerEnv()
    return { ok: true, issues: [] }
  } catch (error) {
    if (error instanceof EnvironmentError) return { ok: false, issues: error.issues }
    return { ok: false, issues: [error instanceof Error ? error.message : 'Nepoznata greška'] }
  }
}

/** Samo za testove — briše keš da se varijable mogu promijeniti između slučajeva. */
export function resetServerEnvCache(): void {
  cachedServerEnv = null
}
