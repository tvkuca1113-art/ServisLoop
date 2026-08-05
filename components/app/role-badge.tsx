import { Badge } from '@/components/ui';
import { ROLE_LABELS, atLeast } from '@/domain/permissions';
import type { Role } from '@/domain/types';

/**
 * A member's role, rendered consistently everywhere it appears.
 *
 * Privileged roles get the outlined variant so the two people who can change the
 * organisation stand out in a member list. Deliberately *not* the `state-*` colours —
 * those are reserved for service state (overdue, due soon), and a role is not a state.
 */
export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge variant={atLeast(role, 'admin') ? 'outline' : 'neutral'} className={className}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}
