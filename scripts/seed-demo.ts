#!/usr/bin/env tsx
/**
 * Popunjavanje demo organizacije.
 *
 *   npm run db:seed              popuni demo podatke
 *   npm run db:seed -- --reset   obriši postojeću demo organizaciju pa popuni
 *
 * Nastaje potpuna, uvjerljiva firma: 4 korisnika, 44 kupca, 52 lokacije,
 * 126 uređaja, servisna historija, rezervacije, prijave kvara, radni nalozi
 * i podsjetnici — uključujući i neuspjele, da se vidi kako sistem izgleda
 * kad nešto pođe po zlu.
 *
 * Sve je deterministički: isto pokretanje daje iste podatke.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'
import {
  CITIES,
  COMPANY_CUSTOMERS,
  DEMO_ORG,
  DEMO_USERS,
  FIRST_NAMES,
  ISSUE_DESCRIPTIONS,
  LAST_NAMES,
  MANUFACTURERS,
  MATERIALS,
  MODELS,
  RECOMMENDATIONS,
  SERVICE_NOTES,
  STREETS,
  createRandom,
} from '../supabase/seed/demo-data'
import { addDays, addMonths, todayInTimeZone } from '../domains/shared/plain-date'
import { formatDocumentNumber } from '../domains/shared/document-number'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

const TIME_ZONE = 'Europe/Sarajevo'
const DEVICE_TARGET = 126
const CUSTOMER_TARGET = 44

/** Isti heš koji koristi aplikacija (`lib/security/tokens.ts`). */
function hashToken(raw: string): string {
  const secret = process.env.PUBLIC_TOKEN_SECRET ?? ''
  return createHash('sha256').update(`${secret}:${raw}`).digest('hex')
}

