'use client';

import { CircleCheck, Send } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from '@/components/ui';
import type { IssueSeverity } from '@/domain/types';
import { cn } from '@/lib/utils';
import { submitIssue } from '@/server/actions/intake';
import { fieldError } from '@/server/actions/result';

/**
 * The fault report form.
 *
 * Severity is asked in plain language, never as "priority". A caretaker cannot be
 * expected to know what "P2" means to a dispatcher, but everyone can answer "is it still
 * working?". The four answers below map onto the domain's severities, which
 * `priorityForIssue` then turns into a work-order priority — so the person who found the
 * fault describes reality, and the system does the translation.
 */

interface SeverityOption {
  value: IssueSeverity;
  label: string;
  description: string;
  /** Token class for the leading marker. Colour is never the only signal. */
  dot: string;
}

const SEVERITIES: readonly SeverityOption[] = [
  {
    value: 'low',
    label: 'It still works, but something is off',
    description: 'A noise, a small leak, a light that should not be on. Nothing has stopped.',
    dot: 'bg-state-ok',
  },
  {
    value: 'normal',
    label: 'It works badly',
    description: 'Not heating properly, cutting out, needs restarting. Usable, but not right.',
    dot: 'bg-state-soon',
  },
  {
    value: 'high',
    label: 'It has stopped working',
    description: 'Nothing comes on, or it stops as soon as it starts. Nobody can use it.',
    dot: 'bg-state-due',
  },
  {
    value: 'critical',
    label: 'It is dangerous',
    description: 'Smoke, burning smell, gas, water everywhere, exposed wiring. We will treat it as an emergency.',
    dot: 'bg-state-overdue',
  },
];

export interface ReportFormProps {
  token: string;
  deviceName: string;
  organizationName: string;
  /** Retired devices cannot be booked, so the follow-up link is dropped. */
  canBook: boolean;
}

type IssueResult = Awaited<ReturnType<typeof submitIssue>>;

export function ReportForm({ token, deviceName, organizationName, canBook }: ReportFormProps) {
  const [severity, setSeverity] = useState<IssueSeverity>('normal');

  const [result, formAction, pending] = useActionState<IssueResult | null, FormData>(
    async (_previous, formData) => submitIssue(formData),
    null,
  );

  if (result?.ok) {
    return (
      <Card>
        <CardHeader className="gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-full bg-state-ok/15 text-state-ok"
          >
            <CircleCheck className="size-5" />
          </span>
          <CardTitle as="h2" className="text-xl">
            Report sent
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-ink">
            &ldquo;{result.data.title}&rdquo; has been logged against {deviceName}.
          </p>

          <div className="flex flex-col gap-2 rounded-card border border-border-base bg-surface-muted p-4">
            <h3 className="text-sm font-semibold text-ink">What happens next</h3>
            <ol className="flex list-inside list-decimal flex-col gap-1.5 text-sm text-ink-muted">
              <li>{organizationName} sees it in their queue, with the device and site attached.</li>
              <li>
                They decide whether it needs a visit. If it does, it becomes a job with the
                urgency you described.
              </li>
              <li>If you left contact details, they will come back to you on them.</li>
            </ol>
          </div>

          <p className="text-sm text-ink-muted">
            If it is dangerous, do not wait for a reply — isolate the device and call
            {' '}
            {organizationName} directly.
          </p>

          <div className="flex flex-col gap-2">
            <Button variant="secondary" asChild className="w-full">
              <Link href={`/d/${token}`}>Back to the device</Link>
            </Button>
            {canBook ? (
              <Button variant="ghost" asChild className="w-full">
                <Link href={`/d/${token}/book`}>Book a service visit as well</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="publicToken" value={token} />

      <FormAlert result={result} />

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-sm font-medium text-ink">How bad is it?</legend>

        <div className="flex flex-col gap-2">
          {SEVERITIES.map((option) => (
            <label key={option.value} className="contents">
              <input
                type="radio"
                name="severity"
                value={option.value}
                checked={severity === option.value}
                onChange={() => {
                  setSeverity(option.value);
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-card border border-border-base bg-surface px-4 py-3 transition-colors',
                  'hover:border-border-strong',
                  'peer-checked:border-brand-600 peer-checked:bg-brand-600/10',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600',
                )}
              >
                <span aria-hidden="true" className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', option.dot)} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-ink">{option.label}</span>
                  <span className="text-xs text-ink-muted">{option.description}</span>
                </span>
              </span>
            </label>
          ))}
        </div>

        <FieldError id="severity-error" message={fieldError(result, 'severity')} />
      </fieldset>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title" required>
            What is wrong, in a few words?
          </Label>
          <Input
            id="title"
            name="title"
            required
            maxLength={140}
            placeholder="Loud knocking when it starts"
            aria-describedby="title-error"
            aria-invalid={fieldError(result, 'title') !== undefined}
          />
          <FieldError id="title-error" message={fieldError(result, 'title')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Tell them more</Label>
          <Textarea
            id="description"
            name="description"
            rows={5}
            maxLength={4000}
            placeholder="When did it start? Does it happen every time? Any error code on the panel?"
            aria-describedby="description-error"
          />
          <FieldError id="description-error" message={fieldError(result, 'description')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reporterName" required>
            Your name
          </Label>
          <Input
            id="reporterName"
            name="reporterName"
            autoComplete="name"
            required
            maxLength={120}
            aria-describedby="reporterName-error"
            aria-invalid={fieldError(result, 'reporterName') !== undefined}
          />
          <FieldError id="reporterName-error" message={fieldError(result, 'reporterName')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reporterEmail">Email</Label>
          <Input
            id="reporterEmail"
            name="reporterEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={200}
            aria-describedby="reporterEmail-error"
            aria-invalid={fieldError(result, 'reporterEmail') !== undefined}
          />
          <FieldError id="reporterEmail-error" message={fieldError(result, 'reporterEmail')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reporterPhone">Phone</Label>
          <Input
            id="reporterPhone"
            name="reporterPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            aria-describedby="reporterPhone-hint"
            aria-invalid={fieldError(result, 'reporterPhone') !== undefined}
          />
          <p id="reporterPhone-hint" className="text-xs text-ink-subtle">
            Optional, but it is how they reach you if they need more detail.
          </p>
          <FieldError id="reporterPhone-error" message={fieldError(result, 'reporterPhone')} />
        </div>
      </div>

      <SubmitButton
        pending={pending}
        pendingLabel="Sending…"
        size="lg"
        className="h-14 w-full text-base"
      >
        <Send aria-hidden="true" className="size-5" />
        Send this report
      </SubmitButton>
    </form>
  );
}
