'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { diffDays } from '@/domain/dates';
import { STAGE_LABELS } from '@/domain/reminders';
import type { Reminder } from '@/domain/types';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';
import {
  REMINDER_GRACE_DAYS,
  dispatchDueReminders,
  type DispatchSummary,
} from '@/server/notify/dispatch';
import { syncDeviceReminders } from '@/server/service/scheduling';

import { guard } from './errors';
import { fail, ok, type ActionResult } from './result';

/**
 * Reminder actions.
 *
 * All three are gated on `reminder:manage`, which the matrix grants to owners and
 * administrators only — a technician can read the log but cannot make ServisLoop email a
 * customer.
 *
 * None of them decides *what* a reminder ladder should contain or *whether* a reminder is
 * due; `planReminders`, `reconcileReminders` and `selectDueReminders` in `src/domain` do
 * that, and `syncDeviceReminders` / `dispatchDueReminders` do the I/O. These are the thin
 * layer that authorises, validates and reports.
 */

const fieldErrorsOf = (error: z.ZodError): Record<string, string[]> =>
  z.flattenError(error).fieldErrors as Record<string, string[]>;

/* ------------------------------------------------------------------ */
/* Regenerate one device's ladder                                      */
/* ------------------------------------------------------------------ */

const regenerateSchema = z.object({ deviceId: z.uuid('Pick a device.') });

/**
 * Rebuild a device's reminder ladder from its current due date.
 *
 * Normally this happens automatically — `recalculateDeviceSchedule` calls the same
 * function after every completion, interval change and import. This action exists for the
 * case where the two got out of step: a store restored from a backup, a due date edited
 * directly, a demo being put back into a known state.
 *
 * It is idempotent. `reconcileReminders` diffs the ladder the due date implies against
 * what exists, so running it repeatedly creates nothing and cancels nothing. Already-sent
 * reminders are never withdrawn: the customer received them, and rewriting that history
 * would make the log lie.
 */
export async function regenerateDeviceReminders(
  formData: FormData,
): Promise<ActionResult<{ created: number; cancelled: number }>> {
  return guard('Could not rebuild the reminders for that device.', async () => {
    const session = await requirePermission('reminder:manage');

    const parsed = regenerateSchema.safeParse({ deviceId: formData.get('deviceId') });
    if (!parsed.success) return fail('Pick a device.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const device = await repo.getDevice(orgId, parsed.data.deviceId);
    if (!device) return fail('That device no longer exists.');

    const { created, cancelled } = await syncDeviceReminders(orgId, device, session.today);

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'reminder.regenerate',
      entity: 'device',
      entityId: device.id,
      meta: { created, cancelled, dueDate: device.nextServiceDue },
    });

    revalidatePath('/app/reminders');
    revalidatePath(`/app/devices/${device.id}`);

    const summary =
      created === 0 && cancelled === 0
        ? 'The ladder was already correct — nothing changed.'
        : `${created} reminder${created === 1 ? '' : 's'} scheduled, ${cancelled} withdrawn.`;

    return ok({ created, cancelled }, `${device.name}: ${summary}`);
  });
}

/* ------------------------------------------------------------------ */
/* Run the dispatch job by hand                                        */
/* ------------------------------------------------------------------ */

/**
 * Send everything that is due, now, for this organisation.
 *
 * The scheduled path is `POST /api/cron/reminders`, which sweeps every tenant. This action
 * is the same dispatcher scoped to the caller's own organisation, for the case where there
 * is no scheduler at all: offline demos, a local checkout, the first hour of a deployment.
 *
 * Pressing it twice is safe. The second run finds no `pending` rows left and reports
 * nothing sent — the same property the cron endpoint relies on.
 */
