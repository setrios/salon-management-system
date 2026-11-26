/**
 * S2.1 booking: P8 `createAppointment`. The public booking operation and the
 * only write on the public surface.
 *
 * Source: REQ-F-001 (one or more services per visit; the total duration and the
 *         total cost are the sums of the selected services), REQ-F-002 (only
 *         slots inside the master's availability and not already booked are
 *         selectable, so a request outside them is refused), REQ-F-003 (the
 *         appointment is confirmed automatically on creation — no approval
 *         state exists), REQ-F-004 and REQ-F-005 (the created record carries the
 *         token and the confirmation URL that the page and the SMS will use),
 *         REQ-F-010 and REQ-F-011 (a reminder whose scheduled time is already
 *         past is skipped, not sent retroactively), REQ-NF-008 (no bookable
 *         start off a 30-minute boundary);
 *         SCN-01 (two services in one visit, confirmed, summed duration and
 *         cost), SCN-13 (75 minutes occupies a 90-minute block);
 *         POS-01, POS-13, NEG-01, NEG-02, NEG-08, NEG-14, NEG-15, NEG-17;
 *         `error-model.md` §3 (409 `SLOT_UNAVAILABLE` = "outside availability,
 *         already booked, or overlaps an existing appointment"; 422
 *         `VALIDATION_ERROR` = request body violates the schema; 422
 *         `BUSINESS_RULE_VIOLATION` = "semantically valid request that breaks a
 *         rule without a more specific code"), §4;
 *         `resource-model.md` §5.1 (P8), §4 (statuses and the state table).
 * Contract: openapi.yaml#/paths/~1appointments/post;
 *           schemas AppointmentCreate, Appointment, AppointmentService,
 *           Reminder; error bodies validated against Problem.
 * Ticket: SMS-8 (Test)
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (tdd-SMS-25, D3, D4, D6, D8, D9):
 *
 *   D3  A `startAt` off the 30-minute boundary is 422 `BUSINESS_RULE_VIOLATION`,
 *       not 409. The contract puts the requirement **on the request body**:
 *       `AppointmentCreate.startAt` is described as "Must fall on a 30-minute
 *       boundary (REQ-NF-008)." A start off the boundary never becomes valid,
 *       whereas 409 `SLOT_UNAVAILABLE` invites a retry with another slot — it
 *       describes a situation that other bookings could change.
 *   D4  P8 declares no 404. An unknown master id, an unknown service id, an
 *       inactive master, an inactive service and a service the master does not
 *       offer are therefore 422 `BUSINESS_RULE_VIOLATION`: the body is
 *       schema-valid, and the rule it breaks is that a booking needs a bookable
 *       master offering the requested services. Answering 404 would be outside
 *       P8's declared set.
 *   D6  `reminders[]` is computed at read time from `startAt` and "now"; it is
 *       not a stored row at this stage. A consequence, stated rather than
 *       discovered: the same appointment read later can report a different
 *       reminder status once the corresponding moment has passed.
 *       **Superseded by S3.2 (H1):** the reminders are stored rows now, and a
 *       due one becomes `sent` on the next read. The cases below assert the
 *       booking's own answer, which is the same either way.
 *   D8  A repeated service id is counted twice — twice in `services[]`, and
 *       twice in the duration and price sums. The schema declares `minItems: 1`
 *       and `maxItems: 20` and does **not** declare `uniqueItems`, so a
 *       repeated id is a permitted body; REQ-F-001 says the total is the sum of
 *       the selected services, read literally.
 *   D9  The clock is injected: `createApp({ now })` takes an optional function
 *       returning the current instant, defaulting to `() => new Date()`. Every
 *       date below is a literal and every reminder case fixes "now", so the
 *       file behaves identically on any day it runs.
 *
 * Terminal-state transitions are **not** asserted here. P8 does not declare
 * 409 `INVALID_STATE_TRANSITION`, and the only status it can write is
 * `confirmed`; the transitions arrive with P10 and P11 (S2.3, S3.1). Recorded in
 * the G2 carry-forward register rather than invented as a case.
 *
 * The "already booked" refusal is asserted in `occupancy.test.ts` (O6–O9),
 * where it is the point of the case; here it appears only as the arrangement
 * for the `detail` assertion, so the same behaviour is not counted twice.
 */

import { randomUUID } from 'node:crypto';

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

type SchemaValidator = ReturnType<typeof getSchemaValidator>;

