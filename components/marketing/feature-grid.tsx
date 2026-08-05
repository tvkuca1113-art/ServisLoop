/**
 * The six capabilities the product is actually built around. Each one maps to a real part
 * of the system, so the copy stays checkable rather than aspirational.
 */

import {
  BellRing,
  CalendarCheck,
  ClipboardCheck,
  FileSignature,
  QrCode,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

import { RevealGroup, RevealItem } from './reveal';

interface Feature {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly detail: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: QrCode,
    title: 'QR device pages',
    description:
      'Every device gets a printable code. Scanning it opens a public page with the model, the service history and the two buttons that matter.',
    detail: 'Book a visit or report a fault. No app, no account.',
  },
  {
    icon: BellRing,
    title: 'Automatic reminders',
    description:
      'Four stages per due date: thirty days out, seven days out, on the day, and a week after it goes overdue.',
    detail: 'Keyed on device, due date and stage, so a retried job cannot send twice.',
  },
  {
    icon: CalendarCheck,
    title: 'Customer self-booking',
    description:
      'Availability is derived from your business hours, your blackout dates and the jobs already confirmed.',
    detail: 'Customers only ever see slots that are genuinely free.',
  },
  {
    icon: ClipboardCheck,
    title: 'Technician checklists',
    description:
      'Build a checklist per device type. The technician works it on a phone, recording pass, fail, a measurement or a note.',
    detail: 'Results snapshot the wording used on the day.',
  },
  {
    icon: FileSignature,
    title: 'Signed PDF reports',
    description:
      'Completing a work order renders a report with the checklist results, parts, notes and a captured signature.',
    detail: 'Rendered server-side with embedded fonts, so accented names survive.',
  },
  {
    icon: RefreshCw,
    title: 'Automatic next service',
    description:
      'On completion the next due date is recomputed from the interval and the anchor you chose, and the reminder ladder regenerates.',
    detail: 'The date is derived by one tested function. Nobody types it.',
  },
];

export function FeatureGrid() {
  return (
    <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((feature) => (
        <RevealItem key={feature.title} className="h-full">
          <Card className="h-full gap-3">
            <CardHeader className="gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                <feature.icon aria-hidden="true" className="size-5" />
              </span>
              <CardTitle>{feature.title}</CardTitle>
              <CardDescription className="leading-relaxed">{feature.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="border-t border-border-base pt-3 text-sm text-ink-subtle">
                {feature.detail}
              </p>
            </CardContent>
          </Card>
        </RevealItem>
      ))}
    </RevealGroup>
  );
}
