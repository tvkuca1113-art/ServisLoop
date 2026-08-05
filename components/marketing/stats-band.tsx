/**
 * Numbers that describe how the product behaves, not how customers have done with it.
 *
 * ServisLoop has not launched, so there is no honest way to publish adoption or savings
 * figures. Every figure here is a property of the system that can be checked against the
 * code, and the band says so in the byline.
 */

import { RevealGroup, RevealItem } from './reveal';

interface Stat {
  readonly figure: string;
  readonly label: string;
  readonly note: string;
}

const STATS: readonly Stat[] = [
  {
    figure: '4',
    label: 'reminder stages',
    note: 'Thirty days out, seven days out, on the due date, and once more when it goes overdue.',
  },
  {
    figure: '0',
    label: 'double-sends',
    note: 'A unique key on device, due date and stage makes the dispatch job safe to retry.',
  },
  {
    figure: '3',
    label: 'ways a job starts',
    note: 'A scheduled service, a customer booking, or a fault the customer reported.',
  },
  {
    figure: '1',
    label: 'QR code per device',
    note: 'One sticker carries the history, the booking form and the fault report.',
  },
];

export function StatsBand() {
  return (
    <div className="flex flex-col gap-8">
      <RevealGroup className="grid gap-px overflow-hidden rounded-card border border-border-base bg-border-base sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <RevealItem key={stat.label} className="bg-surface-raised">
            <div className="flex h-full flex-col gap-2 p-6">
              <p className="flex items-baseline gap-2">
                <span className="tabular text-4xl font-semibold tracking-tight text-ink">
                  {stat.figure}
                </span>
                <span className="text-sm font-medium text-ink-muted">{stat.label}</span>
              </p>
              <p className="text-sm leading-relaxed text-ink-subtle">{stat.note}</p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
      <p className="text-sm text-ink-subtle">
        These describe what the software does. ServisLoop is pre-launch, so there are no
        customer results to quote yet.
      </p>
    </div>
  );
}
