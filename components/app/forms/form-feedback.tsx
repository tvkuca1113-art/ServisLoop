'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button, Spinner, type ButtonProps } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/server/actions/result';

/**
 * The three pieces every action-backed form needs, so that no form invents its own way of
 * reporting success or failure.
 *
 * All three are driven by the same {@link ActionResult} a server action returns, which is
 * why an action never has to throw for a person to find out what went wrong.
 */

export interface FormAlertProps {
  result: ActionResult<unknown> | null;
  className?: string;
}

/**
 * Result banner.
 *
 * Renders nothing for a success with no message — a form that quietly worked should not
 * congratulate itself. Failures always render, because a form that quietly failed is the
 * worst outcome there is.
 */
export function FormAlert({ result, className }: FormAlertProps) {
  if (!result) return null;

  if (result.ok) {
    if (!result.message) return null;
    return (
      <Alert variant="success" icon={<CircleCheck />} className={className}>
        <AlertTitle>{result.message}</AlertTitle>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" icon={<CircleAlert />} className={className}>
      <AlertTitle>{result.error}</AlertTitle>
      {result.fieldErrors ? (
        <AlertDescription>
          <ul className="list-inside list-disc">
            {Object.entries(result.fieldErrors).flatMap(([field, messages]) =>
              messages.map((message) => <li key={`${field}-${message}`}>{message}</li>),
            )}
          </ul>
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

export interface FieldErrorProps {
  /** Must match the input's `aria-describedby`, so the message is announced with the field. */
  id: string;
  message: string | undefined;
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-state-overdue">
      {message}
    </p>
  );
}

export interface SubmitButtonProps extends Omit<ButtonProps, 'type'> {
  pending: boolean;
  /** Shown while the action is in flight. Defaults to the idle label. */
  pendingLabel?: string;
}

/**
 * Submit button wired to an action's pending state.
 *
 * Disabled while in flight — the double-submit guard — and the label changes so the
 * feedback is not carried by the spinner alone.
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  className,
  disabled,
  ...props
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={disabled === true || pending}
      aria-busy={pending}
      className={cn(className)}
      {...props}
    >
      {pending ? <Spinner size="sm" label="" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
