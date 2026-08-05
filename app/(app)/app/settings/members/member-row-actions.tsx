'use client';

import { Check, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';

import { FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { ROLE_LABELS } from '@/domain/permissions';
import type { Role } from '@/domain/types';
import { removeMember, updateMemberRole } from '@/server/actions/org';
import type { ActionResult } from '@/server/actions/result';

/**
 * Per-member controls.
 *
 * Which controls exist at all is decided on the server by `can(role, action, { targetRole,
 * isSelf })`; this component only renders what it was handed. Both actions re-run the same
 * check, so hiding a control is a courtesy, not the protection.
 *
 * Removal goes through a confirmation dialog that names the person, because "Remove" in a
 * row of near-identical rows is the easiest destructive misclick in any admin UI.
 */

export interface MemberRowActionsProps {
  userId: string;
  displayName: string;
  currentRole: Role;
  /** Roles this actor may assign to this member. Empty means the control is not rendered. */
  assignableRoles: readonly Role[];
  canRemove: boolean;
  isSelf: boolean;
}

export function MemberRowActions({
  userId,
  displayName,
  currentRole,
  assignableRoles,
  canRemove,
  isSelf,
}: MemberRowActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [roleResult, roleAction, rolePending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(async (_previous, formData) => updateMemberRole(formData), null);

  const [removeResult, removeFormAction, removePending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(async (_previous, formData) => removeMember(formData), null);

  const canChangeRole = assignableRoles.length > 0;

  if (!canChangeRole && !canRemove) {
    return (
      <span className="text-sm text-ink-subtle">
        {isSelf ? 'This is you' : 'No actions available'}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {canChangeRole ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" disabled={rolePending}>
                Change role
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {assignableRoles.map((role) => {
                const isCurrent = role === currentRole;
                return (
                  <form key={role} action={roleAction}>
                    <input type="hidden" name="userId" value={userId} />
                    <input type="hidden" name="role" value={role} />
                    <DropdownMenuItem asChild disabled={isCurrent || rolePending}>
                      <button type="submit" className="w-full text-left">
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          {isCurrent ? (
                            <Check aria-hidden="true" className="size-4 text-brand-600" />
                          ) : null}
                        </span>
                        <span>{ROLE_LABELS[role]}</span>
                        {isCurrent ? <span className="sr-only">(current role)</span> : null}
                      </button>
                    </DropdownMenuItem>
                  </form>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {canRemove ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfirmOpen(true);
            }}
            aria-label={`Remove ${displayName} from the organisation`}
          >
            <Trash2 aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>

      {roleResult && !roleResult.ok ? (
        <p role="alert" className="text-xs text-state-overdue">
          {roleResult.error}
        </p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title={`Remove ${displayName}?`}
          description="They lose access to this organisation immediately. Work orders and reports they completed are kept, and their name stays on them."
        >
          <FormAlert result={removeResult} />

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
            <form action={removeFormAction}>
              <input type="hidden" name="userId" value={userId} />
              <SubmitButton
                pending={removePending}
                pendingLabel="Removing…"
                variant="destructive"
              >
                Remove from organisation
              </SubmitButton>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
