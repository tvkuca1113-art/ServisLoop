#!/usr/bin/env tsx
/**
 * Generator TypeScript tipova iz stvarne šeme baze.
 *
 *   npm run gen:types
 *
 * Čita `information_schema` i ispisuje `types/supabase.ts` u obliku koji
 * `@supabase/supabase-js` očekuje kao generički parametar `Database`.
 *
 * Zašto vlastiti generator umjesto `supabase gen types`:
 * Supabase CLI za lokalni rad traži Docker, a jedan od uslova projekta je da
 * osnivač ne mora instalirati Docker. Ovaj skript radi s bilo kojom
 * PostgreSQL vezom — i lokalnom i Supabase produkcijskom.
 *
 * Tipovi se NE pišu ručno. Ako se šema promijeni, pokreni skript ponovo.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

interface ColumnRow {
  table_name: string
  column_name: string
  data_type: string
  udt_name: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
  is_identity: 'YES' | 'NO'
  is_generated: 'ALWAYS' | 'NEVER'
}

/** Preslikavanje PostgreSQL tipova na TypeScript. */
function mapType(column: ColumnRow): string {
  const udt = column.udt_name

  // Nizovi u `information_schema` imaju `data_type = 'ARRAY'` i `udt_name`
  // s vodećom donjom crtom, npr. `_int2`.
  if (column.data_type === 'ARRAY') {
    const elementType = mapScalar(udt.replace(/^_/, ''))
    return `${elementType}[]`
  }

  return mapScalar(udt)
}

function mapScalar(udt: string): string {
  switch (udt) {
    case 'uuid':
    case 'text':
    case 'citext':
    case 'varchar':
    case 'bpchar':
    case 'name':
      return 'string'

    // Datum i vrijeme dolaze kao ISO stringovi kroz PostgREST.
    case 'date':
    case 'timestamp':
    case 'timestamptz':
    case 'time':
    case 'timetz':
    case 'interval':
      return 'string'

    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
      return 'number'

    // `numeric` dolazi kao broj kroz PostgREST, ali može izgubiti preciznost
    // na vrlo velikim vrijednostima. Cijene u KM su daleko ispod te granice.
    case 'numeric':
      return 'number'

    case 'bool':
      return 'boolean'

    case 'json':
    case 'jsonb':
      return 'Json'

    case 'bytea':
      return 'string'

    default:
      // Nepoznat tip namjerno postaje `unknown`, ne `any` — kod ga tada mora
      // eksplicitno suziti prije upotrebe.
      return 'unknown'
  }
}

/** Kolona je opciona pri upisu ako ima podrazumijevanu vrijednost ili smije biti NULL. */
function isOptionalOnInsert(column: ColumnRow): boolean {
  return column.column_default !== null || column.is_nullable === 'YES'
}

/** Generisane kolone i identiteti se ne mogu upisivati. */
function isWritable(column: ColumnRow): boolean {
  return column.is_generated !== 'ALWAYS' && column.is_identity !== 'YES'
}

function quoteKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('Nedostaje DATABASE_URL u .env.local')

  const client = new Client({ connectionString })
  await client.connect()

  try {
    const { rows } = await client.query<ColumnRow>(`
      select
        c.table_name,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        c.is_generated
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.table_name <> 'schema_migrations'
      order by c.table_name, c.ordinal_position
    `)

    if (rows.length === 0) {
      throw new Error('Baza nema tabela. Pokreni prvo: npm run db:migrate')
    }

    const byTable = new Map<string, ColumnRow[]>()
    for (const row of rows) {
      const bucket = byTable.get(row.table_name)
      if (bucket) bucket.push(row)
      else byTable.set(row.table_name, [row])
    }

    const parts: string[] = []

    parts.push(`/* eslint-disable */
/**
 * GENERISANO AUTOMATSKI — NE MIJENJATI RUČNO.
 *
 * Izvor: šema baze podataka (public).
 * Ponovo generiši sa:  npm run gen:types
 *
 * Tabela: ${byTable.size}
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {`)

    for (const [tableName, columns] of [...byTable.entries()].sort()) {
      const rowFields = columns
        .map((column) => {
          const type = mapType(column)
          const nullable = column.is_nullable === 'YES' ? ' | null' : ''
          return `          ${quoteKey(column.column_name)}: ${type}${nullable}`
        })
        .join('\n')

      const insertFields = columns
        .filter(isWritable)
        .map((column) => {
          const type = mapType(column)
          const nullable = column.is_nullable === 'YES' ? ' | null' : ''
          const optional = isOptionalOnInsert(column) ? '?' : ''
          return `          ${quoteKey(column.column_name)}${optional}: ${type}${nullable}`
        })
        .join('\n')

      const updateFields = columns
        .filter(isWritable)
        .map((column) => {
          const type = mapType(column)
          const nullable = column.is_nullable === 'YES' ? ' | null' : ''
          return `          ${quoteKey(column.column_name)}?: ${type}${nullable}`
        })
        .join('\n')

      parts.push(`      ${quoteKey(tableName)}: {
        Row: {
${rowFields}
        }
        Insert: {
${insertFields}
        }
        Update: {
${updateFields}
        }
        Relationships: []
      }`)
    }

    parts.push(`    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

/** Kraći pristup: \`Tables<'devices'>\` umjesto duge putanje. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
`)

    const output = parts.join('\n')
    const target = join(process.cwd(), 'types', 'supabase.ts')
    await writeFile(target, output, 'utf8')

    console.log(`\n  Generisano: types/supabase.ts`)
    console.log(`  Tabela: ${byTable.size}`)
    console.log(`  Kolona: ${rows.length}\n`)
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
