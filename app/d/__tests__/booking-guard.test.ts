import { beforeEach, describe, expect, it } from 'vitest';

import {
  getDayAvailability,
  getRangeAvailability,
  validateSlotSelection,
  type AvailabilityConfig,
  type BusyInterval,
  type Slot,
} from '@/domain/availability';
import { addDays, civilDate, toInstant, type CivilDate } from '@/domain/dates';
import type { BlackoutDate, BusinessHours, Organization } from '@/domain/types';
import { __setRepositoryForTests } from '@/server/data';
import { JsonRepository } from '@/server/data/json-repository';
import { createDemoStore, DEMO } from '@/server/data/seed';
import { collectBusyIntervals, createWorkOrderForDevice } from '@/server/service/scheduling';

/**
 * The public booking guard.
 *
 * This is the test for the race the booking page cannot avoid. Two customers open
 * `/d/{token}/book` at the same moment; both are served the same availability; both see
 * 08:00 free; both submit. The client's view is a snapshot taken at page load and it is
 * *never* what decides the booking — `submitBooking` re-reads busy intervals and re-runs
 * `validateSlotSelection` immediately before writing, and that is what these tests
 * exercise, against a real `JsonRepository` rather than a mock.
 *
 * The seeding pattern (and the `server-only` alias that lets a server module be imported
 * at all) matches `src/server/service/__tests__/scheduling.test.ts`.
 */

const TODAY = civilDate('2026-08-02');
/** 09:00 in the organisation's calendar. Supplied, never read from a clock. */
const NOW_MINUTE = 9 * 60;

let repo: JsonRepository;
let org: Organization;
let businessHours: BusinessHours[];
let blackoutDates: CivilDate[];

function configFor(organization: Organization): AvailabilityConfig {
  return {
    slotMinutes: organization.slotMinutes,
    leadHours: organization.bookingLeadHours,
    horizonDays: Math.min(organization.bookingHorizonDays, 365),
    capacity: 1,
  };
}

/** Exactly what the booking page does: fresh busy intervals, then the pure engine. */
async function availableSlots(from: CivilDate, days: number): Promise<Slot[]> {
  const busy = await collectBusyIntervals(org.id, org, from, addDays(from, days - 1));
  return getRangeAvailability({
    from,
    days,
    businessHours,
    blackoutDates,
    busy,
    config: configFor(org),
    today: TODAY,
    nowMinute: NOW_MINUTE,
  }).flatMap((day) => day.slots);
}

/** Exactly what `submitBooking` does: re-read, then re-check the one slot submitted. */
async function recheck(date: CivilDate, startMinute: number) {
  const busy = await collectBusyIntervals(org.id, org, date, date);
  return validateSlotSelection({
    date,
    startMinute,
    businessHours,
    blackoutDates,
    busy,
    config: configFor(org),
    today: TODAY,
    nowMinute: NOW_MINUTE,
  });
}

beforeEach(async () => {
  repo = new JsonRepository({ seed: () => createDemoStore(TODAY) });
  __setRepositoryForTests(repo);

  const found = await repo.getOrganization(DEMO.orgId);
  if (!found) throw new Error('demo organisation missing from seed');
  org = found;

  businessHours = await repo.listBusinessHours(org.id);
  blackoutDates = (await repo.listBlackoutDates(org.id)).map((b: BlackoutDate) => b.date);
});

