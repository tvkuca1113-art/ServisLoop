'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { slugify } from '@/lib/utils'
import {
  actionError,
  actionSuccess,
  signInSchema,
  signUpSchema,
  zodFieldErrors,
  type ActionResult,
} from '@/schemas/auth'

/**
 * Serverske akcije za prijavu, registraciju i odjavu.
 *
 * Sve provjere su ovdje, na serveru. Klijentska validacija postoji samo da
 * korisnik ranije vidi grešku — nikad kao jedina kontrola.
 */

/** Poruke o grešci namjerno ne otkrivaju postoji li nalog s tom adresom. */
function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'Pogrešna e-mail adresa ili lozinka.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'Nalog nije potvrđen. Provjerite e-poštu i kliknite na link za potvrdu.'
  }
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return 'Nalog s ovom adresom već postoji. Pokušajte se prijaviti.'
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Previše pokušaja. Sačekajte nekoliko minuta pa pokušajte ponovo.'
  }
  if (normalized.includes('password')) {
    return 'Lozinka ne zadovoljava uslove. Koristite najmanje 10 znakova.'
  }
  return 'Prijava trenutno nije moguća. Pokušajte ponovo za nekoliko trenutaka.'
}

export async function signIn(formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    redirectTo: formData.get('redirectTo') ?? undefined,
  })

  if (!parsed.success) {
    return actionError('Provjerite unesene podatke.', zodFieldErrors(parsed.error))
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return actionError(friendlyAuthError(error.message))
  }

  // Otvoreno preusmjeravanje je čest propust: prihvatamo isključivo
  // relativne putanje unutar aplikacije.
  const requested = parsed.data.redirectTo ?? ''
  const safeRedirect =
    requested.startsWith('/app') && !requested.startsWith('//') ? requested : '/app/pregled'

  revalidatePath('/', 'layout')
  return actionSuccess({ redirectTo: safeRedirect })
}

export async function signUp(formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
    organizationName: formData.get('organizationName'),
    acceptTerms: formData.get('acceptTerms') === 'on' || formData.get('acceptTerms') === 'true',
  })

  if (!parsed.success) {
    return actionError('Provjerite unesene podatke.', zodFieldErrors(parsed.error))
  }

  const supabase = await createServerSupabase()

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  })

  if (signUpError) {
    return actionError(friendlyAuthError(signUpError.message))
  }

  const userId = signUpData.user?.id
  if (!userId) {
    return actionError('Nalog je kreiran, ali prijava nije uspjela. Pokušajte se prijaviti.')
  }

  // Kreiranje organizacije ide preko servisnog klijenta: u tom trenutku
  // korisnik još nije član nijedne organizacije, pa RLS politika za `insert`
  // ne bi prošla. Sve se radi u jednom nizu koraka i odmah se dodaje vlasnik.
  const service = createServiceSupabase()

  await service
    .from('profiles')
    .upsert({ id: userId, email: parsed.data.email, full_name: parsed.data.fullName })

  const slug = await uniqueSlug(parsed.data.organizationName)

  const { data: organization, error: orgError } = await service
    .from('organizations')
    .insert({
      name: parsed.data.organizationName,
      slug,
      email: parsed.data.email,
      created_by: userId,
    })
    .select('id')
    .single()

  if (orgError || !organization) {
    return actionError(
      'Nalog je kreiran, ali firma nije. Prijavite se — vodit ćemo vas kroz postavljanje.',
    )
  }

  const { error: memberError } = await service.from('organization_members').insert({
    organization_id: organization.id,
    user_id: userId,
    role: 'owner',
  })

  if (memberError) {
    return actionError('Firma je kreirana, ali povezivanje naloga nije uspjelo. Javite nam se.')
  }

  // Zadane vrste opreme, servisni planovi, pravila podsjetnika i čeklista.
  await service.rpc(
    'seed_organization_defaults' as never,
    {
      target_org: organization.id,
    } as never,
  )

  await service.from('audit_events').insert({
    organization_id: organization.id,
    actor_user_id: userId,
    actor_label: parsed.data.fullName,
    action: 'organization.created',
    entity_type: 'organization',
    entity_id: organization.id,
    summary: `Kreirana organizacija "${parsed.data.organizationName}"`,
  })

  revalidatePath('/', 'layout')
  return actionSuccess({ redirectTo: '/app/onboarding' })
}

export async function signOut(): Promise<ActionResult> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signOut()

  if (error) return actionError('Odjava nije uspjela.')

  revalidatePath('/', 'layout')
  return actionSuccess()
}

/**
 * Pravi jedinstvenu oznaku firme.
 * Pri sudaru dodaje brojčani sufiks umjesto da odbije registraciju —
 * dvije firme se lako mogu zvati „Termo Servis“.
 */
async function uniqueSlug(name: string): Promise<string> {
  const service = createServiceSupabase()
  const base = slugify(name) || 'firma'

  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data } = await service
      .from('organizations')
      .select('id')
      .eq('slug', candidate)
      .is('deleted_at', null)
      .maybeSingle()

    if (!data) return candidate
  }

  // Krajnji slučaj: sufiks iz vremena da registracija nikad ne padne.
  return `${base}-${Date.now().toString(36)}`
}
