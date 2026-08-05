'use client';

import { RotateCw, Send } from 'lucide-react';
import { useActionState, useEffect } from 'react';

import { SubmitButton } from '@/components/app/forms/form-feedback';
import { useToast } from '@/components/ui';
import { dispatchRemindersNow, retryReminder } from '@/server/actions/reminders';

/**
 * The two controls on the reminder log that actually send something.
 *
 * Both are rendered only when the server decided the role allows it, and both actions
 * re-check `reminder:manage` — hiding a control is a courtesy, not the protection.
 *
 * Result types are derived from the actions rather than imported from
 * `@/server/notify/dispatch`, which is marked `server-only` and must not be pulled into a
 * client bundle even for its types.
 */

type DispatchResult = Awaited<ReturnType<typeof dispatchRemindersNow>>;
type RetryResult = Awaited<ReturnType<typeof retryReminder>>;

/**
 * Run the dispatch job by hand.
 *
 * Present because a local checkout has no scheduler: without this, the reminder ladder is
 * something you have to take on trust. Pressing it twice is safe — the second run finds no
 * pending rows and says so.
 */
export function DispatchNowButton({ dueCount }: { dueCount: number }) {
  const { toast } = useToast();

  const [result, formAction, pending] = useActionState<DispatchResult | null, FormData>(
    async () => dispatchRemindersNow(),
    null,
  );

  useEffect(() => {
    if (!result) return;
    toast(
      result.ok
        ? { title: result.message ?? 'Dispatch finished.', variant: 'success' }
        : { title: result.error, variant: 'destructive' },
    );
  }, [result, toast]);

  return (
    <form action={formAction}>
      <SubmitButton
        pending={pending}
        pendingLabel="Sending…"
        variant={dueCount > 0 ? 'default' : 'secondary'}
      >
        <Send aria-hidden="true" />
        {dueCount > 0 ? `Run dispatch now (${dueCount} due)` : 'Run dispatch now'}
      </SubmitButton>
    </form>
  );
}

/** Try one failed reminder again. Deliberately per-row: a bad address fails every time. */
export function RetryReminderButton({
  reminderId,
  deviceName,
}: {
  reminderId: string;
  deviceName: string;
}) {
  const { toast } = useToast();

  const [result, formAction, pending] = useActionState<RetryResult | null, FormData>(
    async (_previous, formData) => retryReminder(formData),
    null,
  );

  useEffect(() => {
    if (!result) return;
    toast(
      result.ok
        ? { title: result.message ?? 'Reminder retried.', variant: 'success' }
        : { title: result.error, variant: 'destructive' },
    );
  }, [result, toast]);

  return (
    <form action={formAction}>
      <input type="hidden" name="reminderId" value={reminderId} />
      <SubmitButton
        pending={pending}
        pendingLabel="Retrying…"
        variant="secondary"
        size="sm"
        aria-label={`Retry the reminder for ${deviceName}`}
      >
        <RotateCw aria-hidden="true" />
        Retry
      </SubmitButton>
    </form>
  );
}
