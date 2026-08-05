import { describe, expect, it } from 'vitest';
import { ACTIONS, ForbiddenError, allowedActions, assertCan, atLeast, can } from '../permissions';
import { ROLES, type Role } from '../types';

describe('owner', () => {
  it('can perform every declared action', () => {
    for (const action of ACTIONS) {
      expect(can('owner', action, { targetRole: 'admin' })).toBe(true);
    }
  });
});

describe('admin', () => {
  it('runs the business but cannot delete the organisation', () => {
    expect(can('admin', 'customer:delete')).toBe(true);
    expect(can('admin', 'device:import')).toBe(true);
    expect(can('admin', 'work_order:assign')).toBe(true);
    expect(can('admin', 'org:delete')).toBe(false);
  });

  it('cannot touch an owner', () => {
    expect(can('admin', 'member:update_role', { targetRole: 'technician' })).toBe(true);
    expect(can('admin', 'member:update_role', { targetRole: 'owner' })).toBe(false);
    expect(can('admin', 'member:remove', { targetRole: 'owner' })).toBe(false);
  });

  it('cannot remove itself', () => {
    expect(can('admin', 'member:remove', { targetRole: 'admin', isSelf: true })).toBe(false);
    expect(can('admin', 'member:remove', { targetRole: 'admin', isSelf: false })).toBe(true);
  });
});

describe('technician', () => {
  it('may act only on work orders assigned to them', () => {
    expect(can('technician', 'work_order:start', { isAssignee: true })).toBe(true);
    expect(can('technician', 'work_order:start', { isAssignee: false })).toBe(false);
    expect(can('technician', 'work_order:start')).toBe(false);

    expect(can('technician', 'work_order:complete', { isAssignee: true })).toBe(true);
    expect(can('technician', 'work_order:complete', { isAssignee: false })).toBe(false);

    expect(can('technician', 'report:generate', { isAssignee: true })).toBe(true);
    expect(can('technician', 'report:generate', { isAssignee: false })).toBe(false);
  });

  it('can read the whole directory but not restructure it', () => {
    expect(can('technician', 'customer:read')).toBe(true);
    expect(can('technician', 'device:read')).toBe(true);
    expect(can('technician', 'customer:create')).toBe(false);
    expect(can('technician', 'device:delete')).toBe(false);
    expect(can('technician', 'device:import')).toBe(false);
  });

  it('cannot assign work or manage the team', () => {
    expect(can('technician', 'work_order:assign', { isAssignee: true })).toBe(false);
    expect(can('technician', 'member:invite')).toBe(false);
    expect(can('technician', 'checklist:manage')).toBe(false);
  });
});

describe('viewer', () => {
  it('can read and nothing else', () => {
    const writeActions = ACTIONS.filter(
      (a) =>
        !a.endsWith(':read') &&
        a !== 'org:read' &&
        a !== 'member:read' &&
        a !== 'report:read',
    );
    for (const action of writeActions) {
      expect(can('viewer', action, { isAssignee: true, targetRole: 'viewer' })).toBe(false);
    }
    expect(can('viewer', 'device:read')).toBe(true);
    expect(can('viewer', 'work_order:read')).toBe(true);
    expect(can('viewer', 'report:read')).toBe(true);
  });

  it('cannot export reports', () => {
    expect(can('viewer', 'report:export')).toBe(false);
    expect(can('viewer', 'report:generate')).toBe(false);
  });
});

describe('deny by default', () => {
  it('refuses an action that no matrix entry covers', () => {
    // Cast through unknown: the point is that an unrecognised action is denied, not typed.
    expect(can('viewer', 'totally:made:up' as unknown as (typeof ACTIONS)[number])).toBe(false);
  });

  it('every role and action pair yields a boolean, never undefined', () => {
    for (const role of ROLES) {
      for (const action of ACTIONS) {
        expect(typeof can(role, action)).toBe('boolean');
      }
    }
  });
});

describe('assertCan', () => {
  it('throws a typed error carrying the role and action', () => {
    try {
      assertCan('viewer', 'device:delete');
      throw new Error('expected assertCan to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).role).toBe('viewer');
      expect((error as ForbiddenError).action).toBe('device:delete');
    }
  });

  it('is silent when permitted', () => {
    expect(() => assertCan('admin', 'device:delete')).not.toThrow();
  });
});

describe('atLeast', () => {
  it('orders roles by privilege', () => {
    expect(atLeast('owner', 'admin')).toBe(true);
    expect(atLeast('admin', 'admin')).toBe(true);
    expect(atLeast('technician', 'admin')).toBe(false);
    expect(atLeast('technician', 'viewer')).toBe(true);
    expect(atLeast('viewer', 'technician')).toBe(false);
  });
});

describe('allowedActions', () => {
  it('lists only unconditional grants, so nav never shows a dead link', () => {
    const tech = allowedActions('technician');
    expect(tech).toContain('device:read');
    // Conditional on assignment — excluded from the unconditional list.
    expect(tech).not.toContain('work_order:complete');
  });

  it('narrows monotonically as privilege drops', () => {
    const counts = ROLES.map((r: Role) => allowedActions(r).length);
    const owner = allowedActions('owner').length;
    expect(owner).toBe(ACTIONS.length);
    expect(Math.min(...counts)).toBe(allowedActions('viewer').length);
  });
});
