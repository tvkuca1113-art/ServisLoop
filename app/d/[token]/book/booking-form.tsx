'use client';

import { CalendarCheck, Clock } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import { formatCivilLong, type CivilDate } from '@/domain/dates';
import { cn } from '@/lib/utils';
import { submitBooking } from '@/server/actions/intake';
import { fieldError } from '@/server/actions/result';

/**
 * The booking form: day picker, slot grid, contact details.
 *
 * Day switching is client state rather than a navigation, so a customer who has typed
 * their name and phone number and then changes their mind about Tuesday does not lose
 * what they typed. Every day in the window arrives pre-computed from the server, so
 * switching costs nothing and the client never computes availability itself.
 *
 * Slots that cannot be taken are shown, disabled, with the reason underneath — see the
 * page comment for why hiding them is worse.
 */

export interface SlotOption {
  startMinute: number;
  /** `"08:00–10:00"`. */
  label: string;
  available: boolean;
  /** Plain-language reason, present exactly when `available` is false. */
  reason: string | null;
}

export interface DayOption {
  date: CivilDate;
  /** `"Mon"`. */
  weekday: string;
  /** `"11 Aug"`. */
  dayLabel: string;
  availableCount: number;
  slots: SlotOption[];
}

export interface BookingFormProps {
  token: string;
  deviceName: string;
  organizationName: string;
  days: DayOption[];
  initialDate: CivilDate;
}

type BookingResult = Awaited<ReturnType<typeof submitBooking>>;

