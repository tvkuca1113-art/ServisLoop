import { describe, expect, it } from 'vitest'
import { createTestOrg, db, pool } from './setup'

/**
 * Provjera garancija koje daje BAZA, ne aplikacijski kod.
 *
 * Ovo su tvrdnje koje proizvod javno obećava:
 *   • kupac nikad ne dobija isti podsjetnik dvaput;
 *   • dva kupca ne mogu rezervisati isti termin;
 *   • dva dokumenta ne mogu dobiti isti broj;
 *   • organizacija ne može ostati bez vlasnika.
 *
 * Jedinični testovi provjeravaju logiku odlučivanja. Ovi testovi provjeravaju
 * da ograničenja u bazi zaista drže i kad logika zakaže ili kad dva zahtjeva
 * stignu istovremeno.
 */

describe('★ podsjetnik se ne može poslati dvaput', () => {
  it('jedinstveni indeks odbija duplikat (uređaj + pravilo + rok)', async () => {
    const org = await createTestOrg('2026-04-15')
    const client = db()
    const ruleId = org.ruleIds[0]!

    const insertReminder = () =>
      client.query(
        `insert into public.reminder_events
           (organization_id, device_id, customer_id, rule_id, due_date, offset_days,
            scheduled_for, template_key, status, recipient_email)
         values ($1,$2,$3,$4,'2026-04-15',-30,'2026-03-16','service_reminder','pending',$5)`,
        [org.id, org.deviceId, org.customerId, ruleId, 'kupac@primjer.test'],
      )

    await expect(insertReminder()).resolves.toBeDefined()
    // Drugi pokušaj — tačno ono što se desi kad cron krene dvaput.
    await expect(insertReminder()).rejects.toThrow(/duplicate key|unique/i)

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from public.reminder_events
       where device_id = $1 and rule_id = $2 and due_date = '2026-04-15'`,
      [org.deviceId, ruleId],
    )
    expect(rows[0]?.count).toBe('1')
  })

  it('isti uređaj SMIJE dobiti podsjetnik za drugi rok', async () => {
    const org = await createTestOrg('2026-04-15')
    const client = db()
    const ruleId = org.ruleIds[0]!

    for (const dueDate of ['2026-04-15', '2027-04-15']) {
      await client.query(
        `insert into public.reminder_events
           (organization_id, device_id, customer_id, rule_id, due_date, offset_days,
            scheduled_for, template_key, status, recipient_email)
         values ($1,$2,$3,$4,$5,-30,'2026-03-16','service_reminder','pending','a@primjer.test')`,
        [org.id, org.deviceId, org.customerId, ruleId, dueDate],
      )
    }

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from public.reminder_events where device_id = $1`,
      [org.deviceId],
    )
    expect(rows[0]?.count).toBe('2')
  })

  it('isti rok SMIJE imati podsjetnike po različitim pravilima', async () => {
    const org = await createTestOrg('2026-04-15')
    const client = db()

    for (const [index, ruleId] of org.ruleIds.slice(0, 3).entries()) {
      await client.query(
        `insert into public.reminder_events
           (organization_id, device_id, customer_id, rule_id, due_date, offset_days,
            scheduled_for, template_key, status, recipient_email)
         values ($1,$2,$3,$4,'2026-04-15',$5,'2026-03-16','service_reminder','pending','a@primjer.test')`,
        [org.id, org.deviceId, org.customerId, ruleId, -30 + index],
      )
    }

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from public.reminder_events where device_id = $1`,
      [org.deviceId],
    )
    expect(rows[0]?.count).toBe('3')
  })

  it('neuspjeli podsjetnik mora imati zapisan razlog', async () => {
    const org = await createTestOrg('2026-04-15')
    const client = db()

    await expect(
      client.query(
        `insert into public.reminder_events
           (organization_id, device_id, customer_id, rule_id, due_date, offset_days,
            scheduled_for, template_key, status, recipient_email)
         values ($1,$2,$3,$4,'2026-04-15',-30,'2026-03-16','service_reminder','failed','a@primjer.test')`,
        [org.id, org.deviceId, org.customerId, org.ruleIds[0]],
      ),
    ).rejects.toThrow(/reminder_events_failed_needs_reason|check/i)
  })

  it('podsjetnik označen kao poslan mora imati vrijeme slanja', async () => {
    const org = await createTestOrg('2026-04-15')
    const client = db()

    await expect(
      client.query(
        `insert into public.reminder_events
           (organization_id, device_id, customer_id, rule_id, due_date, offset_days,
            scheduled_for, template_key, status, recipient_email)
         values ($1,$2,$3,$4,'2026-04-15',-30,'2026-03-16','service_reminder','sent','a@primjer.test')`,
        [org.id, org.deviceId, org.customerId, org.ruleIds[0]],
      ),
    ).rejects.toThrow(/reminder_events_sent_needs_time|check/i)
  })
})

describe('★ dnevni posao se ne može pokrenuti dvaput za isti dan', () => {
  it('cron_runs ima jedinstveni (job, run_date)', async () => {
    const client = db()
    const runDate = '2026-05-01'

    await client.query(`insert into public.cron_runs (job, run_date) values ('test-job', $1)`, [
      runDate,
    ])

    await expect(
      client.query(`insert into public.cron_runs (job, run_date) values ('test-job', $1)`, [
        runDate,
      ]),
    ).rejects.toThrow(/duplicate key|unique/i)
  })

  it('kampanja podsjetnika je jedinstvena po organizaciji i danu', async () => {
    const org = await createTestOrg()
    const client = db()

    await client.query(
      `insert into public.reminder_campaigns (organization_id, run_date) values ($1, '2026-05-01')`,
      [org.id],
    )

    await expect(
      client.query(
        `insert into public.reminder_campaigns (organization_id, run_date) values ($1, '2026-05-01')`,
        [org.id],
      ),
    ).rejects.toThrow(/duplicate key|unique/i)
  })
})

describe('★ isti termin ne mogu zauzeti dvije rezervacije', () => {
  it('jedinstveni indeks čuva mjesto u terminu', async () => {
    const org = await createTestOrg()
    const client = db()
    const startsAt = '2026-05-12T08:00:00+02:00'

    const insertBooking = (code: string, slotIndex: number) =>
      client.query(
        `insert into public.bookings
           (organization_id, customer_id, device_id, code, starts_at, ends_at, slot_index, status)
         values ($1,$2,$3,$4,$5::timestamptz, $5::timestamptz + interval '60 min', $6, 'confirmed')`,
        [org.id, org.customerId, org.deviceId, code, startsAt, slotIndex],
      )

    await expect(insertBooking('RZ-1', 0)).resolves.toBeDefined()
    // Drugi zahtjev za isti termin i isto mjesto — mora pasti.
    await expect(insertBooking('RZ-2', 0)).rejects.toThrow(/duplicate key|unique/i)
    // Drugo mjesto u istom terminu je dozvoljeno (kapacitet > 1).
    await expect(insertBooking('RZ-3', 1)).resolves.toBeDefined()
  })

  it('otkazana rezervacija oslobađa termin', async () => {
    const org = await createTestOrg()
    const client = db()
    const startsAt = '2026-05-13T08:00:00+02:00'

    await client.query(
      `insert into public.bookings
         (organization_id, customer_id, code, starts_at, ends_at, slot_index, status, cancelled_at)
       values ($1,$2,'RZ-C1',$3::timestamptz, $3::timestamptz + interval '60 min', 0, 'cancelled', now())`,
      [org.id, org.customerId, startsAt],
    )

    // Isti termin je opet slobodan jer indeks pokriva samo aktivne statuse.
    await expect(
      client.query(
        `insert into public.bookings
           (organization_id, customer_id, code, starts_at, ends_at, slot_index, status)
         values ($1,$2,'RZ-C2',$3::timestamptz, $3::timestamptz + interval '60 min', 0, 'confirmed')`,
        [org.id, org.customerId, startsAt],
      ),
    ).resolves.toBeDefined()
  })

  it('tehničar ne može biti na dva mjesta istovremeno', async () => {
    const org = await createTestOrg()
    const client = db()
    const startsAt = '2026-05-14T08:00:00+02:00'

    await client.query(
      `insert into public.bookings
         (organization_id, customer_id, code, starts_at, ends_at, slot_index, status, assigned_technician_id)
       values ($1,$2,'RZ-T1',$3::timestamptz, $3::timestamptz + interval '60 min', 0, 'confirmed', $4)`,
      [org.id, org.customerId, startsAt, org.technicianId],
    )

    await expect(
      client.query(
        `insert into public.bookings
           (organization_id, customer_id, code, starts_at, ends_at, slot_index, status, assigned_technician_id)
         values ($1,$2,'RZ-T2',$3::timestamptz, $3::timestamptz + interval '60 min', 1, 'confirmed', $4)`,
        [org.id, org.customerId, startsAt, org.technicianId],
      ),
    ).rejects.toThrow(/duplicate key|unique/i)
  })
})

describe('★ brojevi dokumenata su jedinstveni i atomarni', () => {
  it('uzastopni pozivi daju rastuće brojeve', async () => {
    const org = await createTestOrg()
    const client = db()

    const values: number[] = []
    for (let i = 0; i < 5; i++) {
      const { rows } = await client.query<{ next: number }>(
        `select app.next_document_number($1, 'service_report', 2027::smallint) as next`,
        [org.id],
      )
      values.push(rows[0]!.next)
    }

    expect(values).toEqual([1, 2, 3, 4, 5])
  })

  it('istovremeni zahtjevi ne dobijaju isti broj', async () => {
    const org = await createTestOrg()

    /*
     * Deset ZAISTA istovremenih poziva preko odvojenih veza.
     * Jedan `Client` bi upite serijalizovao i test ne bi ništa dokazao —
     * pool otvara više veza koje se stvarno preklapaju u bazi.
     */
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        pool().query<{ next: number }>(
          `select app.next_document_number($1, 'work_order', 2027::smallint) as next`,
          [org.id],
        ),
      ),
    )

    const numbers = results.map((result) => result.rows[0]!.next)
    expect(new Set(numbers).size).toBe(10)
  })

  it('brojači su odvojeni po organizaciji', async () => {
    const orgA = await createTestOrg()
    const orgB = await createTestOrg()
    const client = db()

    const { rows: first } = await client.query<{ next: number }>(
      `select app.next_document_number($1, 'booking', 2027::smallint) as next`,
      [orgA.id],
    )
    const { rows: second } = await client.query<{ next: number }>(
      `select app.next_document_number($1, 'booking', 2027::smallint) as next`,
      [orgB.id],
    )

    // Nijedna firma ne može iz svog broja zaključiti koliko sistem ima korisnika.
    expect(first[0]?.next).toBe(1)
    expect(second[0]?.next).toBe(1)
  })
})

describe('★ zaštita podataka organizacije', () => {
  it('organizacija ne može ostati bez aktivnog vlasnika', async () => {
    const org = await createTestOrg()
    const client = db()

    await expect(
      client.query(
        `delete from public.organization_members where organization_id = $1 and role = 'owner'`,
        [org.id],
      ),
    ).rejects.toThrow(/barem jednog aktivnog vlasnika/)
  })

  it('ali cijela organizacija se MOŽE obrisati', async () => {
    const org = await createTestOrg()
    const client = db()

    await expect(
      client.query(`delete from public.organizations where id = $1`, [org.id]),
    ).resolves.toBeDefined()

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from public.devices where organization_id = $1`,
      [org.id],
    )
    // Kaskada je uklonila i sve vezane zapise.
    expect(rows[0]?.count).toBe('0')
  })

  it('serijski broj je jedinstven unutar organizacije, ali ne globalno', async () => {
    const orgA = await createTestOrg()
    const orgB = await createTestOrg()
    const client = db()

    const serial = 'ZAJEDNICKI-SN-001'

    await client.query(
      `insert into public.devices (organization_id, customer_id, serial_number) values ($1,$2,$3)`,
      [orgA.id, orgA.customerId, serial],
    )

    // Druga firma smije imati isti serijski broj — to su različiti uređaji.
    await expect(
      client.query(
        `insert into public.devices (organization_id, customer_id, serial_number) values ($1,$2,$3)`,
        [orgB.id, orgB.customerId, serial],
      ),
    ).resolves.toBeDefined()

    // Ista firma ne smije imati duplikat.
    await expect(
      client.query(
        `insert into public.devices (organization_id, customer_id, serial_number) values ($1,$2,$3)`,
        [orgA.id, orgA.customerId, serial.toLowerCase()],
      ),
    ).rejects.toThrow(/duplicate key|unique/i)
  })
})

