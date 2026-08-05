import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button, Card, CardContent } from '@/components/ui';
import { requirePermission } from '@/server/auth/context';

import { MembersPanel } from './members-panel';

/**
 * Who is in this organisation.
 *
 * A separate route rather than a fourth tab on Settings: it is the destination of the
 * "Members" item in the user menu and of the `revalidatePath('/app/settings/members')`
 * calls every membership action makes, and it has its own empty and read-only states.
 *
 * The gate is stated twice on purpose. This page asserts `member:read` so an unauthorised
 * request is refused before anything is fetched, and {@link MembersPanel} — an async
 * Server Component that does its own reads — asserts it again, so it cannot be rendered
 * from somewhere that forgot. Every affordance inside it is then derived from `can()` with
 * the *target's* role, and the actions re-check the same rule.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Members',
  description: 'Who has access to this organisation, and what each of them may do.',
};

export default async function MembersPage() {
  const session = await requirePermission('member:read');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Members</h1>
          <p className="text-sm text-ink-muted">
            Access to {session.organization.name} is granted per person, per role.
          </p>
        </div>

        <Button variant="ghost" asChild>
          <Link href="/app/settings">
            <ArrowLeft aria-hidden="true" />
            Back to settings
          </Link>
        </Button>
      </header>

      <Card>
        <CardContent>
          <MembersPanel />
        </CardContent>
      </Card>
    </div>
  );
}
