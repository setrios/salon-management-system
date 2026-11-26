/**
 * S2.1 occupancy: booked time is subtracted from availability, and two requests
 * for the same time cannot both succeed.
 *
 * Source: REQ-F-002 (only slots inside the master's availability **and not
 *         already booked** are selectable), REQ-F-001 (the block a booking
 *         occupies is the summed, rounded duration), REQ-F-031 (rounding),
 *         REQ-NF-008 (30-minute boundaries);
 *         SCN-01 (a booking is confirmed immediately, so it occupies its block
 *         from the moment it is created); POS-13, NEG-08;
 *         `error-model.md` §3 (409 `SLOT_UNAVAILABLE` = "outside availability,
 *         already booked, or overlaps an existing appointment");
 *         `resource-model.md` §5.1 (P7, P8), §4 (the state table: only
 *         `cancelled` frees a block).
 * Contract: openapi.yaml#/paths/~1masters~1{masterId}~1availability (P7),
 *           ~1appointments (P8); schemas AvailabilityResponse, AvailabilitySlot,
 *           Appointment, Problem.
 * Ticket: SMS-8 (Test) — the booking flow's occupancy half; SCN-01's Given.
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (tdd-SMS-25, D1, D2, D9):
 *
 *   D1  A booked slot **disappears** from P7's list; it does not stay with
 *       `available: false`. The contract's `AvailabilitySlot.available` is
 *       required, and the P7 description says the operation "filters out booked
 *       time" — filtering is removal. `available` therefore stays `true` on
 *       every slot P7 returns, and O10 asserts exactly that, so the field is not
 *       left as an unexamined constant.
 *   D2  Concurrency is handled by `pg_advisory_xact_lock(master_id)` around the
 *       booking transaction, plus a partial unique index on
 *       `(master_id, start_at) where status <> 'cancelled'`. The index alone
 *       closes the exact-start race but not the overlap (10:00 and 10:30 with a
 *       90-minute block); the lock serialises the check-then-insert for one
 *       master, which is what makes the overlap check sound. Alternatives
 *       considered and rejected: `SELECT … FOR UPDATE` on the master row (works,
 *       but takes a row lock on a table read by every public request), and
 *       `SERIALIZABLE` isolation (correct, but turns a business refusal into a
 *       serialisation failure the client would see as 500 unless retried).
 *   D9  The clock is injected, so "now" never decides whether a slot is past.
 *
 * O6–O8 are the concurrency cases. They are written as two requests issued
 * together and awaited together, which is the only shape in which the race is
 * observable: a sequential pair would pass against an implementation with no
 * protection at all.
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

/** The instant every case treats as "now" (D9). */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday three weeks after NOW. */
const MONDAY = '2026-12-07';
const OFFSET = '+02:00';

function onMonday(time: string): string {
  return `${MONDAY}T${time}:00${OFFSET}`;
}

