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
import { createLocation, deleteLocation, updateLocation } from '@/server/actions/directory';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Add, edit or delete a site.
 *
 * Deletion lives in this dialog rather than in a separate control because it is only ever
 * reached from the same place editing is, and folding it in keeps one confirmation
 * pattern instead of two. The confirmation replaces the form body rather than stacking a
 * second dialog on top of the first, which nests focus traps and reads badly on a phone.
 */

export interface LocationFormValues {
  id: string;
  customerId: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
}

export interface LocationFormProps {
  customers: ReadonlyArray<{ id: string; name: string }>;
  /** Omit to add a new site. */
  location?: LocationFormValues;
  defaultCustomerId?: string;
  /** Devices still installed here. A site with devices on it cannot be deleted. */
  deviceCount?: number;
  canDelete?: boolean;
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
  /** Where to go once the site is gone — its own page stops existing. */
  redirectAfterDelete?: string;
}

export function LocationForm({
  customers,
  location,
  defaultCustomerId,
  deviceCount = 0,
  canDelete = false,
  triggerLabel,
  triggerVariant,
  triggerSize,
  redirectAfterDelete,
}: LocationFormProps) {
  const [open, setOpen] = useState(false);
  const isEdit = location !== undefined;
  const label = triggerLabel ?? (isEdit ? 'Edit site' : 'Add site');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant ?? (isEdit ? 'secondary' : 'default')} size={triggerSize}>
          {isEdit ? null : <Plus aria-hidden="true" />}
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={isEdit ? `Edit ${location.name}` : 'Add a site'}
        description={
          isEdit
            ? 'The address is what a technician navigates to and what appears on the service report.'
            : 'A site is one address. Devices are installed at a site, so every device needs one.'
        }
        className="max-w-xl"
      >
        <LocationFields
          customers={customers}
          location={location}
          defaultCustomerId={defaultCustomerId}
          deviceCount={deviceCount}
          canDelete={canDelete}
          redirectAfterDelete={redirectAfterDelete}
          onClose={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function LocationFields({
  customers,
  location,
  defaultCustomerId,
  deviceCount,
  canDelete,
  redirectAfterDelete,
  onClose,
}: {
  customers: ReadonlyArray<{ id: string; name: string }>;
  location?: LocationFormValues;
  defaultCustomerId?: string;
  deviceCount: number;
  canDelete: boolean;
  redirectAfterDelete?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = location !== undefined;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [result, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(
    async (_previous, formData) =>
      isEdit ? updateLocation(formData) : createLocation(formData),
    null,
  );

  const [deleteResult, deleteAction, deletePending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(async (_previous, formData) => deleteLocation(formData), null);

  const nameId = useId();
  const customerId = useId();
  const addressId = useId();
  const cityId = useId();
  const postalId = useId();
  const countryId = useId();
  const notesId = useId();

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Site saved.', variant: 'success' });
    onClose();
  }, [result, toast, onClose]);

  useEffect(() => {
    if (!deleteResult?.ok) return;
    toast({ title: deleteResult.message ?? 'Site deleted.', variant: 'success' });
    onClose();
    if (redirectAfterDelete) router.push(redirectAfterDelete);
  }, [deleteResult, toast, onClose, router, redirectAfterDelete]);

  if (confirmingDelete && location) {
    const blocked = deviceCount > 0;

    return (
      <div className="flex flex-col gap-4">
        <FormAlert result={deleteResult} />

        <p className="text-sm text-ink">
          {blocked
            ? `${location.name} still has ${deviceCount} ${deviceCount === 1 ? 'device' : 'devices'} installed. Move or delete those first — a device cannot exist without a site.`
            : `${location.name} will be removed. Nothing else is affected: this site has no devices on it.`}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setConfirmingDelete(false);
            }}
          >
            Keep the site
          </Button>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={location.id} />
            <SubmitButton
              pending={deletePending}
              pendingLabel="Deleting…"
              variant="destructive"
              disabled={blocked}
            >
              Delete site
            </SubmitButton>
          </form>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {isEdit ? <input type="hidden" name="id" value={location.id} /> : null}

      <FormAlert result={result} />

      <fieldset disabled={pending} className="flex flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={customerId} required>
            Customer
          </Label>
          <Select
            name="customerId"
            defaultValue={location?.customerId ?? defaultCustomerId ?? customers[0]?.id}
            required
          >
            <SelectTrigger id={customerId}>
              <SelectValue placeholder="Choose a customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${customerId}-error`} message={fieldError(result, 'customerId')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId} required>
            Site name
          </Label>
          <Input
            id={nameId}
            name="name"
            defaultValue={location?.name ?? ''}
            required
            maxLength={200}
            placeholder="Head office, Warehouse 2, Hotel Evropa"
            aria-invalid={fieldError(result, 'name') !== undefined}
            aria-describedby={`${nameId}-error`}
          />
          <FieldError id={`${nameId}-error`} message={fieldError(result, 'name')} />
          <p className="text-sm text-ink-muted">
            What your technicians call it, not the legal address.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={addressId}>Street address</Label>
          <Input
            id={addressId}
            name="addressLine"
            defaultValue={location?.addressLine ?? ''}
            maxLength={300}
            autoComplete="street-address"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={postalId}>Postcode</Label>
            <Input
              id={postalId}
              name="postalCode"
              defaultValue={location?.postalCode ?? ''}
              maxLength={20}
              autoComplete="postal-code"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={cityId}>City</Label>
            <Input
              id={cityId}
              name="city"
              defaultValue={location?.city ?? ''}
              maxLength={120}
              autoComplete="address-level2"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={countryId}>Country</Label>
            <Input
              id={countryId}
              name="country"
              defaultValue={location?.country ?? ''}
              maxLength={80}
              autoComplete="country-name"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={notesId}>Access notes</Label>
          <Textarea
            id={notesId}
            name="notes"
            defaultValue={location?.notes ?? ''}
            maxLength={2000}
            rows={3}
            placeholder="Gate code, which entrance, who holds the key, parking."
          />
          <p className="text-sm text-ink-muted">
            Shown to the technician on the job. This is where the gate code belongs.
          </p>
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
            Delete site
          </Button>
        ) : (
          <span />
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingLabel="Saving…">
            {isEdit ? 'Save changes' : 'Add site'}
          </SubmitButton>
        </div>
      </DialogFooter>
    </form>
  );
}
