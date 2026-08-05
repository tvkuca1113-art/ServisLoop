'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useState } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useToast,
  type ButtonProps,
} from '@/components/ui';
import {
  DEFAULT_INTERVAL_DAYS,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  describeInterval,
} from '@/domain/service-interval';
import {
  DEVICE_STATUSES,
  INTERVAL_ANCHORS,
  type DeviceStatus,
  type IntervalAnchor,
} from '@/domain/types';
import {
  createDevice,
  createDeviceType,
  deleteDevice,
  updateDevice,
} from '@/server/actions/directory';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Add, edit or delete a device — and, separately, add a device type.
 *
 * The interval and anchor fields are the reason this form matters. Both are *overrides*:
 * left alone, a device follows its type's interval and the organisation's anchor, and the
 * form says so in words next to each field rather than leaving a blank input to be
 * guessed at. Nothing here computes a due date; saving hands the inputs to the server,
 * which asks `recalculateDeviceSchedule` for the answer.
 */

/** Radix forbids an empty `SelectItem` value, so "unset" needs a sentinel of its own. */
const NO_TYPE = 'none';
const INHERIT_ANCHOR = 'inherit';

const STATUS_COPY: Readonly<Record<DeviceStatus, { label: string; detail: string }>> =
  Object.freeze({
    active: { label: 'Active', detail: 'Serviced on schedule and included in reminders.' },
    paused: {
      label: 'Paused',
      detail: 'Kept on the books, but no due date and no reminders until it is active again.',
    },
    retired: {
      label: 'Retired',
      detail: 'Out of service for good. History is kept; nothing is ever chased.',
    },
  });

const ANCHOR_COPY: Readonly<Record<IntervalAnchor, { label: string; detail: string }>> =
  Object.freeze({
    completion: {
      label: 'From the completion date',
      detail: 'Next due = the day the work was finished + the interval.',
    },
    schedule: {
      label: 'From the original due date',
      detail: 'Keeps its anniversary even when a visit runs late. Regulated inspections want this.',
    },
  });

export interface DeviceFormValues {
  id: string;
  locationId: string;
  deviceTypeId: string | null;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installedOn: string | null;
  lastServiceAt: string | null;
  serviceIntervalDays: number | null;
  intervalAnchor: IntervalAnchor | null;
  status: DeviceStatus;
  notes: string | null;
}

export interface DeviceLocationOption {
  id: string;
  name: string;
  customerName: string;
}

export interface DeviceTypeOption {
  id: string;
  name: string;
  defaultIntervalDays: number;
}

export interface DeviceFormProps {
  locations: readonly DeviceLocationOption[];
  deviceTypes: readonly DeviceTypeOption[];
  /** Omit to add a new device. */
  device?: DeviceFormValues;
  defaultLocationId?: string;
  /** The organisation default, shown as the effect of leaving the anchor unset. */
  organizationAnchor: IntervalAnchor;
  canDelete?: boolean;
  /** True when work orders reference this device, which blocks deletion. */
  hasHistory?: boolean;
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
  redirectAfterDelete?: string;
}

