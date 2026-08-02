import { NextResponse, type NextRequest } from 'next/server'
import { requireOrgContext } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { can } from '@/domains/auth/permissions'
import { formatDate, formatDateTime, maskSerial } from '@/lib/format'
import type { PlainDate } from '@/domains/shared/plain-date'

/**
 * Pretraga kroz cijelu organizaciju.
 *
 * Sigurnosne napomene:
 *   • koristi se KORISNIČKI Supabase klijent, pa RLS ograničava rezultate na
 *     organizaciju u kojoj je korisnik član — pretraga ne može „procuriti“
 *     tuđe podatke ni kad bi upit bio pogrešno napisan;
 *   • dodatno filtriramo po `organizationId` iz sesije, kao druga brana;
 *   • tehničar ne dobija rezultate koje po ulozi ne smije vidjeti.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PER_TYPE = 5

export async function GET(request: NextRequest) {
  const context = await requireOrgContext()

  const query = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  // Ograničavamo dužinu da neko ne pošalje ogroman uzorak za pretragu.
  const term = query.slice(0, 80)
  const pattern = `%${term.replace(/[%_]/g, (match) => `\\${match}`)}%`

  const supabase = await createServerSupabase()
  const results: Array<{
    id: string
    type: string
    title: string
    subtitle: string | null
    href: string
  }> = []

  // --- Kupci ---------------------------------------------------------------
  if (can(context.role, 'customers.view')) {
    const { data } = await supabase
      .from('customers')
      .select('id, name, company_name, email, phone, city:locations(city)')
      .eq('organization_id', context.organizationId)
      .is('deleted_at', null)
      .or(
        `name.ilike.${pattern},company_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
      )
      .limit(MAX_PER_TYPE)

    for (const row of data ?? []) {
      results.push({
        id: row.id,
        type: 'customer',
        title: row.company_name || row.name,
        subtitle: [row.email, row.phone].filter(Boolean).join(' · ') || null,
        href: `/app/kupci/${row.id}`,
      })
    }
  }

  // --- Uređaji (uključujući serijski broj) ---------------------------------
  if (can(context.role, 'devices.view')) {
    const { data } = await supabase
      .from('devices')
      .select(
        'id, manufacturer, model, serial_number, next_service_date, customers(name, company_name)',
      )
      .eq('organization_id', context.organizationId)
      .is('deleted_at', null)
      .or(
        `manufacturer.ilike.${pattern},model.ilike.${pattern},serial_number.ilike.${pattern},asset_number.ilike.${pattern}`,
      )
      .limit(MAX_PER_TYPE)

    for (const row of data ?? []) {
      const customer = row.customers as unknown as {
        name: string
        company_name: string | null
      } | null
      results.push({
        id: row.id,
        type: 'device',
        title: [row.manufacturer, row.model].filter(Boolean).join(' ') || 'Uređaj',
        subtitle:
          [
            customer ? customer.company_name || customer.name : null,
            row.serial_number ? maskSerial(row.serial_number) : null,
            row.next_service_date
              ? `servis ${formatDate(row.next_service_date as PlainDate)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
        href: `/app/uredaji/${row.id}`,
      })
    }
  }

  // --- Lokacije ------------------------------------------------------------
  if (can(context.role, 'locations.view')) {
    const { data } = await supabase
      .from('locations')
      .select('id, label, address, city, customers(name, company_name)')
      .eq('organization_id', context.organizationId)
      .is('deleted_at', null)
      .or(`label.ilike.${pattern},address.ilike.${pattern},city.ilike.${pattern}`)
      .limit(MAX_PER_TYPE)

    for (const row of data ?? []) {
      const customer = row.customers as unknown as {
        name: string
        company_name: string | null
      } | null
      results.push({
        id: row.id,
        type: 'location',
        title: row.label,
        subtitle:
          [customer ? customer.company_name || customer.name : null, row.address, row.city]
            .filter(Boolean)
            .join(', ') || null,
        href: `/app/lokacije/${row.id}`,
      })
    }
  }

  // --- Rezervacije ---------------------------------------------------------
  if (can(context.role, 'bookings.view')) {
    const { data } = await supabase
      .from('bookings')
      .select('id, code, starts_at, status, customers(name, company_name)')
      .eq('organization_id', context.organizationId)
      .ilike('code', pattern)
      .limit(MAX_PER_TYPE)

    for (const row of data ?? []) {
      const customer = row.customers as unknown as {
        name: string
        company_name: string | null
      } | null
      results.push({
        id: row.id,
        type: 'booking',
        title: row.code,
        subtitle:
          [
            customer ? customer.company_name || customer.name : null,
            formatDateTime(row.starts_at, context.timeZone),
          ]
            .filter(Boolean)
            .join(' · ') || null,
        href: `/app/rezervacije/${row.id}`,
      })
    }
  }

  // --- Radni nalozi --------------------------------------------------------
  // Tehničar ovdje ne dobija sve naloge: RLS politika `work_orders_select`
  // propušta samo one koji su njemu dodijeljeni.
  {
    const { data } = await supabase
      .from('work_orders')
      .select('id, code, status, scheduled_start, customers(name, company_name)')
      .eq('organization_id', context.organizationId)
      .ilike('code', pattern)
      .limit(MAX_PER_TYPE)

    for (const row of data ?? []) {
      const customer = row.customers as unknown as {
        name: string
        company_name: string | null
      } | null
      results.push({
        id: row.id,
        type: 'work_order',
        title: row.code,
        subtitle:
          [
            customer ? customer.company_name || customer.name : null,
            row.scheduled_start ? formatDateTime(row.scheduled_start, context.timeZone) : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
        href: `/app/radni-nalozi/${row.id}`,
      })
    }
  }

  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } })
}