describe('zadane vrijednosti nove organizacije', () => {
  it('nova firma odmah ima vrste opreme, planove, podsjetnike i čeklistu', async () => {
    const org = await createTestOrg()
    const client = db()

    const counts = await Promise.all(
      ['device_types', 'service_plan_templates', 'reminder_rules', 'checklist_templates'].map(
        (table) =>
          client.query<{ count: string }>(
            `select count(*)::text as count from public.${table} where organization_id = $1`,
            [org.id],
          ),
      ),
    )

    expect(Number(counts[0]!.rows[0]!.count)).toBe(7)
    expect(Number(counts[1]!.rows[0]!.count)).toBe(5)
    expect(Number(counts[2]!.rows[0]!.count)).toBe(5)
    expect(Number(counts[3]!.rows[0]!.count)).toBe(1)

    const { rows: items } = await client.query<{ count: string }>(
      `select count(*)::text as count from public.checklist_template_items where organization_id = $1`,
      [org.id],
    )
    expect(Number(items[0]!.count)).toBe(12)
  })

  it('ponovni poziv ništa ne duplira', async () => {
    const org = await createTestOrg()
    const client = db()

    await client.query('select app.seed_organization_defaults($1)', [org.id])
    await client.query('select app.seed_organization_defaults($1)', [org.id])

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from public.device_types where organization_id = $1`,
      [org.id],
    )
    expect(rows[0]?.count).toBe('7')
  })

  it('nova firma dobija 30 dana probnog perioda', async () => {
    const org = await createTestOrg()
    const client = db()

    const { rows } = await client.query<{
      plan_code: string
      status: string
      trial_ends_on: string
    }>(
      `select plan_code, status, trial_ends_on from public.organization_subscriptions
       where organization_id = $1`,
      [org.id],
    )

    expect(rows[0]?.plan_code).toBe('trial')
    expect(rows[0]?.status).toBe('trialing')
    expect(rows[0]?.trial_ends_on).toBeTruthy()
  })

  it('materijali automatski ažuriraju ukupan iznos naloga', async () => {
    const org = await createTestOrg()
    const client = db()

    const { rows: orderRows } = await client.query<{ id: string }>(
      `insert into public.work_orders (organization_id, code, customer_id)
       values ($1, 'RN-MAT-1', $2) returning id`,
      [org.id, org.customerId],
    )
    const orderId = orderRows[0]!.id

    await client.query(
      `insert into public.work_order_materials
         (organization_id, work_order_id, name, quantity, unit_price)
       values ($1,$2,'Filter',2,18.5), ($1,$2,'Crijevo',3,4.2)`,
      [org.id, orderId],
    )

    const { rows } = await client.query<{ materials_total: string }>(
      `select materials_total from public.work_orders where id = $1`,
      [orderId],
    )
    // 2 × 18,50 + 3 × 4,20 = 49,60
    expect(Number(rows[0]!.materials_total)).toBeCloseTo(49.6, 2)
  })
})
