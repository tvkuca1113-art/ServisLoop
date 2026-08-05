import { Check, X } from 'lucide-react';
import type { Metadata } from 'next';

import { CtaBand } from '@/components/marketing/cta-band';
import { Faq } from '@/components/marketing/faq';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Reveal } from '@/components/marketing/reveal';
import { Section, SectionHeader } from '@/components/marketing/section';
import { StatsBand } from '@/components/marketing/stats-band';

export const metadata: Metadata = {
  title: { absolute: 'ServisLoop — never miss a service date again' },
  description:
    'ServisLoop keeps every device you maintain on schedule: QR device pages, a four-stage reminder ladder, customer self-booking, technician checklists and signed PDF service reports.',
};

/**
 * Illustrative company profiles. ServisLoop has not launched, so these are the kinds of
 * teams it is built for rather than a customer list, and the strip says so.
 */
const AUDIENCE = [
  'Northline HVAC',
  'Meridian Lift Services',
  'Halden Fire Safety',
  'Coastal Water Systems',
  'Pinehurst Facilities',
];

const PROBLEMS = [
  'The schedule lives in a shared spreadsheet. It is accurate right up until two people edit it in the same week.',
  'Reminders go out when somebody remembers to send them, which is usually a fortnight after the date passed.',
  'The customer rings the office to book, the office rings the technician to check the van, and the slot is gone by then.',
  'Proof that the work happened is a photo of a paper sheet on somebody’s phone.',
];

const SOLUTIONS = [
  'The next due date is computed from the interval and the last completed service, so everyone reads the same number.',
  'A fixed four-stage ladder fires on its own, and the idempotency key means a retried job never sends twice.',
  'The customer books from the QR code on the machine, against availability that already accounts for confirmed jobs.',
  'Completing a work order issues a signed PDF, filed against the device with the checklist wording frozen at completion.',
];

export default function HomePage() {
  return (
    <>
      <Hero />

      <Section spacing="compact" tone="muted">
        <Reveal className="flex flex-col gap-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Built for maintenance teams like these
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {AUDIENCE.map((name) => (
              <li key={name} className="text-sm font-medium text-ink-muted sm:text-base">
                {name}
              </li>
            ))}
          </ul>
          <p className="text-center text-xs text-ink-subtle">
            Illustrative company profiles, not customers. ServisLoop is pre-launch.
          </p>
        </Reveal>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="The problem"
          title="Service dates do not slip on purpose"
          description="They slip because the schedule, the reminder, the booking and the paperwork all live in different places, and keeping them in step is somebody’s side job."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal className="h-full">
            <div className="flex h-full flex-col gap-4 rounded-card border border-border-base bg-surface-muted p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-ink">How it usually goes</h3>
              <ul className="flex flex-col gap-4">
                {PROBLEMS.map((problem) => (
                  <li key={problem} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                    <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-state-overdue" />
                    {problem}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal className="h-full" delay={0.08}>
            <div className="flex h-full flex-col gap-4 rounded-card border border-brand-500/25 bg-brand-500/5 p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-ink">How it goes on ServisLoop</h3>
              <ul className="flex flex-col gap-4">
                {SOLUTIONS.map((solution) => (
                  <li key={solution} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-state-ok" />
                    {solution}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="features" tone="muted" aria-labelledby="features-heading">
        <SectionHeader
          eyebrow="Features"
          title="Six things that keep the loop closed"
          description="Each one is a working part of the system, not a roadmap item."
          headingId="features-heading"
        />
        <div className="mt-12">
          <FeatureGrid />
        </div>
      </Section>

      <Section id="how-it-works" aria-labelledby="how-it-works-heading">
        <SectionHeader
          eyebrow="How it works"
          title="From spreadsheet to scheduled in four steps"
          description="No onboarding call, no consultant, no data model to design. Bring a spreadsheet and a printer."
          headingId="how-it-works-heading"
        />
        <div className="mt-12">
          <HowItWorks />
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeader
          eyebrow="By design"
          title="What the system guarantees"
          description="Scheduling software earns trust by being boring and repeatable. These are the properties the product is built around."
        />
        <div className="mt-12">
          <StatsBand />
        </div>
      </Section>

      <Section id="faq" aria-labelledby="faq-heading">
        <SectionHeader
          eyebrow="FAQ"
          title="Questions we would ask first"
          headingId="faq-heading"
        />
        <div className="mt-10 max-w-3xl">
          <Faq />
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
