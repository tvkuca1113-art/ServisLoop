import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'
import { calculateRevenueOpportunity, reminderConversionRate } from '@/domains/analytics/revenue'
import { addDays, startOfMonth, todayInTimeZone, type PlainDate } from '@/domains/shared/plain-date'

/**
 * Podaci za početnu stranicu aplikacije.
 *
 * Dashboard mora odgovoriti na dva pitanja vlasnika:
 *   „Koliko novca stoji u opremi koju već imam?“
 *   „Šta danas moram uraditi da se to ne izgubi?“
 *
 * Zato su metrike vezane za prihod i za konkretne redove čekanja, a ne
 * dekorativni grafikoni.
 */

export interface DashboardQueue {
  key: string
  label: string
  count: number
  href: string
  tone: 'info' | 'warning' | 'danger'
  /** Objašnjenje zašto ova stavka traži pažnju. */
  hint: string
}

export interface DashboardData {
  today: PlainDate
  metrics: {
    dueIn30: number
    dueIn60: number
    overdue: number
    remindersSent30d: number
    bookingsFromReminders30d: number
    completedThisMonth: number
    devicesWithoutContact: number
    devicesWithoutInterval: number
    failedReminders: number
    openIssues: number
    activeDevices: number
  }
  revenue: {
    potentialKm: number
    bookedKm: number
    completedKm: number
    devicesWithoutPrice: number
    conversionRate: number | null
  }
  queues: DashboardQueue[]
  upcoming: Array<{
    id: string
    deviceLabel: string
    customerName: string
    city: string | null
    nextServiceDate: PlainDate
    priceKm: number | null
  }>
}

