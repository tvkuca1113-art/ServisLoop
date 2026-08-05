import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignUpForm } from '@/components/auth/sign-up-form';
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
} from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/env';
import { getSession } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create a ServisLoop account and start tracking service schedules.',
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="info" icon={<Info />}>
          <AlertTitle>Accounts need an authentication backend</AlertTitle>
          <AlertDescription>
            This checkout is running offline against a local file store, so there is nothing to
            register with. Everything else works — the demo organisation is fully populated.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <h1 className="text-lg font-semibold leading-tight text-ink">
              Explore the demo instead
            </h1>
            <CardDescription>
              Four seeded people, four roles, twenty-one devices across four customers, with
              work orders and reminders already in flight.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-ink-muted">
              To enable real accounts, set{' '}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then
              restart the server. The application code does not change — only the repository
              adapter behind it does.
            </p>
          </CardContent>

          <CardFooter>
            <Button asChild className="w-full">
              <Link href="/sign-in">Choose a demo identity</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const session = await getSession();
  if (session) redirect('/app');

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-tight text-ink">
          Create your ServisLoop account
        </h1>
        <CardDescription>
          Takes a minute. You will be added to an organisation by whoever invited you, or you
          can create one once your email is confirmed.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <SignUpForm />
      </CardContent>

      <CardFooter className="justify-between">
        <span className="text-sm text-ink-muted">Already have an account?</span>
        <Button asChild variant="secondary" size="sm">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
