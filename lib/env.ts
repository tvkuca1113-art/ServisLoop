/**
 * Environment access.
 *
 * Read through these helpers rather than touching `process.env` directly, so that
 * "is Supabase configured?" has exactly one answer everywhere in the codebase.
 *
 * Nothing here throws at module scope. A missing variable must not break `next build`
 * — the app is designed to run fully offline against the JSON repository.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

export const env = {
  appUrl: read('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000',
  supabaseUrl: read('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: read('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),
  cronSecret: read('CRON_SECRET'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;

/**
 * True when both public Supabase variables are present.
 *
 * This single predicate decides which repository adapter is live. When it is false the
 * app runs against `.data/store.json` with the demo organisation, which is what makes a
 * clean checkout browsable with no external services.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/** Service-role operations (public QR pages, reminder dispatch) need the secret key too. */
export function isServiceRoleConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(env.supabaseServiceRoleKey);
}

/** Absolute URL for a path, used for QR targets and links inside reminder emails. */
export function absoluteUrl(path: string): string {
  const base = env.appUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** The URL encoded into a device's QR code. */
export function devicePublicUrl(publicToken: string): string {
  return absoluteUrl(`/d/${publicToken}`);
}
