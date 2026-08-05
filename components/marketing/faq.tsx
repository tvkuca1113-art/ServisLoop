/**
 * FAQ built on `<details>` / `<summary>`.
 *
 * Native disclosure means it opens with no JavaScript, is keyboard operable for free, and
 * announces its expanded state correctly in every screen reader. It also means the answers
 * are in the DOM for search engines even while collapsed.
 */

import { ChevronDown } from 'lucide-react';

import { Reveal } from './reveal';

interface QuestionAndAnswer {
  readonly question: string;
  readonly answer: string;
}

const FAQS: readonly QuestionAndAnswer[] = [
  {
    question: 'Do customers need an account to book or report a fault?',
    answer:
      'No. The device page, the booking form and the fault report are public. Each device carries its own 32-byte token, and that token is the only thing the public pages are scoped by, so there is nothing for a customer to sign up for or remember.',
  },
  {
    question: 'What happens if the reminder job runs twice in one day?',
    answer:
      'Nothing extra is sent. A reminder is identified by device, due date and stage, and that triple is unique in the database. The dispatch endpoint can be retried, run on a schedule and overlap with itself without a customer ever seeing the same notice twice.',
  },
  {
    question: 'Can I change a service interval after devices are already in the field?',
    answer:
      'Yes. Change it on the device, or on the device type it inherits from, and the next due date is recomputed together with the reminder ladder. Reminders whose send date has already passed are dropped rather than fired late. Reports that were already issued are never touched.',
  },
  {
    question: 'Are the PDF reports usable as maintenance evidence?',
    answer:
      'They are built for it. A report records the checklist results, who carried out the work, the timestamps and the signature captured on site. Checklist wording is snapshotted at completion, so editing a template months later cannot rewrite what a signed report says.',
  },
  {
    question: 'Does any of this depend on an AI service?',
    answer:
      'No. Due dates, reminder ladders, booking availability, permissions and report contents are all computed by plain, unit-tested code. If every external service you use went dark tomorrow, the scheduling logic would still produce the same answers.',
  },
];

export function Faq() {
  return (
    <Reveal className="flex flex-col gap-3">
      {FAQS.map((faq) => (
        <details
          key={faq.question}
          className="group rounded-card border border-border-base bg-surface-raised px-5 open:shadow-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
            {faq.question}
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 text-ink-subtle transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="pb-5 pr-8 text-sm leading-relaxed text-ink-muted">{faq.answer}</p>
        </details>
      ))}
    </Reveal>
  );
}
