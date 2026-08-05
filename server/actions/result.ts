/**
 * The server-action result contract.
 *
 * Every server action in ServisLoop returns one of these instead of throwing. A thrown
 * error crossing the action boundary becomes an opaque "An error occurred in the Server
 * Components render" in production, which tells the user nothing and the developer very
 * little; a discriminated result carries a sentence a person can act on and, for
 * validation failures, the per-field detail a form needs to mark its inputs.
 *
 * Deliberately *not* marked `'use server'`: a `'use server'` module may only export async
 * functions, and client components need these types and the `fail` helper at build time.
 *
 * Usage in a client component:
 *
 * ```tsx
 * const [state, formAction, pending] = useActionState(
 *   async (_prev: ActionResult<null> | null, formData: FormData) => updateMemberRole(formData),
 *   null,
 * );
 * ```
 */

export interface ActionSuccess<T> {
  ok: true;
  data: T;
  /** Short confirmation, safe to show in a toast or inline. */
  message?: string;
}

export interface ActionFailure {
  ok: false;
  /** One sentence, written for the person who hit the problem. */
  error: string;
  /** Zod's flattened field errors, keyed by form field name. */
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T = null> = ActionSuccess<T> | ActionFailure;

export function ok<T>(data: T, message?: string): ActionSuccess<T> {
  return message === undefined ? { ok: true, data } : { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionFailure {
  return fieldErrors === undefined ? { ok: false, error } : { ok: false, error, fieldErrors };
}

/** Convenience accessor for a client form: the first message for one field, if any. */
export function fieldError(
  result: ActionResult<unknown> | null | undefined,
  field: string,
): string | undefined {
  if (!result || result.ok) return undefined;
  return result.fieldErrors?.[field]?.[0];
}