export async function loadDashboard(
  organizationId: string,
  timeZone: string,
): Promise<DashboardData> {
  const supabase = await createServerSupabase()
  const today = todayInTimeZone(timeZone)
  const in30 = addDays(today, 30)
  const in60 = addDays(today, 60)
  const monthStart = startOfMonth(today)
  const last30 = addDays(today, -30)

  const [
    dueIn30Rows,
    dueIn60Count,
    overdueRows,
    remindersSent,
    bookingsFromReminders,
    completedThisMonth,
    withoutContact,
    withoutInterval,
    failedReminders,
    openIssues,
    activeDevices,
    scheduledBookings,
    unassignedBookings,
    overdueWorkOrders,
    todayWorkOrders,
  ] = await Promise.all([
    // Uređaji kojima rok pada u narednih 30 dana — treba nam i cijena.
    supabase
      .from('devices')
      .select(
        'id, next_service_date, default_service_price, manufacturer, model, customers!inner(name, company_name), locations(city), device_types(name)',
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('status', 'active')
      .gte('next_service_date', today)
      .lte('next_service_date', in30)
      .order('next_service_date', { ascending: true }),

    supabase
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('status', 'active')
      .gt('next_service_date', in30)
      .lte('next_service_date', in60),

    supabase
      .from('devices')
      .select('id, default_service_price')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('status', 'active')
      .lt('next_service_date', today),

    supabase
      .from('reminder_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'sent')
      .gte('scheduled_for', last30),

    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('source', 'reminder')
      .gte('created_at', `${last30}T00:00:00Z`),

    supabase
      .from('service_records')
      .select('id, service_price')
      .eq('organization_id', organizationId)
      .gte('service_date', monthStart),

    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .is('email', null),

    supabase
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('status', 'active')
      .is('service_interval_months', null),

    supabase
      .from('reminder_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'failed'),

    supabase
      .from('issue_reports')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', ['new', 'in_review']),

    supabase
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('status', 'active'),

    supabase
      .from('bookings')
      .select('id, devices(default_service_price)')
      .eq('organization_id', organizationId)
      .in('status', ['pending', 'confirmed', 'rescheduled'])
      .gte('starts_at', new Date().toISOString()),

    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', ['pending', 'confirmed'])
      .is('assigned_technician_id', null),

    supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .not('status', 'in', '(completed,cancelled)')
      .lt('scheduled_start', new Date().toISOString()),

    supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .not('status', 'in', '(completed,cancelled)')
      .gte('scheduled_start', `${today}T00:00:00Z`)
      .lte('scheduled_start', `${today}T23:59:59Z`),
  ])

  const dueDevices = dueIn30Rows.data ?? []
  const overdueDevices = overdueRows.data ?? []
  const completedRecords = completedThisMonth.data ?? []

  const revenue = calculateRevenueOpportunity({
    dueDevices: [...dueDevices, ...overdueDevices].map((device) => ({
      servicePriceKm: device.default_service_price,
    })),
    scheduledServices: (scheduledBookings.data ?? []).map((booking) => {
      const device = booking.devices as unknown as { default_service_price: number | null } | null
      return { priceKm: device?.default_service_price ?? null }
    }),
    completedServices: completedRecords.map((record) => ({ priceKm: record.service_price })),
    fallbackPriceKm: 80,
  })

  const remindersSentCount = remindersSent.count ?? 0
  const bookingsFromRemindersCount = bookingsFromReminders.count ?? 0

  const queues: DashboardQueue[] = ([
    {
      key: 'failed_reminders',
      label: 'Neuspjeli podsjetnici',
      count: failedReminders.count ?? 0,
      href: '/app/podsjetnici?status=failed',
      tone: 'danger',
      hint: 'Kupac NIJE obaviješten. Provjerite adresu i pošaljite ponovo.',
    },
    {
      key: 'open_issues',
      label: 'Prijave kvara bez odgovora',
      count: openIssues.count ?? 0,
      href: '/app/prijave-kvara',
      tone: 'danger',
      hint: 'Kupac čeka odgovor na prijavljeni problem.',
    },
    {
      key: 'overdue_work_orders',
      label: 'Radni nalozi koji kasne',
      count: overdueWorkOrders.count ?? 0,
      href: '/app/radni-nalozi?filter=overdue',
      tone: 'danger',
      hint: 'Zakazani termin je prošao, a nalog nije zatvoren.',
    },
    {
      key: 'unassigned_bookings',
      label: 'Rezervacije bez tehničara',
      count: unassignedBookings.count ?? 0,
      href: '/app/rezervacije?filter=unassigned',
      tone: 'warning',
      hint: 'Termin je dogovoren, ali niko nije zadužen.',
    },
    {
      key: 'today_work_orders',
      label: 'Radni nalozi za danas',
      count: todayWorkOrders.count ?? 0,
      href: '/app/radni-nalozi?filter=today',
      tone: 'info',
      hint: 'Zakazano za današnji dan.',
    },
    {
      key: 'missing_contact',
      label: 'Kupci bez kontakt podataka',
      count: withoutContact.count ?? 0,
      href: '/app/kupci?filter=bez-kontakta',
      tone: 'warning',
      hint: 'Bez e-mail adrese podsjetnik ne može otići — to je izgubljen prihod.',
    },
    {
      key: 'missing_interval',
      label: 'Uređaji bez servisnog intervala',
      count: withoutInterval.count ?? 0,
      href: '/app/uredaji?filter=bez-intervala',
      tone: 'warning',
      hint: 'Bez intervala sistem ne zna kada je sljedeći servis.',
    },
  ] satisfies DashboardQueue[]).filter((queue) => queue.count > 0)

  return {
    today,
    metrics: {
      dueIn30: dueDevices.length,
      dueIn60: dueIn60Count.count ?? 0,
      overdue: overdueDevices.length,
      remindersSent30d: remindersSentCount,
      bookingsFromReminders30d: bookingsFromRemindersCount,
      completedThisMonth: completedRecords.length,
      devicesWithoutContact: withoutContact.count ?? 0,
      devicesWithoutInterval: withoutInterval.count ?? 0,
      failedReminders: failedReminders.count ?? 0,
      openIssues: openIssues.count ?? 0,
      activeDevices: activeDevices.count ?? 0,
    },
    revenue: {
      potentialKm: revenue.potentialKm,
      bookedKm: revenue.bookedKm,
      completedKm: revenue.completedKm,
      devicesWithoutPrice: revenue.devicesWithoutPrice,
      conversionRate: reminderConversionRate(remindersSentCount, bookingsFromRemindersCount),
    },
    queues,
    upcoming: dueDevices.slice(0, 8).map((device) => {
      const customer = device.customers as unknown as {
        name: string
        company_name: string | null
      } | null
      const location = device.locations as unknown as { city: string | null } | null
      const deviceType = device.device_types as unknown as { name: string } | null

      return {
        id: device.id,
        deviceLabel:
          [deviceType?.name, device.manufacturer, device.model].filter(Boolean).join(' · ') ||
          'Uređaj',
        customerName: customer ? customer.company_name || customer.name : 'Nepoznat kupac',
        city: location?.city ?? null,
        nextServiceDate: device.next_service_date as PlainDate,
        priceKm: device.default_service_price,
      }
    }),
  }
}
