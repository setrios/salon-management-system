/**
 * S5.1b administrator appointment actions — R21, R22, R23 and SMS-18.
 *
 *   R21 PATCH /admin/appointments/{appointmentId}          updateAppointmentAdmin → 200 AppointmentAdmin
 *   R22 POST  /admin/appointments/{appointmentId}/cancel   cancelAppointmentAdmin → 200 AppointmentAdmin
 *   R23 POST  /admin/appointments/{appointmentId}/complete completeAppointment    → 200 AppointmentAdmin
 *
 * Source: REQ-F-019 ("The administrator can create, edit, and cancel client
 *         appointments"; AC: "An administrator-created or edited appointment is
 *         reflected identically to a client-made one (subject to REQ-F-002,
 *         REQ-F-003)"),
 *         REQ-F-027 ("The administrator marks an appointment as completed once
 *         the service(s) have been performed; this is a precondition for
 *         payment (REQ-F-021)"), AC: "An appointment cannot have a payment
 *         recorded (REQ-F-021) until it has been marked completed; after
 *         marking, its status is completed"),
 *         REQ-F-028 ("When the administrator changes an appointment's date,
 *         time, or master (REQ-F-019), the system applies the same reminder
 *         recalculation (REQ-F-008) and sends the client the same
 *         updated-details SMS (REQ-F-009) as for a client-initiated
 *         reschedule"), AC: "After an administrator changes an appointment's
 *         time, the stored 24h/2h reminder times match the new time, and one
 *         SMS with the updated details is recorded for the client",
 *         REQ-F-030 ("When an appointment event (new, reschedule, cancellation)
 *         is caused by the administrator's own action (REQ-F-019, REQ-F-028),
 *         the administrator does not receive a notification for that specific
 *         event; the assigned master's notification (REQ-F-016) is
 *         unaffected"), AC: "An administrator who creates, edits, or cancels an
 *         appointment receives no notification for that action, while the
 *         appointment's assigned master still receives their own configured
 *         notification for the same event"),
 *         REQ-F-006 ("The client can cancel any time, without a fee"), REQ-F-009;
 *         `error-model.md` §3.1 (the state table) and §3 (409 SLOT_UNAVAILABLE,
 *         409 INVALID_STATE_TRANSITION, 422 BUSINESS_RULE_VIOLATION);
 *         `resource-model.md` §5.5 (R21, R22, R23);
 *         `openapi.yaml` updateAppointmentAdmin, cancelAppointmentAdmin,
 *         completeAppointment; schemas AppointmentPatch, AppointmentAdmin, Problem.
 * Contract: openapi.yaml#/paths/~1admin~1appointments~1{appointmentId},
 *           ~1admin~1appointments~1{appointmentId}~1cancel,
 *           ~1admin~1appointments~1{appointmentId}~1complete.
 * Ticket: SMS-32 (Test); SMS-18 (Test) — REQ-F-030 on edit and cancellation.
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (S5.1 inventory):
 *
 *   K1  S5.1b covers the acting half: R21 (edit), R22 (cancel), R23 (complete)
 *       and the full REQ-F-030 suite, closing register row 12.
 *   K3  R21 has no recalculation logic of its own (REQ-F-028): it goes through
 *       `reschedule.ts`, `recalculateReminders` and the client `reschedule` row —
 *       the same path P11 takes. Only the guard (`adminAccess`) and the `actor`
 *       differ.
 *   K4  R21 with `client` alone is a correction, not a reschedule: no event, no
 *       recalculation, `updatedAt` changes.
 *   K5  REQ-F-030 on R21 and R22: the acting administrator gets no notification
 *       row, the assigned master gets theirs.
 *   K6  R23 writes no event. The event catalog is `new`, `reschedule`,
 *       `cancellation`; completion is not in it.
 *   K7  Statuses follow `error-model.md` §3.1 as `state.ts` encodes it: `cancel`
 *       on `completed` → 409, on `cancelled` → 200 without a write; `complete`
 *       on `cancelled` → 409, on `completed` → 200 without a write; `edit` on
 *       either → 409.
 *   K8  An `appointmentId` that names nothing answers 404. A non-uuid value
 *       answers 400 on R21 (the operation declares 400) and 404 on R22/R23
 *       (they declare 404 and no 400) — the declared response set decides.
 *   L1  R21 with a `masterId` that changes the master recalculates the block and
 *       the reminders and writes the client `reschedule` row, like P11 (G8
 *       re-prices the lines from the new master's links). This is also where
 *       R21's 409 comes from: the new block may be taken by another record,
 *       which a move within one master cannot be.
 *   L2  R22 does not release or rewrite the reminder rows; a cancelled record
 *       keeps them in the state they had (H5: they are never dispatched).
 *       `reminders[]` of a cancelled record is register row 10, and S5.1b does
 *       not answer it.
 *   L3  R21 refuses a `startAt` off the 30-minute boundary with 422
 *       `BUSINESS_RULE_VIOLATION`, like R19 and P8 (REQ-NF-008 is mapped to R21
 *       in the matrix). P11 keeps its 409; the discrepancy is register row 13.
 *   L4  R21 accepts `serviceIds` (the contract's `AppointmentPatch` declares it,
 *       1–20): the lines are re-read from the (possibly new) master's links, and
 *       `totalDurationMinutes`, `occupiedDurationMinutes`, `endAt` and
 *       `totalPrice` follow. A change of the service set alone writes no
 *       `reschedule` event, because REQ-F-028 names date, time and master.
 *   L5  A supplied `startAt` always writes the client `reschedule` row, even to
 *       the same time — the reading P11 already fixed in R18 (G9).
 *   L6  R23 leaves the reminder rows in place (H5): the contract's completion
 *       example shows `reminders: []`, but the example is illustrative (CL-12's
 *       principle) and clearing history is not one of the operation's effects.
 *       Recorded as register row 10 (extended).
 *
 * What this file does not assert:
 *
 *   - **R19, R20 and getAppointmentAdmin.** S5.1a owns them
 *     (`tests/api/admin-appointments.test.ts`).
 *   - **Concurrent edits.** The check-then-write race is the advisory lock's
 *     (D2), already exercised by `occupancy.test.ts` and `reschedule.test.ts`;
 *     this file issues one request at a time.
 *   - **`payment` and `notificationsSummary`.** J2: optional in the contract and
 *     not produced by these operations.
 *   - **The reminder row of a cancelled record.** L2/register row 10: the SRS is
 *     silent and the addendum (SMS-45) owns it.
 *   - **`updatedAt` of the repeated cancel/complete beyond "unchanged".** F5
 *     fixes it for P10; here it is asserted as equality with the first answer,
 *     not as a date.
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

interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

/** The instant every case treats as "now" (D9). Kyiv is +02:00 in November. */
const NOW = '2026-11-12T09:00:00+02:00';

