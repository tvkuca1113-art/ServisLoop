import { Check, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CtaBand } from '@/components/marketing/cta-band';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/reveal';
import { Section, SectionHeader } from '@/components/marketing/section';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Three illustrative ServisLoop plans: Starter, Team and Business. Priced per organisation, with every plan including QR device pages, reminders, checklists and signed PDF reports.',
};

interface Tier {
  readonly name: string;
  readonly monthly: number;
  readonly annual: number;
  readonly summary: string;
  readonly devices: string;
  readonly seats: string;
  readonly features: readonly string[];
  readonly featured: boolean;
}

const TIERS: readonly Tier[] = [
  {
    name: 'Starter',
    monthly: 29,
    annual: 290,
    summary: 'For a one-van operation that has outgrown the spreadsheet.',
    devices: 'Up to 150 devices',
    seats: '2 seats',
    features: [
      'QR device pages and printable code sheets',
      'Four-stage reminder ladder',
      'Checklists and signed PDF service reports',
      'Automatic next-service scheduling',
      'CSV import with dry-run preview',
    ],
    featured: false,
  },
  {
    name: 'Team',
    monthly: 89,
    annual: 890,
    summary: 'For a service team with a dispatcher and technicians in the field.',
    devices: 'Up to 1,000 devices',
    seats: '10 seats',
    features: [
      'Everything in Starter',
      'Customer self-booking with availability rules',
      'Business hours and blackout dates',
      'Customer fault reporting and triage',
      'XLSX import and column mapping profiles',
      'Owner, admin, technician and viewer roles',
    ],
    featured: true,
  },
  {
    name: 'Business',
    monthly: 249,
    annual: 2490,
    summary: 'For multi-site contractors who have to answer to an auditor.',
    devices: 'Up to 10,000 devices',
    seats: 'Unlimited seats',
    features: [
      'Everything in Team',
      'Audit log export',
      'Compliance and throughput reporting with CSV export',
      'Custom report branding',
      'Priority support with a named contact',
    ],
    featured: false,
  },
];

const INCLUDED_EVERYWHERE = [
  'Unlimited customers and locations',
  'Unlimited work orders and service reports',
  'Public device pages that need no customer account',
  'Row-level tenant isolation in the database',
  'Deterministic due dates with no AI service in the loop',
  'Data export at any time',
];

const PRICING_NOTES = [
  {
    question: 'How is a device counted?',
    answer:
      'A device is one serviceable unit at one location: a boiler, a lift, an extinguisher, a compressor. Retired devices keep their history and stop counting toward the limit.',
  },
  {
    question: 'What happens when a plan limit is reached?',
    answer:
      'Nothing breaks and nothing is deleted. Reminders keep going out and reports keep generating. You are prompted to move up a plan the next time you add a device beyond the limit.',
  },
  {
    question: 'Is there a contract?',
    answer:
      'Monthly plans are month to month. Annual plans run for twelve months and are charged for ten. Either can be cancelled, and your data can be exported for as long as the account exists.',
  },
];

export default function PricingPage() {
  return (
    <>
      <Section spacing="compact" className="pt-16 sm:pt-20">
        <SectionHeader
          as="h1"
          align="center"
          eyebrow="Pricing"
          title="Priced per organisation, not per work order"
          description="One subscription covers the whole service loop: the QR pages, the reminders, the bookings, the checklists and the reports."
        />
        <Reveal className="mx-auto mt-8 max-w-2xl">
          <Alert variant="info" role="note" icon={<Info aria-hidden="true" />}>
            <AlertTitle>These prices are illustrative</AlertTitle>
            <AlertDescription>
              ServisLoop is pre-launch. The plans below show how the product is intended to be
              packaged; nothing on this page is purchasable yet and the final figures may differ.
            </AlertDescription>
          </Alert>
        </Reveal>
      </Section>

      <Section spacing="compact">
        <RevealGroup className="grid items-start gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <RevealItem key={tier.name} className="h-full">
              <Card
                className={cn(
                  'h-full',
                  tier.featured && 'border-brand-600/40 shadow-md ring-1 ring-brand-600/20',
                )}
              >
                <CardHeader className="gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle as="h2" className="text-lg">
                      {tier.name}
                    </CardTitle>
                    {tier.featured ? <Badge variant="outline">Most complete</Badge> : null}
                  </div>
                  <CardDescription>{tier.summary}</CardDescription>
                  <p className="flex items-baseline gap-1.5 pt-2">
                    <span className="tabular text-4xl font-semibold tracking-tight text-ink">
                      €{tier.monthly}
                    </span>
                    <span className="text-sm text-ink-muted">per month</span>
                  </p>
                  <p className="tabular text-sm text-ink-subtle">
                    or €{tier.annual.toLocaleString('en-GB')} a year, which is ten months paid for
                    twelve
                  </p>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="neutral">{tier.devices}</Badge>
                    <Badge variant="neutral">{tier.seats}</Badge>
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-sm text-ink-muted">
                        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-state-ok" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button asChild variant={tier.featured ? 'default' : 'secondary'} className="w-full">
                    <Link href="/sign-up">Start with {tier.name}</Link>
                  </Button>
                </CardFooter>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-8">
          <p className="text-sm text-ink-subtle">
            Prices are in euro, exclude VAT, and are charged per organisation. Annual billing is
            charged once for ten months of the equivalent monthly price. Moving between plans is
            prorated to the day.
          </p>
        </Reveal>
      </Section>

      <Section tone="muted">
        <SectionHeader
          eyebrow="In every plan"
          title="The scheduling core is never the upsell"
          description="Due dates, reminders and service reports are the product. They are not held back for a higher tier."
        />
        <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-2">
          {INCLUDED_EVERYWHERE.map((item) => (
            <RevealItem key={item}>
              <div className="flex gap-3 rounded-card border border-border-base bg-surface-raised p-4 text-sm text-ink-muted">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-state-ok" />
                {item}
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      <Section>
        <SectionHeader eyebrow="Plan details" title="How the limits actually behave" />
        <Reveal className="mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
          {PRICING_NOTES.map((note) => (
            <div key={note.question} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-ink">{note.question}</h3>
              <p className="text-sm leading-relaxed text-ink-muted">{note.answer}</p>
            </div>
          ))}
        </Reveal>
      </Section>

      <CtaBand
        title="Start on any plan, move later"
        description="Every plan runs the same scheduling core, so changing tier changes limits and extras, never the way your due dates are computed."
        primary={{ href: '/sign-up', label: 'Start free' }}
        secondary={{ href: '/contact', label: 'Ask about a plan' }}
        note="Illustrative pricing. Nothing on this page is purchasable yet."
      />
    </>
  );
}
