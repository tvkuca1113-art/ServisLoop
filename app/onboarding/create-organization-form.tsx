'use client';

import { useActionState } from 'react';

import { Button, Card, CardContent, Input, Label } from '@/components/ui';
import { createOrganizationForCurrentUser } from '@/server/actions/onboarding';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * The organisation-creation form.
 *
 * On success the action redirects, so this component never renders a success state —
 * only pending and failure.
 */
export function CreateOrganizationForm({ timezones }: { timezones: string[] }) {
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionResult<null> | null, formData: FormData) =>
      createOrganizationForCurrentUser(formData),
    null,
  );

  const nameError = fieldError(state, 'name');
  const timezoneError = fieldError(state, 'timezone');

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-5">
          {state && !state.ok && !state.fieldErrors ? (
            <p
              role="alert"
              className="rounded-md border border-state-overdue/40 bg-state-overdue/10 px-3 py-2 text-sm text-ink"
            >
              {state.error}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">Organisation name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={80}
              autoComplete="organization"
              placeholder="e.g. Termoservis Sarajevo d.o.o."
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'name-error' : undefined}
            />
            {nameError ? (
              <p id="name-error" className="text-sm text-state-overdue">
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              name="timezone"
              defaultValue={timezones[0]}
              className="h-10 w-full rounded-md border border-border-base bg-surface px-3 text-sm text-ink"
              aria-invalid={timezoneError ? true : undefined}
              aria-describedby={timezoneError ? 'timezone-error' : 'timezone-hint'}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('_', ' ')}
                </option>
              ))}
            </select>
            {timezoneError ? (
              <p id="timezone-error" className="text-sm text-state-overdue">
                {timezoneError}
              </p>
            ) : (
              <p id="timezone-hint" className="text-xs text-ink-muted">
                Service due dates and reminder send times are calculated against this zone.
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating…' : 'Create organisation'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
