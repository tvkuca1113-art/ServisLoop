import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionState } from '@/server/auth/context';
import { listCommonTimezones } from '@/server/actions/onboarding';

import { CreateOrganizationForm } from './create-organization-form';

/**
 * First-run setup.
 *
 * Lives outside the `(app)` route group on purpose: that group's layout calls
 * `requireSession()`, which redirects here — putting this page inside it would be a loop.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Set up your organisation',
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const state = await getSessionState();

  if (state.status === 'anonymous') redirect('/sign-in');
  if (state.status === 'ready') redirect('/app');

  const timezones = await listCommonTimezones();

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Set up your organisation
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            You are signed in as {state.user.email}. One more step and ServisLoop is ready to
            use.
          </p>
        </div>

        <CreateOrganizationForm timezones={timezones} />

        <p className="mt-6 text-center text-xs text-ink-subtle">
          You will be the owner. Opening hours default to Monday–Friday, 08:00–17:00, and you
          can change everything later in Settings.
        </p>
      </div>
    </main>
  );
}
