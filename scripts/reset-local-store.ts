import { existsSync, rmSync } from 'node:fs';
import nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Rebuild the offline demo store.
 *
 * ```
 * npm run db:reset
 * ```
 *
 * Deletes `.data/store.json` and writes it again from `createDemoStore`, so a demo that has
 * been clicked into an odd state — jobs completed, devices retired, reminders sent — goes
 * back to a known one in a second. Offsets in the fixture are measured from *today*, so the
 * rebuilt demo is always interesting: a few devices overdue, a few due soon, most healthy.
 *
 * ## Why this file looks unusual
 *
 * It runs under plain Node (`node --experimental-strip-types`), not under Next, and that
 * costs two things the rest of the codebase takes for granted:
 *
 * 1. **No `@/…` path aliases.** Those are a TypeScript/bundler convention; Node has never
 *    heard of them. The modules being loaded use them internally, so a resolve hook
 *    translates `@/x` to `<repo>/src/x` and adds the `.ts` extension Node's ESM resolver
 *    insists on. That is the whole of the hook — it does no transformation.
 * 2. **No `server-only`.** That package throws unless a React Server Components bundler
 *    picked its "server" export condition, so anything importing it is unusable here. The
 *    obvious entry point, `src/server/data/index.ts`, does import it (and would drag in the
 *    Supabase client besides), so this script imports the two leaf modules directly:
 *    `seed.ts` and `json-repository.ts`, neither of which is guarded.
 *
 * Exits non-zero on any failure, so `npm run db:reset` fails loudly in a script or a CI job
 * instead of leaving a half-written store behind.
 */

const SRC_ROOT = new URL('../src/', import.meta.url);
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * Translate a project specifier into a file URL Node can load.
 *
 * Handles the two forms the source tree uses: `@/domain/dates` (alias, relative to `src`)
 * and `./json-repository` (relative, extensionless). Returns `undefined` for anything else
 * so the default resolver keeps ownership of bare package specifiers.
 */
function resolveProjectSpecifier(
  specifier: string,
  parentURL: string | undefined,
): string | undefined {
  let base: URL;

  if (specifier.startsWith('@/')) {
    base = new URL(specifier.slice(2), SRC_ROOT);
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    // Only rewrite relative specifiers that come from our own TypeScript sources; a
    // relative import inside a dependency must be resolved by Node, untouched.
    if (!parentURL?.startsWith('file:') || !parentURL.endsWith('.ts')) return undefined;
    base = new URL(specifier, parentURL);
  } else {
    return undefined;
  }

  const candidates = base.pathname.endsWith('.ts')
    ? [base.href]
    : [`${base.href}.ts`, `${base.href}/index.ts`];

  return candidates.find((href) => existsSync(fileURLToPath(href)));
}

// `registerHooks` is synchronous and in-thread, which is what makes a single-file script
// possible; it landed in Node 22.15. Type stripping itself needs 22.6, so the floor for
// this script is 22.15 either way — say so plainly rather than failing on a missing export.
const registerHooks = (nodeModule as { registerHooks?: unknown }).registerHooks;
if (typeof registerHooks !== 'function') {
  console.error(
    `ServisLoop: npm run db:reset needs Node 22.15 or newer (running ${process.version}).`,
  );
  process.exit(1);
}

(registerHooks as (hooks: Record<string, unknown>) => void)({
  resolve(
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (s: string, c: unknown) => unknown,
  ) {
    const url = resolveProjectSpecifier(specifier, context.parentURL);
    return url ? { url, shortCircuit: true } : nextResolve(specifier, context);
  },
});

/*
 * Type-only imports of the same modules loaded dynamically below. These are erased before
 * Node ever sees them, so they cost nothing at runtime while keeping the script fully
 * typechecked by `tsc --noEmit` along with the rest of the repository.
 */
type SeedModule = typeof import('../src/server/data/seed');
type RepositoryModule = typeof import('../src/server/data/json-repository');
type IdsModule = typeof import('../src/lib/ids');
type DatesModule = typeof import('../src/domain/dates');

/** Imported by URL rather than by literal path, so the hook above is already installed. */
function load<T>(relativePath: string): Promise<T> {
  return import(new URL(relativePath, import.meta.url).href) as Promise<T>;
}

async function main(): Promise<void> {
  // `DEFAULT_STORE_PATH` is `<cwd>/.data/store.json`, which is what the running app uses.
  // Anchoring the working directory to the repository root makes this script write exactly
  // the file `npm run dev` will read, however it was invoked.
  process.chdir(REPO_ROOT);

  const [seed, repository, ids, dates] = await Promise.all([
    load<SeedModule>('../src/server/data/seed.ts'),
    load<RepositoryModule>('../src/server/data/json-repository.ts'),
    load<IdsModule>('../src/lib/ids.ts'),
    load<DatesModule>('../src/domain/dates.ts'),
  ]);

  const storePath = repository.DEFAULT_STORE_PATH;

  const existed = existsSync(storePath);
  if (existed) rmSync(storePath);
  // The repository writes to a temp file and renames; a leftover one from a crashed write
  // would otherwise sit next to the fresh store forever.
  rmSync(`${storePath}.tmp`, { force: true });

  const anchor = dates.civilDateFromUTC(new Date());

  // Real 256-bit tokens, not the fixture's predictable `demo-token-…` placeholders: the
  // demo's QR pages are reachable by anyone holding the URL, and a guessable token in a
  // store someone later points at the internet is a data leak with a countdown on it.
  const store = seed.createDemoStore(anchor, () => ids.newPublicToken());

  // Constructing the repository against a path that does not exist seeds and persists it,
  // through the same write-to-temp-then-rename path the application uses — so the file on
  // disk is byte-identical in shape to one the app wrote itself.
  new repository.JsonRepository({ filePath: storePath, seed: () => store });

  if (!existsSync(storePath)) {
    throw new Error(`The store was not written to ${storePath}.`);
  }

  const organization = store.organizations[0];
  const owner = store.profiles.find((profile) => profile.id === seed.DEMO.ownerId);

  console.log('');
  console.log(`  ServisLoop demo store ${existed ? 'rebuilt' : 'created'}`);
  console.log(`  ${storePath}`);
  console.log('');
  console.log(`  Organisation   ${organization?.name ?? 'unknown'} (${organization?.timezone ?? '—'})`);
  console.log(`  Anchored to    ${anchor}`);
  console.log(`  Contents       ${seed.describeDemo(store)}`);
  console.log(`  Signed in as   ${owner?.fullName ?? 'the owner'} <${owner?.email ?? '—'}>`);
  console.log('');
  console.log('  Run `npm run dev` and open http://localhost:3000/app.');
  console.log('  Switch role from the demo banner to see the permission gates change.');
  console.log('');
}

try {
  await main();
} catch (error) {
  console.error('');
  console.error('  Could not rebuild the demo store.');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  console.error('');
  process.exitCode = 1;
}