describe('double-booking is rejected at submission time', () => {
  it('refuses the second customer for a slot both of them saw free', async () => {
    const devices = await repo.listDevices(org.id, { status: 'active' });
    const [deviceA, deviceB] = devices;
    expect(deviceA).toBeDefined();
    expect(deviceB).toBeDefined();
    if (!deviceA || !deviceB) return;

    // Both customers load the page. This is the snapshot they share.
    const snapshot = await availableSlots(TODAY, 21);
    const target = snapshot.find((s) => s.available);
    expect(target).toBeDefined();
    if (!target) return;

    // Customer A submits first. The server re-check passes, so the booking is written.
    const first = await recheck(target.date, target.startMinute);
    expect(first.ok).toBe(true);

    await repo.createBooking({
      orgId: org.id,
      deviceId: deviceA.id,
      requestedDate: target.date,
      requestedStartMinute: target.startMinute,
      requestedEndMinute: target.endMinute,
      status: 'pending',
      contactName: 'Customer A',
      contactEmail: 'a@example.test',
      contactPhone: null,
      note: null,
      workOrderId: null,
    });

    // Customer B submits the same slot seconds later, from the same stale snapshot.
    const second = await recheck(target.date, target.startMinute);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('booked');

    // And the point of the whole exercise: judged against the *stale* busy list, the
    // second submission would have been accepted. It is the fresh read that saves it.
    const staleVerdict = validateSlotSelection({
      date: target.date,
      startMinute: target.startMinute,
      businessHours,
      blackoutDates,
      busy: [] as BusyInterval[],
      config: configFor(org),
      today: TODAY,
      nowMinute: NOW_MINUTE,
    });
    expect(staleVerdict.ok).toBe(true);
  });

  it('counts a booking nobody has actioned yet — pending occupies the slot', async () => {
    const devices = await repo.listDevices(org.id, { status: 'active' });
    const device = devices[0];
    if (!device) return;

    const target = (await availableSlots(TODAY, 21)).find((s) => s.available);
    if (!target) return;

    const booking = await repo.createBooking({
      orgId: org.id,
      deviceId: device.id,
      requestedDate: target.date,
      requestedStartMinute: target.startMinute,
      requestedEndMinute: target.endMinute,
      status: 'pending',
      contactName: 'Customer A',
      contactEmail: null,
      contactPhone: '+387 33 000 000',
      note: null,
      workOrderId: null,
    });

    expect(booking.status).toBe('pending');
    const blocked = await recheck(target.date, target.startMinute);
    expect(blocked.ok).toBe(false);

    // Declining releases it again — the slot goes back on sale.
    await repo.updateBooking(org.id, booking.id, { status: 'declined' });
    const released = await recheck(target.date, target.startMinute);
    expect(released.ok).toBe(true);
  });

  it('refuses a slot a technician is already scheduled into', async () => {
    const devices = await repo.listDevices(org.id, { status: 'active' });
    const device = devices[0];
    if (!device) return;

    const target = (await availableSlots(TODAY, 21)).find((s) => s.available);
    if (!target) return;

    await createWorkOrderForDevice({
      org,
      deviceId: device.id,
      kind: 'scheduled',
      scheduledFor: toInstant(target.date, target.startMinute).toISOString(),
      scheduledMinutes: target.endMinute - target.startMinute,
    });

    const verdict = await recheck(target.date, target.startMinute);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('booked');
  });
});

describe('the guard also catches everything the form could be edited around', () => {
  it('rejects a start time that is not one of the organisation’s slots', async () => {
    const target = (await availableSlots(TODAY, 21)).find((s) => s.available);
    if (!target) return;

    const verdict = await recheck(target.date, target.startMinute + 37);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('not_a_slot');
  });

  it('rejects a slot inside the notice period', async () => {
    // Demo hours are Mon–Fri 08:00–17:00 with 24h notice, and it is 09:00 on Sunday.
    // Monday 08:00 is 23 hours away: visible on the page, greyed, and refused here.
    const monday = addDays(TODAY, 1);
    const verdict = await recheck(monday, 8 * 60);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('too_soon');
  });

  it('rejects a day the organisation closes after the page was loaded', async () => {
    // A trading day with real slots on it, chosen from the same snapshot a customer sees.
    const target = (await availableSlots(TODAY, 21)).find((s) => s.available);
    expect(target).toBeDefined();
    if (!target) return;

    // The organisation declares that day closed while the form sits open on a phone.
    await repo.createBlackoutDate({
      orgId: org.id,
      date: target.date,
      reason: 'Training day',
    });
    blackoutDates = (await repo.listBlackoutDates(org.id)).map((b: BlackoutDate) => b.date);

    const verdict = await recheck(target.date, target.startMinute);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe('blackout');
  });

  it('rejects a date beyond the booking horizon', async () => {
    const config = configFor(org);
    let candidate = addDays(TODAY, config.horizonDays + 1);

    // Step forward to the next trading day — a closed weekend has no slots to refuse.
    for (let guard = 0; guard < 7; guard += 1) {
      const slots = getDayAvailability({
        date: candidate,
        businessHours,
        blackoutDates,
        busy: [],
        config,
        today: TODAY,
        nowMinute: NOW_MINUTE,
      });
      const first = slots[0];
      if (first) {
        const verdict = await recheck(candidate, first.startMinute);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.reason).toBe('beyond_horizon');
        return;
      }
      candidate = addDays(candidate, 1);
    }

    throw new Error('no trading day found beyond the booking horizon');
  });
});
