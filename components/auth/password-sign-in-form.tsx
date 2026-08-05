'use client';

import { useActionState, useId } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import { Input, Label } from '@/components/ui';
import { signInWithPassword } from '@/server/actions/auth';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Email and password sign-in.
 *
 * The action redirects on success, so this component only ever renders the failure path —
 * which is exactly why the failure path has to be good.
 */
export function PasswordSignInForm({ next }: { next?: string }) {
  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => signInWithPassword(formData),
    null,
  );

  const emailId = useId();
  const passwordId = useId();
  const emailError = fieldError(result, 'email');
  const passwordError = fieldError(result, 'password');

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {result && !result.ok ? <FormAlert result={result} /> : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

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
          autoComplete="current-password"
          required
          aria-invalid={passwordError !== undefined}
          aria-describedby={passwordError ? `${passwordId}-error` : undefined}
        />
        <FieldError id={`${passwordId}-error`} message={passwordError} />
      </div>

      <SubmitButton pending={pending} pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
