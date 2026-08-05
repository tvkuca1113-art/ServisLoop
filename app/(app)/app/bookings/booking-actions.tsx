'use client';

import { CalendarCheck, X } from 'lucide-react';
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
import { confirmBooking, declineBooking } from '@/server/actions/intake';
import { fieldError } from '@/server/actions/result';

/**
 * Confirm or decline one booking request.
 *
 * Both decisions are confirmed in a dialog that says what will actually happen, because
 * neither is reversible from this screen: confirming puts a job on a technician's
 * calendar, declining tells a customer no. The dialog names the customer and the time so
 * the wrong row cannot be actioned by muscle memory.
 *
 * Which buttons render is decided on the server by `can()`. The actions re-check the same
 * permission — hiding a control is a courtesy, not the protection.
 */

export interface BookingActionsProps {
  bookingId: string;
  contactName: string;
  deviceName: string;
  /** `"11 August 2026, 08:00–10:00"`. */
  whenLabel: string;
  canConfirm: boolean;
  canDecline: boolean;
}

type ConfirmResult = Awaited<ReturnType<typeof confirmBooking>>;
type DeclineResult = Awaited<ReturnType<typeof declineBooking>>;

export function BookingActions({
  bookingId,
  contactName,
  deviceName,
  whenLabel,
  canConfirm,
  canDecline,
}: BookingActionsProps) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);

  const [confirmResult, confirmAction, confirmPending] = useActionState<
    ConfirmResult | null,
    FormData
  >(async (_previous, formData) => confirmBooking(formData), null);

  const [declineResult, declineAction, declinePending] = useActionState<
    DeclineResult | null,
    FormData
  >(async (_previous, formData) => declineBooking(formData), null);

  useEffect(() => {
    if (!confirmResult?.ok) return;
    toast({ title: confirmResult.message ?? 'Booking confirmed.', variant: 'success' });
    setConfirmOpen(false);
  }, [confirmResult, toast]);

  useEffect(() => {
    if (!declineResult?.ok) return;
    toast({ title: declineResult.message ?? 'Booking declined.', variant: 'default' });
    setDeclineOpen(false);
  }, [declineResult, toast]);

  if (!canConfirm && !canDecline) {
    return (
      <p className="text-sm text-ink-muted">
        Your role cannot action booking requests. Ask an administrator to confirm or decline it.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canConfirm ? (
        <Button
          onClick={() => {
            setConfirmOpen(true);
          }}
        >
          <CalendarCheck aria-hidden="true" />
          Confirm
        </Button>
      ) : null}

      {canDecline ? (
        <Button
          variant="secondary"
          onClick={() => {
            setDeclineOpen(true);
          }}
        >
          <X aria-hidden="true" />
          Decline
        </Button>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="Confirm this booking?"
          description={`${whenLabel} on ${deviceName}, for ${contactName}. A scheduled job is created at that time and the slot stops being offered to anyone else.`}
        >
          <FormAlert result={confirmResult} />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirmOpen(false);
              }}
            >
              Not yet
            </Button>
            <form action={confirmAction}>
              <input type="hidden" name="id" value={bookingId} />
              <SubmitButton pending={confirmPending} pendingLabel="Confirming…">
                Confirm and create the job
              </SubmitButton>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent
          title="Decline this booking?"
          description={`${contactName} asked for ${whenLabel}. The slot is released immediately — you still need to tell them.`}
        >
          <form action={declineAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={bookingId} />

            <FormAlert result={declineResult} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`decline-reason-${bookingId}`} required>
                Why?
              </Label>
              <Textarea
                id={`decline-reason-${bookingId}`}
                name="reason"
                rows={3}
                required
                maxLength={500}
                placeholder="Fully booked that morning — offered Thursday instead."
                aria-describedby={`decline-reason-error-${bookingId}`}
                aria-invalid={fieldError(declineResult, 'reason') !== undefined}
              />
              <FieldError
                id={`decline-reason-error-${bookingId}`}
                message={fieldError(declineResult, 'reason')}
              />
              <p className="text-xs text-ink-subtle">
                Kept with the request and in the audit log, so whoever rings them back knows what
                was decided.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDeclineOpen(false);
                }}
              >
                Keep it pending
              </Button>
              <SubmitButton
                pending={declinePending}
                pendingLabel="Declining…"
                variant="destructive"
              >
                Decline the request
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
