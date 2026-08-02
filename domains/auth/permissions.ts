/**
 * Dozvole po ulogama.
 *
 * ★ Ovo NIJE jedina kontrola pristupa. ★
 * Prava zaštita je RLS u bazi (`supabase/migrations/0009_rls.sql`). Ova tablica
 * postoji da bi sučelje moglo unaprijed sakriti ono što korisnik ionako ne bi
 * mogao izvršiti, i da bi serverske akcije mogle rano odbiti zahtjev s jasnom
 * porukom umjesto nerazumljive greške iz baze.
 *
 * Sakrivanje dugmeta nikad se ne smatra sigurnosnom mjerom.
 */

export const ROLES = ['owner', 'dispatcher', 'technician'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Vlasnik',
  dispatcher: 'Dispečer',
  technician: 'Tehničar',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Puna kontrola: postavke, tim, naplata, uvoz i izvoz, brisanje podataka.',
  dispatcher: 'Vodi svakodnevni rad: kupci, uređaji, rezervacije i radni nalozi.',
  technician: 'Radi na terenu: vlastiti nalozi, historija uređaja, zatvaranje servisa.',
}

export const PERMISSIONS = [
  // Organizacija
  'organization.view',
  'organization.update',
  'organization.delete',
  'organization.transfer_ownership',

  // Tim
  'team.view',
  'team.invite',
  'team.update_role',
  'team.remove',

  // Tehničari
  'technicians.view',
  'technicians.manage',

  // Kupci, lokacije, uređaji
  'customers.view',
  'customers.manage',
  'customers.export',
  'locations.view',
  'locations.manage',
  'devices.view',
  'devices.manage',
  'devices.view_history',

  // QR
  'qr.view',
  'qr.generate',
  'qr.rotate',

  // Servisna pravila
  'service_plans.view',
  'service_plans.manage',

  // Podsjetnici
  'reminders.view',
  'reminders.manage',
  'reminders.send_now',

  // Rezervacije
  'bookings.view',
  'bookings.manage',

  // Prijave kvara
  'issues.view',
  'issues.manage',

  // Radni nalozi
  'work_orders.view_all',
  'work_orders.view_assigned',
  'work_orders.create',
  'work_orders.assign',
  'work_orders.complete',
  'work_orders.delete',

  // Izvještaji
  'reports.view_operational',
  'reports.view_financial',
  'reports.export',
  'service_reports.generate',

  // Uvoz i izvoz
  'import.run',
  'data.export_all',

  // Naplata
  'billing.view',
  'billing.manage',

  // Postavke obavijesti
  'notifications.view',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const OWNER_PERMISSIONS: readonly Permission[] = PERMISSIONS

const DISPATCHER_PERMISSIONS: readonly Permission[] = [
  'organization.view',
  'team.view',
  'technicians.view',
  'customers.view',
  'customers.manage',
  'customers.export',
  'locations.view',
  'locations.manage',
  'devices.view',
  'devices.manage',
  'devices.view_history',
  'qr.view',
  'qr.generate',
  'service_plans.view',
  'reminders.view',
  'reminders.send_now',
  'bookings.view',
  'bookings.manage',
  'issues.view',
  'issues.manage',
  'work_orders.view_all',
  'work_orders.view_assigned',
  'work_orders.create',
  'work_orders.assign',
  'work_orders.complete',
  'reports.view_operational',
  'service_reports.generate',
  'import.run',
  'notifications.view',
]

const TECHNICIAN_PERMISSIONS: readonly Permission[] = [
  'organization.view',
  'customers.view',
  'locations.view',
  'devices.view',
  'devices.view_history',
  'qr.view',
  'work_orders.view_assigned',
  'work_orders.complete',
  'service_reports.generate',
  'issues.view',
  'notifications.view',
]

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(OWNER_PERMISSIONS),
  dispatcher: new Set(DISPATCHER_PERMISSIONS),
  technician: new Set(TECHNICIAN_PERMISSIONS),
}

/** Ima li uloga zadanu dozvolu? */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission)
}

/** Ima li uloga BAREM JEDNU od zadanih dozvola? */
export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission))
}

/** Ima li uloga SVE zadane dozvole? */
export function canAll(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => can(role, permission))
}

/** Sve dozvole uloge — koristi se za prikaz na stranici tima. */
export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]].sort()
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export class PermissionDeniedError extends Error {
  readonly permission: Permission
  readonly role: Role

  constructor(role: Role, permission: Permission) {
    super(
      `Vaša uloga (${ROLE_LABELS[role]}) nema ovlaštenje za ovu radnju. ` +
        `Potrebno ovlaštenje: ${permission}.`,
    )
    this.name = 'PermissionDeniedError'
    this.role = role
    this.permission = permission
  }
}

/** Baca `PermissionDeniedError` ako uloga nema dozvolu. */
export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new PermissionDeniedError(role, permission)
}

/**
 * Smije li korisnik vidjeti konkretan radni nalog.
 *
 * Tehničar vidi ISKLJUČIVO naloge koji su njemu dodijeljeni. Ista provjera
 * postoji i u RLS politici `work_orders_select` — ovdje je zbog jasne poruke
 * i ranog izlaza, tamo zbog stvarne sigurnosti.
 */
export function canViewWorkOrder(
  role: Role,
  context: { assignedTechnicianId: string | null; currentTechnicianId: string | null },
): boolean {
  if (can(role, 'work_orders.view_all')) return true
  if (!can(role, 'work_orders.view_assigned')) return false
  return (
    context.assignedTechnicianId !== null &&
    context.assignedTechnicianId === context.currentTechnicianId
  )
}

/** Smije li korisnik mijenjati konkretan radni nalog. */
export function canEditWorkOrder(
  role: Role,
  context: {
    assignedTechnicianId: string | null
    currentTechnicianId: string | null
    status: string
  },
): boolean {
  // Zatvoren ili otkazan nalog ne mijenja niko — historija servisa mora ostati
  // nepromijenjena da bi izvještaj koji je kupac dobio i dalje bio tačan.
  if (context.status === 'completed' || context.status === 'cancelled') return false

  if (can(role, 'work_orders.assign')) return true
  return (
    can(role, 'work_orders.complete') &&
    context.assignedTechnicianId !== null &&
    context.assignedTechnicianId === context.currentTechnicianId
  )
}

/**
 * Koje uloge korisnik smije dodijeliti drugima.
 * Samo vlasnik može napraviti drugog vlasnika.
 */
export function assignableRoles(role: Role): Role[] {
  if (role === 'owner') return ['owner', 'dispatcher', 'technician']
  return []
}