export function BookingForm({
  token,
  deviceName,
  organizationName,
  days,
  initialDate,
}: BookingFormProps) {
  const [selectedDate, setSelectedDate] = useState<CivilDate>(initialDate);
  const [selectedStart, setSelectedStart] = useState<number | null>(null);

  const [result, formAction, pending] = useActionState<BookingResult | null, FormData>(
    async (_previous, formData) => submitBooking(formData),
    null,
  );

  const selectedDay = days.find((d) => d.date === selectedDate) ?? days[0];
  if (!selectedDay) return null;

  if (result?.ok) {
    return (
      <Card>
        <CardHeader className="gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-full bg-state-ok/15 text-state-ok"
          >
            <CalendarCheck className="size-5" />
          </span>
          <CardTitle as="h2" className="text-xl">
            Request sent
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-ink">
            You asked for <span className="font-medium">{formatCivilLong(result.data.date)}</span>,{' '}
            <span className="font-medium">{result.data.time}</span>, for {deviceName}.
          </p>

          <div className="flex flex-col gap-2 rounded-card border border-border-base bg-surface-muted p-4">
            <h3 className="text-sm font-semibold text-ink">What happens next</h3>
            <ol className="flex list-inside list-decimal flex-col gap-1.5 text-sm text-ink-muted">
              <li>{organizationName} sees the request in their diary straight away.</li>
              <li>
                They confirm it — or offer a different time if that slot has just gone — using the
                contact details you left.
              </li>
              <li>
                The slot is held for you in the meantime, so nobody else can book over it while
                they decide.
              </li>
            </ol>
          </div>

          <p className="text-sm text-ink-muted">
            Nothing else to do. If it is urgent, report it as a problem as well so it is flagged.
          </p>

          <div className="flex flex-col gap-2">
            <Button variant="secondary" asChild className="w-full">
              <Link href={`/d/${token}`}>Back to the device</Link>
            </Button>
            <Button variant="ghost" asChild className="w-full">
              <Link href={`/d/${token}/report`}>Report a problem too</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="publicToken" value={token} />
      <input type="hidden" name="date" value={selectedDay.date} />

      <FormAlert result={result} />

      {/* Day picker — a scrolling row of chips, thumb-sized. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-sm font-medium text-ink">Pick a day</legend>
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
          {days.map((day) => {
            const isSelected = day.date === selectedDay.date;
            const isClosed = day.slots.length === 0;

            return (
              <button
                key={day.date}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedDate(day.date);
                  setSelectedStart(null);
                }}
                className={cn(
                  'flex min-w-[4.5rem] shrink-0 snap-start flex-col items-center gap-0.5 rounded-card border px-3 py-2.5 transition-colors',
                  isSelected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-border-base bg-surface text-ink hover:border-border-strong',
                )}
              >
                <span className="text-xs font-medium opacity-80">{day.weekday}</span>
                <span className="text-sm font-semibold">{day.dayLabel}</span>
                <span className={cn('text-[0.6875rem]', isSelected ? 'opacity-90' : 'text-ink-subtle')}>
                  {isClosed
                    ? 'Closed'
                    : day.availableCount === 0
                      ? 'Full'
                      : `${day.availableCount} free`}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Slot grid. Unavailable slots stay visible, disabled, with their reason. */}
      <fieldset className="flex flex-col gap-3">
        <legend className="pb-2 text-sm font-medium text-ink">
          Pick a time on {selectedDay.weekday} {selectedDay.dayLabel}
        </legend>

        {selectedDay.slots.length === 0 ? (
          <p className="rounded-card border border-border-base bg-surface px-4 py-3 text-sm text-ink-muted">
            {organizationName} is closed on this day. Pick another.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {selectedDay.slots.map((slot) => (
              <label key={slot.startMinute} className="contents">
                <input
                  type="radio"
                  name="startMinute"
                  value={slot.startMinute}
                  disabled={!slot.available}
                  checked={selectedStart === slot.startMinute}
                  onChange={() => {
                    setSelectedStart(slot.startMinute);
                  }}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'flex cursor-pointer flex-col gap-0.5 rounded-card border border-border-base bg-surface px-3 py-3 text-left transition-colors',
                    'hover:border-border-strong',
                    'peer-checked:border-brand-600 peer-checked:bg-brand-600/10',
                    'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600',
                    'peer-disabled:cursor-not-allowed peer-disabled:border-border-base peer-disabled:bg-surface-muted peer-disabled:opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'text-sm font-medium tabular',
                      slot.available ? 'text-ink' : 'text-ink-muted line-through',
                    )}
                  >
                    {slot.label}
                  </span>
                  <span className="text-xs text-ink-subtle">{slot.reason ?? 'Available'}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <FieldError id="slot-error" message={fieldError(result, 'startMinute')} />
      </fieldset>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contactName" required>
            Your name
          </Label>
          <Input
            id="contactName"
            name="contactName"
            autoComplete="name"
            required
            maxLength={120}
            aria-describedby="contactName-error"
            aria-invalid={fieldError(result, 'contactName') !== undefined}
          />
          <FieldError id="contactName-error" message={fieldError(result, 'contactName')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contactEmail">Email</Label>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={200}
            aria-describedby="contactEmail-error"
            aria-invalid={fieldError(result, 'contactEmail') !== undefined}
          />
          <FieldError id="contactEmail-error" message={fieldError(result, 'contactEmail')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contactPhone">Phone</Label>
          <Input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            aria-describedby="contactPhone-hint"
            aria-invalid={fieldError(result, 'contactPhone') !== undefined}
          />
          <p id="contactPhone-hint" className="text-xs text-ink-subtle">
            One of email or phone is enough — it is how {organizationName} confirms the time.
          </p>
          <FieldError id="contactPhone-error" message={fieldError(result, 'contactPhone')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note">Anything they should know?</Label>
          <Textarea
            id="note"
            name="note"
            rows={3}
            maxLength={1000}
            placeholder="Access, parking, best time to call…"
            aria-describedby="note-error"
          />
          <FieldError id="note-error" message={fieldError(result, 'note')} />
        </div>
      </div>

      <SubmitButton
        pending={pending}
        pendingLabel="Sending…"
        size="lg"
        className="h-14 w-full text-base"
        disabled={selectedStart === null}
      >
        <Clock aria-hidden="true" className="size-5" />
        Request this time
      </SubmitButton>

      {selectedStart === null ? (
        <p className="-mt-4 text-center text-xs text-ink-subtle">Pick a time to continue.</p>
      ) : null}
    </form>
  );
}
