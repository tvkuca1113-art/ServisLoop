#!/usr/bin/env tsx
/**
 * Pokretač migracija.
 *
 * Primjenjuje sve `.sql` fajlove iz `supabase/migrations/` po abecednom redu i
 * pamti koje su već primijenjene u tabeli `public.schema_migrations`.
 *
 *   npm run db:migrate           primijeni nove migracije
 *   npm run db:reset             obriši šemu i primijeni sve iznova
 *
 * Baza se bira iz `DATABASE_URL` (ili `TEST_DATABASE_URL` uz `--test`).
 *
 * Zašto vlastiti pokretač, a ne Supabase CLI: CLI traži Docker, a jedan od
 * uslova projekta je da osnivač ne mora instalirati Docker. Ovaj skript
 * radi s bilo kojom PostgreSQL vezom, uključujući Supabase.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

interface Options {
  reset: boolean
  useTestDb: boolean
  dryRun: boolean
}

function parseArgs(argv: string[]): Options {
  return {
    reset: argv.includes('--reset'),
    useTestDb: argv.includes('--test'),
    dryRun: argv.includes('--dry-run'),
  }
}

function resolveConnectionString(useTestDb: boolean): string {
  const url = useTestDb
    ? (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL)
    : process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      useTestDb
        ? 'Nedostaje TEST_DATABASE_URL (ili DATABASE_URL) u .env.local'
        : 'Nedostaje DATABASE_URL u .env.local — vidi .env.example',
    )
  }
  return url
}

/** Sakriva lozinku prije ispisa u konzolu. */
function redact(connectionString: string): string {
  try {
    const url = new URL(connectionString)
    if (url.password) url.password = '***'
    return url.toString()
  } catch {
    return '(neispravan DATABASE_URL)'
  }
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now(),
      checksum text not null
    )
  `)
}

async function appliedVersions(client: Client): Promise<Map<string, string>> {
  const result = await client.query<{ version: string; checksum: string }>(
    'select version, checksum from public.schema_migrations',
  )
  return new Map(result.rows.map((row) => [row.version, row.checksum]))
}

function checksum(contents: string): string {
  // Jednostavan FNV-1a heš — dovoljno da uoči izmjenu već primijenjene migracije.
  let hash = 2166136261
  for (let i = 0; i < contents.length; i++) {
    hash ^= contents.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

async function resetSchema(client: Client): Promise<void> {
  console.log('  Brisanje postojeće šeme…')
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists app cascade;
    create schema public;
    grant all on schema public to public;
  `)
  // Lokalnu zamjensku `auth` šemu brišemo samo ako nije Supabase-ova
  // (Supabase-ova sadrži tabelu `identities` koju nikad ne pravimo mi).
  const isSupabaseAuth = await client.query(`
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'identities'
    limit 1
  `)
  if (isSupabaseAuth.rowCount === 0) {
    await client.query('drop schema if exists auth cascade')
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const connectionString = resolveConnectionString(options.useTestDb)

  console.log(`\nServisLoop — migracije`)
  console.log(`  Baza: ${redact(connectionString)}`)

  const client = new Client({ connectionString })
  await client.connect()

  try {
    if (options.reset) {
      if (connectionString.includes('supabase.co') && !process.env.ALLOW_SUPABASE_RESET) {
        throw new Error(
          'Odbijeno: --reset na Supabase bazi briše SVE podatke.\n' +
            'Ako to zaista želiš, pokreni sa ALLOW_SUPABASE_RESET=1.',
        )
      }
      await resetSchema(client)
    }

    await ensureMigrationsTable(client)
    const applied = await appliedVersions(client)

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith('.sql'))
      .sort()

    if (files.length === 0) {
      console.log('  Nema migracija u supabase/migrations/')
      return
    }

    let appliedCount = 0

    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      const contents = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
      const sum = checksum(contents)
      const previous = applied.get(version)

      if (previous) {
        if (previous !== sum) {
          console.warn(
            `  ! ${file} je izmijenjen nakon primjene (checksum ${previous} → ${sum}).\n` +
              `    Migracije se ne mijenjaju retroaktivno — dodaj novu migraciju\n` +
              `    ili pokreni "npm run db:reset" na razvojnoj bazi.`,
          )
        }
        continue
      }

      if (options.dryRun) {
        console.log(`  · ${file} (dry-run, nije primijenjeno)`)
        continue
      }

      process.stdout.write(`  → ${file} … `)
      // Svaka migracija ide u vlastitoj transakciji: ili prođe cijela ili ništa.
      await client.query('begin')
      try {
        await client.query(contents)
        await client.query(
          'insert into public.schema_migrations (version, checksum) values ($1, $2)',
          [version, sum],
        )
        await client.query('commit')
        console.log('ok')
        appliedCount += 1
      } catch (error) {
        await client.query('rollback')
        console.log('GREŠKA')
        throw new Error(
          `Migracija ${file} nije uspjela:\n${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    console.log(
      appliedCount === 0
        ? '\n  Baza je već ažurna.\n'
        : `\n  Primijenjeno migracija: ${appliedCount}\n`,
    )
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
