'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import { Button, Dialog, DialogContent, DialogFooter, useToast } from '@/components/ui';
import { deleteCustomer } from '@/server/actions/directory';
import type { ActionResult } from '@/server/actions/result';

import { CustomerForm, type CustomerFormValues } from './customer-form';

/**
 * The edit and delete controls for one customer.
 *
 * Which of them render is decided on the server from `can()`; this component only shows
 * what it was handed, and the actions re-run the same check. Hiding a control is a
 * courtesy, not the protection.
 *
 * Deletion is confirmed in a dialog that names the company and says what happens to their
 * sites, because "Delete" next to "Edit" in a row of near-identical rows is the easiest
 * destructive misclick in any admin screen.
 */

export interface CustomerActionsProps {
  customer: CustomerFormValues;
  canEdit: boolean;
  canDelete: boolean;
  /** Number of sites still attached. A customer with sites cannot be deleted. */
  locationCount: number;
  /**
   * Where to go after a successful delete. Set on the detail page, whose route stops
   * existing the moment the row does; the list page stays put and just re-renders.
   */
  redirectTo?: string;
}

export function CustomerActions({
  customer,
  canEdit,
  canDelete,
  locationCount,
  redirectTo,
}: CustomerActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => deleteCustomer(formData),
    null,
  );

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Customer deleted.', variant: 'success' });
    setConfirmOpen(false);
    if (redirectTo) router.push(redirectTo);
  }, [result, toast, router, redirectTo]);

  if (!canEdit && !canDelete) return null;

  const blocked = locationCount > 0;

  return (
    <div className="flex items-center justify-end gap-2">
      {canEdit ? <CustomerForm customer={customer} triggerSize="sm" /> : null}

      {canDelete ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirmOpen(true);
          }}
          aria-label={`Delete ${customer.name}`}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title={`Delete ${customer.name}?`}
          description={
            blocked
              ? `${customer.name} still has ${locationCount} ${locationCount === 1 ? 'site' : 'sites'}. Delete or move those first — this keeps devices from being orphaned.`
              : 'The customer record is removed. Work orders and service reports already filed against them are kept.'
          }
        >
          <FormAlert result={result} />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirmOpen(false);
              }}
            >
              Keep them
            </Button>
            <form action={formAction}>
              <input type="hidden" name="id" value={customer.id} />
              <SubmitButton
                pending={pending}
                pendingLabel="Deleting…"
                variant="destructive"
                disabled={blocked}
              >
                Delete customer
              </SubmitButton>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
