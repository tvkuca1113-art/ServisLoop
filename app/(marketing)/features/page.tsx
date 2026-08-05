import {
  BellRing,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  FileSignature,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';

import { CtaBand } from '@/components/marketing/cta-band';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/reveal';
import { Section, SectionHeader } from '@/components/marketing/section';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'QR device pages, a four-stage reminder ladder, availability-aware customer booking, technician checklists, signed PDF service reports and automatic next-service scheduling.',
};

interface Capability {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly points: readonly string[];
}

const CAPABILITIES: readonly Capability[] = [
  {
    id: 'qr-device-pages',
    icon: QrCode,
    eyebrow: 'The device page',
    title: 'One QR code carries the whole machine',
    lead: 'Every device is issued a code you can print onto a sticker or an asset plate. Scanning it opens a public page for that one device.',
    points: [
      'The page shows the device, its location, its service interval and the visits it has had.',
      'Two actions sit on it: book the next service, or report a fault right now.',
      'The URL is scoped by an unguessable 32-byte token, so nothing else in your account is reachable from it.',
      'No login, no app install, and it works from any phone camera.',
    ],
  },
  {
    id: 'reminders',
    icon: BellRing,
    eyebrow: 'Reminders',
    title: 'A four-stage ladder that cannot double-send',
    lead: 'Once a device has a due date, its reminders are derived rather than scheduled by hand. Change the date and the ladder regenerates.',
    points: [
      'Stages fire at thirty days out, seven days out, on the due date, and seven days after it goes overdue.',
      'Each reminder is identified by device, due date and stage. That triple is unique in the database.',
      'The dispatch endpoint can be retried, run twice or overlap with itself. The customer still sees one notice.',
      'Stages whose send date has already passed are dropped instead of firing late.',
    ],
  },
  {
    id: 'booking',
    icon: CalendarCheck,
    eyebrow: 'Booking',
    title: 'Slots the customer picks are slots you actually have',
    lead: 'Availability is computed, not published. It comes out of your business hours, your blackout dates and the work already confirmed.',
    points: [
      'Set opening hours per weekday and mark holidays or shutdown weeks as blackout dates.',
      'Confirmed work orders remove their slots automatically.',
      'A submitted booking arrives as a request; confirming it creates the work order.',
      'Confirmation re-checks the slot, so two customers cannot take the same one in a race.',
    ],
  },
  {
    id: 'checklists',
    icon: ClipboardCheck,
    eyebrow: 'In the field',
    title: 'Checklists per device type, run from a phone',
    lead: 'Build the list once for a device type and every job on that type inherits it. Technicians record results as they go.',
    points: [
      'Items can be a pass or fail, a measurement, a choice or a free note.',
      'Results snapshot the item wording and kind at the moment the job is completed.',
      'Editing a template later changes future jobs only. Signed history stays exactly as it was issued.',
      'Technicians see everything but can only update the jobs assigned to them.',
    ],
  },
  {
    id: 'reports',
    icon: FileSignature,
    eyebrow: 'Evidence',
    title: 'A signed PDF for every completed visit',
    lead: 'Completing a work order renders a service report on the server and files it against the device.',
    points: [
      'The report carries the checklist results, the technician, timestamps, notes and a signature captured on site.',
      'Fonts are embedded, so names and notes with č, ć, ž, š or đ render correctly rather than as boxes.',
      'Generation is pure JavaScript with no headless browser, which makes the output deterministic.',
      'Reports download from the device history or straight from the work order.',
    ],
  },
  {
    id: 'scheduling',
    icon: RefreshCw,
    eyebrow: 'The loop closes',
    title: 'The next date sets itself',
    lead: 'Completing a service recomputes the next due date from the interval and the anchor you picked, then rebuilds the reminders behind it.',
    points: [
      'Anchor the interval to the completion date or to the date the service was originally due.',
      'Intervals live on the device and fall back to the device type when the device has none.',
      'One tested function owns that column. Nothing else in the codebase writes it.',
      'All date arithmetic uses calendar dates, so a service due on the 30th does not drift across a daylight-saving boundary.',
    ],
  },
];

