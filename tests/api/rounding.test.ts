/**
 * S2.1 rounding: SCN-13 — a summed duration is rounded **up** to the next
 * 30-minute boundary for occupancy, and the rounded block is what the system
 * offers and what it reserves.
 *
 * Source: REQ-F-031 (a multi-service duration is rounded up to the next
 *         30-minute boundary for occupancy: 75 becomes 90), REQ-NF-008 (all
 *         scheduling uses 30-minute slots), REQ-F-001 (the total duration is the
 *         sum of the selected services), REQ-F-002 (a slot is offered only when
 *         the whole block fits inside availability);
 *         SCN-13 (75 minutes occupies a 90-minute block); POS-13, POS-27;
 *         `resource-model.md` §5.1 (P7, P8);
 *         `openapi.yaml#/components/schemas/AvailabilityResponse`
 *         (`occupiedDurationMinutes`: "Sum after rounding up to a 30-minute
 *         boundary (REQ-F-031); 75 becomes 90") and `AvailabilitySlot`
 *         (`durationMinutes`: "Rounded block occupied by the requested
 *         services").
 * Contract: openapi.yaml#/paths/~1masters~1{masterId}~1availability (P7),
 *           ~1appointments (P8); schemas AvailabilityResponse, AvailabilitySlot,
 *           Appointment.
 * Ticket: SMS-19 (Test)
 *
 * ---------------------------------------------------------------------------
 * Why this file exists separately from `availability.test.ts` and
 * `booking.test.ts`.
 *
 * S1.3 already proved the rounding arithmetic on P7's own response
 * (`availability.test.ts`, "P7 — duration arithmetic and 30-minute rounding").
 * SCN-13 is not that arithmetic: it is the claim that the rounded block is the
 * unit the system schedules in — the block P7 offers, the block P8 reserves, and
 * the block that decides whether a start fits at all. Those are three different
 * observations of one rule, and a defect can satisfy any one of them alone:
 *
 *   - an implementation that rounds for display but reserves the unrounded
 *     duration passes R1 and fails R2/R3;
 *   - one that rounds each service separately passes R1 and fails R6;
 *   - one that rounds the block but tests fit against the unrounded duration
 *     passes R1–R6 and fails R7.
 *
 * The file therefore asserts the rule where it is observable, not where it is
 * convenient. It uses the injected clock (D9) so that "now" never decides
 * whether a slot is in the past.
 */

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import {
  arrangeAdmin,
  arrangeLink,
  arrangeMaster,
  arrangeService,
  arrangeWeeklyWindow,
  unique,
  type AdminFixture,
  type MasterFixture,
  type ServiceFixture,
} from '../helpers/booking.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal view of a supertest response; see `tests/api/auth.test.ts`. */
interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

/** The instant every case treats as "now" (D9); well before every date used. */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday three weeks after NOW. */
const MONDAY = '2026-12-07';
const OFFSET = '+02:00';

function onMonday(time: string): string {
  return `${MONDAY}T${time}:00${OFFSET}`;
}

