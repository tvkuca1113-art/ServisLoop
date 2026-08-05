import { describe, expect, it } from 'vitest';
import { civilDate } from '../dates';
import {
  STAGE_OFFSETS,
  type DispatchableReminder,
  planReminders,
  reconcileReminders,
  reminderKey,
  renderReminderMessage,
  selectDueReminders,
  selectStaleReminders,
} from '../reminders';

const DEVICE = 'dev-1';

function reminder(over: Partial<DispatchableReminder> = {}): DispatchableReminder {
  return {
    id: 'r1',
    deviceId: DEVICE,
    dueDate: civilDate('2026-09-01'),
    stage: 'T_7',
    scheduledFor: civilDate('2026-08-25'),
    status: 'pending',
    ...over,
  };
}

describe('planReminders', () => {
  it('builds the full ladder ordered by send date', () => {
    const plan = planReminders({ deviceId: DEVICE, dueDate: civilDate('2026-09-01') });
    expect(plan.map((p) => p.stage)).toEqual(['T_30', 'T_7', 'T_0', 'OVERDUE']);
    expect(plan.map((p) => p.scheduledFor)).toEqual([
      '2026-08-02',
      '2026-08-25',
      '2026-09-01',
      '2026-09-08',
    ]);
  });

  it('applies the documented stage offsets', () => {
    expect(STAGE_OFFSETS).toEqual({ T_30: -30, T_7: -7, T_0: 0, OVERDUE: 7 });
  });

  it('produces nothing for an unscheduled device', () => {
    expect(planReminders({ deviceId: DEVICE, dueDate: null })).toEqual([]);
  });

  it('honours a restricted stage list', () => {
    const plan = planReminders({
      deviceId: DEVICE,
      dueDate: civilDate('2026-09-01'),
      stages: ['T_7', 'T_0'],
    });
    expect(plan.map((p) => p.stage)).toEqual(['T_7', 'T_0']);
  });

  it('drops stages whose send date already passed when `today` is supplied', () => {
    // Due date moved close in: a "30 days before" notice would be nonsense.
    const plan = planReminders({
      deviceId: DEVICE,
      dueDate: civilDate('2026-09-01'),
      today: civilDate('2026-08-20'),
    });
    expect(plan.map((p) => p.stage)).toEqual(['T_7', 'T_0', 'OVERDUE']);
  });

  it('emits a stable idempotency key', () => {
    const plan = planReminders({ deviceId: DEVICE, dueDate: civilDate('2026-09-01') });
    expect(plan[0]?.key).toBe(reminderKey(DEVICE, civilDate('2026-09-01'), 'T_30'));
    expect(plan[0]?.key).toBe('dev-1:2026-09-01:T_30');
  });
});

describe('selectDueReminders', () => {
  const today = civilDate('2026-08-25');

  it('selects only pending reminders whose date has arrived', () => {
    const list = [
      reminder({ id: 'a', scheduledFor: civilDate('2026-08-25') }),
      reminder({ id: 'b', scheduledFor: civilDate('2026-08-26') }), // future
      reminder({ id: 'c', scheduledFor: civilDate('2026-08-24'), status: 'sent' }),
    ];
    expect(selectDueReminders({ reminders: list, today }).map((r) => r.id)).toEqual(['a']);
  });

  it('drains a backlog oldest first', () => {
    const list = [
      reminder({ id: 'newer', scheduledFor: civilDate('2026-08-24') }),
      reminder({ id: 'older', scheduledFor: civilDate('2026-08-20') }),
    ];
    expect(selectDueReminders({ reminders: list, today }).map((r) => r.id)).toEqual([
      'older',
      'newer',
    ]);
  });

  it('refuses to send reminders that are stale beyond the grace window', () => {
    const list = [reminder({ id: 'ancient', scheduledFor: civilDate('2026-07-01') })];
    expect(selectDueReminders({ reminders: list, today })).toEqual([]);
    expect(selectStaleReminders(list, today).map((r) => r.id)).toEqual(['ancient']);
  });

  it('respects the dispatch limit', () => {
    const list = Array.from({ length: 10 }, (_, i) =>
      reminder({ id: `r${i}`, scheduledFor: civilDate('2026-08-20') }),
    );
    expect(selectDueReminders({ reminders: list, today, limit: 3 })).toHaveLength(3);
  });

  it('is idempotent — a reminder already marked sent is never picked again', () => {
    const list = [reminder({ id: 'a', scheduledFor: civilDate('2026-08-25') })];
    const firstPass = selectDueReminders({ reminders: list, today });
    expect(firstPass).toHaveLength(1);

    const afterSend = list.map((r) => ({ ...r, status: 'sent' as const }));
    expect(selectDueReminders({ reminders: afterSend, today })).toHaveLength(0);
  });
});

