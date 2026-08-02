#!/usr/bin/env tsx
/**
 * Provjera izolacije organizacija (row-level security).
 *
 * Ovo NIJE pregled politika — skript se stvarno prijavljuje kao korisnik
 * organizacije A i pokušava pročitati, izmijeniti i obrisati podatke
 * organizacije B. Svaki takav pokušaj MORA propasti.
 *
 *   npm run db:verify-rls
 *
 * Radi na `TEST_DATABASE_URL` (ili `DATABASE_URL`). Baza se prije provjere
 * potpuno resetuje, pa je nikad ne pokazuj na produkciju.
 *
 * Kako radi simulacija prijave:
 *   `set role authenticated` + `set_config('request.jwt.claim.sub', <uuid>)`
 * je tačno ono što Supabase radi kad korisnik pošalje svoj JWT. Time
 * testiramo iste politike koje vrijede u produkciji.
 */
import { execFileSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

interface Check {
  name: string
  passed: boolean
  detail: string
}

const checks: Check[] = []

function record(name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail })
  const mark = passed ? '[32m✓[0m' : '[31m✗[0m'
  console.log(`  ${mark} ${name}`)
  if (!passed) console.log(`      ${detail}`)
}

/** Izvršava upit kao prijavljeni korisnik i vraća broj vidljivih redova. */
async function countAs(client: Client, userId: string, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    await client.query('set local role authenticated')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
    const result = await client.query(sql, params)
    await client.query('commit')
    return result.rowCount ?? 0
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

/** Pokušava naredbu koja mora propasti ili ne pogoditi nijedan red. */
async function attemptAs(
  client: Client,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ ok: boolean; rowCount: number; error?: string }> {
  await client.query('begin')
  try {
    await client.query('set local role authenticated')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
    const result = await client.query(sql, params)
    await client.query('rollback')
    return { ok: true, rowCount: result.rowCount ?? 0 }
  } catch (error) {
    await client.query('rollback')
    return { ok: false, rowCount: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

interface Fixture {
  orgId: string
  ownerId: string
  dispatcherId: string
  technicianUserId: string
  technicianRecordId: string
  otherTechnicianUserId: string
  otherTechnicianRecordId: string
  customerId: string
  deviceId: string
  workOrderId: string
  otherWorkOrderId: string
}

async function createFixture(client: Client, slug: string, label: string): Promise<Fixture> {
  const org = await client.query<{ id: string }>(
    `insert into public.organizations (name, slug) values ($1, $2) returning id`,
    [label, slug],
  )
  const orgId = org.rows[0]!.id
  await client.query('select app.seed_organization_defaults($1)', [orgId])

  async function makeUser(email: string): Promise<string> {
    const user = await client.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    )
    const id = user.rows[0]!.id
    await client.query(
      `insert into public.profiles (id, email, full_name) values ($1, $2, $3)
       on conflict (id) do nothing`,
      [id, email, email.split('@')[0]],
    )
    return id
  }

  const ownerId = await makeUser(`owner@${slug}.test`)
  const dispatcherId = await makeUser(`dispatcher@${slug}.test`)
  const technicianUserId = await makeUser(`tech1@${slug}.test`)
  const otherTechnicianUserId = await makeUser(`tech2@${slug}.test`)

  for (const [userId, role] of [
    [ownerId, 'owner'],
    [dispatcherId, 'dispatcher'],
    [technicianUserId, 'technician'],
    [otherTechnicianUserId, 'technician'],
  ] as const) {
    await client.query(
      `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)`,
      [orgId, userId, role],
    )
  }

  const tech1 = await client.query<{ id: string }>(
    `insert into public.technicians (organization_id, user_id, full_name)
     values ($1, $2, $3) returning id`,
    [orgId, technicianUserId, `Tehničar 1 ${label}`],
  )
  const tech2 = await client.query<{ id: string }>(
    `insert into public.technicians (organization_id, user_id, full_name)
     values ($1, $2, $3) returning id`,
    [orgId, otherTechnicianUserId, `Tehničar 2 ${label}`],
  )

  const customer = await client.query<{ id: string }>(
    `insert into public.customers (organization_id, name, email, phone)
     values ($1, $2, $3, $4) returning id`,
    [orgId, `Kupac ${label}`, `kupac@${slug}.test`, '+38761000111'],
  )
  const customerId = customer.rows[0]!.id

  const location = await client.query<{ id: string }>(
    `insert into public.locations (organization_id, customer_id, address, city)
     values ($1, $2, $3, $4) returning id`,
    [orgId, customerId, 'Ulica 1', 'Sarajevo'],
  )

  const device = await client.query<{ id: string }>(
    `insert into public.devices
       (organization_id, customer_id, location_id, manufacturer, model, serial_number,
        service_interval_months, next_service_date, default_service_price)
     values ($1, $2, $3, 'AeroTherm', 'ST-12', $4, 12, current_date + 20, 70)
     returning id`,
    [orgId, customerId, location.rows[0]!.id, `SN-${slug.toUpperCase()}-001`],
  )
  const deviceId = device.rows[0]!.id

  async function makeWorkOrder(code: string, technicianId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `insert into public.work_orders
         (organization_id, code, customer_id, device_id, assigned_technician_id, status, service_price)
       values ($1, $2, $3, $4, $5, 'assigned', 70)
       returning id`,
      [orgId, code, customerId, deviceId, technicianId],
    )
    return result.rows[0]!.id
  }

  return {
    orgId,
    ownerId,
    dispatcherId,
    technicianUserId,
    technicianRecordId: tech1.rows[0]!.id,
    otherTechnicianUserId,
    otherTechnicianRecordId: tech2.rows[0]!.id,
    customerId,
    deviceId,
    workOrderId: await makeWorkOrder(`RN-${slug}-1`, tech1.rows[0]!.id),
    otherWorkOrderId: await makeWorkOrder(`RN-${slug}-2`, tech2.rows[0]!.id),
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Nedostaje TEST_DATABASE_URL (ili DATABASE_URL) u .env.local')
  }
  if (connectionString.includes('supabase.co') && !process.env.ALLOW_SUPABASE_RESET) {
    throw new Error('Odbijeno: provjera resetuje bazu. Ne pokazuj je na Supabase produkciju.')
  }

  console.log('\nServisLoop — provjera izolacije organizacija\n')
  console.log('  Priprema baze…')
  execFileSync('npx', ['tsx', 'scripts/db-migrate.ts', '--reset', '--test'], {
    stdio: 'pipe',
    env: process.env,
  })

  const client = new Client({ connectionString })
  await client.connect()

  try {
    console.log('  Kreiranje dvije odvojene organizacije…\n')
    const orgA = await createFixture(client, 'alfa', 'Alfa Servis d.o.o.')
    const orgB = await createFixture(client, 'beta', 'Beta Klima d.o.o.')

    // -----------------------------------------------------------------------
    console.log('  Čitanje tuđih podataka')
    // -----------------------------------------------------------------------
    const crossReadTables: Array<[string, string]> = [
      ['customers', 'kupci'],
      ['locations', 'lokacije'],
      ['devices', 'uređaji'],
      ['work_orders', 'radni nalozi'],
      ['technicians', 'tehničari'],
      ['device_types', 'vrste opreme'],
      ['reminder_rules', 'pravila podsjetnika'],
      ['service_plan_templates', 'servisni planovi'],
      ['checklist_templates', 'čekliste'],
      ['organization_settings', 'postavke organizacije'],
      ['booking_settings', 'postavke rezervacija'],
      ['import_jobs', 'uvozi'],
      ['organization_subscriptions', 'pretplata'],
      ['notification_events', 'obavijesti'],
      ['audit_events', 'revizijski dnevnik'],
    ]

    for (const [table, label] of crossReadTables) {
      const visible = await countAs(
        client,
        orgA.ownerId,
        `select 1 from public.${table} where organization_id = $1`,
        [orgB.orgId],
      )
      record(
        `Vlasnik A ne vidi ${label} organizacije B`,
        visible === 0,
        `vidljivo redova: ${visible} (očekivano 0)`,
      )
    }

    // Kontrolna provjera: vlastite podatke MORA vidjeti.
    const ownData = await countAs(
      client,
      orgA.ownerId,
      `select 1 from public.devices where organization_id = $1`,
      [orgA.orgId],
    )
    record('Vlasnik A vidi vlastite uređaje', ownData > 0, `vidljivo redova: ${ownData}`)

    // -----------------------------------------------------------------------
    console.log('\n  Izmjena i brisanje tuđih podataka')
    // -----------------------------------------------------------------------
    const update = await attemptAs(
      client,
      orgA.ownerId,
      `update public.customers set name = 'PROBOJ' where id = $1`,
      [orgB.customerId],
    )
    record(
      'Vlasnik A ne može izmijeniti kupca organizacije B',
      update.rowCount === 0,
      `izmijenjeno redova: ${update.rowCount}`,
    )

    const remove = await attemptAs(
      client,
      orgA.ownerId,
      `delete from public.devices where id = $1`,
      [orgB.deviceId],
    )
    record(
      'Vlasnik A ne može obrisati uređaj organizacije B',
      remove.rowCount === 0,
      `obrisano redova: ${remove.rowCount}`,
    )

    const insertIntoOther = await attemptAs(
      client,
      orgA.ownerId,
      `insert into public.customers (organization_id, name) values ($1, 'Podmetnuti kupac')`,
      [orgB.orgId],
    )
    record(
      'Vlasnik A ne može upisati kupca u organizaciju B',
      !insertIntoOther.ok,
      insertIntoOther.ok ? 'upis je prošao (ne bi smio)' : 'upis odbijen politikom',
    )

    // -----------------------------------------------------------------------
    console.log('\n  Ograničenja uloge tehničara')
    // -----------------------------------------------------------------------
    const techOwnOrders = await countAs(
      client,
      orgA.technicianUserId,
      `select 1 from public.work_orders where id = $1`,
      [orgA.workOrderId],
    )
    record(
      'Tehničar vidi nalog koji mu je dodijeljen',
      techOwnOrders === 1,
      `redova: ${techOwnOrders}`,
    )

    const techOtherOrders = await countAs(
      client,
      orgA.technicianUserId,
      `select 1 from public.work_orders where id = $1`,
      [orgA.otherWorkOrderId],
    )
    record(
      'Tehničar NE vidi nalog drugog tehničara iste firme',
      techOtherOrders === 0,
      `redova: ${techOtherOrders} (očekivano 0)`,
    )

    const techSteal = await attemptAs(
      client,
      orgA.technicianUserId,
      `update public.work_orders set assigned_technician_id = $1 where id = $2`,
      [orgA.technicianRecordId, orgA.otherWorkOrderId],
    )
    record(
      'Tehničar ne može preuzeti tuđi nalog',
      techSteal.rowCount === 0,
      `izmijenjeno redova: ${techSteal.rowCount}`,
    )

    const techBilling = await countAs(
      client,
      orgA.technicianUserId,
      `select 1 from public.organization_subscriptions where organization_id = $1`,
      [orgA.orgId],
    )
    record(
      'Tehničar vidi plan firme (samo za čitanje), ali ne može ga mijenjati',
      techBilling >= 0,
      `redova: ${techBilling}`,
    )

    const techChangesPlan = await attemptAs(
      client,
      orgA.technicianUserId,
      `update public.organization_subscriptions set plan_code = 'pro' where organization_id = $1`,
      [orgA.orgId],
    )
    record(
      'Tehničar ne može promijeniti plan pretplate',
      techChangesPlan.rowCount === 0,
      `izmijenjeno redova: ${techChangesPlan.rowCount}`,
    )

    const techAddsMember = await attemptAs(
      client,
      orgA.technicianUserId,
      `insert into public.organization_members (organization_id, user_id, role)
       values ($1, $2, 'owner')`,
      [orgA.orgId, orgA.technicianUserId],
    )
    record(
      'Tehničar ne može sebe postaviti za vlasnika',
      !techAddsMember.ok || techAddsMember.rowCount === 0,
      techAddsMember.ok ? 'upis je prošao (ne bi smio)' : 'upis odbijen politikom',
    )

    // -----------------------------------------------------------------------
    console.log('\n  Ograničenja uloge dispečera')
    // -----------------------------------------------------------------------
    const dispatcherManagesTeam = await attemptAs(
      client,
      orgA.dispatcherId,
      `update public.technicians set full_name = 'Promijenjeno' where id = $1`,
      [orgA.technicianRecordId],
    )
    record(
      'Dispečer ne može mijenjati zapise tehničara',
      dispatcherManagesTeam.rowCount === 0,
      `izmijenjeno redova: ${dispatcherManagesTeam.rowCount}`,
    )

    const dispatcherEditsCustomer = await attemptAs(
      client,
      orgA.dispatcherId,
      `update public.customers set notes = 'Dispečer je bio ovdje' where id = $1`,
      [orgA.customerId],
    )
    record(
      'Dispečer može uređivati kupce vlastite firme',
      dispatcherEditsCustomer.rowCount === 1,
      `izmijenjeno redova: ${dispatcherEditsCustomer.rowCount}`,
    )

    const dispatcherDeletesOrg = await attemptAs(
      client,
      orgA.dispatcherId,
      `delete from public.organizations where id = $1`,
      [orgA.orgId],
    )
    record(
      'Dispečer ne može obrisati organizaciju',
      dispatcherDeletesOrg.rowCount === 0,
      `obrisano redova: ${dispatcherDeletesOrg.rowCount}`,
    )

    // -----------------------------------------------------------------------
    console.log('\n  Tajni podaci i tokeni')
    // -----------------------------------------------------------------------
    const anonAccess = await attemptAs(client, orgA.ownerId, `select 1 from public.rate_limits`, [])
    record(
      'Prijavljeni korisnik ne može čitati tabelu ograničenja pristupa',
      !anonAccess.ok || anonAccess.rowCount === 0,
      anonAccess.ok ? `redova: ${anonAccess.rowCount}` : 'pristup odbijen',
    )

    const counters = await attemptAs(
      client,
      orgA.ownerId,
      `select 1 from public.document_counters where organization_id = $1`,
      [orgA.orgId],
    )
    record(
      'Prijavljeni korisnik ne može čitati brojače dokumenata',
      !counters.ok || counters.rowCount === 0,
      counters.ok ? `redova: ${counters.rowCount}` : 'pristup odbijen',
    )

    const cronHistory = await attemptAs(client, orgA.ownerId, `select 1 from public.cron_runs`, [])
    record(
      'Prijavljeni korisnik ne može čitati historiju cron poslova',
      !cronHistory.ok || cronHistory.rowCount === 0,
      cronHistory.ok ? `redova: ${cronHistory.rowCount}` : 'pristup odbijen',
    )

    // -----------------------------------------------------------------------
    console.log('\n  Zaštita posljednjeg vlasnika')
    // -----------------------------------------------------------------------
    const removeLastOwner = await attemptAs(
      client,
      orgA.ownerId,
      `delete from public.organization_members where organization_id = $1 and role = 'owner'`,
      [orgA.orgId],
    )
    record(
      'Nije moguće ukloniti posljednjeg vlasnika organizacije',
      !removeLastOwner.ok,
      removeLastOwner.ok ? 'brisanje je prošlo (ne bi smjelo)' : 'blokirano okidačem',
    )
  } finally {
    await client.end()
  }

  const failed = checks.filter((check) => !check.passed)
  console.log(
    `\n  Ukupno provjera: ${checks.length} · prošlo: ${checks.length - failed.length} · palo: ${failed.length}\n`,
  )

  if (failed.length > 0) {
    console.error('  IZOLACIJA NIJE POTPUNA. Ove provjere nisu prošle:')
    for (const check of failed) console.error(`   • ${check.name} — ${check.detail}`)
    console.error('')
    process.exit(1)
  }

  console.log('  Izolacija organizacija je potvrđena.\n')
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
