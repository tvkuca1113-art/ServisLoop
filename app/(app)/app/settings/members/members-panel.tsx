import { Users } from 'lucide-react';

import { RoleBadge } from '@/components/app/role-badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can } from '@/domain/permissions';
import { ROLES, ROLE_RANK, type Role } from '@/domain/types';
import { initials } from '@/lib/utils';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';

import { InviteMemberForm } from './invite-member-form';
import { MemberRowActions } from './member-row-actions';

/**
 * Who is in this organisation, and what each of them may do.
 *
 * Every affordance on this screen is derived from `can()` with the *target's* role and
 * whether the target is the actor — the same two facts the server actions pass. That is
 * what makes "an administrator cannot demote an owner" and "nobody can remove themselves"
 * true here rather than merely hidden here: the rule is stated once, in the matrix, and
 * both the UI and the action ask it the same question.
 */
export async function MembersPanel() {
  // `member:read` is the floor for seeing this at all — every role has it, but stating it
  // keeps the guard honest if that ever changes.
  const session = await requirePermission('member:read');

  const repo = getRepository();
  const orgId = session.organization.id;

  const memberships = await repo.listMemberships(orgId);
  const profiles = await repo.listProfiles(memberships.map((m) => m.userId));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const members = memberships
    .map((membership) => {
      const profile = profileById.get(membership.userId);
      const isSelf = membership.userId === session.user.id;

      return {
        userId: membership.userId,
        name: profile?.fullName ?? profile?.email ?? 'Unknown member',
        email: profile?.email ?? '—',
        role: membership.role,
        isSelf,
        /**
         * Both halves of the rule, exactly as `updateMemberRole` applies them: may this
         * actor act on a person of *that* role, and may they hand out *this* one.
         */
        assignableRoles: can(session.role, 'member:update_role', {
          targetRole: membership.role,
          isSelf,
        })
          ? ROLES.filter((role) =>
              can(session.role, 'member:update_role', { targetRole: role, isSelf }),
            )
          : [],
        canRemove: can(session.role, 'member:remove', { targetRole: membership.role, isSelf }),
      };
    })
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name));

  const invitableRoles: Role[] = ROLES.filter(
    (role) =>
      can(session.role, 'member:invite', { targetRole: role }) &&
      can(session.role, 'member:update_role', { targetRole: role }),
  );
  const canInvite = invitableRoles.length > 0;
  const defaultInviteRole: Role =
    invitableRoles.find((role) => role === 'technician') ?? (invitableRoles[0] as Role);

  const owners = members.filter((m) => m.role === 'owner').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink">Members</h2>
        <p className="text-sm text-ink-muted">
          {members.length} {members.length === 1 ? 'person has' : 'people have'} access to{' '}
          {session.organization.name}. An organisation always keeps at least one owner — the
          last one cannot be demoted or removed.
        </p>
      </div>

      {canInvite ? (
        <InviteMemberForm assignableRoles={invitableRoles} defaultRole={defaultInviteRole} />
      ) : (
        <Alert>
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            Inviting and removing members needs the Owner or Administrator role. You are signed
            in as {ROLE_LABELS[session.role]}: {ROLE_DESCRIPTIONS[session.role]}
          </AlertDescription>
        </Alert>
      )}

      {members.length === 0 ? (
        <EmptyState
          titleAs="h3"
          icon={<Users />}
          title="No members yet"
          description="Invite the first colleague to give them access to this organisation."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar size="md">
                      <AvatarFallback>{initials(member.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2 font-medium text-ink">
                        <span className="truncate">{member.name}</span>
                        {member.isSelf ? (
                          <span className="text-xs font-normal text-ink-subtle">(you)</span>
                        ) : null}
                      </span>
                      <span className="truncate text-sm text-ink-muted">{member.email}</span>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <RoleBadge role={member.role} />
                    {member.role === 'owner' && owners === 1 ? (
                      <span className="text-xs text-ink-subtle">Last owner</span>
                    ) : null}
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <MemberRowActions
                    userId={member.userId}
                    displayName={member.name}
                    currentRole={member.role}
                    assignableRoles={member.assignableRoles}
                    canRemove={member.canRemove}
                    isSelf={member.isSelf}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <section className="flex flex-col gap-2 rounded-card border border-border-base p-4">
        <h3 className="text-sm font-semibold text-ink">What each role can do</h3>
        <dl className="flex flex-col gap-2">
          {ROLES.map((role) => (
            <div key={role} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <dt className="sm:w-32 sm:shrink-0">
                <RoleBadge role={role} />
              </dt>
              <dd className="text-sm text-ink-muted">{ROLE_DESCRIPTIONS[role]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
