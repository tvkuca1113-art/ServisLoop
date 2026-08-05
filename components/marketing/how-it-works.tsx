/**
 * Four steps, in the order a new organisation actually does them. Rendered as an ordered
 * list so the sequence survives without the numbers being decorative text.
 */

import { Printer, Upload, Wrench, BellRing } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { RevealList, RevealListItem } from './reveal';

interface Step {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
}

const STEPS: readonly Step[] = [
  {
    icon: Upload,
    title: 'Import your devices',
    body: 'Upload a CSV or XLSX of customers, locations and devices. Map the columns once, then review a dry run that flags every bad row before anything is written.',
  },
  {
    icon: Printer,
    title: 'Print the QR codes',
    body: 'Generate a sheet of codes and put one on each machine. That sticker stays the customer entry point for the whole life of the device.',
  },
  {
    icon: BellRing,
    title: 'Let the reminders run',
    body: 'ServisLoop watches every due date and notifies the customer at each stage. They pick a slot from the availability your business hours allow.',
  },
  {
    icon: Wrench,
    title: 'Close the loop on site',
    body: 'The technician runs the checklist and captures a signature. Completing the job issues the PDF report and sets the next due date automatically.',
  },
];

export function HowItWorks() {
  return (
    <RevealList className="grid list-none gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step, index) => (
        <RevealListItem key={step.title} className="h-full">
          <div className="relative flex h-full flex-col gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="tabular flex size-9 shrink-0 items-center justify-center rounded-full border border-border-base bg-surface-raised text-sm font-semibold text-brand-600"
              >
                {index + 1}
              </span>
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-border-base"
              />
              <step.icon aria-hidden="true" className="size-5 shrink-0 text-ink-subtle" />
            </div>
            <h3 className="text-base font-semibold text-ink">
              <span className="sr-only">Step {index + 1}: </span>
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-ink-muted">{step.body}</p>
          </div>
        </RevealListItem>
      ))}
    </RevealList>
  );
}
