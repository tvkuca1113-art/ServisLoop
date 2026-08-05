'use client';

import { useActionState, useId } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import { Input, Label } from '@/components/ui';
import { signUpWithPassword } from '@/server/actions/auth';
import { fieldError, type ActionResult } from '@/server/actions/result';

/** Account creation. On success with email confirmation on, the result carries the copy. */
export function SignUpForm() {
  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => signUpWithPassword(formData),
    null,
  );

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  const nameError = fieldError(result, 'fullName');
  const emailError = fieldError(result, 'email');
  const passwordError = fieldError(result, 'password');

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert result={result} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId} required>
          Full name
        </Label>
        <Input
          id={nameId}
          name="fullName"
          autoComplete="name"
          required
          placeholder="Adnan Selimović"
          aria-invalid={nameError !== undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
        />
        <FieldError id={`${nameId}-error`} message={nameError} />
      </div>

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={passwordId} required>
          Password
        </Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-invalid={passwordError !== undefined}
          aria-describedby={passwordError ? `${passwordId}-error` : `${passwordId}-hint`}
        />
        <FieldError id={`${passwordId}-error`} message={passwordError} />
        {passwordError === undefined ? (
          <p id={`${passwordId}-hint`} className="text-sm text-ink-muted">
            At least 10 characters. A short sentence you will remember beats a scramble you
            will not.
          </p>
        ) : null}
      </div>

      <SubmitButton pending={pending} pendingLabel="Creating your account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}