/**
 * The instant every case treats as "now" (D9). Kyiv is +02:00 in November, and
 * 2026-11-12 is a Thursday (ISO weekday 4), which the short-notice cases use.
 */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday three weeks after NOW: every reminder is in the future. */
const FAR_MONDAY = '2026-12-07';
const WINTER_OFFSET = '+02:00';

/** A wall-clock instant on the test's Monday. */
function onMonday(time: string): string {
  return `${FAR_MONDAY}T${time}:00${WINTER_OFFSET}`;
}

/** A wall-clock instant on the Thursday NOW falls on (2026-11-12). */
function onThursday(time: string): string {
  return `2026-11-12T${time}:00${WINTER_OFFSET}`;
}

describe('S2.1 booking — P8 createAppointment', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isProblem = getSchemaValidator('Problem');
  const isAppointment = getSchemaValidator('Appointment');

  let admin: AdminFixture;
  let olena: MasterFixture;

  /** Olena's services, as SCN-01 has them: 30 + 30 minutes at one slot. */
  let haircut: ServiceFixture;
  let blowDry: ServiceFixture;

  /** A 45-minute service, so a 45 + 30 request sums to 75 and occupies 90. */
  let coloring: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    olena = await arrangeMaster(app, 'Olena Booking');

    haircut = await arrangeService(app, admin.token, {
      name: unique('Booking Haircut'),
      baseDurationMinutes: 30,
    });
    blowDry = await arrangeService(app, admin.token, {
      name: unique('Booking Blow-dry'),
      baseDurationMinutes: 30,
    });
    coloring = await arrangeService(app, admin.token, {
      name: unique('Booking Coloring'),
      baseDurationMinutes: 45,
      category: 'Coloring',
    });

    // The price the master charges is the link's, not a function of duration.
    await arrangeLink(app, admin.token, olena.id, haircut.id, 40000);
    await arrangeLink(app, admin.token, olena.id, blowDry.id, 25000);
    await arrangeLink(app, admin.token, olena.id, coloring.id, 50000);

    // Olena works Mondays 10:00–18:00 and Thursdays 08:00–18:00; the Thursday
    // window is what the short-notice reminder cases book into.
    await arrangeWeeklyWindow(app, olena.token, 1, '10:00', '18:00');
    await arrangeWeeklyWindow(app, olena.token, 4, '08:00', '18:00');
  });

  /** A master created for one case, with one service linked, alone on his calendar. */
  async function freshMasterWithService(): Promise<{
    master: MasterFixture;
    service: ServiceFixture;
    price: number;
  }> {
    const master = await arrangeMaster(app, unique('Booking Solo'));
    const service = await arrangeService(app, admin.token, {
      name: unique('Booking Solo Service'),
      baseDurationMinutes: 30,
    });
    const price = 33000;
    await arrangeLink(app, admin.token, master.id, service.id, price);
    await arrangeWeeklyWindow(app, master.token, 1, '10:00', '18:00');
    return { master, service, price };
  }

  /** Books through P8 with everything but `overrides` filled in from a valid body. */
  async function book(overrides: Record<string, unknown> = {}): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        masterId: olena.id,
        serviceIds: [haircut.id],
        startAt: onMonday('10:00'),
        ...overrides,
      });
  }

  /**
   * A master with the two SCN-01 services linked, working Monday 10:00–18:00.
   *
   * The SCN-01 block below has eight cases that each book the *same* 10:00 slot
   * for the *same* pair of services. They are separate cases, so each must start
   * from a calendar that does not already contain the previous one's booking —
   * otherwise the second case onwards is answered 409 and proves nothing about
   * the totals it claims. A master per case is the arrangement that says so,
   * rather than a file whose cases depend on their order.
   */
  async function freshPairMaster(): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('Booking Pair'));
    await arrangeLink(app, admin.token, master.id, haircut.id, 40000);
    await arrangeLink(app, admin.token, master.id, blowDry.id, 25000);
    await arrangeWeeklyWindow(app, master.token, 1, '10:00', '18:00');
    return master;
  }

  /** Books both SCN-01 services for a master of this case's own, at 10:00. */
  async function bookPair(overrides: Record<string, unknown> = {}): Promise<JsonResponse> {
    const master = await freshPairMaster();
    return book({
      masterId: master.id,
      serviceIds: [haircut.id, blowDry.id],
      ...overrides,
    });
  }

  function expectProblem(response: JsonResponse, expected: { status: number; code: string }): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({ status: expected.status, code: expected.code });
    expect(response.body.traceId).toMatch(UUID_V4);
    expect(response.body.instance).toBeDefined();
  }

  function expectAppointment(response: JsonResponse): void {
    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(isAppointment(response.body), JSON.stringify(isAppointment.errors ?? [])).toBe(true);
  }

  // ======================================================= SCN-01 — booking

  describe('SCN-01 — two services in one visit (REQ-F-001, REQ-F-003)', () => {
    it('answers 201 with status confirmed: there is no approval state', async () => {
      const response = await bookPair();

      expectAppointment(response);
      expect(response.body.status).toBe('confirmed');
    });

    it('sums the durations: 30 + 30 is 60', async () => {
      const response = await bookPair();

      expectAppointment(response);
      expect(response.body).toMatchObject({
        totalDurationMinutes: 60,
        occupiedDurationMinutes: 60,
      });
    });

    it('sums the prices the master charges into totalPrice', async () => {
      const response = await bookPair();

      expectAppointment(response);
      expect(response.body.totalPrice).toEqual({ amountMinor: 65000, currency: 'UAH' });
    });

    it('snapshots each service line with its name, duration and price', async () => {
      const response = await bookPair();

      expectAppointment(response);
      const lines = response.body.services as Record<string, any>[];

      expect(lines).toHaveLength(2);
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            serviceId: haircut.id,
            baseDurationMinutes: 30,
            price: { amountMinor: 40000, currency: 'UAH' },
          }),
          expect.objectContaining({
            serviceId: blowDry.id,
            baseDurationMinutes: 30,
            price: { amountMinor: 25000, currency: 'UAH' },
          }),
        ]),
      );
      // A snapshot, not a live join: the name is a copy taken at booking time.
      expect(lines.every((line) => typeof line.name === 'string' && line.name !== '')).toBe(true);
    });

    it('sets endAt to startAt plus the occupied block', async () => {
      const response = await bookPair();

      expectAppointment(response);
      expect(response.body.startAt).toBe(onMonday('10:00'));
      expect(response.body.endAt).toBe(onMonday('11:00'));
    });

    it('returns a Location header naming the created appointment', async () => {
      const response = await bookPair();

      expectAppointment(response);
      const location = response.headers.location;
      expect(location).toBeDefined();
      expect(location).toContain(String(response.body.id));
    });

    it('returns an accessToken uuid and a confirmationUrl carrying it', async () => {
      // REQ-F-004/REQ-F-005 need a page and a link; S2.1 provides the credential
      // and the URL the page will be served at. Serving the page and recording
      // the SMS is S2.2 (SMS-26) — G2 carry-forward register, row 1.
      const response = await bookPair();

      expectAppointment(response);
      expect(response.body.accessToken).toMatch(UUID_V4);
      expect(response.body.confirmationUrl).toContain(response.body.accessToken as string);
    });

    it('does not let the client choose a status: a status property is 422', async () => {
      // REQ-F-003 read as a constraint on the write: `confirmed` is the only
      // status a creation can produce, and `AppointmentCreate` declares no
      // `status` (D22: unknown body properties are rejected).
      expectProblem(await book({ status: 'completed' }), {
        status: 422,
        code: 'VALIDATION_ERROR',
      });
    });

    it('schedules the 24 h and 2 h reminders when the booking is days ahead', async () => {
      const response = await bookPair();

      expectAppointment(response);
      const reminders = (
        response.body.reminders as { type: string; scheduledAt: string; status: string }[]
      )
        .slice()
        .sort((a, b) => a.type.localeCompare(b.type));

      expect(reminders.map((reminder) => reminder.type)).toEqual(['24h', '2h']);
      expect(reminders.every((reminder) => reminder.status === 'scheduled')).toBe(true);
      expect(reminders.find((reminder) => reminder.type === '24h')?.scheduledAt).toBe(
        '2026-12-06T10:00:00+02:00',
      );
      expect(reminders.find((reminder) => reminder.type === '2h')?.scheduledAt).toBe(
        onMonday('08:00'),
      );
    });
  });

  // ============================================ reminders (REQ-F-010, F-011)

  describe('reminders — skipped when already past (REQ-F-010, D9)', () => {
    it('skips the 24 h reminder for a booking under 24 hours ahead', async () => {
      // NOW is 09:00 on a Thursday; 12:00 is three hours away. The 24 h moment
      // (Wednesday 12:00) has passed, so it is skipped and not sent
      // retroactively (REQ-F-010); the 2 h moment (10:00) is still ahead.
      const response = await book({ startAt: '2026-11-12T12:00:00+02:00' });

      expectAppointment(response);
      const reminders = response.body.reminders as { type: string; status: string }[];

      expect(reminders.find((reminder) => reminder.type === '24h')?.status).toBe('skipped');
      expect(reminders.find((reminder) => reminder.type === '2h')?.status).toBe('scheduled');
    });

    it('skips both reminders for a booking under two hours ahead', async () => {
      // NOW is 09:00; 10:00 is one hour away, so both moments are past.
      const response = await book({ startAt: '2026-11-12T10:00:00+02:00' });

      expectAppointment(response);
      const reminders = response.body.reminders as { type: string; status: string }[];

      expect(reminders.every((reminder) => reminder.status === 'skipped')).toBe(true);
    });
  });

  // ============================================ 415 / 422 — the request

  describe('the request body (NEG-01, NEG-02, NEG-15, NEG-17)', () => {
    it('answers 415 UNSUPPORTED_MEDIA_TYPE for a non-JSON body', async () => {
      const response = await request(app)
        .post('/api/v1/appointments')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('client=Iryna');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('answers 422 VALIDATION_ERROR for a body with no client', async () => {
      const response = await request(app)
        .post('/api/v1/appointments')
        .send({ masterId: olena.id, serviceIds: [haircut.id], startAt: onMonday('10:00') });

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
    });

    it('answers 422 VALIDATION_ERROR naming client.phone for a phone off the pattern', async () => {
      const response = await book({ client: { name: 'Iryna Kovalenko', phone: 'call me' } });

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
      const fields = (response.body.errors as { field: string }[]).map((error) => error.field);
      expect(fields).toContain('client.phone');
    });

    it('answers 422 VALIDATION_ERROR for an empty serviceIds array', async () => {
      expectProblem(await book({ serviceIds: [] }), {
        status: 422,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  // ====================================== the availability rule (REQ-F-002)

  describe('the requested slot (REQ-F-002, NEG-08)', () => {
    it("answers 409 SLOT_UNAVAILABLE when the start is outside the master's availability", async () => {
      // Olena works Mondays from 10:00; 09:00 is before her window.
      expectProblem(await book({ startAt: onMonday('09:00') }), {
        status: 409,
        code: 'SLOT_UNAVAILABLE',
      });
    });

    it('answers 409 SLOT_UNAVAILABLE when the block runs past the end of the window', async () => {
      // 17:00 is inside Olena's 10:00–18:00 window, but 45 + 30 sums to 75 and
      // occupies 90 minutes (REQ-F-031), so the block would end at 18:30. P7
      // does not offer 17:00 for this request, and P8 must refuse it. A check
      // that only asks "is the start inside the window" would wrongly accept.
      expectProblem(
        await book({ serviceIds: [coloring.id, haircut.id], startAt: onMonday('17:00') }),
        { status: 409, code: 'SLOT_UNAVAILABLE' },
      );
    });
  });

  // ======================== the rules the request itself breaks (D3, D4, D8)

  describe('rules the body breaks (D3, D4, D8, REQ-NF-008)', () => {
    it('answers 422 BUSINESS_RULE_VIOLATION for a start off the 30-minute boundary', async () => {
      // REQ-NF-008, and the contract states it on the body: `startAt` is
      // described as "Must fall on a 30-minute boundary (REQ-NF-008)."
      expectProblem(await book({ startAt: onMonday('10:15') }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
    });

    it('answers 422 BUSINESS_RULE_VIOLATION for an inactive master', async () => {
      const { master, service } = await freshMasterWithService();
      await request(app)
        .patch(`/api/v1/admin/masters/${master.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: false });

      expectProblem(await book({ masterId: master.id, serviceIds: [service.id] }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
    });

    it('answers 422 BUSINESS_RULE_VIOLATION for a masterId that names no master', async () => {
      // P8 declares no 404 (D4): an id that names nothing is a body the server
      // cannot book, and 422 is inside P8's declared set.
      expectProblem(await book({ masterId: randomUUID() }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
    });

    it('answers 422 BUSINESS_RULE_VIOLATION for a serviceIds entry that names no service', async () => {
      expectProblem(await book({ serviceIds: [randomUUID()] }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
    });

    it('answers 422 BUSINESS_RULE_VIOLATION for a service the master does not offer', async () => {
      // The master exists and the service is active; the link between them does
      // not. REQ-F-002 makes availability the master's, and a service the
      // master does not offer is not theirs to book.
      const stranger = await arrangeService(app, admin.token, {
        name: unique('Booking Unoffered'),
        baseDurationMinutes: 30,
      });

      expectProblem(await book({ serviceIds: [stranger.id] }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
    });

    it('answers 422 BUSINESS_RULE_VIOLATION for a deactivated service', async () => {
      const { master, service } = await freshMasterWithService();
      await request(app)
        .patch(`/api/v1/admin/services/${service.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: false });

      expectProblem(await book({ masterId: master.id, serviceIds: [service.id] }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
    });

    it('counts a repeated service id twice: two lines, doubled duration and price', async () => {
      // D8. `serviceIds` declares `maxItems: 20` and no `uniqueItems`, so a
      // repeat is a permitted body; REQ-F-001's "sum of the selected services"
      // is read literally.
      const { master, service, price } = await freshMasterWithService();

      const response = await book({
        masterId: master.id,
        serviceIds: [service.id, service.id],
        startAt: onMonday('10:00'),
      });

      expectAppointment(response);
      expect(response.body.services).toHaveLength(2);
      expect(response.body).toMatchObject({
        totalDurationMinutes: 60,
        occupiedDurationMinutes: 60,
      });
      expect(response.body.totalPrice).toEqual({ amountMinor: price * 2, currency: 'UAH' });
    });
  });

  // ================================================ the detail sentence

  describe('the Problem detail (G1 carry-forward register, row 6)', () => {
    it('answers 409 with a detail that says the slot is unavailable for this master', async () => {
      // The suite asserts status and `code` everywhere but the `detail`
      // sentence nowhere, which is how the S1.3 403 defect (runs-04 §4a)
      // reached a signed stage. This is the one case that compares the
      // sentence, so the class cannot regress silently here.
      const master = await freshPairMaster();
      const first = await book({
        masterId: master.id,
        serviceIds: [haircut.id, blowDry.id],
      });
      expectAppointment(first);

      const second = await book({
        masterId: master.id,
        serviceIds: [haircut.id, blowDry.id],
      });
      expectProblem(second, { status: 409, code: 'SLOT_UNAVAILABLE' });
      expect(String(second.body.detail)).toMatch(/slot/i);
      expect(String(second.body.detail)).toMatch(/master/i);
    });
  });

  // ============================================ the past start (CL-11)

  describe('a startAt at or before now (CL-11)', () => {
    // Olena's Thursday window is 08:00–18:00 (`beforeAll`), and NOW is 09:00 on
    // that Thursday. The three starts below are on the boundary and inside the
    // window, so the only thing that separates them is the clock. No fixture is
    // added: `arrangeWeeklyWindow` replaces the whole rule set, and a second
    // call would erase the Monday window the other cases use.
    //
    // The Thursday bookings already in this file are 12:00 and 10:00, both
    // haircut (30 min). B3 takes [09:30, 10:00); the 10:00 booking takes
    // [10:00, 10:30). Half-open intervals, so they do not overlap.

    it('B1 answers 422 BUSINESS_RULE_VIOLATION for a start in the past inside a free window', async () => {
      // 08:30 is inside 08:00–18:00 and on the boundary; it is refused because
      // it is not in the future, not because the slot is unavailable.
      expectProblem(await book({ startAt: onThursday('08:30') }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
    });

    it('B2 answers 422 BUSINESS_RULE_VIOLATION for a start exactly at now', async () => {
      // CL-11's boundary is `<=`, not `<`: a start that is not in the future is
      // refused. With `<`, booking at 09:00 when it is 09:00 would be allowed —
      // a client booking a slot that has already begun.
      expectProblem(await book({ startAt: onThursday('09:00') }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
    });

    it('B3 accepts the first start after now: 09:30 is 201', async () => {
      // The guard against over-rejection. This case is green at RED because it
      // asserts behaviour P8 already has; it is not a RED failure and not a
      // defect. It exists so that a rule that refuses every Thursday start
      // cannot pass B1 and B2.
      const response = await book({ startAt: onThursday('09:30') });

      expectAppointment(response);
      expect(response.body.startAt).toBe(onThursday('09:30'));
    });
  });
});
