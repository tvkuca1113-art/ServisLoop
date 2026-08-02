import { execFileSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import { Client, Pool } from 'pg'
import { beforeAll, afterAll } from 'vitest'

/**
 * Priprema za integracijske testove.
 *
 * Za razliku od jediničnih testova, ovi rade protiv STVARNOG PostgreSQL-a.
 * Time provjeravamo ono što se u kodu ne može dokazati: da jedinstveni
 * indeksi, okidači i ograničenja zaista rade kako tvrdimo.
 *
 * Baza se prije svega resetuje. Zato `TEST_DATABASE_URL` nikad ne smije
 * pokazivati na produkciju — skript to i odbija ako prepozna Supabase URL.
 */

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

let sharedClient: Client | null = null
let sharedPool: Pool | null = null

export function db(): Client {
  if (!sharedClient) {
    throw new Error('Baza nije spremna. Provjeri TEST_DATABASE_URL u .env.local')
  }
  return sharedClient
}

/**
 * Pool s više veza — potreban za testove stvarne istovremenosti.
 * Jedan `Client` serijalizuje upite, pa se preko njega utrka ne može ni
 * simulirati; pool otvara zasebne veze koje se stvarno preklapaju.
 */
export function pool(): Pool {
  if (!sharedPool) {
    throw new Error('Pool nije spreman. Provjeri TEST_DATABASE_URL u .env.local')
  }
  return sharedPool
}

beforeAll(async () => {
  if (!TEST_DATABASE_URL) {
    throw new Error(
      'Integracijski testovi traže TEST_DATABASE_URL u .env.local.\n' +
        'Vidi docs/TESTING.md za pokretanje lokalnog PostgreSQL-a.',
    )
  }

  if (TEST_DATABASE_URL.includes('supabase.co') && !process.env.ALLOW_SUPABASE_RESET) {
    throw new Error(
      'Odbijeno: integracijski testovi brišu i ponovo kreiraju šemu.\n' +
        'TEST_DATABASE_URL ne smije pokazivati na Supabase produkciju.',
    )
  }

  execFileSync('npx', ['tsx', 'scripts/db-migrate.ts', '--reset', '--test'], {
    stdio: 'pipe',
    env: process.env,
  })

  sharedClient = new Client({ connectionString: TEST_DATABASE_URL })
  await sharedClient.connect()

  sharedPool = new Pool({ connectionString: TEST_DATABASE_URL, max: 10 })
}, 120_000)

afterAll(async () => {
  await sharedClient?.end()
  await sharedPool?.end()
  sharedClient = null
  sharedPool = null
})

// ---------------------------------------------------------------------------
// Pomoćne funkcije za pravljenje testnih podataka
// ---------------------------------------------------------------------------

export interface TestOrg {
  id: string
  ownerId: string
  technicianId: string
  customerId: string
  locationId: string
  deviceId: string
  ruleIds: string[]
}

let orgCounter = 0

/** Pravi potpunu organizaciju sa zadanim vrijednostima i jednim uređajem. */
export async function createTestOrg(nextServiceDate = '2026-04-15'): Promise<TestOrg> {
  const client = db()
  orgCounter += 1
  const slug = `test-org-${orgCounter}-${Date.now().toString(36)}`

  const { rows: orgRows } = await client.query<{ id: string }>(
    `insert into public.organizations (name, slug) values ($1, $2) returning id`,
    [`Test firma ${orgCounter}`, slug],
  )
  const orgId = orgRows[0]!.id

  await client.query('select app.seed_organization_defaults($1)', [orgId])

  const { rows: userRows } = await client.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [`owner-${slug}@primjer.test`],
  )
  const ownerId = userRows[0]!.id

  await client.query(
    `insert into public.profiles (id, email, full_name) values ($1, $2, 'Test Vlasnik')
     on conflict (id) do nothing`,
    [ownerId, `owner-${slug}@primjer.test`],
  )

  await client.query(
    `insert into public.organization_members (organization_id, user_id, role)
     values ($1, $2, 'owner')`,
    [orgId, ownerId],
  )

  const { rows: techRows } = await client.query<{ id: string }>(
    `insert into public.technicians (organization_id, full_name) values ($1, 'Test Tehničar')
     returning id`,
    [orgId],
  )

  const { rows: customerRows } = await client.query<{ id: string }>(
    `insert into public.customers (organization_id, name, email)
     values ($1, 'Test Kupac', $2) returning id`,
    [orgId, `kupac-${slug}@primjer.test`],
  )
  const customerId = customerRows[0]!.id

  const { rows: locationRows } = await client.query<{ id: string }>(
    `insert into public.locations (organization_id, customer_id, address, city)
     values ($1, $2, 'Testna 1', 'Sarajevo') returning id`,
    [orgId, customerId],
  )
  const locationId = locationRows[0]!.id

  const { rows: deviceRows } = await client.query<{ id: string }>(
    `insert into public.devices
       (organization_id, customer_id, location_id, manufacturer, model, serial_number,
        service_interval_months, next_service_date, default_service_price)
     values ($1, $2, $3, 'TestTherm', 'T-12', $4, 12, $5, 70)
     returning id`,
    [orgId, customerId, locationId, `SN-${slug}`, nextServiceDate],
  )

  const { rows: ruleRows } = await client.query<{ id: string }>(
    `select id from public.reminder_rules where organization_id = $1 and is_active order by offset_days`,
    [orgId],
  )

  return {
    id: orgId,
    ownerId,
    technicianId: techRows[0]!.id,
    customerId,
    locationId,
    deviceId: deviceRows[0]!.id,
    ruleIds: ruleRows.map((row) => row.id),
  }
}

/** Izvršava upit kao prijavljeni korisnik (RLS aktivan). */
export async function asUser<T>(userId: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = db()
  await client.query('begin')
  try {
    await client.query('set local role authenticated')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
    const result = await run(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}
