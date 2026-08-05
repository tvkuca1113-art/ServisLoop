'use client';

import { UserRoundCog } from 'lucide-react';
import { useActionState, useEffect, useId, useState } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@/components/ui';
import { ROLE_LABELS } from '@/domain/permissions';
import type { Role } from '@/domain/types';
import { assignWorkOrder } from '@/server/actions/work-orders';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Who is doing this job.
 *
 * The whole team is offered rather than technicians only: in a small service company the
 * owner does jobs too, and filtering the list by role would quietly make the most common
 * assignment impossible. The role is shown beside each name so the choice is informed
 * rather than restricted.
 *
 * Unassigning is a first-class option. A job whose technician has left has to be able to
 * go back to the pool, and pretending otherwise leaves it stuck on a board nobody reads.
 */

/** Radix forbids an empty `SelectItem` value, so "nobody" needs a sentinel. */
const UNASSIGNED = 'unassigned';

export interface AssignableMember {
  id: string;
  name: string;
  role: Role;
}

export interface AssignControlProps {
  workOrderId: string;
  assignedTo: string | null;
  members: readonly AssignableMember[];
  /** False for a closed job, or a role that may not assign. */
  canAssign: boolean;
}

export function AssignControl({
  workOrderId,
  assignedTo,
  members,
  canAssign,
}: AssignControlProps) {
  const { toast } = useToast();
  const selectId = useId();
  const [value, setValue] = useState(assignedTo ?? UNASSIGNED);

  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => assignWorkOrder(formData),
    null,
  );

  useEffect(() => {
    if (!result?.ok) return;
    toast({ title: result.message ?? 'Assignment saved.', variant: 'success' });
  }, [result, toast]);

  const current = members.find((m) => m.id === assignedTo);

  if (!canAssign) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Assigned to
        </span>
        <span className="text-sm text-ink">{current?.name ?? 'Nobody yet'}</span>
      </div>
    );
  }

  const unchanged = (value === UNASSIGNED ? null : value) === assignedTo;

  return (
    <form action={formAction} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="id" value={workOrderId} />
      {/* The sentinel never reaches the server: "nobody" is submitted as an empty field. */}
      <input type="hidden" name="assignedTo" value={value === UNASSIGNED ? '' : value} />

      <FormAlert result={result} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={selectId}>Assigned to</Label>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger id={selectId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Nobody yet</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name} · {ROLE_LABELS[member.role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id={`${selectId}-error`} message={fieldError(result, 'assignedTo')} />
      </div>

      {unchanged ? (
        <Button type="button" variant="secondary" size="sm" disabled className="w-fit">
          <UserRoundCog aria-hidden="true" />
          Assignment saved
        </Button>
      ) : (
        <SubmitButton pending={pending} pendingLabel="Saving…" size="sm" className="w-fit">
          <UserRoundCog aria-hidden="true" />
          Save assignment
        </SubmitButton>
      )}
    </form>
  );
}
