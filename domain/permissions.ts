/**
 * Role-based access control.
 *
 * One table, one function. Every guard in the application — server actions, route
 * handlers, UI affordances — calls {@link can}. The Postgres RLS policies in
 * `supabase/migrations/0006_rls_policies.sql` mirror this table, so the same rule is
 * enforced in two independent places: if a bug lets a request past the application
 * guard, the database still refuses it.
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

import { ROLE_RANK, type Role } from './types';

export const ACTIONS = [
  // Organisation
  'org:read',
  'org:update',
  'org:delete',
  'org:manage_billing',
  // Members
  'member:read',
  'member:invite',
  'member:update_role',
  'member:remove',
  // Directory
  'customer:read',
  'customer:create',
  'customer:update',
  'customer:delete',
  'location:read',
  'location:create',
  'location:update',
  'location:delete',
  'device:read',
  'device:create',
  'device:update',
  'device:delete',
  'device:import',
  // Scheduling
  'work_order:read',
  'work_order:create',
  'work_order:update',
  'work_order:assign',
  'work_order:start',
  'work_order:complete',
  'work_order:cancel',
  'work_order:delete',
  // Customer-facing intake
  'booking:read',
  'booking:confirm',
  'booking:decline',
  'issue:read',
  'issue:triage',
  'issue:close',
  // Configuration and output
  'checklist:read',
  'checklist:manage',
  'reminder:read',
  'reminder:manage',
  'report:read',
  'report:generate',
  'report:export',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Context for the handful of actions that depend on more than the role.
 *
 * Technicians can act on work orders assigned to them, and only those. That single
 * qualifier is why this is a function rather than a static matrix.
 */
export interface PermissionContext {
  /** True when the actor is the assignee of the work order in question. */
  isAssignee?: boolean;
  /** True when the target member is the actor themselves. */
  isSelf?: boolean;
  /** Role of the member being acted upon, for member-management checks. */
  targetRole?: Role;
}

type Rule = true | ((ctx: PermissionContext) => boolean);

const ASSIGNEE_ONLY: Rule = (ctx) => ctx.isAssignee === true;

/**
 * The permission matrix. Absent entry = denied.
 *
 * `owner` is granted everything explicitly rather than via a wildcard, so that adding a
 * new action forces a deliberate decision about every role instead of silently
 * defaulting to "the owner can do it".
 */
const MATRIX: Readonly<Record<Role, Partial<Record<Action, Rule>>>> = Object.freeze({
  owner: Object.fromEntries(ACTIONS.map((a) => [a, true as Rule])) as Partial<
    Record<Action, Rule>
  >,

  admin: {
    'org:read': true,
    'org:update': true,
    'org:manage_billing': true,

    'member:read': true,
    'member:invite': true,
    // An admin may not touch owners, and may not promote anyone to owner.
    'member:update_role': (ctx) => ctx.targetRole !== 'owner',
    'member:remove': (ctx) => ctx.targetRole !== 'owner' && ctx.isSelf !== true,

    'customer:read': true,
    'customer:create': true,
    'customer:update': true,
    'customer:delete': true,
    'location:read': true,
    'location:create': true,
    'location:update': true,
    'location:delete': true,
    'device:read': true,
    'device:create': true,
    'device:update': true,
    'device:delete': true,
    'device:import': true,

    'work_order:read': true,
    'work_order:create': true,
    'work_order:update': true,
    'work_order:assign': true,
    'work_order:start': true,
    'work_order:complete': true,
    'work_order:cancel': true,
    'work_order:delete': true,

    'booking:read': true,
    'booking:confirm': true,
    'booking:decline': true,
    'issue:read': true,
    'issue:triage': true,
    'issue:close': true,

    'checklist:read': true,
    'checklist:manage': true,
    'reminder:read': true,
    'reminder:manage': true,
    'report:read': true,
    'report:generate': true,
    'report:export': true,
  },

  technician: {
    'org:read': true,
    'member:read': true,

    'customer:read': true,
    'location:read': true,
    'device:read': true,
    // Technicians record findings against the device they are servicing.
    'device:update': true,

    'work_order:read': true,
    'work_order:update': ASSIGNEE_ONLY,
    'work_order:start': ASSIGNEE_ONLY,
    'work_order:complete': ASSIGNEE_ONLY,

    'booking:read': true,
    'issue:read': true,

    'checklist:read': true,
    'reminder:read': true,
    'report:read': true,
    'report:generate': ASSIGNEE_ONLY,
  },

  viewer: {
    'org:read': true,
    'member:read': true,
    'customer:read': true,
    'location:read': true,
    'device:read': true,
    'work_order:read': true,
    'booking:read': true,
    'issue:read': true,
    'checklist:read': true,
    'reminder:read': true,
    'report:read': true,
  },
});

/**
 * The authorisation decision.
 *
 * @param role   the actor's role in the organisation
 * @param action what they are trying to do
 * @param ctx    extra facts for context-sensitive rules
 */
export function can(role: Role, action: Action, ctx: PermissionContext = {}): boolean {
  const rule = MATRIX[role]?.[action];
  if (rule === undefined) return false;
  if (rule === true) return true;
  return rule(ctx);
}

/** Throwing variant for server actions and route handlers. */
export class ForbiddenError extends Error {
  readonly action: Action;
  readonly role: Role;
  constructor(role: Role, action: Action) {
    super(`Role "${role}" is not permitted to perform "${action}".`);
    this.name = 'ForbiddenError';
    this.role = role;
    this.action = action;
  }
}

export function assertCan(role: Role, action: Action, ctx: PermissionContext = {}): void {
  if (!can(role, action, ctx)) throw new ForbiddenError(role, action);
}

/** Privilege comparison, e.g. `atLeast(role, 'admin')`. */
export function atLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Every action a role can perform unconditionally. Used to drive nav visibility. */
export function allowedActions(role: Role): Action[] {
  return ACTIONS.filter((a) => {
    const rule = MATRIX[role]?.[a];
    return rule === true;
  });
}

export const ROLE_LABELS: Readonly<Record<Role, string>> = Object.freeze({
  owner: 'Owner',
  admin: 'Administrator',
  technician: 'Technician',
  viewer: 'Viewer',
});

export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = Object.freeze({
  owner: 'Full control, including billing and deleting the organisation.',
  admin: 'Manages customers, devices, scheduling and team members.',
  technician: 'Works assigned jobs, completes checklists and generates reports.',
  viewer: 'Read-only access to everything.',
});
