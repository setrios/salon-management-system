/**
 * S3.1 client reschedule — P11 `rescheduleAppointmentByToken`.
 *
 *   P11 POST /appointments/{token}/reschedule
 *       rescheduleAppointmentByToken   (public, `security: []`)
 *
 * Source: REQ-F-007 ("The client can reschedule the appointment via the link,
 *         free of charge, with no restriction on notice period or number of
 *         times"; AC: "Rescheduling repeatedly, including shortly before the
 *         appointment, succeeds each time without a fee or error" — SRS v1.3
 *         lines 460–464), REQ-F-008 (reminder times = new time ∓ 24 h / 2 h),
 *         REQ-F-009 ("Exactly one reschedule SMS per successful reschedule is
 *         recorded"), REQ-F-029 (a skipped reminder reactivates when the new
 *         time puts it in the future), REQ-F-002 (only a slot inside
 *         availability and not already booked), REQ-F-001 (the total is the sum
 *         of the selected services' prices);
 *         SCN-03 (reschedule to a new available slot, reminders recalculated,
 *         one reschedule SMS), SCN-11 (a skipped 24 h reminder becomes
 *         scheduled after an early reschedule);
 *         SRS v1.3:371 ("A reschedule … updates date/time and master on this
 *         same record and does not create a new Appointment");
 *         `error-model.md` §3.1 (the state table's `edit` column: `confirmed`
 *         → 200 recalculated, `completed`/`cancelled` → 409
 *         `INVALID_STATE_TRANSITION`), §3 (409 `SLOT_UNAVAILABLE`, 422
 *         `BUSINESS_RULE_VIOLATION`);
 *         `resource-model.md` §5.1 (P11's response set: 200, 400, 404, 409,
 *         422, 415, 500).
 * Contract: openapi.yaml#/paths/~1appointments~1{token}~1reschedule; schemas
 *           AppointmentReschedule, Appointment, Reminder, Problem.
 * Ticket: SMS-10 (Test)
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (S3.1 inventory, G1–G10):
 *
 *   G1  CL-11: a requested `startAt` earlier than or equal to the injected
 *       clock is 422 `BUSINESS_RULE_VIOLATION` on P8 and P11. The rule lives
 *       once, in `rules.ts` (`startInPast`), and both operations call it. R11
 *       is P11's half; B1–B3 in `booking.test.ts` are P8's.
 *   G2  A `cancelled` or `completed` record is 409 `INVALID_STATE_TRANSITION`.
 *       The decision is `state.ts`'s (`error-model.md` §3.1, the `edit`
 *       column); this file does not restate the table.
 *   G3  The service set does not change: `AppointmentReschedule` has no
 *       `serviceIds`, and the duration is the stored one. R1 asserts the
 *       totals are the booking's.
 *   G4  A `masterId` that differs must name a bookable master who offers every
 *       service of the record, otherwise 422 `BUSINESS_RULE_VIOLATION`. "Bookable"
 *       is P8's rule (D4): active and role `master`. R12 and R13.
 *   G5  The availability check is P8's, under the same advisory lock on
 *       `master_id` (D2). The lock is what makes check-then-write sound; the
 *       partial unique index is the backstop. R3 and R4.
 *   G6  One `notifications` row per successful reschedule: `reschedule` /
 *       `client` / `sms` / `sent`. There is no unique index for it, because
 *       REQ-F-007 allows rescheduling any number of times (R17).
 *   G7  Reminders are computed at read time (D6), so recalculation and
 *       reactivation are automatic. R15 and R16 prove it; no code is written
 *       for it. **Superseded by S3.2 (H1, H6):** the rows are stored and the
 *       reschedule recalculates them in place. R15 and R16 still pass, and the
 *       recalculation is asserted in `reminders.test.ts` (R7, R8).
 *   G8  When the master changes, the lines are re-priced from the new master's
 *       links and `totalPrice` follows (REQ-F-001; `MasterService` carries
 *       "that master's individual price"). When the master does not change, the
 *       snapshot is untouched. R12.
 *   G9  Rescheduling to the same time is a successful reschedule: 200, one
 *       `reschedule` row, `updatedAt` written. REQ-F-009 has no exception for
 *       "the time did not change", and §3.1's `edit` column does not
 *       distinguish it. R18.
 *   G10 The record is the same: same `id`, same `accessToken`, no new
 *       appointment (SRS:371). R2.
 *
 * What this file does *not* assert:
 *
 *   - **The advisory lock's serialisation.** The run is sequential; the lock is
 *     evidenced by construction (D2), as O6–O9 do for P8.
 *   - **The unique-index backstop.** The exact-start race is not reproduced.
 *   - **That the SMS was sent.** `sent` means "handed to the simulated channel"
 *     (E3); delivery is simulated.
 *   - **REQ-F-029's ticket in the SRS matrix.** The matrix (`:925`) assigns it
 *     to SMS-29; R16 asserts its observable effect here because the reschedule
 *     is what makes it observable. The gate records the discrepancy.
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import { getPool } from '../../src/db/client.js';
import {
  arrangeAdmin,
  arrangeLink,
  arrangeMaster,
  arrangeService,
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

/** A wall-clock instant on the test's Thursday (the day NOW falls on). */
function onThursday(time: string): string {
  return `2026-11-12T${time}:00${WINTER_OFFSET}`;
}

