import { describe, expect, it } from 'vitest';
import { civilDate } from '../dates';
import {
  DEFAULT_INTERVAL_DAYS,
  InvalidIntervalError,
  assertValidInterval,
  compareByUrgency,
  computeNextServiceDue,
  describeInterval,
  effectiveAnchor,
  effectiveIntervalDays,
  projectSchedule,
  serviceStatus,
} from '../service-interval';

describe('effectiveIntervalDays', () => {
  it('prefers the device override', () => {
    expect(
      effectiveIntervalDays({ serviceIntervalDays: 90 }, { defaultIntervalDays: 365 }),
    ).toBe(90);
  });

  it('falls back to the device type, then to the global default', () => {
    expect(
      effectiveIntervalDays({ serviceIntervalDays: null }, { defaultIntervalDays: 180 }),
    ).toBe(180);
    expect(effectiveIntervalDays({ serviceIntervalDays: null }, null)).toBe(
      DEFAULT_INTERVAL_DAYS,
    );
  });

  it('rejects an out-of-range interval rather than silently clamping', () => {
    expect(() => effectiveIntervalDays({ serviceIntervalDays: 0 }, null)).toThrow(
      InvalidIntervalError,
    );
    expect(() => effectiveIntervalDays({ serviceIntervalDays: 99_999 }, null)).toThrow(
      InvalidIntervalError,
    );
    expect(() => assertValidInterval(30.5)).toThrow(InvalidIntervalError);
  });
});

describe('effectiveAnchor', () => {
  it('uses the device setting, then the organisation default', () => {
    expect(effectiveAnchor({ intervalAnchor: 'schedule' }, 'completion')).toBe('schedule');
    expect(effectiveAnchor({ intervalAnchor: null }, 'schedule')).toBe('schedule');
    expect(effectiveAnchor({ intervalAnchor: null })).toBe('completion');
  });
});

describe('computeNextServiceDue — never serviced', () => {
  it('seeds from the installation date', () => {
    expect(
      computeNextServiceDue({
        intervalDays: 365,
        anchor: 'completion',
        installedOn: civilDate('2026-01-15'),
      }),
    ).toBe('2027-01-15');
  });

  it('returns null when there is nothing to anchor to', () => {
    expect(computeNextServiceDue({ intervalDays: 365, anchor: 'completion' })).toBeNull();
  });
});

describe('computeNextServiceDue — completion anchor', () => {
  it('counts forward from the day the work was done', () => {
    expect(
      computeNextServiceDue({
        intervalDays: 90,
        anchor: 'completion',
        completedOn: civilDate('2026-08-02'),
        previousDue: civilDate('2026-07-01'),
      }),
    ).toBe('2026-10-31');
  });

  it('lets the cadence drift when work runs late', () => {
    // Due 1 March, done 20 March, annual → next due 20 March next year.
    expect(
      computeNextServiceDue({
        intervalDays: 365,
        anchor: 'completion',
        completedOn: civilDate('2026-03-20'),
        previousDue: civilDate('2026-03-01'),
      }),
    ).toBe('2027-03-20');
  });
});

describe('computeNextServiceDue — schedule anchor', () => {
  it('holds the original cadence when work runs late', () => {
    expect(
      computeNextServiceDue({
        intervalDays: 365,
        anchor: 'schedule',
        completedOn: civilDate('2026-03-20'),
        previousDue: civilDate('2026-03-01'),
      }),
    ).toBe('2027-03-01');
  });

  it('holds the cadence when work runs early', () => {
    expect(
      computeNextServiceDue({
        intervalDays: 365,
        anchor: 'schedule',
        completedOn: civilDate('2026-02-10'),
        previousDue: civilDate('2026-03-01'),
      }),
    ).toBe('2027-03-01');
  });

  it('rolls forward over several missed intervals', () => {
    // Quarterly device, due 2026-01-01, not touched until 2026-08-02.
    expect(
      computeNextServiceDue({
        intervalDays: 90,
        anchor: 'schedule',
        completedOn: civilDate('2026-08-02'),
        previousDue: civilDate('2026-01-01'),
      }),
    ).toBe('2026-09-28');
  });

  it('degrades to the completion anchor when there is no previous due date', () => {
    expect(
      computeNextServiceDue({
        intervalDays: 30,
        anchor: 'schedule',
        completedOn: civilDate('2026-08-02'),
        previousDue: null,
      }),
    ).toBe('2026-09-01');
  });
});

