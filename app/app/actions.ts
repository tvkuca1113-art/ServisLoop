'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgContext } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { actionError, actionSuccess, type ActionResult } from '@/schemas/auth'

/**
 * Serverske akcije zajedničke cijeloj aplikaciji.
 *
 * Svaka počinje `requireOrgContext()` — bez toga nema ni korisnika ni
 * organizacije. Upiti idu preko korisničkog klijenta, pa RLS i dalje vrijedi:
 * ako korisnik pokuša označiti tuđu obavijest, baza jednostavno ne pogodi
 * nijedan red.
 */

export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  await requireOrgContext()
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('notification_events')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)

  if (error) return actionError('Obavijest nije označena kao pročitana.')

  revalidatePath('/app', 'layout')
  return actionSuccess()
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const context = await requireOrgContext()
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('notification_events')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('organization_id', context.organizationId)
    .eq('is_read', false)

  if (error) return actionError('Obavijesti nisu označene kao pročitane.')

  revalidatePath('/app', 'layout')
  return actionSuccess()
}