export function DeviceForm({
  locations,
  deviceTypes,
  device,
  defaultLocationId,
  organizationAnchor,
  canDelete = false,
  hasHistory = false,
  triggerLabel,
  triggerVariant,
  triggerSize,
  redirectAfterDelete,
}: DeviceFormProps) {
  const [open, setOpen] = useState(false);
  const isEdit = device !== undefined;
  const label = triggerLabel ?? (isEdit ? 'Edit device' : 'Add device');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant ?? (isEdit ? 'secondary' : 'default')}
          size={triggerSize}
          disabled={locations.length === 0}
        >
          {isEdit ? null : <Plus aria-hidden="true" />}
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={isEdit ? `Edit ${device.name}` : 'Add a device'}
        description={
          isEdit
            ? 'Changing the interval, anchor, dates or status recalculates the next service date and rebuilds the reminders.'
            : 'A device is one serviced asset at one site. Its QR code and public page are created with it.'
        }
        className="max-w-2xl"
      >
        <DeviceFields
          locations={locations}
          deviceTypes={deviceTypes}
          device={device}
          defaultLocationId={defaultLocationId}
          organizationAnchor={organizationAnchor}
          canDelete={canDelete}
          hasHistory={hasHistory}
          redirectAfterDelete={redirectAfterDelete}
          onClose={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeviceFields({
  locations,
  deviceTypes,
  device,
  defaultLocationId,
  organizationAnchor,
  canDelete,
  hasHistory,
  redirectAfterDelete,
  onClose,
}: {
  locations: readonly DeviceLocationOption[];
  deviceTypes: readonly DeviceTypeOption[];
  device?: DeviceFormValues;
  defaultLocationId?: string;
  organizationAnchor: IntervalAnchor;
  canDelete: boolean;
  hasHistory: boolean;
  redirectAfterDelete?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = device !== undefined;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [typeValue, setTypeValue] = useState(device?.deviceTypeId ?? NO_TYPE);
  const [anchorValue, setAnchorValue] = useState<string>(
    device?.intervalAnchor ?? INHERIT_ANCHOR,
  );

  const [result, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(async (_previous, formData) => (isEdit ? updateDevice(formData) : createDevice(formData)), null);

  const [deleteResult, deleteAction, deletePending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(async (_previous, formData) => deleteDevice(formData), null);

  const nameId = useId();
  const locationId = useId();
  const typeId = useId();
  const manufacturerId = useId();
  const modelId = useId();
  const serialId = useId();
  const installedId = useId();
  const lastServiceId = useId();
  const intervalId = useId();
  const anchorId = useId();
  const statusId = useId();
  const notesId = useId();

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Device saved.', variant: 'success' });
    onClose();
  }, [result, toast, onClose]);

  useEffect(() => {
    if (!deleteResult?.ok) return;
    toast({ title: deleteResult.message ?? 'Device deleted.', variant: 'success' });
    onClose();
    if (redirectAfterDelete) router.push(redirectAfterDelete);
  }, [deleteResult, toast, onClose, router, redirectAfterDelete]);

  const selectedType = deviceTypes.find((t) => t.id === typeValue);
  const inheritedInterval = selectedType?.defaultIntervalDays ?? DEFAULT_INTERVAL_DAYS;

  if (confirmingDelete && device) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert result={deleteResult} />

        <p className="text-sm text-ink">
          {hasHistory
            ? `${device.name} has work orders filed against it. Those are the record of work you did, so the device cannot be deleted. Set its status to Retired instead — that stops every reminder and keeps the history.`
            : `${device.name} and its pending reminders will be removed. Its QR code stops working immediately.`}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setConfirmingDelete(false);
            }}
          >
            Keep the device
          </Button>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={device.id} />
            <SubmitButton
              pending={deletePending}
              pendingLabel="Deleting…"
              variant="destructive"
              disabled={hasHistory}
            >
              Delete device
            </SubmitButton>
          </form>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {isEdit ? <input type="hidden" name="id" value={device.id} /> : null}

      {/* Sentinels never reach the server: "unset" is submitted as an empty field. */}
      <input type="hidden" name="deviceTypeId" value={typeValue === NO_TYPE ? '' : typeValue} />
      <input
        type="hidden"
        name="intervalAnchor"
        value={anchorValue === INHERIT_ANCHOR ? '' : anchorValue}
      />

      <FormAlert result={result} />

      <fieldset disabled={pending} className="flex flex-col gap-4 border-0 p-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={nameId} required>
              Device name
            </Label>
            <Input
              id={nameId}
              name="name"
              defaultValue={device?.name ?? ''}
              required
              maxLength={200}
              placeholder="Passenger lift A, Rooftop chiller, Boiler 3"
              aria-invalid={fieldError(result, 'name') !== undefined}
              aria-describedby={`${nameId}-error`}
            />
            <FieldError id={`${nameId}-error`} message={fieldError(result, 'name')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={locationId} required>
              Installed at
            </Label>
            <Select
              name="locationId"
              defaultValue={device?.locationId ?? defaultLocationId ?? locations[0]?.id}
              required
            >
              <SelectTrigger id={locationId}>
                <SelectValue placeholder="Choose a site" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.customerName} · {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id={`${locationId}-error`} message={fieldError(result, 'locationId')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={typeId}>Device type</Label>
            <Select value={typeValue} onValueChange={setTypeValue}>
              <SelectTrigger id={typeId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TYPE}>No type</SelectItem>
                {deviceTypes.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-ink-muted">
              Sets the default interval and the checklist technicians complete.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={manufacturerId}>Manufacturer</Label>
            <Input
              id={manufacturerId}
              name="manufacturer"
              defaultValue={device?.manufacturer ?? ''}
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={modelId}>Model</Label>
            <Input
              id={modelId}
              name="model"
              defaultValue={device?.model ?? ''}
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={serialId}>Serial number</Label>
            <Input
              id={serialId}
              name="serialNumber"
              defaultValue={device?.serialNumber ?? ''}
              maxLength={120}
              className="font-mono"
            />
            <p className="text-sm text-ink-muted">
              Used to match devices when you import a spreadsheet, so a re-import updates
              nothing twice.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-card border border-border-base p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-ink">Service schedule</h3>
            <p className="text-sm text-ink-muted">
              The next service date is calculated from these. It is never typed in by hand.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={installedId}>Installed on</Label>
              <Input
                id={installedId}
                name="installedOn"
                type="date"
                defaultValue={device?.installedOn ?? ''}
                aria-invalid={fieldError(result, 'installedOn') !== undefined}
                aria-describedby={`${installedId}-error`}
              />
              <FieldError id={`${installedId}-error`} message={fieldError(result, 'installedOn')} />
              <p className="text-sm text-ink-muted">
                Seeds the very first due date when nothing has been serviced yet.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={lastServiceId}>Last service</Label>
              <Input
                id={lastServiceId}
                name="lastServiceAt"
                type="date"
                defaultValue={device?.lastServiceAt ?? ''}
                aria-invalid={fieldError(result, 'lastServiceAt') !== undefined}
                aria-describedby={`${lastServiceId}-error`}
              />
              <FieldError
                id={`${lastServiceId}-error`}
                message={fieldError(result, 'lastServiceAt')}
              />
              <p className="text-sm text-ink-muted">
                Set it for equipment you inherited. Completing a job updates it by itself.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={intervalId}>Service interval (days)</Label>
              <Input
                id={intervalId}
                name="serviceIntervalDays"
                type="number"
                inputMode="numeric"
                min={MIN_INTERVAL_DAYS}
                max={MAX_INTERVAL_DAYS}
                defaultValue={device?.serviceIntervalDays ?? ''}
                placeholder={String(inheritedInterval)}
                aria-invalid={fieldError(result, 'serviceIntervalDays') !== undefined}
                aria-describedby={`${intervalId}-error`}
              />
              <FieldError
                id={`${intervalId}-error`}
                message={fieldError(result, 'serviceIntervalDays')}
              />
              <p className="text-sm text-ink-muted">
                Leave blank to follow{' '}
                {selectedType
                  ? `the ${selectedType.name} default`
                  : 'the organisation default'}{' '}
                — {describeInterval(inheritedInterval).toLowerCase()}.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={anchorId}>Next service is measured</Label>
              <Select value={anchorValue} onValueChange={setAnchorValue}>
                <SelectTrigger id={anchorId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT_ANCHOR}>
                    Organisation default ({ANCHOR_COPY[organizationAnchor].label.toLowerCase()})
                  </SelectItem>
                  {INTERVAL_ANCHORS.map((anchor) => (
                    <SelectItem key={anchor} value={anchor}>
                      {ANCHOR_COPY[anchor].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-ink-muted">
                {
                  ANCHOR_COPY[
                    anchorValue === INHERIT_ANCHOR
                      ? organizationAnchor
                      : (anchorValue as IntervalAnchor)
                  ].detail
                }
              </p>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={statusId} required>
                Status
              </Label>
              <Select name="status" defaultValue={device?.status ?? 'active'} required>
                <SelectTrigger id={statusId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_COPY[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-ink-muted">
                {STATUS_COPY[device?.status ?? 'active'].detail}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={notesId}>Notes</Label>
          <Textarea
            id={notesId}
            name="notes"
            defaultValue={device?.notes ?? ''}
            maxLength={2000}
            rows={3}
            placeholder="Spare part numbers, known quirks, where the isolator is."
          />
        </div>
      </fieldset>

      <DialogFooter className="sm:justify-between">
        {isEdit && canDelete ? (
          <Button
            type="button"
            variant="ghost"
            className="text-state-overdue"
            onClick={() => {
              setConfirmingDelete(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete device
          </Button>
        ) : (
          <span />
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingLabel="Saving…">
            {isEdit ? 'Save changes' : 'Add device'}
          </SubmitButton>
        </div>
      </DialogFooter>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Device types                                                        */
/* ------------------------------------------------------------------ */

/**
 * Add a device type.
 *
 * Separate from the device form on purpose: a type carries a default interval that every
 * future device of that kind inherits, so creating one is a decision about the fleet
 * rather than a field on one device.
 */
export function DeviceTypeForm({ triggerSize }: { triggerSize?: ButtonProps['size'] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size={triggerSize}>
          <Plus aria-hidden="true" />
          Add device type
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Add a device type"
        description="Types group equipment that is serviced the same way — lifts, boilers, fire dampers. Each carries the interval its devices inherit."
      >
        <DeviceTypeFields
          onClose={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeviceTypeFields({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const nameId = useId();
  const intervalId = useId();

  const [result, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(async (_previous, formData) => createDeviceType(formData), null);

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Device type added.', variant: 'success' });
    onClose();
  }, [result, toast, onClose]);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormAlert result={result} />

      <fieldset disabled={pending} className="flex flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId} required>
            Type name
          </Label>
          <Input
            id={nameId}
            name="name"
            required
            maxLength={120}
            placeholder="Passenger lift"
            aria-invalid={fieldError(result, 'name') !== undefined}
            aria-describedby={`${nameId}-error`}
          />
          <FieldError id={`${nameId}-error`} message={fieldError(result, 'name')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={intervalId} required>
            Default interval (days)
          </Label>
          <Input
            id={intervalId}
            name="defaultIntervalDays"
            type="number"
            inputMode="numeric"
            min={MIN_INTERVAL_DAYS}
            max={MAX_INTERVAL_DAYS}
            defaultValue={DEFAULT_INTERVAL_DAYS}
            required
            aria-invalid={fieldError(result, 'defaultIntervalDays') !== undefined}
            aria-describedby={`${intervalId}-error`}
          />
          <FieldError
            id={`${intervalId}-error`}
            message={fieldError(result, 'defaultIntervalDays')}
          />
          <p className="text-sm text-ink-muted">
            Devices of this type follow it unless they set their own. Existing devices keep
            the interval they already have.
          </p>
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Add device type
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
