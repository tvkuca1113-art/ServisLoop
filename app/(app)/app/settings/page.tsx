import { Building2, CalendarClock, Database, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { defaultBusinessHours } from '@/domain/availability';
import { can } from '@/domain/permissions';
import { cn } from '@/lib/utils';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { BusinessHoursForm } from './business-hours-form';
import { DataSourcePanel } from './data-source-panel';
import { OrganisationForm } from './organisation-form';

/**
 * Organisation settings.
 *
 * Read access is gated on `org:read` rather than `org:update`, because every role holds
 * `org:read` and the Settings link is in the sidebar for all of them. The gate that
 * matters is the *write* one: `can(role, 'org:update')` is handed to each form as
 * `canEdit`, which is what renders the read-only notice and disables the fieldsets — and
 * the server actions re-check the same permission, so a disabled control is a courtesy
 * rather than the protection.
 *
 * The section is a URL parameter, not client state. `?tab=data-source` is linked to
 * directly from the demo banner and the user menu, so it has to survive a full page load,
 * be shareable, and put the back button in charge of undoing a switch. The sections are
 * plain links for the same reason a viewer can read this page at all: nothing here needs
 * JavaScript to be useful.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Organisation, scheduling rules, opening hours and data source.',
};

const SECTIONS = [
  {
    id: 'organisation',
    label: 'Organisation',
    hint: 'Name, timezone, reminder lead time and booking rules',
  },
  { id: 'hours', label: 'Opening hours', hint: 'The week customers may book into' },
  { id: 'data-source', label: 'Data source', hint: 'Which repository adapter is live' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function isSection(value: string): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requirePermission('org:read');
  const params = await searchParams;

  const tabParam = firstParam(params.tab);
  const active: SectionId = isSection(tabParam) ? tabParam : 'organisation';

  const canEdit = can(session.role, 'org:update');
  const canSeeMembers = can(session.role, 'member:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  // Only the section being rendered is read. Opening hours are three queries the
  // organisation form has no use for, and the data-source panel reads no data at all.
  const [hours, blackouts] =
    active === 'hours'
      ? await Promise.all([repo.listBusinessHours(orgId), repo.listBlackoutDates(orgId)])
      : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Settings</h1>
          <p className="text-sm text-ink-muted">
            {session.organization.name} · {session.organization.timezone}
            {session.organization.isDemo ? ' · demo organisation' : ''}
          </p>
        </div>

        {canSeeMembers ? (
          <Button variant="secondary" asChild>
            <Link href="/app/settings/members">
              <Users aria-hidden="true" />
              Members
            </Link>
          </Button>
        ) : null}
      </header>

      {/*
        Link-based sections rather than a Radix `Tabs`: the choice has to live in the URL
        (see the note at the top of the file), and a link works with JavaScript disabled.
        `aria-current` carries the selection for assistive technology; the underline and
        the ink colour carry it visually.
      */}
      <nav aria-label="Settings sections" className="border-b border-border-base">
        <ul className="-mb-px flex flex-wrap gap-1">
          {SECTIONS.map((section) => {
            const isActive = section.id === active;
            return (
              <li key={section.id}>
                <Link
                  href={`/app/settings?tab=${section.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={section.hint}
                  className={cn(
                    'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-brand-600 text-ink'
                      : 'border-transparent text-ink-muted hover:border-border-strong hover:text-ink',
                  )}
                >
                  <SectionIcon id={section.id} />
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {active === 'organisation' ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Organisation</CardTitle>
          </CardHeader>
          <CardContent>
            <OrganisationForm
              organization={{
                name: session.organization.name,
                timezone: session.organization.timezone,
                reminderLeadDays: session.organization.reminderLeadDays,
                defaultIntervalAnchor: session.organization.defaultIntervalAnchor,
                slotMinutes: session.organization.slotMinutes,
                bookingLeadHours: session.organization.bookingLeadHours,
                bookingHorizonDays: session.organization.bookingHorizonDays,
              }}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      ) : null}

      {active === 'hours' ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Availability</CardTitle>
          </CardHeader>
          <CardContent>
            <BusinessHoursForm
              /*
               * An organisation that has never saved its hours gets the standard week —
               * Monday to Friday, 08:00–17:00 — from the same domain helper the
               * availability engine falls back to. Showing seven closed days instead
               * would misreport what a customer is currently offered.
               */
              hours={
                hours.length > 0
                  ? hours.map((h) => ({
                      weekday: h.weekday,
                      isOpen: h.isOpen,
                      openMinute: h.openMinute,
                      closeMinute: h.closeMinute,
                    }))
                  : defaultBusinessHours()
              }
              blackouts={blackouts.map((b) => ({
                id: b.id,
                date: b.date,
                reason: b.reason,
              }))}
              today={session.today}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      ) : null}

      {active === 'data-source' ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">
              Data source{' '}
              <Badge variant={session.isOffline ? 'neutral' : 'ok'}>
                {session.isOffline ? 'Local file store' : 'Supabase'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataSourcePanel />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SectionIcon({ id }: { id: SectionId }) {
  const className = 'size-4';
  if (id === 'organisation') return <Building2 aria-hidden="true" className={className} />;
  if (id === 'hours') return <CalendarClock aria-hidden="true" className={className} />;
  return <Database aria-hidden="true" className={className} />;
}
