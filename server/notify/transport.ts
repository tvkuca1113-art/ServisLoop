import 'server-only';

import type { CivilDate } from '@/domain/dates';
import type { ReminderStage } from '@/domain/types';

/**
 * The reminder delivery boundary.
 *
 * ServisLoop ships with no email provider configured, and that is deliberate: the product
 * runs end-to-end on a clean checkout with no accounts, no keys and no outbound network.
 * The cost of that decision is exactly one interface — {@link ReminderTransport} — and the
 * dispatcher knows nothing else about how a message reaches a customer.
 *
 * ## Swapping in a real provider
 *
 * Implement `ReminderTransport` and return it from {@link getReminderTransport}. That is
 * the whole change; no other file needs editing. For example:
 *
 * ```ts
 * class ResendTransport implements ReminderTransport {
 *   readonly name = 'resend';
 *   async send(envelope: ReminderEnvelope): Promise<void> {
 *     if (!envelope.to) throw new Error('No recipient address.');
 *     const response = await fetch('https://api.resend.com/emails', {
 *       method: 'POST',
 *       headers: {
 *         Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
 *         'Content-Type': 'application/json',
 *         // Providers that support it will collapse a retry of the same reminder into
 *         // one delivery. ServisLoop does not depend on that — see `dispatch.ts` — but
 *         // it costs nothing to hand the key over.
 *         'Idempotency-Key': envelope.reminderId,
 *       },
 *       body: JSON.stringify({
 *         from: 'service@example.com',
 *         to: envelope.to,
 *         subject: envelope.subject,
 *         text: envelope.body,
 *       }),
 *     });
 *     if (!response.ok) throw new Error(`Resend responded ${response.status}.`);
 *   }
 * }
 * ```
 *
 * The contract a transport must honour is short:
 *
 * - **Throw on failure.** A resolved promise is taken as proof of handover, and the
 *   reminder row is moved to `sent`. Never resolve on a rejected send.
 * - **Do not retry internally past the request.** The dispatcher records the failure and
 *   an operator retries deliberately; a transport that retries forever hides the outage.
 * - **Do not mutate the message.** `renderReminderMessage` in the domain layer owns the
 *   wording, so the customer-facing text is reviewable and identical on every run.
 */

export interface ReminderEnvelope {
  /** Where the message goes. `null` when the customer has no address on file. */
  to: string | null;
  subject: string;
  body: string;
  /** The reminder row's id — a natural idempotency key for providers that accept one. */
  reminderId: string;
  organizationName: string;
  deviceName: string;
  locationName: string;
  stage: ReminderStage;
  dueDate: CivilDate;
}

export interface ReminderTransport {
  /** Short identifier, recorded in the dispatch log so an operator knows what ran. */
  readonly name: string;
  /** Resolve on successful handover, throw on anything else. */
  send(envelope: ReminderEnvelope): Promise<void>;
}

/**
 * The default transport: write the rendered message to the server log.
 *
 * This is not a stub that pretends to work. Nothing is claimed to have been emailed — the
 * log line says `[reminder:console]` — and the message printed is byte-for-byte the one a
 * provider would be handed, so the wording, the booking link and the timing can all be
 * reviewed before a provider is ever connected.
 */
export class ConsoleTransport implements ReminderTransport {
  readonly name = 'console';

  send(envelope: ReminderEnvelope): Promise<void> {
    const recipient = envelope.to ?? '(no address on file)';
    console.info(
      [
        `[reminder:console] ${envelope.stage} · ${envelope.organizationName}`,
        `  to:      ${recipient}`,
        `  device:  ${envelope.deviceName} at ${envelope.locationName}`,
        `  due:     ${envelope.dueDate}`,
        `  subject: ${envelope.subject}`,
        envelope.body
          .split('\n')
          .map((line) => `  | ${line}`)
          .join('\n'),
      ].join('\n'),
    );
    return Promise.resolve();
  }
}

let cached: ReminderTransport | null = null;

/**
 * The transport the dispatcher will use.
 *
 * Memoised per server process so a future provider client is constructed once. Replace the
 * body when you connect a provider; every caller goes through here.
 */
export function getReminderTransport(): ReminderTransport {
  cached ??= new ConsoleTransport();
  return cached;
}

/** Test hook — swap in a transport and clear it again afterwards. */
export function __setReminderTransportForTests(transport: ReminderTransport | null): void {
  cached = transport;
}