/**
 * Three Mondays after NOW, at distinct times per case: the fixtures share one
 * master calendar, so two cases that booked the same slot would answer the
 * second one 409 for the first one's booking.
 */
const FIRST_MONDAY = '2026-12-07';
const SECOND_MONDAY = '2026-12-14';
const THIRD_MONDAY = '2026-12-21';
const WINTER_OFFSET = '+02:00';

function onMonday(monday: string, time: string): string {
  return `${monday}T${time}:00${WINTER_OFFSET}`;
}

describe('S5.1b administrator appointment actions — R21, R22, R23, SMS-18', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isAppointmentAdmin = getSchemaValidator('AppointmentAdmin');
  const isProblem = getSchemaValidator('Problem');

  let admin: AdminFixture;
  let masterA: MasterFixture;
  let masterB: MasterFixture;
  let haircut: ServiceFixture;
  let colouring: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    masterA = await arrangeMaster(app, unique('AdminAction Master A'));
    masterB = await arrangeMaster(app, unique('AdminAction Master B'));

    haircut = await arrangeService(app, admin.token, {
      name: unique('AdminAction Haircut'),
      baseDurationMinutes: 30,
    });
    colouring = await arrangeService(app, admin.token, {
      name: unique('AdminAction Colouring'),
      baseDurationMinutes: 60,
    });

    // The same service costs different money at the two masters (L1/G8), and
    // only master A offers colouring (U5's coverage refusal).
    await arrangeLink(app, admin.token, masterA.id, haircut.id, 40000);
    await arrangeLink(app, admin.token, masterA.id, colouring.id, 70000);
    await arrangeLink(app, admin.token, masterB.id, haircut.id, 50000);

    await arrangeWeeklyWindow(app, masterA.token, 1, '09:00', '18:00');
    await arrangeWeeklyWindow(app, masterB.token, 1, '09:00', '18:00');
  });

  // --------------------------------------------------------------- helpers

  /** Books through R19 — the administrator's own create, as S5.1a delivered it. */
  async function book(
    masterId: string,
    startAt: string,
    serviceIds: readonly string[] = [haircut.id],
  ): Promise<JsonResponse> {
    const response = await request(app)
      .post('/api/v1/admin/appointments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        masterId,
        serviceIds,
        startAt,
      });
    expect(response.status).toBe(201);
    return response;
  }

  /** R21. */
  async function patch(
    appointmentId: string,
    body: Record<string, unknown>,
  ): Promise<JsonResponse> {
    return request(app)
      .patch(`/api/v1/admin/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);
  }

  /** R22. */
  async function cancelAction(appointmentId: string): Promise<JsonResponse> {
    return request(app)
      .post(`/api/v1/admin/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`);
  }

  /** R23. */
  async function completeAction(appointmentId: string): Promise<JsonResponse> {
    return request(app)
      .post(`/api/v1/admin/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${admin.token}`);
  }

  /** R24 — the message records of one appointment, as the administrator sees them. */
  async function notifications(appointmentId: string): Promise<JsonResponse> {
    return request(app)
      .get(`/api/v1/admin/appointments/${appointmentId}/notifications`)
      .set('Authorization', `Bearer ${admin.token}`);
  }

  async function notificationItems(
    appointmentId: string,
  ): Promise<Array<{ audience: string; eventType: string; status: string }>> {
    const response = await notifications(appointmentId);
    expect(response.status).toBe(200);
    return response.body.items as Array<{ audience: string; eventType: string; status: string }>;
  }

  function expectAppointmentAdmin(response: JsonResponse, status = 200): void {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(isAppointmentAdmin(response.body), JSON.stringify(isAppointmentAdmin.errors ?? [])).toBe(
      true,
    );
    // J2/D18: the staff view never carries the client's credential.
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.confirmationUrl).toBeUndefined();
  }

  function expectProblem(response: JsonResponse, expected: { status: number; code: string }): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body.code).toBe(expected.code);
    expect(response.body.status).toBe(expected.status);
  }

  // =========================================================================
  // U1–U8: updateAppointmentAdmin (R21)
  // =========================================================================

  describe('updateAppointmentAdmin (R21, PATCH /admin/appointments/{appointmentId})', () => {
    it('U1 moves the record and recalculates the reminders and one client reschedule row (K3, REQ-F-028)', async () => {
      const created = await book(masterA.id, onMonday(FIRST_MONDAY, '10:00'));

      const response = await patch(created.body.id, {
        startAt: onMonday(FIRST_MONDAY, '14:00'),
      });

      expectAppointmentAdmin(response);
      expect(response.body).toMatchObject({
        id: created.body.id,
        status: 'confirmed',
        master: { id: masterA.id, fullName: masterA.fullName },
        startAt: onMonday(FIRST_MONDAY, '14:00'),
        endAt: onMonday(FIRST_MONDAY, '14:30'),
        totalDurationMinutes: 30,
        occupiedDurationMinutes: 30,
        totalPrice: { amountMinor: 40000, currency: 'UAH' },
        // The injected clock: the edit is a write.
        updatedAt: NOW,
      });

      // REQ-F-008 through REQ-F-028: both stored moments follow the new time.
      expect(response.body.reminders).toEqual([
        { type: '24h', scheduledAt: onMonday('2026-12-06', '14:00'), status: 'scheduled' },
        { type: '2h', scheduledAt: onMonday(FIRST_MONDAY, '12:00'), status: 'scheduled' },
      ]);

      // REQ-F-009: exactly one client reschedule SMS for one edit. The client's
      // rows are `new`, the two reminders, and this reschedule.
      const items = await notificationItems(created.body.id);
      const client = items.filter((row) => row.audience === 'client');
      expect(client).toHaveLength(4);
      expect(
        client.filter((row) => row.eventType === 'reschedule' && row.status === 'sent'),
      ).toHaveLength(1);

      // The record is the same one: P9 by the token the booking returned shows it.
      const read = await request(app).get(
        `/api/v1/appointments/${created.body.accessToken as string}`,
      );
      expect(read.status).toBe(200);
      expect(read.body.startAt).toBe(onMonday(FIRST_MONDAY, '14:00'));
    });

    it('U2 does not notify the acting administrator but does notify the master (K5, REQ-F-030, SMS-18)', async () => {
      const created = await book(masterA.id, onMonday(FIRST_MONDAY, '11:00'));

      expectAppointmentAdmin(
        await patch(created.body.id, { startAt: onMonday(FIRST_MONDAY, '15:00') }),
      );

      const items = await notificationItems(created.body.id);

      // REQ-F-030: the administrator's own action produces no row for them.
      expect(items.some((row) => row.audience === 'admin')).toBe(false);

      // REQ-F-016: the assigned master's notification is unaffected. S4.1 writes
      // one row per enabled channel, so the count is the preferences'.
      expect(items.some((row) => row.audience === 'master' && row.eventType === 'reschedule')).toBe(
        true,
      );
    });

    it('U3 changes the master, re-prices from their link and writes the client reschedule (L1, G8)', async () => {
      const created = await book(masterA.id, onMonday(FIRST_MONDAY, '13:00'));

      const response = await patch(created.body.id, { masterId: masterB.id });

      expectAppointmentAdmin(response);
      expect(response.body).toMatchObject({
        id: created.body.id,
        master: { id: masterB.id, fullName: masterB.fullName },
        // A master change alone does not move the time.
        startAt: onMonday(FIRST_MONDAY, '13:00'),
        endAt: onMonday(FIRST_MONDAY, '13:30'),
        // G8: the new master's haircut, not the snapshot's 40000.
        totalPrice: { amountMinor: 50000, currency: 'UAH' },
        updatedAt: NOW,
      });

      // REQ-F-028 names the master: the change is a reschedule for the client.
      const items = await notificationItems(created.body.id);
      expect(
        items.filter((row) => row.audience === 'client' && row.eventType === 'reschedule'),
      ).toHaveLength(1);
    });

    it('U4 corrects the client without an event or a recalculation (K4)', async () => {
      const created = await book(masterA.id, onMonday(FIRST_MONDAY, '16:00'));
      const before = await notificationItems(created.body.id);

      const response = await patch(created.body.id, {
        client: { name: 'Corrected Client', phone: '+380507654321' },
      });

      expectAppointmentAdmin(response);
      expect(response.body).toMatchObject({
        id: created.body.id,
        client: { name: 'Corrected Client', phone: '+380507654321' },
        master: { id: masterA.id },
        startAt: onMonday(FIRST_MONDAY, '16:00'),
        totalPrice: { amountMinor: 40000, currency: 'UAH' },
        updatedAt: NOW,
      });

      // K4: no event, so the message records are exactly what they were.
      const after = await notificationItems(created.body.id);
      expect(after).toEqual(before);
    });

    it('U5 recalculates the block and the price when the service set changes (L4)', async () => {
      const created = await book(masterA.id, onMonday(SECOND_MONDAY, '12:00'));
      const before = await notificationItems(created.body.id);

      const response = await patch(created.body.id, { serviceIds: [colouring.id] });

      expectAppointmentAdmin(response);
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0]).toMatchObject({
        serviceId: colouring.id,
        baseDurationMinutes: 60,
        price: { amountMinor: 70000, currency: 'UAH' },
      });
      expect(response.body).toMatchObject({
        startAt: onMonday(SECOND_MONDAY, '12:00'),
        endAt: onMonday(SECOND_MONDAY, '13:00'),
        totalDurationMinutes: 60,
        occupiedDurationMinutes: 60,
        totalPrice: { amountMinor: 70000, currency: 'UAH' },
        updatedAt: NOW,
      });

      // L4/REQ-F-028: the set alone is not a reschedule — no event.
      const after = await notificationItems(created.body.id);
      expect(after).toEqual(before);

      // A service the target master does not offer is a body rule (422): master
      // B has haircut only.
      const onB = await book(masterB.id, onMonday(FIRST_MONDAY, '15:30'));
      expectProblem(await patch(onB.body.id, { serviceIds: [colouring.id] }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });
      expectProblem(
        await patch(onB.body.id, {
          serviceIds: ['00000000-0000-4000-8000-000000000999'],
        }),
        { status: 422, code: 'BUSINESS_RULE_VIOLATION' },
      );
    });

    it('U6 answers 409 INVALID_STATE_TRANSITION on a completed or cancelled record (K7)', async () => {
      const completed = await book(masterA.id, onMonday(SECOND_MONDAY, '09:00'));
      expectAppointmentAdmin(await completeAction(completed.body.id));

      expectProblem(await patch(completed.body.id, { startAt: onMonday(SECOND_MONDAY, '11:00') }), {
        status: 409,
        code: 'INVALID_STATE_TRANSITION',
      });

      const cancelled = await book(masterA.id, onMonday(SECOND_MONDAY, '10:00'));
      expectAppointmentAdmin(await cancelAction(cancelled.body.id));

      expectProblem(
        await patch(cancelled.body.id, { client: { name: 'Too Late', phone: '+380501112233' } }),
        { status: 409, code: 'INVALID_STATE_TRANSITION' },
      );
    });

    it('U7 answers 409 SLOT_UNAVAILABLE for a taken block, on a move and on a master change (L1)', async () => {
      const first = await book(masterA.id, onMonday(THIRD_MONDAY, '11:00'));
      await book(masterA.id, onMonday(THIRD_MONDAY, '14:00'));

      expectProblem(await patch(first.body.id, { startAt: onMonday(THIRD_MONDAY, '14:00') }), {
        status: 409,
        code: 'SLOT_UNAVAILABLE',
      });

      // L1: the new master's block may be taken where the old master's was not.
      const onA = await book(masterA.id, onMonday(THIRD_MONDAY, '11:30'));
      await book(masterB.id, onMonday(THIRD_MONDAY, '11:30'));

      expectProblem(await patch(onA.body.id, { masterId: masterB.id }), {
        status: 409,
        code: 'SLOT_UNAVAILABLE',
      });
    });

    it('U8 enforces the declared error set: 404, 400, 422, 415, 401 and 403 (K8, L3)', async () => {
      const target = await book(masterA.id, onMonday(FIRST_MONDAY, '12:00'));
      const unknownUuid = '00000000-0000-4000-8000-000000000999';

      // 404: a well-formed id that names nothing.
      expectProblem(await patch(unknownUuid, { startAt: onMonday(SECOND_MONDAY, '12:00') }), {
        status: 404,
        code: 'NOT_FOUND',
      });

      // 400: R21 declares 400, so a non-uuid path value is MALFORMED_REQUEST.
      expectProblem(
        await patch('not-a-valid-uuid', { startAt: onMonday(SECOND_MONDAY, '12:00') }),
        { status: 400, code: 'MALFORMED_REQUEST' },
      );

      // 400: no body at all (the body is required by the contract).
      const noBody = await request(app)
        .patch(`/api/v1/admin/appointments/${target.body.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expectProblem(noBody, { status: 400, code: 'MALFORMED_REQUEST' });

      // 422: `AppointmentPatch` has `minProperties: 1`, so `{}` is a schema violation.
      expectProblem(await patch(target.body.id, {}), {
        status: 422,
        code: 'VALIDATION_ERROR',
      });

      // 422: the 30-minute boundary (L3, REQ-NF-008).
      expectProblem(await patch(target.body.id, { startAt: onMonday(SECOND_MONDAY, '10:15') }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });

      // 422: a start at or before the injected clock (CL-11).
      expectProblem(await patch(target.body.id, { startAt: '2026-11-12T08:30:00+02:00' }), {
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
      });

      // 415: a body that is not JSON.
      const nonJson = await request(app)
        .patch(`/api/v1/admin/appointments/${target.body.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set('Content-Type', 'text/plain')
        .send('not json');
      expectProblem(nonJson, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });

      // 401: no credentials at all.
      const noAuth = await request(app)
        .patch(`/api/v1/admin/appointments/${target.body.id}`)
        .send({ startAt: onMonday(SECOND_MONDAY, '12:00') });
      expectProblem(noAuth, { status: 401, code: 'UNAUTHENTICATED' });

      // 403: a master is not the administrator.
      const masterAuth = await request(app)
        .patch(`/api/v1/admin/appointments/${target.body.id}`)
        .set('Authorization', `Bearer ${masterA.token}`)
        .send({ startAt: onMonday(SECOND_MONDAY, '12:00') });
      expectProblem(masterAuth, { status: 403, code: 'FORBIDDEN' });
    });
  });

  // =========================================================================
  // X1–X3: cancelAppointmentAdmin (R22)
  // =========================================================================

  describe('cancelAppointmentAdmin (R22, POST /admin/appointments/{appointmentId}/cancel)', () => {
    it('X1 cancels a confirmed record, notifies the master and not the acting administrator (K5, REQ-F-030)', async () => {
      const created = await book(masterA.id, onMonday(SECOND_MONDAY, '13:00'));

      const response = await cancelAction(created.body.id);

      expectAppointmentAdmin(response);
      expect(response.body).toMatchObject({
        id: created.body.id,
        status: 'cancelled',
        startAt: onMonday(SECOND_MONDAY, '13:00'),
        updatedAt: NOW,
      });

      const items = await notificationItems(created.body.id);
      // REQ-F-030: no row for the administrator, the master's rows stand (one
      // per enabled channel).
      expect(items.some((row) => row.audience === 'admin')).toBe(false);
      expect(
        items.some((row) => row.audience === 'master' && row.eventType === 'cancellation'),
      ).toBe(true);
      // SRS v1.3:253–256 (P10's reading): a cancellation sends the client nothing.
      expect(
        items.some((row) => row.audience === 'client' && row.eventType === 'cancellation'),
      ).toBe(false);

      // L2/H5: the reminder rows are untouched by the cancellation.
      expect(response.body.reminders).toHaveLength(2);
    });

    it('X2 answers 409 on a completed record and 200 without a write on a cancelled one (K7)', async () => {
      const completed = await book(masterA.id, onMonday(SECOND_MONDAY, '14:00'));
      expectAppointmentAdmin(await completeAction(completed.body.id));
      expectProblem(await cancelAction(completed.body.id), {
        status: 409,
        code: 'INVALID_STATE_TRANSITION',
      });

      const cancelled = await book(masterA.id, onMonday(SECOND_MONDAY, '15:00'));
      const first = await cancelAction(cancelled.body.id);
      expectAppointmentAdmin(first);
      const afterFirst = await notificationItems(cancelled.body.id);

      const repeat = await cancelAction(cancelled.body.id);
      expectAppointmentAdmin(repeat);
      expect(repeat.body.status).toBe('cancelled');
      // F5's rule for the repeat: no write, so `updatedAt` is the first one's.
      expect(repeat.body.updatedAt).toBe(first.body.updatedAt);

      // And no second cancellation event: the row set is the first one's.
      expect(await notificationItems(cancelled.body.id)).toEqual(afterFirst);
    });

    it('X3 answers 404 for an unknown or non-uuid id, 401 without auth, 403 for a master (K8)', async () => {
      const unknownUuid = '00000000-0000-4000-8000-000000000999';

      expectProblem(await cancelAction(unknownUuid), { status: 404, code: 'NOT_FOUND' });

      // R22 declares no 400: a non-uuid names no resource.
      expectProblem(await cancelAction('not-a-valid-uuid'), {
        status: 404,
        code: 'NOT_FOUND',
      });

      const noAuth = await request(app).post(`/api/v1/admin/appointments/${unknownUuid}/cancel`);
      expectProblem(noAuth, { status: 401, code: 'UNAUTHENTICATED' });

      const masterAuth = await request(app)
        .post(`/api/v1/admin/appointments/${unknownUuid}/cancel`)
        .set('Authorization', `Bearer ${masterA.token}`);
      expectProblem(masterAuth, { status: 403, code: 'FORBIDDEN' });
    });
  });

  // =========================================================================
  // P1–P3: completeAppointment (R23)
  // =========================================================================

  describe('completeAppointment (R23, POST /admin/appointments/{appointmentId}/complete)', () => {
    it('P1 marks a confirmed record completed (REQ-F-027, K6)', async () => {
      const created = await book(masterA.id, onMonday(SECOND_MONDAY, '16:00'));
      const before = await notificationItems(created.body.id);

      const response = await completeAction(created.body.id);

      expectAppointmentAdmin(response);
      expect(response.body).toMatchObject({
        id: created.body.id,
        status: 'completed',
        startAt: onMonday(SECOND_MONDAY, '16:00'),
        totalPrice: { amountMinor: 40000, currency: 'UAH' },
        updatedAt: NOW,
      });

      // K6: completion is not in the event catalog, so the rows do not change.
      expect(await notificationItems(created.body.id)).toEqual(before);
      expect(before.some((row) => row.eventType === 'cancellation')).toBe(false);
    });

    it('P2 answers 409 on a cancelled record, 200 without a write on a completed one, and keeps the reminder rows (K7, L6)', async () => {
      const cancelled = await book(masterA.id, onMonday(SECOND_MONDAY, '17:00'));
      expectAppointmentAdmin(await cancelAction(cancelled.body.id));
      expectProblem(await completeAction(cancelled.body.id), {
        status: 409,
        code: 'INVALID_STATE_TRANSITION',
      });

      const completed = await book(masterA.id, onMonday(THIRD_MONDAY, '16:00'));
      const before = await notificationItems(completed.body.id);
      const first = await completeAction(completed.body.id);
      expectAppointmentAdmin(first);

      const repeat = await completeAction(completed.body.id);
      expectAppointmentAdmin(repeat);
      expect(repeat.body.status).toBe('completed');
      expect(repeat.body.updatedAt).toBe(first.body.updatedAt);

      // K6: the repeat wrote nothing, so the rows are the booking's.
      expect(await notificationItems(completed.body.id)).toEqual(before);

      // L6/H5: the stored reminder rows survive completion; the contract's
      // `reminders: []` example is illustrative and is register row 10 (extended).
      expect(first.body.reminders).toHaveLength(2);
      expect(first.body.reminders.map((row: { status: string }) => row.status)).toEqual([
        'scheduled',
        'scheduled',
      ]);
    });

    it('P3 answers 404 for an unknown or non-uuid id, 401 without auth, 403 for a master (K8)', async () => {
      const unknownUuid = '00000000-0000-4000-8000-000000000999';

      expectProblem(await completeAction(unknownUuid), { status: 404, code: 'NOT_FOUND' });

      expectProblem(await completeAction('not-a-valid-uuid'), {
        status: 404,
        code: 'NOT_FOUND',
      });

      const noAuth = await request(app).post(`/api/v1/admin/appointments/${unknownUuid}/complete`);
      expectProblem(noAuth, { status: 401, code: 'UNAUTHENTICATED' });

      const masterAuth = await request(app)
        .post(`/api/v1/admin/appointments/${unknownUuid}/complete`)
        .set('Authorization', `Bearer ${masterA.token}`);
      expectProblem(masterAuth, { status: 403, code: 'FORBIDDEN' });
    });
  });
});