describe('serviceStatus', () => {
  const today = civilDate('2026-08-02');

  it('classifies each band', () => {
    expect(serviceStatus({ nextServiceDue: civilDate('2026-12-01'), today }).state).toBe('ok');
    expect(serviceStatus({ nextServiceDue: civilDate('2026-08-20'), today }).state).toBe(
      'due_soon',
    );
    expect(serviceStatus({ nextServiceDue: civilDate('2026-08-02'), today }).state).toBe('due');
    expect(serviceStatus({ nextServiceDue: civilDate('2026-07-20'), today }).state).toBe(
      'overdue',
    );
  });

  it('reports signed days until due', () => {
    expect(serviceStatus({ nextServiceDue: civilDate('2026-08-12'), today }).daysUntilDue).toBe(
      10,
    );
    expect(serviceStatus({ nextServiceDue: civilDate('2026-07-23'), today }).daysUntilDue).toBe(
      -10,
    );
  });

  it('respects a custom lead window', () => {
    expect(
      serviceStatus({ nextServiceDue: civilDate('2026-08-20'), today, leadDays: 7 }).state,
    ).toBe('ok');
    expect(
      serviceStatus({ nextServiceDue: civilDate('2026-08-08'), today, leadDays: 7 }).state,
    ).toBe('due_soon');
  });

  it('never chases paused or retired devices', () => {
    for (const deviceStatus of ['paused', 'retired'] as const) {
      const result = serviceStatus({
        nextServiceDue: civilDate('2026-01-01'),
        today,
        deviceStatus,
      });
      expect(result.state).toBe('unscheduled');
      expect(result.isActionable).toBe(false);
    }
  });

  it('treats a device with no due date as unscheduled, not overdue', () => {
    const result = serviceStatus({ nextServiceDue: null, today });
    expect(result.state).toBe('unscheduled');
    expect(result.daysUntilDue).toBeNull();
    expect(result.isActionable).toBe(false);
  });

  it('marks exactly the actionable states', () => {
    expect(serviceStatus({ nextServiceDue: civilDate('2026-12-01'), today }).isActionable).toBe(
      false,
    );
    expect(serviceStatus({ nextServiceDue: civilDate('2026-08-10'), today }).isActionable).toBe(
      true,
    );
  });
});

describe('compareByUrgency', () => {
  it('sorts soonest first and pushes unscheduled devices to the end', () => {
    const devices = [
      { nextServiceDue: null },
      { nextServiceDue: civilDate('2026-09-01') },
      { nextServiceDue: civilDate('2026-07-01') },
    ];
    expect([...devices].sort(compareByUrgency).map((d) => d.nextServiceDue)).toEqual([
      '2026-07-01',
      '2026-09-01',
      null,
    ]);
  });
});

describe('projectSchedule', () => {
  it('projects forward by whole intervals', () => {
    expect(projectSchedule(civilDate('2026-01-01'), 90, 3)).toEqual([
      '2026-04-01',
      '2026-06-30',
      '2026-09-28',
    ]);
  });

  it('bounds its own output', () => {
    expect(projectSchedule(civilDate('2026-01-01'), 90, 0)).toEqual([]);
    expect(() => projectSchedule(civilDate('2026-01-01'), 90, 500)).toThrow(RangeError);
  });
});

describe('describeInterval', () => {
  it('uses natural phrasing for common cadences', () => {
    expect(describeInterval(365)).toBe('Annually');
    expect(describeInterval(730)).toBe('Every 2 years');
    expect(describeInterval(30)).toBe('Monthly');
    expect(describeInterval(90)).toBe('Quarterly');
    expect(describeInterval(180)).toBe('Every 6 months');
    expect(describeInterval(7)).toBe('Weekly');
    expect(describeInterval(14)).toBe('Every 2 weeks');
    expect(describeInterval(120)).toBe('Every 4 months');
    expect(describeInterval(45)).toBe('Every 45 days');
  });
});
