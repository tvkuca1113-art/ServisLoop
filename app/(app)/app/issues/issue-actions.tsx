'use client';

import { CircleCheck, Wrench } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { closeIssue, convertIssueToWorkOrder } from '@/server/actions/intake';
import { fieldError } from '@/server/actions/result';

/**
 * The two decisions a reported fault needs: does it become a job, or is it finished here?
 *
 * "Convert to job" is not undoable from this screen — it allocates a work-order code and
 * puts the fault in front of a technician — so it goes through a dialog that says what
 * will be created. Closing asks for a note, because "closed" with no explanation is
 * indistinguishable from "ignored" when someone reads the record six months later.
 */

export interface IssueActionsProps {
  issueId: string;
  title: string;
  deviceName: string;
  /** Already converted — the job exists, so only closing is left. */
  hasWorkOrder: boolean;
  canTriage: boolean;
  canClose: boolean;
}

type ConvertResult = Awaited<ReturnType<typeof convertIssueToWorkOrder>>;
type CloseResult = Awaited<ReturnType<typeof closeIssue>>;

export function IssueActions({
  issueId,
  title,
  deviceName,
  hasWorkOrder,
  canTriage,
  canClose,
}: IssueActionsProps) {
  const { toast } = useToast();
  const [convertOpen, setConvertOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const [convertResult, convertAction, convertPending] = useActionState<
    ConvertResult | null,
    FormData
  >(async (_previous, formData) => convertIssueToWorkOrder(formData), null);

  const [closeResult, closeAction, closePending] = useActionState<CloseResult | null, FormData>(
    async (_previous, formData) => closeIssue(formData),
    null,
  );

  useEffect(() => {
    if (!convertResult?.ok) return;
    toast({ title: convertResult.message ?? 'Job created.', variant: 'success' });
    setConvertOpen(false);
  }, [convertResult, toast]);

  useEffect(() => {
    if (!closeResult?.ok) return;
    toast({ title: closeResult.message ?? 'Report closed.', variant: 'default' });
    setCloseOpen(false);
  }, [closeResult, toast]);

  const showConvert = canTriage && !hasWorkOrder;

  if (!showConvert && !canClose) {
    return (
      <p className="text-sm text-ink-muted">
        Your role cannot triage reports. Ask an administrator to turn this into a job or close it.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showConvert ? (
        <Button
          onClick={() => {
            setConvertOpen(true);
          }}
        >
          <Wrench aria-hidden="true" />
          Convert to job
        </Button>
      ) : null}

      {canClose ? (
        <Button
          variant="secondary"
          onClick={() => {
            setCloseOpen(true);
          }}
        >
          <CircleCheck aria-hidden="true" />
          Close
        </Button>
      ) : null}

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent
          title="Turn this report into a job?"
          description={`A work order is opened against ${deviceName} for "${title}", carrying the urgency the reporter gave it. Assign and schedule it from the work orders screen.`}
        >
          <FormAlert result={convertResult} />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConvertOpen(false);
              }}
            >
              Not yet
            </Button>
            <form action={convertAction}>
              <input type="hidden" name="id" value={issueId} />
              <SubmitButton pending={convertPending} pendingLabel="Creating…">
                Create the job
              </SubmitButton>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent
          title="Close this report?"
          description={`"${title}" on ${deviceName}. Closing it takes it out of the queue.`}
        >
          <form action={closeAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={issueId} />

            <FormAlert result={closeResult} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-note-${issueId}`} required>
                What happened?
              </Label>
              <Textarea
                id={`close-note-${issueId}`}
                name="note"
                rows={3}
                required
                maxLength={500}
                placeholder="Talked them through resetting it — no visit needed."
                aria-describedby={`close-note-error-${issueId}`}
                aria-invalid={fieldError(closeResult, 'note') !== undefined}
              />
              <FieldError
                id={`close-note-error-${issueId}`}
                message={fieldError(closeResult, 'note')}
              />
              <p className="text-xs text-ink-subtle">
                Kept with the report and in the audit log.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCloseOpen(false);
                }}
              >
                Keep it open
              </Button>
              <SubmitButton pending={closePending} pendingLabel="Closing…">
                Close the report
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