export async function dispatchRemindersNow(): Promise<ActionResult<DispatchSummary>> {
  return guard('Could not run the reminder dispatch.', async () => {
    const session = await requirePermission('reminder:manage');
    const repo = getRepository();
    const orgId = session.organization.id;

    const summary = await dispatchDueReminders({ today: session.today, orgId });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'reminder.dispatch',
      entity: 'reminder',
      entityId: null,
      meta: { ...summary, today: session.today },
    });

    revalidatePath('/app/reminders');
    revalidatePath('/app');

    return ok(summary, describeRun(summary));
  });
}

function describeRun(summary: DispatchSummary): string {
  if (summary.scanned === 0) return 'Nothing was due. No reminders were sent.';

  const parts = [`${summary.sent} sent`];
  if (summary.failed > 0) parts.push(`${summary.failed} failed`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);

  return `${parts.join(', ')} out of ${summary.scanned} due (transport: ${summary.transport}).`;
}

/* ------------------------------------------------------------------ */
/* Retry one failed reminder                                           */
/* ------------------------------------------------------------------ */

const retrySchema = z.object({ reminderId: z.uuid('Pick a reminder.') });

/**
 * Attempt one reminder again.
 *
 * A failed send is never retried automatically. An address that does not exist fails
 * identically on every attempt, and a job that keeps trying turns one bad record into a
 * permanent error loop — so the row keeps its error text and waits for a person.
 *
 * The row is moved back to `pending` and handed straight to the dispatcher, which applies
 * exactly the same rules as a scheduled run: a reminder that has since gone stale is
 * skipped rather than sent late, and one whose device was paused or serviced in the
 * meantime is skipped with the reason recorded on the row.
 */
export async function retryReminder(formData: FormData): Promise<ActionResult<DispatchSummary>> {
  return guard('Could not retry that reminder.', async () => {
    const session = await requirePermission('reminder:manage');

    const parsed = retrySchema.safeParse({ reminderId: formData.get('reminderId') });
    if (!parsed.success) return fail('Pick a reminder.', fieldErrorsOf(parsed.error));

    const repo = getRepository();
    const orgId = session.organization.id;

    const existing = await repo.listReminders(orgId);
    const reminder = existing.find((r) => r.id === parsed.data.reminderId);
    if (!reminder) return fail('That reminder no longer exists.');

    if (reminder.status === 'sent') {
      return fail(
        'That reminder was already sent. Re-sending it would tell the customer the same thing twice.',
      );
    }

    // Back to `pending` first, so the row the dispatcher sees satisfies the same
    // precondition a swept row does. Everything after this point is the ordinary path.
    const reset: Reminder = await repo.updateReminder(orgId, reminder.id, {
      status: 'pending',
      error: null,
      sentAt: null,
    });

    const summary = await dispatchDueReminders({
      today: session.today,
      orgId,
      reminders: [reset],
    });

    await repo.appendAuditLog({
      orgId,
      actorId: session.user.id,
      action: 'reminder.retry',
      entity: 'reminder',
      entityId: reminder.id,
      meta: { ...summary, stage: reminder.stage, previousStatus: reminder.status },
    });

    revalidatePath('/app/reminders');

    const label = `${STAGE_LABELS[reminder.stage]} reminder`;

    if (summary.sent === 1) return ok(summary, `${label} sent.`);
    if (summary.failed === 1) {
      return fail(
        `${label} failed again. The reason is recorded on the row — fix the address or the provider before retrying.`,
      );
    }

    // Two ways not to send, and they leave the row in different states, so they get
    // different sentences. A stale reminder stays `pending` with no error text — it is
    // nobody's mistake, just too late — while everything else records why on the row.
    const lateness = diffDays(reset.scheduledFor, session.today);
    if (lateness > REMINDER_GRACE_DAYS) {
      return ok(
        summary,
        `${label} was not sent: it was due to go out ${lateness} days ago, and a notice that late says something the customer already knows. It stays in the stuck list.`,
      );
    }

    return ok(
      summary,
      `${label} was not sent — the device it was raised for no longer needs it. The reason is recorded on the row.`,
    );
  });
}