/** One weekly window, as M4 takes it. */
interface WeeklyWindow {
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly endTime: string;
}

const MONDAY_WINDOW: WeeklyWindow = { dayOfWeek: 1, startTime: '10:00', endTime: '18:00' };
const THURSDAY_WINDOW: WeeklyWindow = { dayOfWeek: 4, startTime: '08:00', endTime: '18:00' };

describe('S3.1 reschedule — P11 rescheduleAppointmentByToken', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isProblem = getSchemaValidator('Problem');
  const isAppointment = getSchemaValidator('Appointment');

  let admin: AdminFixture;
  let haircut: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    haircut = await arrangeService(app, admin.token, {
      name: unique('Reschedule Haircut'),
      baseDurationMinutes: 30,
    });
  });

  /**
   * Replaces a master's rule set through M4 with the given windows.
   *
   * M4 is a full replacement (`resource-model.md` §4), so both windows go in
   * one request: two calls would leave only the second.
   */
  async function arrangeWindows(
    masterToken: string,
    windows: readonly WeeklyWindow[],
  ): Promise<void> {
    await request(app)
      .put('/api/v1/me/availability')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ weekly: windows, dates: [] });
  }

  /**
   * A master of this case's own, with the shared haircut linked at `price` and
   * the given windows. A master per case keeps the cases independent: each
   * books the same 10:00 slot, and a shared calendar would answer the second
   * case 409 for the first one's booking.
   */
  async function freshMaster(
    options: { readonly price?: number; readonly windows?: readonly WeeklyWindow[] } = {},
  ): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('Reschedule Master'));
    await arrangeLink(app, admin.token, master.id, haircut.id, options.price ?? 40000);
    await arrangeWindows(master.token, options.windows ?? [MONDAY_WINDOW]);
    return master;
  }

  /** Books the shared haircut through P8. */
  async function book(masterId: string, startAt: string): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        masterId,
        serviceIds: [haircut.id],
        startAt,
      });
  }

  /** Calls P11 with the given body. */
  async function reschedule(
    token: string,
    body: Record<string, unknown>,
  ): Promise<JsonResponse> {
    return request(app).post(`/api/v1/appointments/${token}/reschedule`).send(body);
  }

  /** R24 — the message records of one appointment, as the administrator sees them. */
  /**
   * The client's rows of a page.
   *
   * S4.1 writes the master's and the administrator's rows for the same event,
   * so the page's `total` is no longer a statement about the client's message.
   * These five cases are about the client's message, so they count it by
   * predicate — the treatment `notification.test.ts` already uses for
   * REQ-F-005.
   */
  function clientRows(response: JsonResponse): { audience: string; eventType: string }[] {
    return (response.body.items as { audience: string; eventType: string }[]).filter(
      (row) => row.audience === 'client',
    );
  }

  async function notifications(appointmentId: string): Promise<JsonResponse> {
    return request(app)
      .get(`/api/v1/admin/appointments/${appointmentId}/notifications`)
      .set('Authorization', `Bearer ${admin.token}`);
  }

  function expectProblem(
    response: JsonResponse,
    expected: { status: number; code: string },
  ): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({ status: expected.status, code: expected.code });
    expect(response.body.traceId).toMatch(UUID_V4);
    expect(response.body.instance).toBeDefined();
  }

  function expectAppointment(response: JsonResponse, status = 200): void {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(
      isAppointment(response.body),
      JSON.stringify(isAppointment.errors ?? []),
    ).toBe(true);
  }

  // ============================================ the move (REQ-F-007, F-008, F-009)

  describe('the move (REQ-F-007, REQ-F-008, REQ-F-009)', () => {
    it('R1 moves a confirmed appointment to a free slot and records one reschedule SMS', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      expectAppointment(created, 201);

      const response = await reschedule(created.body.accessToken as string, {
        startAt: onMonday('14:00'),
      });

      expectAppointment(response);
      expect(response.body).toMatchObject({
        id: created.body.id,
        accessToken: created.body.accessToken,
        status: 'confirmed',
        startAt: onMonday('14:00'),
        endAt: onMonday('14:30'),
        // G3: the service set and the duration are the booking's.
        totalDurationMinutes: 30,
        occupiedDurationMinutes: 30,
        totalPrice: { amountMinor: 40000, currency: 'UAH' },
      });

      const rows = await notifications(created.body.id as string);
      expect(rows.status).toBe(200);
      // The client's rows: one `new`, one `reschedule`, and the two reminders
      // S3.2 records (H1). The reminder rows are asserted in
      // `reminders.test.ts`; here the count is the sanity check that the
      // reschedule wrote exactly one client row.
      expect(clientRows(rows)).toHaveLength(4);
      expect(rows.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            audience: 'client',
            eventType: 'reschedule',
            channel: 'sms',
            status: 'sent',
          }),
        ]),
      );
    });

    it('R2 updates the same record: P9 by the same token shows the new time', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      expectAppointment(await reschedule(token, { startAt: onMonday('14:00') }));

      const read = await request(app).get(`/api/v1/appointments/${token}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({
        id: created.body.id,
        accessToken: token,
        startAt: onMonday('14:00'),
      });
    });

    it('R14 keeps the current master when masterId is omitted', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));

      const response = await reschedule(created.body.accessToken as string, {
        startAt: onMonday('14:00'),
      });

      expectAppointment(response);
      expect(response.body.master).toEqual({ id: master.id, fullName: master.fullName });
    });

    it('R17 allows repeated reschedules: each writes one reschedule row', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      expectAppointment(await reschedule(token, { startAt: onMonday('14:00') }));
      expectAppointment(await reschedule(token, { startAt: onMonday('16:00') }));

      const rows = await notifications(created.body.id as string);
      // The client's rows: one `new`, two `reschedule`, and the two reminders
      // (H1).
      expect(clientRows(rows)).toHaveLength(5);
      const reschedules = (rows.body.items as { audience: string; eventType: string }[]).filter(
        (item) => item.audience === 'client' && item.eventType === 'reschedule',
      );
      expect(reschedules).toHaveLength(2);
    });

    it('R18 treats a reschedule to the same time as a successful reschedule', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));

      const response = await reschedule(created.body.accessToken as string, {
        startAt: onMonday('10:00'),
      });

      expectAppointment(response);
      expect(response.body.startAt).toBe(onMonday('10:00'));
      // G9: the row is written even though the values are the same, so
      // `updatedAt` is the injected clock rather than the booking's.
      expect(response.body.updatedAt).toBe(NOW);

      const rows = await notifications(created.body.id as string);
      // The client's rows: one `new`, one `reschedule`, and the two reminders
      // (H1).
      expect(clientRows(rows)).toHaveLength(4);
    });
  });

  // ================================================ the slot (REQ-F-002)

  describe('the requested slot (REQ-F-002)', () => {
    it('R3 answers 409 SLOT_UNAVAILABLE when the new slot is already booked', async () => {
      const master = await freshMaster();
      const first = await book(master.id, onMonday('10:00'));
      const second = await book(master.id, onMonday('14:00'));
      expectAppointment(second, 201);

      const response = await reschedule(first.body.accessToken as string, {
        startAt: onMonday('14:00'),
      });

      expectProblem(response, { status: 409, code: 'SLOT_UNAVAILABLE' });

      const read = await request(app).get(
        `/api/v1/appointments/${first.body.accessToken as string}`,
      );
      expect(read.body.startAt).toBe(onMonday('10:00'));
    });

    it("R4 answers 409 SLOT_UNAVAILABLE when the new start is outside the master's availability", async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));

      // The master works Mondays from 10:00; 09:00 is before the window.
      const response = await reschedule(created.body.accessToken as string, {
        startAt: onMonday('09:00'),
      });

      expectProblem(response, { status: 409, code: 'SLOT_UNAVAILABLE' });
    });
  });

  // ============================================ the state (error-model §3.1)

  describe('the state (error-model.md §3.1, G2)', () => {
    it('R5 answers 409 INVALID_STATE_TRANSITION for a cancelled record and writes nothing', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;
      await request(app).post(`/api/v1/appointments/${token}/cancel`);

      const response = await reschedule(token, { startAt: onMonday('14:00') });

      expectProblem(response, { status: 409, code: 'INVALID_STATE_TRANSITION' });

      const read = await request(app).get(`/api/v1/appointments/${token}`);
      expect(read.body).toMatchObject({ status: 'cancelled', startAt: onMonday('10:00') });

      const rows = await notifications(created.body.id as string);
      // The client's rows: one `new` and the two reminders (H1). The refused
      // reschedule wrote nothing.
      expect(clientRows(rows)).toHaveLength(3);
    });

    it('R6 answers 409 INVALID_STATE_TRANSITION for a completed record and writes nothing', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      // The operation that produces `completed` is R23 (S5.3 / SMS-34); this is
      // arrangement, not an assertion about storage.
      await getPool().query("update appointments set status = 'completed' where id = $1", [
        created.body.id,
      ]);

      const response = await reschedule(token, { startAt: onMonday('14:00') });

      expectProblem(response, { status: 409, code: 'INVALID_STATE_TRANSITION' });

      const read = await request(app).get(`/api/v1/appointments/${token}`);
      expect(read.body).toMatchObject({ status: 'completed', startAt: onMonday('10:00') });

      const rows = await notifications(created.body.id as string);
      // The client's rows: one `new` and the two reminders (H1). The refused
      // reschedule wrote nothing.
      expect(clientRows(rows)).toHaveLength(3);
    });
  });

  // ============================================ the token and the body

  describe('the token and the body', () => {
    it('R7 answers 404 NOT_FOUND for a token that names no appointment', async () => {
      // The route is proven to exist first: an unmounted path also answers 404,
      // and a bare 404 assertion would be green for the wrong reason.
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      expectAppointment(
        await reschedule(created.body.accessToken as string, { startAt: onMonday('14:00') }),
      );

      const response = await reschedule(randomUUID(), { startAt: onMonday('16:00') });

      expectProblem(response, { status: 404, code: 'NOT_FOUND' });
    });

    it('R8 answers 400 MALFORMED_REQUEST for a token that is not a uuid', async () => {
      // P11 declares 400, unlike P9 and P10: the shared parameter rule takes
      // the 400 branch, not the 404 one.
      const response = await request(app)
        .post('/api/v1/appointments/not-a-uuid/reschedule')
        .send({ startAt: onMonday('14:00') });

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('R9 answers 422 VALIDATION_ERROR for a body that breaks AppointmentReschedule', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      expectProblem(await reschedule(token, {}), {
        status: 422,
        code: 'VALIDATION_ERROR',
      });

      // `additionalProperties: false` (D-22): the body has no `serviceIds`.
      expectProblem(
        await reschedule(token, { startAt: onMonday('14:00'), serviceIds: [haircut.id] }),
        { status: 422, code: 'VALIDATION_ERROR' },
      );
    });

    it('R10 answers 415 UNSUPPORTED_MEDIA_TYPE for a non-JSON body', async () => {
      const response = await request(app)
        .post(`/api/v1/appointments/${randomUUID()}/reschedule`)
        .set('Content-Type', 'text/plain')
        .send('startAt=2026-12-07T14:00:00+02:00');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });
  });

  // ============================================ the past start (CL-11)

  describe('the past start (CL-11, G1)', () => {
    it('R11 answers 422 BUSINESS_RULE_VIOLATION for a startAt at or before now', async () => {
      const master = await freshMaster({ windows: [MONDAY_WINDOW, THURSDAY_WINDOW] });
      const created = await book(master.id, onMonday('10:00'));

      // 08:30 on the Thursday NOW falls on: inside the 08:00–18:00 window, on
      // the boundary, and in the past. The refusal is the clock's, not the
      // window's.
      const response = await reschedule(created.body.accessToken as string, {
        startAt: onThursday('08:30'),
      });

      expectProblem(response, { status: 422, code: 'BUSINESS_RULE_VIOLATION' });
    });
  });

  // ============================================ the master (G4, G8)

  describe('the master (G4, G8)', () => {
    it('R12 moves to another master who offers the service and re-prices from that master', async () => {
      const first = await freshMaster({ price: 40000 });
      const second = await freshMaster({ price: 55000 });
      const created = await book(first.id, onMonday('10:00'));

      const response = await reschedule(created.body.accessToken as string, {
        startAt: onMonday('14:00'),
        masterId: second.id,
      });

      expectAppointment(response);
      expect(response.body.master).toEqual({ id: second.id, fullName: second.fullName });
      // G8: the price is the new master's link, not the old snapshot.
      expect(response.body.totalPrice).toEqual({ amountMinor: 55000, currency: 'UAH' });
      expect((response.body.services as { price: unknown }[])[0]?.price).toEqual({
        amountMinor: 55000,
        currency: 'UAH',
      });
    });

    it('R13 answers 422 BUSINESS_RULE_VIOLATION for a master who cannot take the record', async () => {
      const first = await freshMaster();
      const created = await book(first.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      // A master who does not offer the service.
      const stranger = await arrangeMaster(app, unique('Reschedule NoLink'));
      await arrangeWindows(stranger.token, [MONDAY_WINDOW]);

      expectProblem(
        await reschedule(token, { startAt: onMonday('14:00'), masterId: stranger.id }),
        { status: 422, code: 'BUSINESS_RULE_VIOLATION' },
      );

      // A master who offers it but is not bookable (D4).
      const retired = await freshMaster();
      await request(app)
        .patch(`/api/v1/admin/masters/${retired.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: false });

      expectProblem(
        await reschedule(token, { startAt: onMonday('14:00'), masterId: retired.id }),
        { status: 422, code: 'BUSINESS_RULE_VIOLATION' },
      );
    });
  });

  // ============================================ the reminders (F-008, F-029)

  describe('the reminders (REQ-F-008, REQ-F-029, G7)', () => {
    it('R15 recalculates the reminders from the new time', async () => {
      const master = await freshMaster({ windows: [MONDAY_WINDOW, THURSDAY_WINDOW] });
      const created = await book(master.id, onMonday('10:00'));

      // Three hours ahead: the 24 h moment has passed, the 2 h moment has not.
      const response = await reschedule(created.body.accessToken as string, {
        startAt: onThursday('12:00'),
      });

      expectAppointment(response);
      const reminders = response.body.reminders as { type: string; status: string }[];
      expect(reminders.find((reminder) => reminder.type === '24h')?.status).toBe('skipped');
      expect(reminders.find((reminder) => reminder.type === '2h')?.status).toBe('scheduled');
    });

    it('R16 reactivates a skipped 24 h reminder when the new time is far enough ahead', async () => {
      const master = await freshMaster({ windows: [MONDAY_WINDOW, THURSDAY_WINDOW] });
      const created = await book(master.id, onThursday('12:00'));
      expectAppointment(created, 201);
      expect(
        (created.body.reminders as { type: string; status: string }[]).find(
          (reminder) => reminder.type === '24h',
        )?.status,
      ).toBe('skipped');

      // Four days later: the 24 h moment is in the future again (REQ-F-029).
      const response = await reschedule(created.body.accessToken as string, {
        startAt: '2026-11-16T10:00:00+02:00',
      });

      expectAppointment(response);
      expect(
        (response.body.reminders as { type: string; status: string }[]).find(
          (reminder) => reminder.type === '24h',
        )?.status,
      ).toBe('scheduled');
    });
  });
});
