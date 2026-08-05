import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { env, isServiceRoleConfigured } from '@/lib/env';

/**
 * The service-role client. **It bypasses RLS entirely.**
 *
 * Because the tenancy boundary is gone, the caller becomes the boundary. Only these
 * surfaces may use it, and each is safe for a specific, stated reason:
 *
 * - the public QR page, booking submission and issue reporting — every query is scoped
 *   by an unguessable per-device `public_token` (32 random bytes), and the handler never
 *   accepts an `org_id` from the request;
 * - the reminder dispatch cron — a trusted job with no end user, authenticated by
 *   `CRON_SECRET`, which by design sweeps every tenant;
 * - member invitation, which has to reach `auth.admin` to create the user record.
 *
 * Anything else must go through `createServerSupabaseClient()` so that RLS applies.
 */

export class ServiceRoleNotConfiguredError extends Error {
  constructor() {
    super(
      'SUPABASE_SERVICE_ROLE_KEY is not set. It is required for inviting members, for the ' +
        'public QR, booking and issue endpoints, and for the reminder dispatch job.',
    );
    this.name = 'ServiceRoleNotConfiguredError';
  }
}

export type AdminSupabaseClient = SupabaseClient<Database>;

export function createAdminClient(): AdminSupabaseClient {
  const { supabaseUrl, supabaseServiceRoleKey } = env;

  // Loud and specific: a missing service-role key on a public endpoint would otherwise
  // surface as an RLS denial with no rows, which reads exactly like "device not found".
  if (!isServiceRoleConfigured() || !supabaseUrl || !supabaseServiceRoleKey) {
    throw new ServiceRoleNotConfiguredError();
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    // There is no user session on this client, and persisting one would risk a
    // service-role token leaking into a cookie or into local storage.
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/** Original name of {@link createAdminClient}, kept for existing call sites. */
export const createAdminSupabaseClient = createAdminClient;
