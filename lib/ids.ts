import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Identifier generation. Server-only — `node:crypto` is not available in the browser.
 *
 * These live outside `src/domain` on purpose: the domain layer is forbidden from using
 * randomness so that it stays deterministic and testable. Identity generation is an
 * infrastructure concern, and it belongs here.
 */

export function newId(): string {
  return randomUUID();
}

/**
 * The unguessable token embedded in a device's QR code.
 *
 * 32 random bytes rendered as base64url — 256 bits of entropy, 43 characters. The public
 * device page is reachable by anyone holding this string, so it must not be enumerable.
 * Postgres enforces `char_length(public_token) >= 24` to stop a short test value from
 * ever reaching production.
 */
export function newPublicToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Short, human-quotable reference for support conversations. Not a security token. */
export function shortRef(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}
