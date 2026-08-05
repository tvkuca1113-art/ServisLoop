import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Reveal } from '@/components/marketing/reveal';
import { Section, SectionHeader } from '@/components/marketing/section';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with the ServisLoop team about pilots, migrations from an existing maintenance system, or how the scheduling core works.',
};

const TOPICS = [
  'A pilot with our own devices',
  'Migrating from another maintenance system',
  'Pricing and plan limits',
  'Security, hosting and data residency',
  'Something else',
];

const DETAILS = [
  {
    icon: Mail,
    label: 'Email',
    value: 'hello@servisloop.com',
    href: 'mailto:hello@servisloop.com',
  },
  {
    icon: Phone,
    label: 'Phone',
    value: '+387 33 555 010',
    href: 'tel:+38733555010',
  },
  {
    icon: MapPin,
    label: 'Office',
    value: 'Zmaja od Bosne 4, 71000 Sarajevo, Bosnia and Herzegovina',
    href: null,
  },
  {
    icon: Clock,
    label: 'Hours',
    value: 'Monday to Friday, 08:00 to 16:00 CET',
    href: null,
  },
] as const;

/**
 * Static markup only. There is no server action and no `action` attribute, so nothing is
 * transmitted when the button is pressed; the note under the form says as much rather
 * than pretending a message was sent.
 */
// TODO: wire to /api/contact
function ContactForm() {
  return (
    <form className="flex flex-col gap-5" aria-describedby="contact-form-status">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-name" required>
            Name
          </Label>
          <Input id="contact-name" name="name" autoComplete="name" placeholder="Amina Hodžić" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-email" required>
            Work email
          </Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="amina@northline.example"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-company">Company</Label>
          <Input
            id="contact-company"
            name="company"
            autoComplete="organization"
            placeholder="Northline HVAC"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-devices">Devices under service</Label>
          <Input
            id="contact-devices"
            name="devices"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="240"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-topic">What is this about?</Label>
        <select
          id="contact-topic"
          name="topic"
          defaultValue={TOPICS[0]}
          className="h-9 w-full rounded-md border border-border-base bg-surface px-3 text-sm text-ink shadow-sm transition-colors hover:border-border-strong"
        >
          {TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-message" required>
          Message
        </Label>
        <Textarea
          id="contact-message"
          name="message"
          rows={6}
          placeholder="Tell us what you service, how many sites, and how the schedule is tracked today."
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit">Send message</Button>
        <p id="contact-form-status" className="text-sm text-ink-subtle">
          This form is not connected yet. Until it is, email{' '}
          <a
            href="mailto:hello@servisloop.com"
            className="font-medium text-brand-600 underline-offset-4 hover:underline"
          >
            hello@servisloop.com
          </a>
          .
        </p>
      </div>
    </form>
  );
}

export default function ContactPage() {
  return (
    <>
      <Section spacing="compact" className="pt-16 sm:pt-20">
        <SectionHeader
          as="h1"
          eyebrow="Contact"
          title="Tell us what you service"
          description="Pilots, migrations and awkward questions about how the scheduling works are all welcome. A person reads every message."
        />
      </Section>

      <Section spacing="compact" className="pb-20 sm:pb-24">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
          <Reveal>
            <Card className="py-7">
              <CardHeader>
                <CardTitle as="h2" className="text-lg">
                  Send a message
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ContactForm />
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={0.06} className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <h2 className="text-lg font-semibold text-ink">Company details</h2>
              <dl className="flex flex-col gap-5">
                {DETAILS.map((detail) => (
                  <div key={detail.label} className="flex gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                      <detail.icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">
                        {detail.label}
                      </dt>
                      <dd className="text-sm leading-relaxed text-ink">
                        {detail.href ? (
                          <a
                            href={detail.href}
                            className="text-ink underline-offset-4 hover:underline"
                          >
                            {detail.value}
                          </a>
                        ) : (
                          detail.value
                        )}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-relaxed text-ink-subtle">
                ServisLoop is pre-launch. The registered address and phone number above are
                placeholders for this site, and company registration and VAT numbers will be
                published at launch.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-card border border-border-base bg-surface-muted p-6">
              <h2 className="text-base font-semibold text-ink">Already have an account?</h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                Support requests move faster from inside the app, where we can see the organisation
                and the device in question.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild variant="secondary" size="sm">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/pricing">See pricing</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