describe('reconcileReminders', () => {
  it('creates the ladder from scratch', () => {
    const desired = planReminders({ deviceId: DEVICE, dueDate: civilDate('2026-09-01') });
    const result = reconcileReminders({ desired, existing: [] });
    expect(result.toCreate).toHaveLength(4);
    expect(result.toCancel).toHaveLength(0);
  });

  it('is a no-op when the ladder already matches', () => {
    const desired = planReminders({ deviceId: DEVICE, dueDate: civilDate('2026-09-01') });
    const existing: DispatchableReminder[] = desired.map((d, i) => ({
      id: `e${i}`,
      deviceId: d.deviceId,
      dueDate: d.dueDate,
      stage: d.stage,
      scheduledFor: d.scheduledFor,
      status: 'pending',
    }));
    const result = reconcileReminders({ desired, existing });
    expect(result.toCreate).toHaveLength(0);
    expect(result.toCancel).toHaveLength(0);
    expect(result.unchanged).toHaveLength(4);
  });

  it('cancels pending reminders for a due date that moved', () => {
    const oldPlan = planReminders({ deviceId: DEVICE, dueDate: civilDate('2026-09-01') });
    const existing: DispatchableReminder[] = oldPlan.map((d, i) => ({
      id: `e${i}`,
      deviceId: d.deviceId,
      dueDate: d.dueDate,
      stage: d.stage,
      scheduledFor: d.scheduledFor,
      status: 'pending',
    }));
    const desired = planReminders({ deviceId: DEVICE, dueDate: civilDate('2026-12-01') });

    const result = reconcileReminders({ desired, existing });
    expect(result.toCreate).toHaveLength(4);
    expect(result.toCancel).toHaveLength(4);
  });

  it('never cancels a reminder that was already sent', () => {
    const oldPlan = planReminders({ deviceId: DEVICE, dueDate: civilDate('2026-09-01') });
    const existing: DispatchableReminder[] = oldPlan.map((d, i) => ({
      id: `e${i}`,
      deviceId: d.deviceId,
      dueDate: d.dueDate,
      stage: d.stage,
      scheduledFor: d.scheduledFor,
      status: i === 0 ? 'sent' : 'pending',
    }));
    const desired = planReminders({ deviceId: DEVICE, dueDate: civilDate('2026-12-01') });

    const result = reconcileReminders({ desired, existing });
    expect(result.toCancel.map((r) => r.id)).not.toContain('e0');
    expect(result.unchanged.map((r) => r.id)).toContain('e0');
  });
});

describe('renderReminderMessage', () => {
  const base = {
    deviceName: 'Boiler VK-200',
    locationName: 'Hotel Neretva',
    organizationName: 'ServisLoop Demo d.o.o.',
    bookingUrl: 'https://example.com/d/abc',
  };

  it('is deterministic — identical inputs give byte-identical output', () => {
    const args = {
      ...base,
      stage: 'T_7' as const,
      dueDate: civilDate('2026-09-01'),
      today: civilDate('2026-08-25'),
    };
    expect(renderReminderMessage(args)).toEqual(renderReminderMessage(args));
  });

  it('phrases upcoming, due-today and overdue differently', () => {
    const upcoming = renderReminderMessage({
      ...base,
      stage: 'T_7',
      dueDate: civilDate('2026-09-01'),
      today: civilDate('2026-08-25'),
    });
    expect(upcoming.body).toContain('in 7 day(s)');
    expect(upcoming.subject).toBe('Service reminder: Boiler VK-200 at Hotel Neretva');

    const dueToday = renderReminderMessage({
      ...base,
      stage: 'T_0',
      dueDate: civilDate('2026-09-01'),
      today: civilDate('2026-09-01'),
    });
    expect(dueToday.body).toContain('is due today');

    const overdue = renderReminderMessage({
      ...base,
      stage: 'OVERDUE',
      dueDate: civilDate('2026-09-01'),
      today: civilDate('2026-09-08'),
    });
    expect(overdue.subject).toContain('Overdue service');
    expect(overdue.body).toContain('7 day(s) overdue');
  });

  it('always includes the booking link', () => {
    const msg = renderReminderMessage({
      ...base,
      stage: 'T_30',
      dueDate: civilDate('2026-09-01'),
      today: civilDate('2026-08-02'),
    });
    expect(msg.body).toContain(base.bookingUrl);
  });
});