describe('S2.1 rounding — SCN-13, the rounded block is the scheduling unit', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isAvailabilityResponse = getSchemaValidator('AvailabilityResponse');
  const isAppointment = getSchemaValidator('Appointment');

  let admin: AdminFixture;

  /** 45 + 30 = 75, which occupies 90: SCN-13's own numbers. */
  let service45: ServiceFixture;
  let service30: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);

    service45 = await arrangeService(app, admin.token, {
      name: unique('Rounding 45'),
      baseDurationMinutes: 45,
    });
    service30 = await arrangeService(app, admin.token, {
      name: unique('Rounding 30'),
      baseDurationMinutes: 30,
    });
  });

  /**
   * A master of this case's own, with the given services linked and one Monday
   * window. Each case gets a fresh calendar, so no case's booking can change
   * another's slot list.
   */
  async function freshMaster(
    services: ServiceFixture[],
    window: { startTime: string; endTime: string } = { startTime: '10:00', endTime: '18:00' },
  ): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('Rounding Master'));
    for (const service of services) {
      await arrangeLink(app, admin.token, master.id, service.id, 30000);
    }
    await arrangeWeeklyWindow(app, master.token, 1, window.startTime, window.endTime);
    return master;
  }

  async function getSlots(masterId: string, serviceIds: ServiceFixture[]): Promise<JsonResponse> {
    return request(app)
      .get(`/api/v1/masters/${masterId}/availability`)
      .query({ date: MONDAY, serviceIds: serviceIds.map((service) => service.id).join(',') });
  }

  async function book(
    masterId: string,
    serviceIds: ServiceFixture[],
    startAt: string,
  ): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        masterId,
        serviceIds: serviceIds.map((service) => service.id),
        startAt,
      });
  }

  function startsOf(response: JsonResponse): string[] {
    const slots = (response.body.slots ?? []) as Array<{ startAt: string }>;
    return slots.map((slot) => slot.startAt).sort();
  }

  // ================================================ the arithmetic, on P7

  it('R1 reports 75 minutes summed and 90 occupied (SCN-13)', async () => {
    const master = await freshMaster([service45, service30]);

    const response = await getSlots(master.id, [service45, service30]);

    expect(response.status).toBe(200);
    expect(
      isAvailabilityResponse(response.body),
      JSON.stringify(isAvailabilityResponse.errors ?? []),
    ).toBe(true);
    expect(response.body).toMatchObject({
      totalDurationMinutes: 75,
      occupiedDurationMinutes: 90,
    });
  });

  it('R2 reports the same pair on the appointment P8 creates', async () => {
    // The rounding is not a display rule of P7: the record P8 writes carries the
    // same two numbers, so a client reading the appointment sees the block that
    // was actually reserved.
    const master = await freshMaster([service45, service30]);

    const response = await book(master.id, [service45, service30], onMonday('10:00'));

    expect(response.status).toBe(201);
    expect(isAppointment(response.body), JSON.stringify(isAppointment.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({
      totalDurationMinutes: 75,
      occupiedDurationMinutes: 90,
    });
  });

  it('R3 sets endAt 90 minutes after startAt, not 75', async () => {
    const master = await freshMaster([service45, service30]);

    const response = await book(master.id, [service45, service30], onMonday('10:00'));

    expect(response.status).toBe(201);
    expect(response.body.startAt).toBe(onMonday('10:00'));
    expect(response.body.endAt).toBe(onMonday('11:30'));
  });

  it('R4 leaves an already-aligned total alone: 30 + 30 stays 60', async () => {
    // "Round up to the next boundary" is not "round up to a fixed block": a
    // total that already ends on a boundary is not pushed to the next one.
    const master = await freshMaster([service30, service30]);

    const response = await book(master.id, [service30, service30], onMonday('10:00'));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      totalDurationMinutes: 60,
      occupiedDurationMinutes: 60,
    });
    expect(response.body.endAt).toBe(onMonday('11:00'));
  });

  it('R5 rounds a single 45-minute service up to 60', async () => {
    const master = await freshMaster([service45]);

    const response = await book(master.id, [service45], onMonday('10:00'));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      totalDurationMinutes: 45,
      occupiedDurationMinutes: 60,
    });
  });

  it('R6 rounds the sum once, not each service: 45 + 45 occupies 90, not 120', async () => {
    // Rounding each service first would give 60 + 60 = 120. REQ-F-031 rounds
    // "the summed duration", so the two 45-minute services occupy one 90-minute
    // block.
    const master = await freshMaster([service45, service45]);

    const response = await book(master.id, [service45, service45], onMonday('10:00'));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      totalDurationMinutes: 90,
      occupiedDurationMinutes: 90,
    });
    expect(response.body.endAt).toBe(onMonday('11:30'));
  });

  it('R7 refuses a start the unrounded duration would fit but the block does not', async () => {
    // The window closes at 11:15. A 75-minute request would end at 11:15 and
    // "fit"; the 90-minute block ends at 11:30 and does not. P7 must offer no
    // slot, and P8 must refuse the start — this is the case that separates
    // "rounds the block" from "tests fit against the unrounded duration".
    const master = await freshMaster([service45, service30], {
      startTime: '10:00',
      endTime: '11:15',
    });

    const slots = await getSlots(master.id, [service45, service30]);
    expect(slots.status).toBe(200);
    expect(startsOf(slots)).toEqual([]);

    const booking = await book(master.id, [service45, service30], onMonday('10:00'));
    expect(booking.status).toBe(409);
    expect(booking.body).toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    expect(booking.body.traceId).toMatch(UUID_V4);
  });
});
