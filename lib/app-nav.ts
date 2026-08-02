import type { Permission } from '@/domains/auth/permissions'

/**
 * Struktura navigacije aplikacije.
 *
 * Svaka stavka nosi dozvolu koja je potrebna da bi se vidjela. Sakrivanje
 * stavke je udobnost — stvarna zaštita je provjera na serverskoj strani svake
 * rute i RLS u bazi. Tehničar koji ručno upiše `/app/postavke/pretplata`
 * dobija poruku o nedostatku ovlaštenja, ne podatke.
 */

export interface NavItem {
  href: string
  label: string
  icon: string
  permission: Permission
  /** Prikazuje brojač neriješenih stavki. */
  badgeKey?: 'bookings' | 'issues' | 'workOrders' | 'failedReminders'
  /** Točno podudaranje putanje umjesto prefiksa. */
  exact?: boolean
}

export interface NavGroup {
  label: string | null
  items: NavItem[]
}

export const APP_NAV: NavGroup[] = [
  {
    label: null,
    items: [
      {
        href: '/app/pregled',
        label: 'Pregled',
        icon: 'LayoutDashboard',
        permission: 'organization.view',
        exact: true,
      },
    ],
  },
  {
    label: 'Baza',
    items: [
      { href: '/app/kupci', label: 'Kupci', icon: 'Users', permission: 'customers.view' },
      { href: '/app/lokacije', label: 'Lokacije', icon: 'MapPin', permission: 'locations.view' },
      { href: '/app/uredaji', label: 'Uređaji', icon: 'Wrench', permission: 'devices.view' },
      {
        href: '/app/servisni-planovi',
        label: 'Servisni planovi',
        icon: 'CalendarRange',
        permission: 'service_plans.view',
      },
    ],
  },
  {
    label: 'Rad',
    items: [
      {
        href: '/app/rezervacije',
        label: 'Rezervacije',
        icon: 'CalendarCheck',
        permission: 'bookings.view',
        badgeKey: 'bookings',
      },
      {
        href: '/app/radni-nalozi',
        label: 'Radni nalozi',
        icon: 'ClipboardList',
        permission: 'work_orders.view_assigned',
        badgeKey: 'workOrders',
      },
      {
        href: '/app/prijave-kvara',
        label: 'Prijave kvara',
        icon: 'TriangleAlert',
        permission: 'issues.view',
        badgeKey: 'issues',
      },
      {
        href: '/app/tehnicari',
        label: 'Tehničari',
        icon: 'HardHat',
        permission: 'technicians.view',
      },
    ],
  },
  {
    label: 'Automatika',
    items: [
      {
        href: '/app/podsjetnici',
        label: 'Podsjetnici',
        icon: 'BellRing',
        permission: 'reminders.view',
        badgeKey: 'failedReminders',
      },
      {
        href: '/app/izvjestaji',
        label: 'Izvještaji',
        icon: 'ChartNoAxesColumn',
        permission: 'reports.view_operational',
      },
      { href: '/app/uvoz', label: 'Uvoz podataka', icon: 'Upload', permission: 'import.run' },
    ],
  },
]

export const SETTINGS_NAV: NavItem[] = [
  {
    href: '/app/postavke/organizacija',
    label: 'Organizacija',
    icon: 'Building2',
    permission: 'organization.view',
  },
  {
    href: '/app/postavke/tim',
    label: 'Tim',
    icon: 'Users',
    permission: 'team.view',
  },
  {
    href: '/app/postavke/obavijesti',
    label: 'Obavijesti',
    icon: 'Bell',
    permission: 'notifications.view',
  },
  {
    href: '/app/postavke/pretplata',
    label: 'Plan i pretplata',
    icon: 'CreditCard',
    permission: 'billing.view',
  },
]

/** Čitljiv naziv rute za mrvice (breadcrumb). */
export const ROUTE_LABELS: Record<string, string> = {
  app: 'ServisLoop',
  pregled: 'Pregled',
  kupci: 'Kupci',
  lokacije: 'Lokacije',
  uredaji: 'Uređaji',
  'servisni-planovi': 'Servisni planovi',
  rezervacije: 'Rezervacije',
  'radni-nalozi': 'Radni nalozi',
  'prijave-kvara': 'Prijave kvara',
  tehnicari: 'Tehničari',
  podsjetnici: 'Podsjetnici',
  izvjestaji: 'Izvještaji',
  uvoz: 'Uvoz podataka',
  postavke: 'Postavke',
  organizacija: 'Organizacija',
  tim: 'Tim',
  obavijesti: 'Obavijesti',
  pretplata: 'Plan i pretplata',
  onboarding: 'Prvi koraci',
  admin: 'Administracija',
  novi: 'Novo',
}
