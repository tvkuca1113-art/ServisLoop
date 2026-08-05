/**
 * The closing call to action. Takes its copy from the caller so the home page, the
 * features page and the pricing page can each end on the sentence that fits them.
 */

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui';

import { Reveal } from './reveal';
import { Container } from './section';

export interface CtaBandProps {
  title?: string;
  description?: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  note?: string;
}

export function CtaBand({
  title = 'Put your service schedule on rails',
  description = 'Import your devices, print the QR sheet, and let the due dates take care of themselves.',
  primary = { href: '/sign-up', label: 'Start free' },
  secondary = { href: '/contact', label: 'Talk to us' },
  note = 'Works on a clean install with no external services configured.',
}: CtaBandProps) {
  return (
    <section className="w-full border-y border-border-base bg-surface-muted py-16 sm:py-20">
      <Container>
        <Reveal className="flex flex-col items-start gap-6 rounded-card border border-border-base bg-surface-raised p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {title}
            </h2>
            <p className="text-pretty leading-relaxed text-ink-muted">{description}</p>
            {note ? <p className="text-sm text-ink-subtle">{note}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={primary.href}>
                {primary.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {secondary ? (
              <Button asChild size="lg" variant="outline">
                <Link href={secondary.href}>{secondary.label}</Link>
              </Button>
            ) : null}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
