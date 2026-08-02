import type { Metadata } from 'next'
import { requireOrgContext } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { AppShell } from '@/components/app/app-shell'
import type { NotificationItem } from '@/components/app/notification-center'
import { evaluateSubscription } from '@/domains/billing/entitlements'
import { isPlanCode } from '@/domains/billing/plans'
import { todayInTimeZone } from '@/domains/shared/plain-date'

export const metadata: Metadata = {
  title: { default: 'Aplikacija', template: '%s · ServisLoop' },
  robots: { index: false, follow: false },
}

/**
 * Okvir autentificirane aplikacije.
 *
 * `requireOrgContext()` preusmjerava na prijavu ako sesije nema, odnosno na
 * onboarding ako korisnik još nije član nijedne organizacije. Sve ispod ovog
 * sloja može računati na to da kontekst postoji.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOrgContext()
  const supabase = await createServerSupabase()
  const today = todayInTimeZone(context.timeZone)

  // Brojači u navigaciji. Svaki je `head: true` upit — vraća samo broj,
  // ne i redove, pa je jeftin i kad organizacija ima hiljade zapisa.
  const [bookings, issues, workOrders, failedReminders, notificationRows, subscription] =
    await Promise.all([
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .in('status', ['pending'])
        .gte('starts_at', new Date().toISOString()),

      supabase
        .from('issue_reports')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .in('status', ['new', 'in_review']),

      supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .in('status', ['assigned', 'in_progress', 'waiting_part']),

      supabase
        .from('reminder_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .eq('status', 'failed'),

      supabase
        .from('notification_events')
        .select('id, type, title, body, link_path, severity, is_read, created_at')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(15),

      supabase
        .from('organization_subscriptions')
        .select('plan_code, status, trial_ends_on, current_period_end')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
    ])

  const notifications: NotificationItem[] = (notificationRows.data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkPath: row.link_path,
    severity: row.severity as NotificationItem['severity'],
    isRead: row.is_read,
    createdAt: row.created_at,
  }))

  const planCode =
    subscription.data && isPlanCode(subscription.data.plan_code)
      ? subscription.data.plan_code
      : 'trial'

  const subscriptionState = evaluateSubscription(
    {
      planCode,
      status: (subscription.data?.status ?? 'trialing') as 'trialing',
      trialEndsOn: subscription.data?.trial_ends_on ?? null,
      currentPeriodEnd: subscription.data?.current_period_end ?? null,
    },
    today,
    context.isDemo,
  )

  return (
    <AppShell
      role={context.role}
      organizationName={context.organizationName}
      userName={context.user.fullName ?? context.user.email}
      userEmail={context.user.email}
      isDemo={context.isDemo}
      counts={{
        bookings: bookings.count ?? 0,
        issues: issues.count ?? 0,
        workOrders: workOrders.count ?? 0,
        failedReminders: failedReminders.count ?? 0,
      }}
      notifications={notifications}
      // Demo traka se već prikazuje zasebno; ne dupliramo je.
      banner={context.isDemo ? null : subscriptionState.banner}
    >
      {children}
    </AppShell>
  )
}
