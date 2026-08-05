'use client';

import { CalendarClock, CircleSlash, Play } from 'lucide-react';
import { useActionState, useEffect, useId, useState } from 'react';

import { FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Input,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { STATUS_LABELS } from '@/domain/work-order';
import type { WorkOrderStatus } from '@/domain/types';
import { cancelWorkOrder, startWorkOrder, updateWorkOrder } from '@/server/actions/work-orders';
import type { ActionResult } from '@/server/actions/result';

/**
 * The status controls for one job.
 *
 * The buttons rendered here are derived from `allowedTransitions` on the server and passed
 * in as `allowed` — this component never decides for itself what is legal. That is the
 * point: a technician looking at an unassigned job sees no "Start" button, because the
 * status machine says `scheduled → in_progress` needs an assignee, not because this file
 * remembered to check. If the transition table gains an edge, the button appears with no
 * edit here.
 *
 * Completion is deliberately absent. Closing a job means recording a checklist, so it
 * lives with the checklist — see `checklist-run.tsx`.
 */

export interface StatusActionsProps {
  workOrderId: string;
  code: string;
  status: WorkOrderStatus;
  /** Legal target states, straight from `allowedTransitions(status)`. */
  allowed: readonly WorkOrderStatus[];
  /** Current schedule, so "return to schedule" can pre-fill rather than ask twice. */
  scheduledDate: string;
  scheduledTime: string;
  priority: string;
  canStart: boolean;
  canUpdate: boolean;
  canCancel: boolean;
}

export function StatusActions({
  workOrderId,
  code,
  status,
  allowed,
  scheduledDate,
  scheduledTime,
  priority,
  canStart,
  canUpdate,
  canCancel,
}: StatusActionsProps) {
  const { toast } = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const [startResult, startAction, startPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(async (_previous, formData) => startWorkOrder(formData), null);

  useEffect(() => {
    if (!startResult) return;
    if (startResult.ok) toast({ title: startResult.message ?? 'Job started.', variant: 'success' });
    else toast({ title: startResult.error, variant: 'destructive' });
  }, [startResult, toast]);

  const showStart = allowed.includes('in_progress') && canStart;
  const showReschedule = status === 'in_progress' && allowed.includes('scheduled') && canUpdate;
  const showCancel = allowed.includes('cancelled') && canCancel;

  if (!showStart && !showReschedule && !showCancel) {
    return (
      <p className="text-sm text-ink-muted">
        {allowed.length === 0
          ? `This job is ${STATUS_LABELS[status].toLowerCase()}. A closed job is a record, so nothing here can change it.`
          : 'Your role cannot move this job on. Ask an administrator, or the technician it is assigned to.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showStart ? (
        <form action={startAction}>
          <input type="hidden" name="id" value={workOrderId} />
          <SubmitButton pending={startPending} pendingLabel="Starting…">
            <Play aria-hidden="true" />
            Start job
          </SubmitButton>
        </form>
      ) : null}

      {showReschedule ? (
        <Button
          variant="secondary"
          onClick={() => {
            setRescheduleOpen(true);
          }}
        >
          <CalendarClock aria-hidden="true" />
          Back to the calendar
        </Button>
      ) : null}

      {showCancel ? (
        <Button
          variant="ghost"
          className="text-state-overdue"
          onClick={() => {
            setCancelOpen(true);
          }}
        >
          <CircleSlash aria-hidden="true" />
          Cancel job
        </Button>
      ) : null}

      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        workOrderId={workOrderId}
        code={code}
        scheduledDate={scheduledDate}
        scheduledTime={scheduledTime}
        priority={priority}
      />

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        workOrderId={workOrderId}
        code={code}
      />
    </div>
  );
}

/**
 * Push a started job back onto the calendar.
 *
 * `in_progress → scheduled` exists for the visit that could not be finished — a part was
 * missing, the plant room was locked. It goes back with a new date rather than being
 * cancelled, because the work is still owed.
 */
function RescheduleDialog({
  open,
  onOpenChange,
  workOrderId,
  code,
  scheduledDate,
  scheduledTime,
  priority,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  code: string;
  scheduledDate: string;
  scheduledTime: string;
  priority: string;
}) {
  const { toast } = useToast();
  const dateId = useId();
  const timeId = useId();

  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => updateWorkOrder(formData),
    null,
  );

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Job rescheduled.', variant: 'success' });
    onOpenChange(false);
  }, [result, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Put ${code} back on the calendar`}
        description="The visit stays owed. Give it the date you expect to return, and it goes back to Scheduled."
      >
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="id" value={workOrderId} />
          <input type="hidden" name="priority" value={priority} />

          <FormAlert result={result} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={dateId} required>
                New date
              </Label>
              <Input id={dateId} name="scheduledDate" type="date" defaultValue={scheduledDate} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={timeId}>Start time</Label>
              <Input
                id={timeId}
                name="scheduledTime"
                type="time"
                defaultValue={scheduledTime || '08:00'}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Keep working
            </Button>
            <SubmitButton pending={pending} pendingLabel="Saving…">
              Reschedule
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  workOrderId,
  code,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: string;
  code: string;
}) {
  const { toast } = useToast();
  const reasonId = useId();

  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => cancelWorkOrder(formData),
    null,
  );

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Job cancelled.', variant: 'default' });
    onOpenChange(false);
  }, [result, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Cancel ${code}?`}
        description="Cancelling is final — there is no way back from it. The device keeps the service date this job was going to satisfy, so it will still come due."
      >
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="id" value={workOrderId} />

          <FormAlert result={result} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={reasonId}>Why?</Label>
            <Textarea
              id={reasonId}
              name="reason"
              rows={3}
              maxLength={500}
              placeholder="Customer cancelled the contract. Site sold."
            />
            <p className="text-xs text-ink-subtle">
              Kept on the job itself, not just in the audit log — whoever opens this in a
              year is reading the job.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Keep the job
            </Button>
            <SubmitButton pending={pending} pendingLabel="Cancelling…" variant="destructive">
              Cancel the job
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