interface Supporting {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
}

const SUPPORTING: readonly Supporting[] = [
  {
    icon: Upload,
    title: 'Import that shows its working',
    body: 'CSV and XLSX both land in the same two-phase importer: map the columns, then read a dry-run preview with per-row errors. Nothing is written until you confirm the preview.',
  },
  {
    icon: ShieldCheck,
    title: 'Four roles, enforced twice',
    body: 'Owner, admin, technician and viewer. The rules are one pure function in the application and a matching set of row-level security policies in Postgres, so the database refuses what the UI hides.',
  },
  {
    icon: Building2,
    title: 'Multi-tenant from the first row',
    body: 'Every record carries an organisation id and every policy checks membership. The public device, booking and issue routes never query as an anonymous user.',
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Section spacing="compact" className="pt-16 sm:pt-20">
        <SectionHeader
          as="h1"
          eyebrow="Features"
          title="Everything the service loop needs, and not much else"
          description="ServisLoop does one job: keep equipment in the field on its maintenance schedule and prove that the work happened. Here is what that means in practice."
        />
      </Section>

      {CAPABILITIES.map((capability, index) => (
        <Section
          key={capability.id}
          id={capability.id}
          aria-labelledby={`${capability.id}-heading`}
          spacing="compact"
          tone={index % 2 === 1 ? 'muted' : 'default'}
          className="scroll-mt-20"
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
            <Reveal className="flex flex-col gap-4">
              <span className="flex size-11 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                <capability.icon aria-hidden="true" className="size-5" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
                {capability.eyebrow}
              </span>
              <h2
                id={`${capability.id}-heading`}
                className="text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
              >
                {capability.title}
              </h2>
              <p className="text-pretty leading-relaxed text-ink-muted">{capability.lead}</p>
            </Reveal>

            <Reveal delay={0.06}>
              <ul className="flex flex-col gap-4 rounded-card border border-border-base bg-surface-raised p-6 sm:p-8">
                {capability.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Section>
      ))}

      <Section tone="muted">
        <SectionHeader
          eyebrow="Underneath"
          title="The parts you only notice when they are missing"
          description="Import, permissions and tenancy are where field-service tools usually leak. They were built first here, not last."
        />
        <RevealGroup className="mt-12 grid gap-5 lg:grid-cols-3">
          {SUPPORTING.map((item) => (
            <RevealItem key={item.title} className="h-full">
              <Card className="h-full">
                <CardHeader className="gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                    <item.icon aria-hidden="true" className="size-5" />
                  </span>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{item.body}</CardDescription>
                </CardHeader>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Service states"
          title="One vocabulary for how late something is"
          description="Every device, list and dashboard uses the same five states, and colour is never the only signal. Each badge shows a dot and a word."
        />
        <Reveal className="mt-10 flex flex-wrap items-center gap-3">
          <Badge variant="neutral">Unscheduled</Badge>
          <Badge variant="ok">On schedule</Badge>
          <Badge variant="soon">Due soon</Badge>
          <Badge variant="due">Due</Badge>
          <Badge variant="overdue">Overdue</Badge>
        </Reveal>
        <Reveal delay={0.06} className="mt-6">
          <Card className="max-w-3xl">
            <CardContent>
              <p className="text-sm leading-relaxed text-ink-muted">
                States are derived from the next due date and today, never stored. A device moves
                from due soon to due to overdue on its own, and the reminder ladder is anchored to
                the same date, so the badge and the notice can never disagree.
              </p>
            </CardContent>
          </Card>
        </Reveal>
      </Section>

      <CtaBand
        title="See it against your own device list"
        description="Import a spreadsheet of the equipment you look after and ServisLoop will compute the due dates and the reminder ladder for all of it."
        primary={{ href: '/sign-up', label: 'Start free' }}
        secondary={{ href: '/pricing', label: 'See pricing' }}
        note="Illustrative pricing while the product is pre-launch."
      />
    </>
  );
}