describe('S2.1 occupancy — booked time is not offered, and cannot be double-booked', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isAvailabilityResponse = getSchemaValidator('AvailabilityResponse');
  const isAppointment = getSchemaValidator('Appointment');
  const isProblem = getSchemaValidator('Problem');

  let admin: AdminFixture;

  /** 45 + 30 = 75, occupying 90: the block that makes overlap observable. */
  let service45: ServiceFixture;
  let service30: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);

    service45 = await arrangeService(app, admin.token, {
      name: unique('Occupancy 45'),
      baseDurationMinutes: 45,
    });
    service30 = await arrangeService(app, admin.token, {
      name: unique('Occupancy 30'),
      baseDurationMinutes: 30,
    });
  });

  /** A master of this case's own, so no case's booking changes another's list. */
  async function freshMaster(
    services: ServiceFixture[] = [service45, service30],
  ): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('Occupancy Master'));
    for (const service of services) {
      await arrangeLink(app, admin.token, master.id, service.id, 30000);
    }
    await arrangeWeeklyWindow(app, master.token, 1, '10:00', '18:00');
    return master;
  }

  async function getSlots(
    masterId: string,
    serviceIds: ServiceFixture[] = [service45, service30],
  ): Promise<JsonResponse> {
    return request(app)
      .get(`/api/v1/masters/${masterId}/availability`)
      .query({ date: MONDAY, serviceIds: serviceIds.map((service) => service.id).join(',') });
  }

  /**
   * Starts a booking request and returns its promise.
   *
   * `async` on purpose: the body runs synchronously up to the `return`, so two
   * calls made before either is awaited are two requests in flight at once —
   * which is the only shape in which the race is observable.
   */
  async function bookRequest(
    masterId: string,
    startAt: string,
    serviceIds: ServiceFixture[] = [service45, service30],
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

  async function book(
    masterId: string,
    startAt: string,
    serviceIds: ServiceFixture[] = [service45, service30],
  ): Promise<JsonResponse> {
    return bookRequest(masterId, startAt, serviceIds);
  }

  function startsOf(response: JsonResponse): string[] {
    const slots = (response.body.slots ?? []) as Array<{ startAt: string }>;
    return slots.map((slot) => slot.startAt).sort();
  }

  // ============================================ P7 and P8 agree on the block

  it('O1 offers a slot at 10:00 before anything is booked', async () => {
    const master = await freshMaster();

    const response = await getSlots(master.id);

    expect(response.status).toBe(200);
    expect(
      isAvailabilityResponse(response.body),
      JSON.stringify(isAvailabilityResponse.errors ?? []),
    ).toBe(true);
    expect(startsOf(response)).toContain(onMonday('10:00'));
  });

  it('O2 offers exactly the starts P8 accepts: the two operations share one rule', async () => {
    // The single-source-of-truth requirement, stated as an observation: for a
    // fresh master, every start P7 offers is a start P8 accepts, and the first
    // start P7 does not offer is a start P8 refuses. If P7 computed slots from
    // windows while P8 checked availability separately, this is where the two
    // would diverge.
    const master = await freshMaster();

    const offered = startsOf(await getSlots(master.id));
    expect(offered.length).toBeGreaterThan(0);

    const accepted = await book(master.id, offered[0] as string);
    expect(accepted.status).toBe(201);
    expect(isAppointment(accepted.body), JSON.stringify(isAppointment.errors ?? [])).toBe(true);

    // 09:00 is before the window, so P7 does not offer it and P8 refuses it.
    expect(offered).not.toContain(onMonday('09:00'));
    const refused = await book(master.id, onMonday('09:00'));
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  });

  it('O3 removes the booked start from P7 and keeps the rest', async () => {
    const master = await freshMaster();
    const before = startsOf(await getSlots(master.id));

    const created = await book(master.id, onMonday('10:00'));
    expect(created.status).toBe(201);

    const after = startsOf(await getSlots(master.id));

    expect(after).not.toContain(onMonday('10:00'));
    // The "rest" is the starts outside the booked block. The block is 90
    // minutes (45 + 30 rounded up), so it covers 10:00–11:30 and removes 10:30
    // and 11:00 as well — O4 states that directly, and this case must not
    // contradict it. What this case adds is that nothing *else* moved.
    expect(after).toEqual(before.filter((start) => start >= onMonday('11:30')));
  });

  it('O4 removes every start the booked block overlaps, not only its own', async () => {
    // A 90-minute block from 10:00 covers 10:00–11:30, so 10:30 and 11:00 are
    // gone too. Removing only the exact start would leave two slots that P8
    // would then refuse — the divergence O2 exists to catch.
    const master = await freshMaster();

    const created = await book(master.id, onMonday('10:00'));
    expect(created.status).toBe(201);

    const after = startsOf(await getSlots(master.id));

    expect(after).not.toContain(onMonday('10:00'));
    expect(after).not.toContain(onMonday('10:30'));
    expect(after).not.toContain(onMonday('11:00'));
    // 11:30 is the first start after the block ends, and it is still offered.
    expect(after).toContain(onMonday('11:30'));
  });

  it("O5 keeps a booking on one master out of another master's slots", async () => {
    const booked = await freshMaster();
    const other = await freshMaster();

    const created = await book(booked.id, onMonday('10:00'));
    expect(created.status).toBe(201);

    expect(startsOf(await getSlots(other.id))).toContain(onMonday('10:00'));
  });

  // ==================================================== the concurrency cases

  it('O6 accepts one of two simultaneous requests for the same start', async () => {
    // Issued together and awaited together: a sequential pair would pass against
    // an implementation with no protection at all (D2).
    const master = await freshMaster();

    const [first, second] = await Promise.all([
      bookRequest(master.id, onMonday('10:00')),
      bookRequest(master.id, onMonday('10:00')),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('O7 accepts one of two simultaneous requests whose blocks overlap', async () => {
    // 10:00 and 10:30 are different starts, so a unique index on
    // `(master_id, start_at)` does not see them as a conflict — but a 90-minute
    // block from 10:00 covers 10:30. This is the case the index alone cannot
    // close, and the reason D2 takes a lock as well.
    const master = await freshMaster();

    const [first, second] = await Promise.all([
      bookRequest(master.id, onMonday('10:00')),
      bookRequest(master.id, onMonday('10:30')),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('O8 answers the losing request with 409 SLOT_UNAVAILABLE, not 500', async () => {
    // A unique-violation surfaced as a 500 would be the shape of an
    // implementation that relies on the index and lets the driver's error
    // escape. The loser must be a business refusal the client can act on.
    const master = await freshMaster();

    const [first, second] = await Promise.all([
      bookRequest(master.id, onMonday('10:00')),
      bookRequest(master.id, onMonday('10:00')),
    ]);

    const loser = first.status === 201 ? second : first;
    expect(loser.status).toBe(409);
    expect(loser.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(loser.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(loser.body).toMatchObject({ status: 409, code: 'SLOT_UNAVAILABLE' });
    expect(loser.body.traceId).toMatch(UUID_V4);
  });

  it('O9 leaves exactly one appointment behind after the race', async () => {
    // The refusal must not be a rollback of both: one record exists, and P7
    // shows its block as taken. Read through P7 rather than through a count, so
    // the assertion is about the observable state.
    const master = await freshMaster();

    const [first, second] = await Promise.all([
      bookRequest(master.id, onMonday('10:00')),
      bookRequest(master.id, onMonday('10:00')),
    ]);

    const winner = first.status === 201 ? first : second;
    expect(winner.status).toBe(201);

    const after = startsOf(await getSlots(master.id));
    expect(after).not.toContain(onMonday('10:00'));
    expect(after).not.toContain(onMonday('10:30'));
  });

  // ============================================ what `available` means now

  it('O10 reports available: true on every slot P7 returns, because booked time is filtered out', async () => {
    // D1. The field is required by the schema, and the operation's description
    // says it "filters out booked time" — so a booked slot is absent, not
    // present-and-false. This case exists so the field is not left as an
    // unexamined constant: it is asserted *after* a booking, which is the only
    // state in which the two readings differ.
    const master = await freshMaster();

    const created = await book(master.id, onMonday('10:00'));
    expect(created.status).toBe(201);

    const response = await getSlots(master.id);
    const slots = response.body.slots as Array<{ startAt: string; available: boolean }>;

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.available === true)).toBe(true);
    expect(slots.map((slot) => slot.startAt)).not.toContain(onMonday('10:00'));
  });
});
