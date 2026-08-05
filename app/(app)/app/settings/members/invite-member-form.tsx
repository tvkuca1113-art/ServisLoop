'use client';

import { UserPlus } from 'lucide-react';
import { useActionState, useId } from 'react';

import { FieldError, FormAlert, SubmitButton } from '@/components/app/forms/form-feedback';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/domain/permissions';
import type { Role } from '@/domain/types';
import { inviteMember } from '@/server/actions/org';
import { fieldError, type ActionResult } from '@/server/actions/result';

/**
 * Invite someone into the organisation.
 *
 * `assignableRoles` is computed on the server by running every role through
 * `can(actorRole, 'member:update_role', { targetRole })`, so an administrator is never
 * offered "Owner" in the first place — and the action re-checks the same rule, so
 * offering it would not help anyway.
 */
export function InviteMemberForm({
  assignableRoles,
  defaultRole,
}: {
  assignableRoles: readonly Role[];
  defaultRole: Role;
}) {
  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => inviteMember(formData),
    null,
  );

  const emailId = useId();
  const nameId = useId();
  const roleId = useId();

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-card border border-border-base bg-surface-muted p-4"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-ink">Invite a colleague</h3>
        <p className="text-sm text-ink-muted">
          They receive an email with a sign-in link and join this organisation with the role
          you choose. You can change it later.
        </p>
      </div>

      <FormAlert result={result} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={emailId} required>
            Email address
          </Label>
          <Input
            id={emailId}
            name="email"
            type="email"
            autoComplete="off"
            required
            placeholder="colleague@company.com"
            aria-invalid={fieldError(result, 'email') !== undefined}
            aria-describedby={`${emailId}-error`}
          />
          <FieldError id={`${emailId}-error`} message={fieldError(result, 'email')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Full name</Label>
          <Input
            id={nameId}
            name="fullName"
            autoComplete="off"
            maxLength={120}
            placeholder="Optional — they can set it themselves"
            aria-describedby={`${nameId}-error`}
          />
          <FieldError id={`${nameId}-error`} message={fieldError(result, 'fullName')} />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={roleId} required>
            Role
          </Label>
          <Select name="role" defaultValue={defaultRole} disabled={pending}>
            <SelectTrigger id={roleId} className="sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-ink-muted">{ROLE_DESCRIPTIONS[defaultRole]}</p>
        </div>
      </div>

      <div>
        <SubmitButton pending={pending} pendingLabel="Sending invitation…">
          <UserPlus aria-hidden="true" />
          Send invitation
        </SubmitButton>
      </div>
    </form>
  );
}
