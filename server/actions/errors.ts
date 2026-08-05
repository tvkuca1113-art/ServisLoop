import 'server-only';

import { z } from 'zod';

import { ForbiddenError } from '@/domain/permissions';
import { ConflictError, NotFoundError } from '@/server/data/repository';

import { fail, type ActionFailure, type ActionResult } from './result';

/**
 * Error translation for server actions.
 *
 * Two categories have to be told apart. Next signals control flow — `redirect()`,
 * `notFound()` — by *throwing*, and those throws must reach the framework untouched. A
 * blanket `catch` inside an action would swallow them and leave the user on a page that
 * silently did nothing. Everything else is a real failure and gets converted to an
 * {@link ActionFailure} the form can render.
 */

interface ErrorWithDigest {
  digest: string;
}

function hasDigest(error: unknown): error is ErrorWithDigest {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest: unknown }).digest === 'string'
  );
}

/**
 * True for Next's control-flow throws (`NEXT_REDIRECT`, `NEXT_HTTP_ERROR_FALLBACK`, …).
 *
 * Matched on the `digest` prefix rather than by importing Next's internal predicate,
 * which is not part of the public API and has moved between minor releases.
 */
export function isFrameworkError(error: unknown): boolean {
  return hasDigest(error) && error.digest.startsWith('NEXT_');
}

/** Turn a Zod failure into a field-level {@link ActionFailure}. */
export function zodFailure(error: z.ZodError, message: string): ActionFailure {
  const flattened = z.flattenError(error);
  return fail(message, flattened.fieldErrors as Record<string, string[]>);
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ForbiddenError) {
    return 'Your role does not allow that. Ask an owner or administrator to do it for you.';
  }
  // Conflicts and missing rows carry copy written for a person — surface them verbatim.
  if (error instanceof ConflictError || error instanceof NotFoundError) return error.message;
  return fallback;
}

/**
 * Run an action body, converting anything thrown into a failure result.
 *
 * @param fallback the message shown for an error we have no specific copy for. Write it
 *                 as a sentence about *this* action, not a generic "Something went wrong".
 */
export async function guard<T>(
  fallback: string,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (isFrameworkError(error)) throw error;
    if (error instanceof z.ZodError) return zodFailure(error, fallback);
    return fail(describe(error, fallback));
  }
}
