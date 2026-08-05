'use client';

import { useActionState, useId } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import { Input, Label } from '@/components/ui';
import { sendMagicLink } from '@/server/actions/auth';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Passwordless sign-in.
 *
 * The confirmation is deliberately non-committal — "if that address has an account" —
 * because a definite "no such user" turns this form into a way of testing whether a
 * given person works at a given company.
 */
export function MagicLinkForm() {
  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => sendMagicLink(formData),
    null,
  );

  const emailId = useId();
  const emailError = fieldError(result, 'email');

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert result={result} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={emailId} required>
          Work email
        </Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          aria-invalid={emailError !== undefined}
          aria-describedby={emailError ? `${emailId}-error` : undefined}
        />
        <FieldError id={`${emailId}-error`} message={emailError} />
      </div>

      <SubmitButton
        pending={pending}
        pendingLabel="Sending…"
        variant="secondary"
        className="w-full"
      >
        Email me a sign-in link
      </SubmitButton>
    </form>
  );
}
