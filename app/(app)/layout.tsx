import type { Metadata } from 'next';

import { AppShell } from '@/components/app/shell/app-shell';
import { requireSession } from '@/server/auth/context';

/**
 * The guard for everything under `/app`.
 *
 * `requireSession()` runs before any child renders and redirects to `/sign-in` when there
 * is no session — or when the signed-in account belongs to no organisation, since without
 * one there is nothing to show. Pages below can therefore assume a session exists and call
 * `requireSession()` again freely: it is wrapped in React's `cache`, so the whole render
 * resolves it once.
 *
 * This is the application-level half of the tenancy boundary. The other half is Postgres
 * RLS, which is the one that cannot be bypassed by a bug in this file.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'ServisLoop', template: '%s · ServisLoop' },
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return <AppShell session={session}>{children}</AppShell>;
}