const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function makeToken(random: ReturnType<typeof createRandom>, length: number): string {
  let token = ''
  for (let i = 0; i < length; i++) {
    token += TOKEN_ALPHABET[random.int(0, TOKEN_ALPHABET.length - 1)]
  }
  return token
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('Nedostaje DATABASE_URL u .env.local')

  const shouldReset = process.argv.includes('--reset')

  console.log('\nServisLoop — demo podaci\n')

  // Migracije moraju biti primijenjene prije seeda.
  execFileSync('npx', ['tsx', 'scripts/db-migrate.ts'], { stdio: 'pipe', env: process.env })

  const client = new Client({ connectionString })
  await client.connect()
  const random = createRandom(20260315)
  const today = todayInTimeZone(TIME_ZONE)

  try {
    await client.query('begin')

    // --- Očisti prethodnu demo organizaciju ------------------------------
    const { rows: existing } = await client.query<{ id: string }>(
      `select id from public.organizations where slug = $1`,
      [DEMO_ORG.slug],
    )

    if (existing.length > 0) {
      if (!shouldReset) {
        console.log('  Demo organizacija već postoji.')
        console.log('  Za ponovno kreiranje pokreni: npm run db:seed -- --reset\n')
        await client.query('rollback')
        return
      }
      console.log('  Brisanje postojeće demo organizacije…')
      // Kaskadno brisanje pokriva sve tenant tabele.
      await client.query(`delete from public.organizations where slug = $1`, [DEMO_ORG.slug])
      await client.query(`delete from auth.users where email = any($1::text[])`, [
        DEMO_USERS.map((user) => user.email),
      ])
    }

    // --- Organizacija -------------------------------------------------------
    console.log('  Kreiranje organizacije…')
    const { rows: orgRows } = await client.query<{ id: string }>(
      `insert into public.organizations
         (name, slug, legal_name, tax_id, email, phone, address, city, postal_code,
          timezone, is_demo, onboarding_completed_at, onboarding_step)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, true, now(), 11)
       returning id`,
      [
        DEMO_ORG.name,
        DEMO_ORG.slug,
        DEMO_ORG.legalName,
        DEMO_ORG.taxId,
        DEMO_ORG.email,
        DEMO_ORG.phone,
        DEMO_ORG.address,
        DEMO_ORG.city,
        DEMO_ORG.postalCode,
        TIME_ZONE,
      ],
    )
    const orgId = orgRows[0]!.id

    await client.query('select app.seed_organization_defaults($1)', [orgId])

    // Demo organizacija ima plan "demo" — nikad ne šalje stvarne poruke.
    await client.query(
      `update public.organization_subscriptions
       set plan_code = 'demo', status = 'active', trial_ends_on = null,
           override_note = 'Demo organizacija — slanje poruka je onemogućeno'
       where organization_id = $1`,
      [orgId],
    )

    // --- Korisnici i tehničari ---------------------------------------------
    console.log('  Kreiranje korisnika i tehničara…')
    const userIds = new Map<string, string>()
    const technicianIds = new Map<string, string>()

    for (const user of DEMO_USERS) {
      const { rows } = await client.query<{ id: string }>(
        `insert into auth.users (email) values ($1) returning id`,
        [user.email],
      )
      const userId = rows[0]!.id
      userIds.set(user.key, userId)

      await client.query(
        `insert into public.profiles (id, email, full_name) values ($1,$2,$3)
         on conflict (id) do nothing`,
        [userId, user.email, user.fullName],
      )

      await client.query(
        `insert into public.organization_members (organization_id, user_id, role)
         values ($1,$2,$3)`,
        [orgId, userId, user.role],
      )

      if (user.role === 'technician') {
        const { rows: techRows } = await client.query<{ id: string }>(
          `insert into public.technicians (organization_id, user_id, full_name, email, phone, color, specialties)
           values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [
            orgId,
            userId,
            user.fullName,
            user.email,
            `+3876100${random.int(1000, 9999)}`,
            user.key === 'tech1' ? '#18C7B5' : '#5E8BFF',
            user.key === 'tech1' ? ['klima', 'toplotne pumpe'] : ['kotlovi', 'rashladna oprema'],
          ],
        )
        technicianIds.set(user.key, techRows[0]!.id)
      }
    }

    const techIdList = [...technicianIds.values()]

    // --- Vrste opreme --------------------------------------------------------
    const { rows: deviceTypeRows } = await client.query<{
      id: string
      code: string
      default_interval_months: number
    }>(
      `select id, code, default_interval_months from public.device_types where organization_id = $1`,
      [orgId],
    )
    const deviceTypes = deviceTypeRows.filter((type) => type.code !== 'druga_oprema')

    const { rows: planRows } = await client.query<{
      id: string
      device_type_id: string
      price: string
    }>(
      `select id, device_type_id, price from public.service_plan_templates where organization_id = $1`,
      [orgId],
    )
    const planByType = new Map(planRows.map((plan) => [plan.device_type_id, plan]))

    // --- Kupci, lokacije, uređaji -------------------------------------------
    console.log(`  Kreiranje ${CUSTOMER_TARGET} kupaca i ${DEVICE_TARGET} uređaja…`)

    interface SeedDevice {
      id: string
      customerId: string
      locationId: string
      typeId: string
      typeCode: string
      nextServiceDate: string
      lastServiceDate: string | null
      price: number
      qrToken: string
    }

    const devices: SeedDevice[] = []
    const customerIds: string[] = []

    for (let index = 0; index < CUSTOMER_TARGET; index++) {
      const isCompany = index < COMPANY_CUSTOMERS.length
      const companyName = isCompany ? COMPANY_CUSTOMERS[index]! : null
      const personName = `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`
      const name = isCompany ? companyName! : personName

      // Otprilike svaki deseti kupac nema e-mail — to je stvarnost svake
      // preuzete baze i demo mora pokazati kako sistem to prikazuje.
      const hasEmail = !(index % 10 === 7)
      const slugName = `kupac${index + 1}`

      const { rows: customerRows } = await client.query<{ id: string }>(
        `insert into public.customers
           (organization_id, customer_type, name, company_name, email, phone, phone_secondary,
            reminder_consent, marketing_consent, consent_source, consent_recorded_at, notes, external_ref)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), $11, $12)
         returning id`,
        [
          orgId,
          isCompany ? 'company' : 'individual',
          name,
          companyName,
          hasEmail ? `${slugName}@primjer.ba` : null,
          `+38761${String(100000 + index * 137).slice(0, 6)}`,
          random.bool(0.25) ? `+38733${String(200000 + index * 91).slice(0, 6)}` : null,
          true,
          random.bool(0.3),
          'Ugovor o održavanju',
          random.bool(0.2) ? 'Zvati poslije 16h.' : null,
          `EXT-${String(index + 1).padStart(4, '0')}`,
        ],
      )
      const customerId = customerRows[0]!.id
      customerIds.push(customerId)

      // Neki kupci imaju više lokacija (poslovni objekti).
      const locationCount = isCompany && random.bool(0.4) ? 2 : 1

      for (let locationIndex = 0; locationIndex < locationCount; locationIndex++) {
        const city = random.pick(CITIES)
        const { rows: locationRows } = await client.query<{ id: string }>(
          `insert into public.locations
             (organization_id, customer_id, label, address, city, postal_code, contact_person, phone, access_notes)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           returning id`,
          [
            orgId,
            customerId,
            locationCount > 1 ? `Objekat ${locationIndex + 1}` : 'Glavna lokacija',
            `${random.pick(STREETS)} ${random.int(1, 140)}`,
            city.name,
            city.postalCode,
            isCompany ? personName : null,
            `+38761${String(300000 + index * 53).slice(0, 6)}`,
            random.bool(0.3) ? 'Ključ kod portira, ulaz iz dvorišta.' : null,
          ],
        )
        const locationId = locationRows[0]!.id

        // Po lokaciji 1–4 uređaja, dok ne dođemo do ciljanog broja.
        const deviceCount = random.int(1, isCompany ? 4 : 2)

        for (let d = 0; d < deviceCount && devices.length < DEVICE_TARGET; d++) {
          const type = random.pick(deviceTypes)
          const typeCode = type.code as keyof typeof MANUFACTURERS
          const manufacturer = random.pick(MANUFACTURERS[typeCode])
          const model = random.pick(MODELS[typeCode])
          const interval = type.default_interval_months
          const plan = planByType.get(type.id)
          const price = plan ? Number(plan.price) : 80

          // Datum ugradnje: 1–6 godina unazad.
          const installedAt = addDays(today, -random.int(365, 2200))
          const warrantyEnd = addMonths(installedAt, random.pick([24, 36, 60]))

          /*
           * Raspored rokova je namjerno raznolik da demo pokaže sva stanja:
           *   ~8 %  kasni,
           *   ~18 % dospijeva u 30 dana,
           *   ~14 % dospijeva u 31–60 dana,
           *   ostalo dalje u budućnosti.
           */
          const bucket = random.next()
          const offsetDays =
            bucket < 0.08
              ? -random.int(1, 45)
              : bucket < 0.26
                ? random.int(0, 30)
                : bucket < 0.4
                  ? random.int(31, 60)
                  : random.int(61, 330)

          const nextServiceDate = addDays(today, offsetDays)
          const lastServiceDate = random.bool(0.72) ? addMonths(nextServiceDate, -interval) : null

          const { rows: deviceRows } = await client.query<{ id: string }>(
            `insert into public.devices
               (organization_id, customer_id, location_id, device_type_id, manufacturer, model,
                serial_number, installed_at, installer_name, warranty_start, warranty_end,
                service_interval_months, next_service_date, last_service_date,
                default_service_price, status, external_ref)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',$16)
             returning id`,
            [
              orgId,
              customerId,
              locationId,
              type.id,
              manufacturer,
              model,
              `${manufacturer.slice(0, 2).toUpperCase()}${random.int(10, 99)}-${random.int(100000, 999999)}`,
              installedAt,
              random.pick(['Damir Suljić', 'Nedim Karić', 'Vanjski izvođač']),
              installedAt,
              warrantyEnd,
              interval,
              nextServiceDate,
              lastServiceDate,
              price,
              `DEV-${String(devices.length + 1).padStart(4, '0')}`,
            ],
          )
          const deviceId = deviceRows[0]!.id

          // QR token. Prvi uređaj dobija čitljiv „demo“ token da javna
          // stranica na marketing sajtu uvijek radi.
          const rawToken = devices.length === 0 ? 'demo' : makeToken(random, 22)
          await client.query(
            `insert into public.qr_tokens (organization_id, device_id, token_hash, token_hint)
             values ($1,$2,$3,$4)`,
            [orgId, deviceId, hashToken(rawToken), rawToken.slice(0, 6)],
          )

          devices.push({
            id: deviceId,
            customerId,
            locationId,
            typeId: type.id,
            typeCode: type.code,
            nextServiceDate,
            lastServiceDate,
            price,
            qrToken: rawToken,
          })
        }
      }
    }

    /*
     * Dopuna do ciljanog broja uređaja.
     *
     * Petlja iznad prestaje kad potroši kupce, pa broj uređaja zna ostati
     * ispod cilja. Ovdje dodajemo preostale uređaje na postojeće lokacije —
     * u stvarnosti jedan kupac ionako često ima više jedinica.
     */
    if (devices.length < DEVICE_TARGET) {
      const { rows: locationPool } = await client.query<{ id: string; customer_id: string }>(
        `select id, customer_id from public.locations where organization_id = $1`,
        [orgId],
      )

      let poolIndex = 0
      while (devices.length < DEVICE_TARGET && locationPool.length > 0) {
        const location = locationPool[poolIndex % locationPool.length]!
        poolIndex += 1

        const type = random.pick(deviceTypes)
        const typeCode = type.code as keyof typeof MANUFACTURERS
        const manufacturer = random.pick(MANUFACTURERS[typeCode])
        const model = random.pick(MODELS[typeCode])
        const interval = type.default_interval_months
        const plan = planByType.get(type.id)
        const price = plan ? Number(plan.price) : 80

        const installedAt = addDays(today, -random.int(365, 2200))
        const warrantyEnd = addMonths(installedAt, random.pick([24, 36, 60]))

        const bucket = random.next()
        const offsetDays =
          bucket < 0.08
            ? -random.int(1, 45)
            : bucket < 0.26
              ? random.int(0, 30)
              : bucket < 0.4
                ? random.int(31, 60)
                : random.int(61, 330)

        const nextServiceDate = addDays(today, offsetDays)
        const lastServiceDate = random.bool(0.72) ? addMonths(nextServiceDate, -interval) : null

        const { rows: deviceRows } = await client.query<{ id: string }>(
          `insert into public.devices
             (organization_id, customer_id, location_id, device_type_id, manufacturer, model,
              serial_number, installed_at, installer_name, warranty_start, warranty_end,
              service_interval_months, next_service_date, last_service_date,
              default_service_price, status, external_ref)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',$16)
           returning id`,
          [
            orgId,
            location.customer_id,
            location.id,
            type.id,
            manufacturer,
            model,
            `${manufacturer.slice(0, 2).toUpperCase()}${random.int(10, 99)}-${random.int(100000, 999999)}`,
            installedAt,
            random.pick(['Damir Suljić', 'Nedim Karić', 'Vanjski izvođač']),
            installedAt,
            warrantyEnd,
            interval,
            nextServiceDate,
            lastServiceDate,
            price,
            `DEV-${String(devices.length + 1).padStart(4, '0')}`,
          ],
        )
        const deviceId = deviceRows[0]!.id

        const rawToken = makeToken(random, 22)
        await client.query(
          `insert into public.qr_tokens (organization_id, device_id, token_hash, token_hint)
           values ($1,$2,$3,$4)`,
          [orgId, deviceId, hashToken(rawToken), rawToken.slice(0, 6)],
        )

        devices.push({
          id: deviceId,
          customerId: location.customer_id,
          locationId: location.id,
          typeId: type.id,
          typeCode: type.code,
          nextServiceDate,
          lastServiceDate,
          price,
          qrToken: rawToken,
        })
      }
    }

    // --- Servisna historija --------------------------------------------------
    console.log('  Kreiranje servisne historije…')
    let workOrderSeq = 0
    let reportSeq = 0
    const year = Number(today.slice(0, 4))

    const devicesWithHistory = devices.filter((device) => device.lastServiceDate !== null)

    for (const device of devicesWithHistory.slice(0, 60)) {
      const technicianId = random.pick(techIdList)
      const serviceDate = device.lastServiceDate!
      workOrderSeq += 1

      const { rows: orderRows } = await client.query<{ id: string }>(
        `insert into public.work_orders
           (organization_id, code, customer_id, location_id, device_id, assigned_technician_id,
            status, service_type, service_price, labor_minutes, completed_at, started_at,
            next_service_date, customer_signature_name, technician_signature_name,
            customer_signed_at, technician_signed_at, report_status, recommendation)
         values ($1,$2,$3,$4,$5,$6,'completed','redovni_servis',$7,$8,$9,$9,$10,$11,$12,$9,$9,'none',$13)
         returning id`,
        [
          orgId,
          formatDocumentNumber('work_order', year, workOrderSeq),
          device.customerId,
          device.locationId,
          device.id,
          technicianId,
          device.price,
          random.int(35, 120),
          `${serviceDate}T09:00:00Z`,
          device.nextServiceDate,
          'Kupac',
          'Tehničar',
          random.pick(RECOMMENDATIONS),
        ],
      )
      const workOrderId = orderRows[0]!.id

      // Materijali
      const materialCount = random.int(0, 3)
      for (let m = 0; m < materialCount; m++) {
        const material = random.pick(MATERIALS)
        await client.query(
          `insert into public.work_order_materials
             (organization_id, work_order_id, name, sku, quantity, unit, unit_price)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            orgId,
            workOrderId,
            material.name,
            material.sku,
            random.int(1, 3),
            material.unit,
            material.unitPrice,
          ],
        )
      }

      const { rows: recordRows } = await client.query<{ id: string }>(
        `insert into public.service_records
           (organization_id, work_order_id, device_id, customer_id, location_id, technician_id,
            service_date, service_type, work_performed, recommendations, labor_minutes,
            service_price, previous_service_date, next_service_date)
         values ($1,$2,$3,$4,$5,$6,$7,'redovni_servis',$8,$9,$10,$11,$12,$13)
         returning id`,
        [
          orgId,
          workOrderId,
          device.id,
          device.customerId,
          device.locationId,
          technicianId,
          serviceDate,
          random.pick(SERVICE_NOTES),
          random.pick(RECOMMENDATIONS),
          random.int(35, 120),
          device.price,
          null,
          device.nextServiceDate,
        ],
      )

      reportSeq += 1
      /*
       * Izvještaj se zavodi kao `pending`, bez datoteke.
       *
       * Ograničenje `service_reports_ready_needs_file` ne dopušta status
       * "ready" bez stvarnog PDF-a — i to je ispravno: status u bazi mora
       * odgovarati stvarnosti. Seed ne generiše 60 PDF-ova; oni nastaju
       * na prvi otvor izvještaja (vidi services/reports/generate-report.ts).
       */
      await client.query(
        `insert into public.service_reports
           (organization_id, service_record_id, work_order_id, report_number, status)
         values ($1,$2,$3,$4,'pending')`,
        [
          orgId,
          recordRows[0]!.id,
          workOrderId,
          formatDocumentNumber('service_report', year, reportSeq),
        ],
      )
    }

    // --- Rezervacije ----------------------------------------------------------
    console.log('  Kreiranje rezervacija i radnih naloga u toku…')
    const upcomingDevices = devices.filter((device) => device.nextServiceDate >= today).slice(0, 14)
    let bookingSeq = 0

    for (const [index, device] of upcomingDevices.entries()) {
      bookingSeq += 1
      const daysAhead = random.int(2, 20)
      const bookingDate = addDays(today, daysAhead)
      const hour = random.pick(['08:00', '09:15', '10:30', '13:00', '14:15'])
      const startsAt = `${bookingDate}T${hour}:00+01:00`
      const assigned = index % 3 === 0 ? null : random.pick(techIdList)
      const status = index % 4 === 0 ? 'pending' : 'confirmed'

      const { rows: bookingRows } = await client.query<{ id: string }>(
        `insert into public.bookings
           (organization_id, customer_id, device_id, location_id, code, starts_at, ends_at,
            slot_index, status, source, assigned_technician_id, contact_email, customer_note)
         values ($1,$2,$3,$4,$5,$6::timestamptz, $6::timestamptz + interval '60 minutes',
                 $7,$8,$9,$10,$11,$12)
         on conflict do nothing
         returning id`,
        [
          orgId,
          device.customerId,
          device.id,
          device.locationId,
          formatDocumentNumber('booking', year, bookingSeq),
          startsAt,
          index % 5,
          status,
          index % 2 === 0 ? 'reminder' : 'qr',
          assigned,
          `kupac${index + 1}@primjer.ba`,
          random.bool(0.4) ? 'Molim poziv pola sata ranije.' : null,
        ],
      )

      // Iz dijela rezervacija nastaju otvoreni radni nalozi.
      if (bookingRows[0] && assigned && random.bool(0.6)) {
        workOrderSeq += 1
        await client.query(
          `insert into public.work_orders
             (organization_id, code, customer_id, location_id, device_id, booking_id,
              assigned_technician_id, status, priority, service_type, scheduled_start,
              scheduled_end, estimated_minutes, service_price)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'redovni_servis',$10::timestamptz,
                   $10::timestamptz + interval '60 minutes', 60, $11)`,
          [
            orgId,
            formatDocumentNumber('work_order', year, workOrderSeq),
            device.customerId,
            device.locationId,
            device.id,
            bookingRows[0].id,
            assigned,
            random.pick(['assigned', 'in_progress', 'waiting_part']),
            random.pick(['normal', 'normal', 'high']),
            startsAt,
            device.price,
          ],
        )
      }
    }

    // --- Prijave kvara --------------------------------------------------------
    console.log('  Kreiranje prijava kvara…')
    for (let index = 0; index < 9; index++) {
      const device = devices[index * 7]
      if (!device) continue
      const isUrgent = index < 3
      await client.query(
        `insert into public.issue_reports
           (organization_id, device_id, customer_id, location_id, code, category, description,
            error_code, still_operating, is_urgent, safety_risk, contact_email, status, source, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'public', now() - ($14 || ' days')::interval)`,
        [
          orgId,
          device.id,
          device.customerId,
          device.locationId,
          formatDocumentNumber('issue_report', year, index + 1),
          random.pick(['no_cooling', 'noise', 'leak', 'error_code', 'no_heating']),
          ISSUE_DESCRIPTIONS[index % ISSUE_DESCRIPTIONS.length]!,
          random.bool(0.3) ? `E${random.int(1, 9)}` : null,
          random.bool(0.6),
          isUrgent,
          false,
          `kupac${index + 1}@primjer.ba`,
          index < 5 ? 'new' : 'in_review',
          random.int(0, 12),
        ],
      )
    }

    // --- Podsjetnici (uključujući neuspjele) ---------------------------------
    console.log('  Kreiranje historije podsjetnika…')
    const { rows: ruleRows } = await client.query<{
      id: string
      offset_days: number
      template_key: string
    }>(
      `select id, offset_days, template_key from public.reminder_rules
       where organization_id = $1 and is_active order by offset_days`,
      [orgId],
    )

    let sentCount = 0
    let failedCount = 0

    for (const device of devices.slice(0, 70)) {
      for (const rule of ruleRows) {
        const sendDate = addDays(device.nextServiceDate, rule.offset_days)
        // Samo podsjetnici čiji je dan slanja već prošao.
        if (sendDate >= today) continue

        // Otprilike svaki dvanaesti pokušaj nije uspio — demo mora
        // pokazati i to stanje, jer je ono operativno najvažnije.
        const failed = (sentCount + failedCount) % 12 === 11

        await client.query(
          `insert into public.reminder_events
             (organization_id, device_id, customer_id, rule_id, due_date, offset_days,
              scheduled_for, channel, template_key, status, attempt_count, recipient_email,
              subject, sent_at, failed_at, last_error)
           values ($1,$2,$3,$4,$5,$6,$7,'email',$8,$9,$10,$11,$12,$13,$14,$15)
           on conflict (device_id, rule_id, due_date) do nothing`,
          [
            orgId,
            device.id,
            device.customerId,
            rule.id,
            device.nextServiceDate,
            rule.offset_days,
            sendDate,
            rule.template_key,
            failed ? 'failed' : 'sent',
            failed ? 3 : 1,
            `kupac@primjer.ba`,
            `Servis dospijeva ${device.nextServiceDate}`,
            failed ? null : `${sendDate}T06:05:00Z`,
            failed ? `${sendDate}T06:05:00Z` : null,
            failed ? 'Invalid recipient address: mailbox does not exist' : null,
          ],
        )

        if (failed) failedCount += 1
        else sentCount += 1
      }
    }

    // --- Obavijesti -----------------------------------------------------------
    await client.query(
      `insert into public.notification_events
         (organization_id, type, title, body, link_path, severity)
       values
         ($1,'reminder_failed','Podsjetnik nije poslan','Slanje na adresu kupca nije uspjelo — provjerite kontakt podatke.','/app/podsjetnici','critical'),
         ($1,'issue_urgent','Hitna prijava kvara','Rashladna vitrina ne drži temperaturu.','/app/prijave-kvara','critical'),
         ($1,'booking_created','Nova rezervacija','Kupac je rezervisao termin preko QR koda.','/app/rezervacije','info')`,
      [orgId],
    )

    await client.query(
      `insert into public.audit_events
         (organization_id, actor_label, action, entity_type, entity_id, summary)
       values ($1, 'sistem: seed', 'demo.seeded', 'organization', $1, 'Kreirani demo podaci')`,
      [orgId],
    )

    await client.query('commit')

    // --- Sažetak ---------------------------------------------------------------
    const { rows: locationCountRows } = await client.query<{ count: string }>(
      `select count(*)::text as count from public.locations where organization_id = $1`,
      [orgId],
    )
    const locationCountTotal = locationCountRows[0]?.count ?? '0'
    const demoDevice = devices[0]!
    console.log(`
  Demo organizacija je spremna.

  Firma:        ${DEMO_ORG.name}
  Kupci:        ${customerIds.length}
  Lokacije:     ${locationCountTotal}
  Uređaji:      ${devices.length}
  Servisi:      ${devicesWithHistory.slice(0, 60).length}
  Rezervacije:  ${upcomingDevices.length}
  Podsjetnici:  ${sentCount} poslanih, ${failedCount} neuspjelih
  Prijave:      9

  Javna stranica uređaja:  /u/${demoDevice.qrToken}

  Prijava (nakon kreiranja lozinki u Supabase Auth):
${DEMO_USERS.map((user) => `    ${user.role.padEnd(11)} ${user.email}`).join('\n')}

  NAPOMENA: skripta kreira redove u bazi. Lozinke za prijavu postavljaju se
  kroz Supabase Auth — upute su u docs/SUPABASE_SETUP.md, dio "Demo korisnici".
`)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
