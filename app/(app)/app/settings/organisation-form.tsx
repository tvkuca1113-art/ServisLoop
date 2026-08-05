'use client';

import { useActionState, useId } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { INTERVAL_ANCHORS, type IntervalAnchor } from '@/domain/types';
import { updateOrganizationSettings } from '@/server/actions/org';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Organisation settings.
 *
 * Every field here changes how the deterministic core behaves — the reminder ladder, the
 * next-due calculation, the slots a customer is offered — so each one carries a sentence
 * saying what it will actually do, rather than a label and a number.
 */

const ANCHOR_COPY: Readonly<Record<IntervalAnchor, { label: string; detail: string }>> =
  Object.freeze({
    completion: {
      label: 'From the completion date',
      detail:
        'Next due = the day the job was finished + the interval. The cadence drifts when work runs late, which is what most reactive contracts want.',
    },
    schedule: {
      label: 'From the original due date',
      detail:
        'Next due keeps its anniversary, rolling forward in whole intervals until it lands after the completion date. This is what regulated inspections need.',
    },
  });

/**
 * Common IANA zones, offered as suggestions rather than as the only allowed values.
 *
 * A free-text field with a datalist beats a 400-entry dropdown: you can type "Sarajevo"
 * and get there in four keystrokes, and any valid zone name is still accepted because the
 * server validates against `Intl` rather than against this list.
 */
const TIMEZONE_SUGGESTIONS = [
  'Europe/Sarajevo',
  'Europe/Zagreb',
  'Europe/Belgrade',
  'Europe/Ljubljana',
  'Europe/Vienna',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Budapest',
  'Europe/Bucharest',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Helsinki',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

export interface OrganisationFormValues {
  name: string;
  timezone: string;
  reminderLeadDays: number;
  defaultIntervalAnchor: IntervalAnchor;
  slotMinutes: number;
  bookingLeadHours: number;
  bookingHorizonDays: number;
}

export function OrganisationForm({
  organization,
  canEdit,
}: {
  organization: OrganisationFormValues;
  canEdit: boolean;
}) {
  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => updateOrganizationSettings(formData),
    null,
  );

  const nameId = useId();
  const tzId = useId();
  const tzListId = useId();
  const leadId = useId();
  const anchorId = useId();
  const slotId = useId();
  const bookingLeadId = useId();
  const horizonId = useId();

  const suggestions = TIMEZONE_SUGGESTIONS.includes(
    organization.timezone as (typeof TIMEZONE_SUGGESTIONS)[number],
  )
    ? TIMEZONE_SUGGESTIONS
    : [organization.timezone, ...TIMEZONE_SUGGESTIONS];

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormAlert result={result} />

      {!canEdit ? (
        <Alert>
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            Changing organisation settings needs the Owner or Administrator role. These are the
            values every due date and booking slot is currently computed from.
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6 border-0 p-0">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={nameId} required>
              Organisation name
            </Label>
            <Input
              id={nameId}
              name="name"
              defaultValue={organization.name}
              required
              maxLength={120}
              aria-invalid={fieldError(result, 'name') !== undefined}
              aria-describedby={`${nameId}-error`}
            />
            <FieldError id={`${nameId}-error`} message={fieldError(result, 'name')} />
            <p className="text-sm text-ink-muted">
              Appears on service reports, QR device pages and reminder emails.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={tzId} required>
              Timezone
            </Label>
            <Input
              id={tzId}
              name="timezone"
              list={tzListId}
              defaultValue={organization.timezone}
              required
              aria-invalid={fieldError(result, 'timezone') !== undefined}
              aria-describedby={`${tzId}-error`}
            />
            <datalist id={tzListId}>
              {suggestions.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <FieldError id={`${tzId}-error`} message={fieldError(result, 'timezone')} />
            <p className="text-sm text-ink-muted">
              An IANA name such as <code className="font-mono text-xs">Europe/Sarajevo</code>.
              &ldquo;Today&rdquo; is decided in this zone, so a job completed at 23:30 counts
              for the right day.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={leadId} required>
              Reminder lead time
            </Label>
            <Input
              id={leadId}
              name="reminderLeadDays"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              defaultValue={organization.reminderLeadDays}
              required
              aria-invalid={fieldError(result, 'reminderLeadDays') !== undefined}
              aria-describedby={`${leadId}-error`}
            />
            <FieldError id={`${leadId}-error`} message={fieldError(result, 'reminderLeadDays')} />
            <p className="text-sm text-ink-muted">
              Days before the due date at which a device starts showing as due soon.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={anchorId} required>
              Next service is measured
            </Label>
            <Select
              name="defaultIntervalAnchor"
              defaultValue={organization.defaultIntervalAnchor}
              disabled={!canEdit || pending}
            >
              <SelectTrigger id={anchorId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_ANCHORS.map((anchor) => (
                  <SelectItem key={anchor} value={anchor}>
                    {ANCHOR_COPY[anchor].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-ink-muted">
              {ANCHOR_COPY[organization.defaultIntervalAnchor].detail} Individual devices can
              override this.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-card border border-border-base p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-ink">Customer booking</h3>
            <p className="text-sm text-ink-muted">
              What the public booking form on a device&rsquo;s QR page will offer.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={slotId} required>
                Slot length (minutes)
              </Label>
              <Input
                id={slotId}
                name="slotMinutes"
                type="number"
                inputMode="numeric"
                min={15}
                max={480}
                step={15}
                defaultValue={organization.slotMinutes}
                required
                aria-invalid={fieldError(result, 'slotMinutes') !== undefined}
                aria-describedby={`${slotId}-error`}
              />
              <FieldError id={`${slotId}-error`} message={fieldError(result, 'slotMinutes')} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={bookingLeadId} required>
                Minimum notice (hours)
              </Label>
              <Input
                id={bookingLeadId}
                name="bookingLeadHours"
                type="number"
                inputMode="numeric"
                min={0}
                max={720}
                defaultValue={organization.bookingLeadHours}
                required
                aria-invalid={fieldError(result, 'bookingLeadHours') !== undefined}
                aria-describedby={`${bookingLeadId}-error`}
              />
              <FieldError
                id={`${bookingLeadId}-error`}
                message={fieldError(result, 'bookingLeadHours')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={horizonId} required>
                Book up to (days ahead)
              </Label>
              <Input
                id={horizonId}
                name="bookingHorizonDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={730}
                defaultValue={organization.bookingHorizonDays}
                required
                aria-invalid={fieldError(result, 'bookingHorizonDays') !== undefined}
                aria-describedby={`${horizonId}-error`}
              />
              <FieldError
                id={`${horizonId}-error`}
                message={fieldError(result, 'bookingHorizonDays')}
              />
            </div>
          </div>
        </div>
      </fieldset>

      {canEdit ? (
        <div>
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save organisation settings
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
