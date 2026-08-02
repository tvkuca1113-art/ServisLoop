import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getServerEnv } from '@/lib/env'
import { assertCan, type Permission, type Role, isRole } from '@/domains/auth/permissions'

/**
 * Serverska sesija i kontekst organizacije.
 *
 * Svaka autentificirana stranica i svaka serverska akcija počinje pozivom
 * `requireOrgContext()`. Time dobijamo:
 *   • provjereno korisničko ID iz Supabase sesije (nikad iz URL-a ili forme);
 *   • organizaciju čiji je korisnik AKTIVAN član;
 *   • njegovu ulogu.
 *
 * ★ `organization_id` NIKAD ne dolazi od klijenta. ★
 * Klijent može poslati bilo koji ID; mi ga ignorišemo i koristimo onaj koji je
 * vezan za sesiju. Dodatno, i da propustimo, RLS bi odbio red.
 *
 * `cache()` iz Reacta osigurava da se unutar jednog zahtjeva baza pita samo
 * jednom, koliko god komponenti tražilo kontekst.
 */

export interface SessionUser {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
}

export interface OrganizationContext {
  user: SessionUser
  organizationId: string
  organizationName: string
  organizationSlug: string
  timeZone: string
  currency: string
  role: Role
  isDemo: boolean
  onboardingCompleted: boolean
  /** ID zapisa tehničara ako je korisnik tehničar; inače `null`. */
  technicianId: string | null
}

/** Trenutno prijavljeni korisnik ili `null`. Ne preusmjerava. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabase()

  // `getUser()` provjerava token kod Supabase servera. `getSession()` čita
  // kolačić bez provjere i zato se ne koristi za odluke o pristupu.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, email')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? '',
    fullName: profile?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  }
})

/** Prijavljeni korisnik ili preusmjeravanje na prijavu. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    const target = returnTo ? `/prijava?nastavi=${encodeURIComponent(returnTo)}` : '/prijava'
    redirect(target)
  }
  return user
}

/**
 * Organizacije kojih je korisnik aktivan član.
 * MVP predviđa jednu po korisniku, ali arhitektura podržava više — zato
 * upit vraća listu i sučelje ima prebacivač organizacija.
 */
export const getUserOrganizations = cache(
  async (): Promise<
    Array<{ id: string; name: string; slug: string; role: Role; isDemo: boolean }>
  > => {
    const user = await getSessionUser()
    if (!user) return []

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organizations!inner(id, name, slug, is_demo, deleted_at)')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (error || !data) return []

    return data
      .map((row) => {
        const org = row.organizations as unknown as {
          id: string
          name: string
          slug: string
          is_demo: boolean
          deleted_at: string | null
        } | null
        if (!org || org.deleted_at !== null) return null
        if (!isRole(row.role)) return null
        return { id: org.id, name: org.name, slug: org.slug, role: row.role, isDemo: org.is_demo }
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
  },
)

/**
 * Puni kontekst: korisnik + organizacija + uloga.
 * Preusmjerava na prijavu ako nema sesije, ili na onboarding ako korisnik
 * još nije ni u jednoj organizaciji.
 */
export const requireOrgContext = cache(async (): Promise<OrganizationContext> => {
  const user = await requireUser()
  const supabase = await createServerSupabase()

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select(
      'role, organization_id, organizations!inner(id, name, slug, timezone, currency, is_demo, onboarding_completed_at, deleted_at)',
    )
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Neuspješno učitavanje organizacije: ${error.message}`)
  }

  const organization = membership?.organizations as unknown as
    | {
        id: string
        name: string
        slug: string
        timezone: string
        currency: string
        is_demo: boolean
        onboarding_completed_at: string | null
        deleted_at: string | null
      }
    | undefined

  if (!membership || !organization || organization.deleted_at !== null) {
    redirect('/app/onboarding')
  }

  if (!isRole(membership.role)) {
    throw new Error(`Nepoznata uloga u organizaciji: ${String(membership.role)}`)
  }

  let technicianId: string | null = null
  if (membership.role === 'technician') {
    const { data: technician } = await supabase
      .from('technicians')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    technicianId = technician?.id ?? null
  }

  return {
    user,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    timeZone: organization.timezone,
    currency: organization.currency,
    role: membership.role,
    isDemo: organization.is_demo,
    onboardingCompleted: organization.onboarding_completed_at !== null,
    technicianId,
  }
})

/**
 * Kontekst uz provjeru ovlaštenja.
 * Baca `PermissionDeniedError` koji `error.tsx` pretvara u razumljivu poruku
 * umjesto prazne stranice.
 */
export async function requirePermission(permission: Permission): Promise<OrganizationContext> {
  const context = await requireOrgContext()
  assertCan(context.role, permission)
  return context
}

/**
 * Je li korisnik na popisu super-administratora.
 *
 * Popis je isključivo u varijabli okruženja `SUPER_ADMIN_EMAILS` i provjera je
 * isključivo serverska. Nema tabele koju bi neko mogao izmijeniti da bi sebi
 * dao pristup, i nema klijentske provjere koju bi mogao zaobići.
 */
export async function isSuperAdmin(): Promise<boolean> {
  const user = await getSessionUser()
  if (!user?.email) return false

  try {
    const { superAdminEmails } = getServerEnv()
    if (superAdminEmails.length === 0) return false
    return superAdminEmails.includes(user.email.toLowerCase())
  } catch {
    // Nepotpuna konfiguracija nikad ne smije rezultirati odobrenim pristupom.
    return false
  }
}

/** Super-admin ili 404 — ne otkrivamo ni da stranica postoji. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user || !(await isSuperAdmin())) {
    notFound()
  }
  return user
}
