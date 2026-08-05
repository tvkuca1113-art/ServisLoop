import Link from 'next/link';

import { LoopMark } from '@/components/marketing/logo';
import { ToastProvider } from '@/components/ui';
import { formatCivilLong } from '@/domain/dates';
import { ROLE_LABELS } from '@/domain/permissions';
import type { SessionContext } from '@/server/auth/context';
import { listDemoIdentities } from '@/server/auth/demo-identities';

import { DemoBanner } from './demo-banner';
import { MobileNav } from './mobile-nav';
import { visibleNavItems } from './nav-items';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';

/**
 * The authenticated chrome.
 *
 * A Server Component on purpose: the session, the permission filter and the demo identity
 * list are all resolved here, and only plain data crosses into the client components that
 * need interactivity (collapse state, the mobile sheet, the dropdowns). That keeps the
 * permission decision on the server, where it is not merely cosmetic.
 *
 * Owns `<main id="main">`, the target of the skip link in the root layout.
 */
export async function AppShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const items = visibleNavItems(session.role);
  const organizations = session.organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
  }));

  const identities = session.isOffline ? await listDemoIdentities() : [];
  const displayName = session.user.fullName ?? session.user.email;

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-surface">
        {session.isOffline ? (
          <DemoBanner
            identities={identities}
            activeUserId={session.user.id}
            activeName={displayName}
            activeRoleLabel={ROLE_LABELS[session.role]}
          />
        ) : null}

        <div className="flex flex-1 items-start">
          <Sidebar items={items} organizations={organizations} activeOrgId={session.organization.id} />

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border-base bg-surface/90 px-4 backdrop-blur lg:px-6">
              <MobileNav
                items={items}
                organizations={organizations}
                activeOrgId={session.organization.id}
                organizationName={session.organization.name}
              />

              <Link href="/app" className="flex items-center gap-2 text-ink lg:hidden">
                <LoopMark className="size-6 shrink-0" />
                <span className="text-sm font-semibold tracking-tight">ServisLoop</span>
              </Link>

              <div className="ml-auto flex items-center gap-3">
                {/*
                  Today in the *organisation's* timezone, not the browser's. Every due
                  date, reminder stage and booking slot in the product is computed against
                  this day, so showing it here is the difference between "the system is
                  wrong" and "we are in a different timezone from head office".
                */}
                <p className="hidden text-xs text-ink-muted md:block">
                  <span className="text-ink-subtle">Today · </span>
                  {formatCivilLong(session.today)}
                  <span className="text-ink-subtle"> · {session.organization.timezone}</span>
                </p>

                <UserMenu
                  name={displayName}
                  email={session.user.email}
                  role={session.role}
                />
              </div>
            </header>

            <main id="main" className="flex-1 px-4 py-6 lg:px-6 lg:py-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
