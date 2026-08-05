import 'server-only';

import { civilDateFromUTC } from '@/domain/dates';
import { isSupabaseConfigured } from '@/lib/env';
import { newPublicToken } from '@/lib/ids';

import { DEFAULT_STORE_PATH, JsonRepository } from './json-repository';
import type { Repository } from './repository';
import { createDemoStore } from './seed';
import { SupabaseRepository } from './supabase-repository';

/**
 * Adapter selection — the one place that decides which repository is live.
 *
 * Supabase configured  → `SupabaseRepository`, tenant isolation enforced by Postgres RLS.
 * Nothing configured   → `JsonRepository` seeded with the demo organisation, so a clean
 *                        checkout is fully browsable with no external services.
 *
 * Nothing above this module knows or cares which one it got.
 */

let cached: Repository | null = null;

function createJsonRepository(): Repository {
  return new JsonRepository({
    filePath: DEFAULT_STORE_PATH,
    seed: () => createDemoStore(civilDateFromUTC(new Date()), () => newPublicToken()),
  });
}

/**
 * The active repository.
 *
 * Lazily constructed and memoised per server process. Deliberately *not* built at module
 * scope: `next build` imports these modules to collect metadata, and constructing a
 * client (or touching the filesystem) at import time would make the build depend on
 * runtime configuration.
 */
export function getRepository(): Repository {
  if (cached) return cached;

  // The Supabase module is imported statically, but its client is constructed inside the
  // constructor rather than at module scope — so importing it costs nothing in offline
  // mode and `next build` never needs credentials.
  cached = isSupabaseConfigured() ? new SupabaseRepository() : createJsonRepository();

  return cached;
}

/** True when the app is running against the local file store rather than Supabase. */
export function isOfflineMode(): boolean {
  return !isSupabaseConfigured();
}

/** Test hook — swap in a repository and clear it again afterwards. */
export function __setRepositoryForTests(repo: Repository | null): void {
  cached = repo;
}

export * from './repository';
export { JsonRepository, DEFAULT_STORE_PATH } from './json-repository';
export { createDemoStore, DEMO, describeDemo } from './seed';
