import type { Metadata } from 'next';
import { CircleAlert, Database, Info } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { DemoIdentityPicker } from '@/components/auth/demo-identity-picker';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { PasswordSignInForm } from '@/components/auth/password-sign-in-form';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Separator,
} from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/env';
import { DEMO_USER_COOKIE, getSession } from '@/server/auth/context';
import { listDemoIdentities } from '@/server/auth/demo-identities';
import { DEMO } from '@/server/data/seed';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your ServisLoop organisation.',
  robots: { index: false, follow: false },
};

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = firstValue(params.next);
  const errorCode = firstValue(params.error);
  const state = firstValue(params.state);

  // `force-dynamic` matters here: this branch must be evaluated per request, not frozen
  // into a static page at build time when the deployment had no credentials yet.
  if (!isSupabaseConfigured()) {
    return <DemoModePanel next={next} />;
  }

  const session = await getSession();
  if (session) redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/app');

  if (state === 'no-organisation') {
    return <NoOrganisationPanel />;
  }

  return (
    <div className="flex flex-col gap-4">
      {errorCode ? (
        <Alert variant="destructive" icon={<CircleAlert />}>
          <AlertTitle>That sign-in link did not work.</AlertTitle>
          <AlertDescription>
            Links expire after an hour and can only be used once. Request a new one below.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold leading-tight text-ink">
            Sign in to ServisLoop
          </h1>
          <CardDescription>
            Use the email address your organisation invited.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <PasswordSignInForm next={next} />

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs uppercase tracking-wide text-ink-subtle">or</span>
            <Separator className="flex-1" />
          </div>

          <MagicLinkForm />
        </CardContent>

        <CardFooter className="justify-between">
          <span className="text-sm text-ink-muted">New to ServisLoop?</span>
          <Button asChild variant="secondary" size="sm">
            <Link href="/sign-up">Create an account</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * What a clean checkout sees.
 *
 * There is no auth backend to sign in to, so the honest thing is to say so plainly and
 * then get out of the way: pick one of the four seeded people and go. Choosing the
 * technician rather than the owner is the fastest way to see the role gates work.
 */
async function DemoModePanel({ next }: { next?: string }) {
  const [identities, cookieStore] = await Promise.all([listDemoIdentities(), cookies()]);
  const activeId = cookieStore.get(DEMO_USER_COOKIE)?.value ?? DEMO.ownerId;

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="info" icon={<Info />}>
        <AlertTitle>Demo mode — no authentication backend is configured</AlertTitle>
        <AlertDescription>
          <p>
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are unset,
            so ServisLoop is running against a local file store seeded with a demo
            maintenance company. Nothing you do here leaves this machine.
          </p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold leading-tight text-ink">
            Continue as one of the demo team
          </h1>
          <CardDescription>
            Every role sees a different product. Permissions are enforced by the same{' '}
            <code className="font-mono text-xs">can(role, action)</code> function the
            production build uses, so what you see here is what a real technician would see.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <DemoIdentityPicker identities={identities} activeId={activeId} next={next ?? '/app'} />
        </CardContent>

        <CardFooter className="flex-col items-start gap-2">
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <Database aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Data lives in <code className="font-mono text-xs">.data/store.json</code>. Reset it
              at any time with <code className="font-mono text-xs">npm run db:reset</code>, or
              open{' '}
              <Link
                href="/app/settings?tab=data-source"
                className="font-medium text-brand-600 underline-offset-4 hover:underline"
              >
                Settings → Data source
              </Link>{' '}
              to see how to connect Supabase.
            </span>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Signed in with Supabase, but not a member of any organisation.
 *
 * Without this the app would bounce between `/app` and `/sign-in` forever, because
 * `requireSession()` treats "no membership" the same as "not signed in".
 */
function NoOrganisationPanel() {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-tight text-ink">
          Your account is not part of an organisation yet
        </h1>
        <CardDescription>
          ServisLoop groups every customer, device and work order under an organisation, and
          your account has not been added to one.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <p className="text-sm text-ink-muted">
          Ask a colleague with the Owner or Administrator role to invite you from{' '}
          <span className="font-medium text-ink">Settings → Members</span>. The invitation goes
          to the same address you just signed in with.
        </p>
      </CardContent>

      <CardFooter className="justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/contact">Contact support</Link>
        </Button>
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="secondary" size="sm">
            Sign out
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
