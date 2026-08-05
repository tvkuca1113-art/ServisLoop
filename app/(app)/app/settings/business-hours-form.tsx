'use client';

import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { useActionState, useId } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Label,
} from '@/components/ui';
import { formatCivilLong, formatMinuteOfDay } from '@/domain/dates';
import type { CivilDate } from '@/domain/dates';
import { WEEKDAY_ORDER, weekdayName } from '@/lib/weekdays';
import { addBlackoutDate, removeBlackoutDate, replaceBusinessHours } from '@/server/actions/org';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Opening hours and closed days.
 *
 * These two together are the entire input to the availability engine, which is why they
 * share a screen: a customer is offered a slot only when the weekday is open, the day is
 * not blacked out, and nothing else is already booked into it.
 *
 * The week is submitted whole rather than a day at a time — a half-applied update would
 * produce availability for a week that never existed.
 */

export interface BusinessHoursRow {
  weekday: number;
  isOpen: boolean;
  openMinute: number;
  closeMinute: number;
}

export interface BlackoutRow {
  id: string;
  date: CivilDate;
  reason: string | null;
}

export function BusinessHoursForm({
  hours,
  blackouts,
  today,
  canEdit,
}: {
  hours: readonly BusinessHoursRow[];
  blackouts: readonly BlackoutRow[];
  today: CivilDate;
  canEdit: boolean;
}) {
  const byWeekday = new Map(hours.map((h) => [h.weekday, h]));

  const [hoursResult, hoursAction, hoursPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(async (_previous, formData) => replaceBusinessHours(formData), null);

  const [addResult, addAction, addPending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => addBlackoutDate(formData),
    null,
  );

  const [removeResult, removeAction, removePending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(async (_previous, formData) => removeBlackoutDate(formData), null);

  const dateId = useId();
  const reasonId = useId();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-ink">Opening hours</h2>
          <p className="text-sm text-ink-muted">
            The window customers may book into on each weekday. Times are in the
            organisation&rsquo;s timezone.
          </p>
        </div>

        {!canEdit ? (
          <Alert>
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              Changing opening hours needs the Owner or Administrator role.
            </AlertDescription>
          </Alert>
        ) : null}

        <form action={hoursAction} className="flex flex-col gap-4" noValidate>
          <FormAlert result={hoursResult} />

          <fieldset disabled={!canEdit || hoursPending} className="flex flex-col gap-2 border-0 p-0">
            <legend className="sr-only">Opening hours for each weekday</legend>

            {WEEKDAY_ORDER.map((weekday) => {
              const row = byWeekday.get(weekday);
              const isOpen = row?.isOpen ?? false;
              const fromValue = formatMinuteOfDay(row?.openMinute ?? 8 * 60);
              const toValue = formatMinuteOfDay(row?.closeMinute ?? 17 * 60);
              const fromError = fieldError(hoursResult, `from-${weekday}`);
              const toError = fieldError(hoursResult, `to-${weekday}`);

              return (
                <div
                  key={weekday}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border-base bg-surface px-3 py-2"
                >
                  <div className="flex min-w-40 items-center gap-2.5">
                    <Checkbox
                      id={`open-${weekday}`}
                      name={`open-${weekday}`}
                      defaultChecked={isOpen}
                    />
                    <Label htmlFor={`open-${weekday}`} className="font-medium">
                      {weekdayName(weekday)}
                    </Label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={`from-${weekday}`} className="text-ink-muted">
                      Open
                    </Label>
                    <Input
                      id={`from-${weekday}`}
                      name={`from-${weekday}`}
                      type="time"
                      defaultValue={fromValue}
                      className="w-32"
                      aria-invalid={fromError !== undefined}
                    />
                    <Label htmlFor={`to-${weekday}`} className="text-ink-muted">
                      Close
                    </Label>
                    <Input
                      id={`to-${weekday}`}
                      name={`to-${weekday}`}
                      type="time"
                      defaultValue={toValue}
                      className="w-32"
                      aria-invalid={toError !== undefined}
                    />
                  </div>

                  <div className="w-full">
                    <FieldError id={`from-${weekday}-error`} message={fromError} />
                    <FieldError id={`to-${weekday}-error`} message={toError} />
                  </div>
                </div>
              );
            })}
          </fieldset>

          {canEdit ? (
            <div>
              <SubmitButton pending={hoursPending} pendingLabel="Saving…">
                Save opening hours
              </SubmitButton>
            </div>
          ) : null}
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-ink">Closed days</h2>
          <p className="text-sm text-ink-muted">
            Public holidays, shutdowns and training days. No booking slots are offered on
            these dates, whatever the opening hours say.
          </p>
        </div>

        <FormAlert result={removeResult} />

        {blackouts.length === 0 ? (
          <EmptyState
            titleAs="h3"
            icon={<CalendarOff />}
            title="No closed days"
            description="Every day that is open in the schedule above is currently bookable."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {blackouts.map((blackout) => (
              <li
                key={blackout.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border-base bg-surface px-3 py-2"
              >
                <span className="font-medium text-ink">{formatCivilLong(blackout.date)}</span>
                <span className="text-sm text-ink-muted">
                  {blackout.reason ?? 'No reason recorded'}
                </span>
                {canEdit ? (
                  <form action={removeAction} className="ml-auto">
                    <input type="hidden" name="id" value={blackout.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={removePending}
                      aria-label={`Remove ${blackout.date} from the closed days`}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form
            action={addAction}
            className="flex flex-col gap-3 rounded-card border border-border-base p-4"
            noValidate
          >
            <h3 className="text-sm font-semibold text-ink">Add a closed day</h3>
            <FormAlert result={addResult} />

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={dateId} required>
                  Date
                </Label>
                <Input
                  id={dateId}
                  name="date"
                  type="date"
                  min={today}
                  required
                  className="w-44"
                  aria-invalid={fieldError(addResult, 'date') !== undefined}
                  aria-describedby={`${dateId}-error`}
                />
                <FieldError id={`${dateId}-error`} message={fieldError(addResult, 'date')} />
              </div>

              <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                <Label htmlFor={reasonId}>Reason</Label>
                <Input
                  id={reasonId}
                  name="reason"
                  maxLength={120}
                  placeholder="Company training day"
                  aria-describedby={`${reasonId}-error`}
                />
                <FieldError id={`${reasonId}-error`} message={fieldError(addResult, 'reason')} />
              </div>

              <SubmitButton pending={addPending} pendingLabel="Adding…" variant="secondary">
                <Plus aria-hidden="true" />
                Add closed day
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
