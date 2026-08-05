'use client';

import { Plus } from 'lucide-react';
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
  Textarea,
  useToast,
  type ButtonProps,
} from '@/components/ui';
import { createCustomer, updateCustomer } from '@/server/actions/directory';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Add or edit a customer.
 *
 * The fields live in a child component rendered *inside* `DialogContent`, which Radix
 * unmounts when the dialog closes. That is deliberate: `useActionState` keeps its result
 * for the life of the component, so a form that survived the close would greet the next
 * person who opened it with the previous submission's success banner and their old
 * values. Unmounting resets both for free.
 */

export interface CustomerFormValues {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  externalRef: string | null;
  notes: string | null;
}

export interface CustomerFormProps {
  /** Omit to add a new customer. */
  customer?: CustomerFormValues;
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
}

export function CustomerForm({
  customer,
  triggerLabel,
  triggerVariant,
  triggerSize,
}: CustomerFormProps) {
  const [open, setOpen] = useState(false);
  const isEdit = customer !== undefined;
  const label = triggerLabel ?? (isEdit ? 'Edit details' : 'Add customer');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant ?? (isEdit ? 'secondary' : 'default')} size={triggerSize}>
          {isEdit ? null : <Plus aria-hidden="true" />}
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={isEdit ? `Edit ${customer.name}` : 'Add a customer'}
        description={
          isEdit
            ? 'Contact details appear on service reports and reminder emails.'
            : 'A customer is the company you invoice. Their sites go in as locations, and devices sit on those sites.'
        }
        className="max-w-xl"
      >
        <CustomerFields
          customer={customer}
          onSaved={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CustomerFields({
  customer,
  onSaved,
}: {
  customer?: CustomerFormValues;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = customer !== undefined;

  const [result, formAction, pending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(
    async (_previous, formData) =>
      isEdit ? updateCustomer(formData) : createCustomer(formData),
    null,
  );

  const nameId = useId();
  const contactId = useId();
  const emailId = useId();
  const phoneId = useId();
  const refId = useId();
  const notesId = useId();

  useEffect(() => {
    if (!result?.ok) return;
    // The confirmation follows the dialog out, so the change is acknowledged somewhere the
    // user is still looking.
    toast({ title: result.message ?? 'Customer saved.', variant: 'success' });
    onSaved();
  }, [result, toast, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {isEdit ? <input type="hidden" name="id" value={customer.id} /> : null}

      <FormAlert result={result} />

      <fieldset disabled={pending} className="flex flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId} required>
            Company name
          </Label>
          <Input
            id={nameId}
            name="name"
            defaultValue={customer?.name ?? ''}
            required
            maxLength={200}
            autoComplete="organization"
            aria-invalid={fieldError(result, 'name') !== undefined}
            aria-describedby={`${nameId}-error`}
          />
          <FieldError id={`${nameId}-error`} message={fieldError(result, 'name')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={contactId}>Main contact</Label>
            <Input
              id={contactId}
              name="contactName"
              defaultValue={customer?.contactName ?? ''}
              maxLength={120}
              autoComplete="name"
              placeholder="Who to call about a service visit"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={refId}>Reference</Label>
            <Input
              id={refId}
              name="externalRef"
              defaultValue={customer?.externalRef ?? ''}
              maxLength={80}
              placeholder="Their number in your accounting system"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={emailId}>Email</Label>
            <Input
              id={emailId}
              name="email"
              type="email"
              defaultValue={customer?.email ?? ''}
              autoComplete="email"
              aria-invalid={fieldError(result, 'email') !== undefined}
              aria-describedby={`${emailId}-error`}
            />
            <FieldError id={`${emailId}-error`} message={fieldError(result, 'email')} />
            <p className="text-sm text-ink-muted">Where service reminders are sent.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={phoneId}>Phone</Label>
            <Input
              id={phoneId}
              name="phone"
              type="tel"
              defaultValue={customer?.phone ?? ''}
              maxLength={40}
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={notesId}>Internal notes</Label>
          <Textarea
            id={notesId}
            name="notes"
            defaultValue={customer?.notes ?? ''}
            maxLength={2000}
            rows={3}
            placeholder="Access arrangements, invoicing quirks, anything the next technician should know."
          />
          <p className="text-sm text-ink-muted">Never shown to the customer.</p>
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onSaved} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          {isEdit ? 'Save changes' : 'Add customer'}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
