import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import type { Database } from '@/lib/database.types';
import { env, isSupabaseConfigured } from '@/lib/env';

/**
 * The request-scoped Supabase client.
 *
 * Every query made on behalf of a signed-in user goes through this client, so the request
 * carries that user's JWT and Postgres RLS — not application code — decides which rows
 * are visible.
 *
 * `@/server/auth/context` and `SupabaseRepository` both import this module lazily, so
 * nothing here runs (and no credentials are needed) in offline mode or during
 * `next build`. Constructing the client is cheap and stateless; the session lives
 * entirely in cookies, which is why every caller gets a fresh instance rather than a
 * memoised one — a client captured across requests would answer the next user's query
 * with the previous user's token.
 */

/** Typed against the hand-written schema, so every table and column is checked. */
export type ServerSupabaseClient = SupabaseClient<Database>;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, ' +
        'or leave them blank to run against the local file store.',
    );
    this.name = 'SupabaseNotConfiguredError';
  }
}

/**
 * A client bound to the current request's cookies.
 *
 * Works in Server Components, server actions and route handlers.
 */
export async function createServerSupabaseClient(): Promise<ServerSupabaseClient> {
  // Narrowed rather than asserted, so the misconfiguration case produces the message
  // above instead of an opaque fetch failure inside supabase-js.
  const { supabaseUrl, supabaseAnonKey } = env;
  if (!isSupabaseConfigured() || !supabaseUrl || !supabaseAnonKey) {
    throw new SupabaseNotConfiguredError();
  }

  // Async since Next 15. The call also binds this client to the current request, which
  // is the reason it cannot be hoisted to module scope.
  const store = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return store.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Thrown when this client was created from a Server Component, whose cookie
          // jar is read-only. Safe to swallow: `middleware.ts` calls `updateSession()`
          // on every matched request and refreshes the session there, where the
          // response is still writable. Rethrowing would turn a routine token rotation
          // into a rendering error.
        }
      },
    },
  });
}
