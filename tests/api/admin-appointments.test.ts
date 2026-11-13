/**
 * S5.1a administrator reads and creates — R19, R20, and getAppointmentAdmin.
 *
 *   R19 POST /admin/appointments                  createAppointmentAdmin → 201 Appointment
 *   R20 GET  /admin/appointments                  listAppointmentsAdmin  → 200 AppointmentAdminPage
 *       GET  /admin/appointments/{appointmentId}  getAppointmentAdmin    → 200 AppointmentAdmin
 *
 * Source: REQ-F-019 ("An administrator can create appointments on behalf of
 *         clients using the same business rules as public booking"),
 *         REQ-F-020 ("An administrator can view the appointment schedule across
 *         all masters, with filtering by date range, master, and status"),
 *         REQ-F-030 ("The acting administrator is not self-notified about
 *         actions they perform, but affected clients and masters receive
 *         notifications");
 *         `resource-model.md` §5.1 (R19, R20), §5.2;
 *         `openapi.yaml` createAppointmentAdmin, listAppointmentsAdmin,
 *         getAppointmentAdmin; schemas AppointmentCreate, Appointment,
 *         AppointmentAdminPage, AppointmentAdmin, Problem.
 * Contract: openapi.yaml#/paths/~1admin~1appointments,
 *           ~1admin~1appointments~1{appointmentId};
 *           schemas Appointment, AppointmentAdminPage, AppointmentAdmin, Problem.
 * Ticket: SMS-32 (Test)
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (S5.1 inventory, K1–K9):
 *
 *   K1  S5.1a covers the read-and-create operations (R19, R20,
 *       getAppointmentAdmin). The acting half (R21 edit, R22 cancel, R23
 *       complete, and the full SMS-18 suite) is S5.1b.
 *   K2  R19 has no business rules of its own: it reuses the path P8 uses
 *       (`offBoundary`, `serviceRejection`, `startInPast`, the booking
 *       transaction with `bookedBlocks`, and 409 `SLOT_UNAVAILABLE`).
 *   K3  R21 uses `reschedule.ts` (S5.1b).
 *   K4  R21 client-only edit writes no event (S5.1b).
 *   K5  REQ-F-030 on R19: the acting administrator receives no notification row,
 *       while the client receives their confirmation SMS and the master
 *       receives their notification according to preferences.
 *   K6  R23 writes no events (S5.1b).
 *   K7  Status transitions follow `state.ts` (S5.1b).
 *   K8  An `appointmentId` that names no appointment (including a malformed or
 *       non-uuid string) answers 404 `NOT_FOUND` on getAppointmentAdmin,
 *       because the operation declares no 400.
 *   K9  The order of R20 is `startAt` then `id` ascending, the same ordering M1
 *       uses, so an appointment calendar always reads chronologically forwards.
 *
 * What this file does not assert:
 *
 *   - **R21, R22, R23.** S5.1b owns the update, cancel, and complete actions.
 *   - **`payment` and `notificationsSummary`.** J2: optional in the contract
 *     and not produced here.
 */

import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getPool } from '../../src/db/client.js';
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

/** Two Mondays after NOW: bookings are safely in the future (CL-11). */
const FIRST_MONDAY = '2026-12-07';
const SECOND_MONDAY = '2026-12-14';
const WINTER_OFFSET = '+02:00';

function onMonday(monday: string, time: string): string {
  return `${monday}T${time}:00${WINTER_OFFSET}`;
}

describe('S5.1a administrator appointments — R19, R20, getAppointmentAdmin', () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isAppointment = getSchemaValidator('Appointment');
  const isAppointmentAdmin = getSchemaValidator('AppointmentAdmin');
  const isAppointmentAdminPage = getSchemaValidator('AppointmentAdminPage');
  const isProblem = getSchemaValidator('Problem');

  let admin: AdminFixture;
  let masterA: MasterFixture;
  let masterB: MasterFixture;
  let haircut: ServiceFixture;
  let colouring: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    masterA = await arrangeMaster(app, unique('AdminAppt Master A'));
    masterB = await arrangeMaster(app, unique('AdminAppt Master B'));

    haircut = await arrangeService(app, admin.token, {
      name: unique('AdminAppt Haircut'),
      baseDurationMinutes: 30,
    });
    colouring = await arrangeService(app, admin.token, {
      name: unique('AdminAppt Colouring'),
      baseDurationMinutes: 60,
    });

    await arrangeLink(app, admin.token, masterA.id, haircut.id, 40000);
    await arrangeLink(app, admin.token, masterA.id, colouring.id, 70000);
    await arrangeLink(app, admin.token, masterB.id, haircut.id, 50000);

    // Both masters are available Mondays 09:00-18:00
    await arrangeWeeklyWindow(app, masterA.token, 1, '09:00', '18:00');
    await arrangeWeeklyWindow(app, masterB.token, 1, '09:00', '18:00');
  });

  function expectProblem(
    res: JsonResponse,
    expected: { status: number; code: string },
  ): void {
    expect(res.status).toBe(expected.status);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(isProblem(res.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(res.body.code).toBe(expected.code);
    expect(res.body.status).toBe(expected.status);
  }

  function expectPage(res: JsonResponse): Record<string, any>[] {
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(isAppointmentAdminPage(res.body), JSON.stringify(isAppointmentAdminPage.errors ?? [])).toBe(true);
    return res.body.items as Record<string, any>[];
  }

  // =========================================================================
  // C1–C4: createAppointmentAdmin (R19)
  // =========================================================================

  describe('createAppointmentAdmin (R19, POST /admin/appointments)', () => {
    it('C1 creates an appointment with sums, client view, Location header, and suppresses admin notification (K2, K5)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Oksana Petrenko', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id, colouring.id],
          startAt: onMonday(FIRST_MONDAY, '10:00'),
        });

      expect(response.status).toBe(201);
      expect(isAppointment(response.body), JSON.stringify(isAppointment.errors ?? [])).toBe(true);

      const created = response.body;
      expect(response.headers.location).toBe(`/api/v1/admin/appointments/${created.id}`);

      // Sums and rounding: 30 + 60 = 90 min (occupied: 90 min)
      expect(created.status).toBe('confirmed');
      expect(created.totalDurationMinutes).toBe(90);
      expect(created.occupiedDurationMinutes).toBe(90);
      expect(created.totalPrice).toEqual({ amountMinor: 110000, currency: 'UAH' });
      expect(created.endAt).toBe(onMonday(FIRST_MONDAY, '11:30'));

      // Client representation has credentials (REQ-NF-001)
      expect(typeof created.accessToken).toBe('string');
      expect(created.confirmationUrl).toContain(created.accessToken);

      // REQ-F-030 (K5): client gets confirmation SMS, master gets notification, admin gets NONE
      const notifsRes = await request(app)
        .get(`/api/v1/admin/appointments/${created.id}/notifications`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(notifsRes.status).toBe(200);

      const items = notifsRes.body.items as { audience: string; eventType: string }[];
      expect(items.some((row) => row.audience === 'client' && row.eventType === 'new')).toBe(true);
      expect(items.some((row) => row.audience === 'master' && row.eventType === 'new')).toBe(true);
      expect(items.some((row) => row.audience === 'admin')).toBe(false);
    });

    it('C2 answers 422 BUSINESS_RULE_VIOLATION for business rule violations (K2)', async () => {
      // 1. Past startAt (CL-11)
      const pastRes = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Past Client', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: '2026-11-12T08:30:00+02:00',
        });
      expectProblem(pastRes, { status: 422, code: 'BUSINESS_RULE_VIOLATION' });

      // 2. Off 30-minute boundary (D3, REQ-NF-008)
      const offBoundaryRes = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Off Boundary', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday(FIRST_MONDAY, '10:15'),
        });
      expectProblem(offBoundaryRes, { status: 422, code: 'BUSINESS_RULE_VIOLATION' });

      // 3. Service not offered by master
      const unlinkedRes = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Unlinked Service', phone: '+380501112233' },
          masterId: masterB.id,
          serviceIds: [colouring.id], // masterB only has haircut
          startAt: onMonday(FIRST_MONDAY, '10:00'),
        });
      expectProblem(unlinkedRes, { status: 422, code: 'BUSINESS_RULE_VIOLATION' });
    });

    it('C3 answers 409 SLOT_UNAVAILABLE when the slot is outside availability or already booked (K2)', async () => {
      // Outside master's availability window (Sunday)
      const sundayRes = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Sunday Client', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: '2026-12-06T10:00:00+02:00',
        });
      expectProblem(sundayRes, { status: 409, code: 'SLOT_UNAVAILABLE' });

      // Conflict: book 12:00-12:30 on master A
      const first = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'First Client', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday(FIRST_MONDAY, '12:00'),
        });
      expect(first.status).toBe(201);

      // Second booking at the same slot
      const conflict = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Second Client', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday(FIRST_MONDAY, '12:00'),
        });
      expectProblem(conflict, { status: 409, code: 'SLOT_UNAVAILABLE' });
    });

    it('C4 enforces authentication, authorization and request validation', async () => {
      // 401 Unauthenticated
      const noAuth = await request(app)
        .post('/api/v1/admin/appointments')
        .send({
          client: { name: 'No Auth', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday(FIRST_MONDAY, '14:00'),
        });
      expectProblem(noAuth, { status: 401, code: 'UNAUTHENTICATED' });

      // 403 Forbidden for a regular master
      const masterAuth = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${masterA.token}`)
        .send({
          client: { name: 'Master Auth', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday(FIRST_MONDAY, '14:00'),
        });
      expectProblem(masterAuth, { status: 403, code: 'FORBIDDEN' });

      // 415 Unsupported media type
      const nonJson = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .set('Content-Type', 'text/plain')
        .send('not json');
      expectProblem(nonJson, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });

      // 422 Validation error: schema violation (missing client phone)
      const schemaViolation = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Incomplete' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday(FIRST_MONDAY, '14:00'),
        });
      expectProblem(schemaViolation, { status: 422, code: 'VALIDATION_ERROR' });
    });
  });

  // =========================================================================
  // L1–L4: listAppointmentsAdmin (R20)
  // =========================================================================

  describe('listAppointmentsAdmin (R20, GET /admin/appointments)', () => {
    it('L1 lists appointments across all masters in staff view, ordered by startAt then id, and dispatches due reminders (K8, K9, J5)', async () => {
      // Create one appointment on Master A (15:00) and one on Master B (13:00)
      const apptB = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Client B', phone: '+380501112233' },
          masterId: masterB.id,
          serviceIds: [haircut.id],
          startAt: onMonday(SECOND_MONDAY, '13:00'),
        });
      expect(apptB.status).toBe(201);

      const apptA = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Client A', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday(SECOND_MONDAY, '15:00'),
        });
      expect(apptA.status).toBe(201);

      // Move 24h reminder of apptB into the past to verify dispatch on read (J5)
      await getPool().query(
        `update notifications set scheduled_at = $2
          where appointment_id = $1 and event_type = 'reminder_24h'`,
        [apptB.body.id, '2026-11-12T08:00:00+02:00'],
      );

      const response = await request(app)
        .get(`/api/v1/admin/appointments?from=${SECOND_MONDAY}&to=${SECOND_MONDAY}`)
        .set('Authorization', `Bearer ${admin.token}`);

      const items = expectPage(response);
      expect(items.length).toBeGreaterThanOrEqual(2);

      // Chronological order (K9): 13:00 before 15:00
      const idxB = items.findIndex((r) => r.id === apptB.body.id);
      const idxA = items.findIndex((r) => r.id === apptA.body.id);
      expect(idxB).toBeLessThan(idxA);

      // Staff representation check (J2): no accessToken and no confirmationUrl
      for (const item of items) {
        expect(item.accessToken).toBeUndefined();
        expect(item.confirmationUrl).toBeUndefined();
        expect(item.client).toBeDefined();
        expect(item.master).toBeDefined();
      }

      // Check due reminder was dispatched to 'sent' (J5)
      const foundB = items[idxB];
      const reminder24h = foundB?.reminders.find((r: any) => r.type === '24h');
      expect(reminder24h?.status).toBe('sent');
    });

    it('L2 filters by masterId, status, and date range', async () => {
      const fApptA = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Filter Client A', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday('2026-12-28', '10:00'),
        });
      expect(fApptA.status).toBe(201);

      const fApptB = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Filter Client B', phone: '+380501112233' },
          masterId: masterB.id,
          serviceIds: [haircut.id],
          startAt: onMonday('2026-12-28', '11:00'),
        });
      expect(fApptB.status).toBe(201);

      // Filter by masterId
      const masterARes = await request(app)
        .get(`/api/v1/admin/appointments?masterId=${masterA.id}&from=2026-12-28&to=2026-12-28`)
        .set('Authorization', `Bearer ${admin.token}`);
      const masterAItems = expectPage(masterARes);
      expect(masterAItems).toHaveLength(1);
      expect(masterAItems[0]?.master.id).toBe(masterA.id);

      // Filter by status=confirmed
      const statusRes = await request(app)
        .get('/api/v1/admin/appointments?status=confirmed&from=2026-12-28&to=2026-12-28')
        .set('Authorization', `Bearer ${admin.token}`);
      const statusItems = expectPage(statusRes);
      expect(statusItems).toHaveLength(2);
      expect(statusItems.every((r) => r.status === 'confirmed')).toBe(true);

      // Filter by non-matching date range
      const emptyRes = await request(app)
        .get('/api/v1/admin/appointments?from=2026-12-01&to=2026-12-02')
        .set('Authorization', `Bearer ${admin.token}`);
      const emptyItems = expectPage(emptyRes);
      expect(emptyItems).toEqual([]);
      expect(emptyRes.body.total).toBe(0);
    });

    it('L3 pages through appointments with page and pageSize, returning total', async () => {
      const pAppt1 = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Paging Client 1', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday('2026-12-21', '10:00'),
        });
      expect(pAppt1.status).toBe(201);

      const pAppt2 = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Paging Client 2', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday('2026-12-21', '11:00'),
        });
      expect(pAppt2.status).toBe(201);

      const page1 = await request(app)
        .get('/api/v1/admin/appointments?from=2026-12-21&to=2026-12-21&page=1&pageSize=1')
        .set('Authorization', `Bearer ${admin.token}`);
      const page2 = await request(app)
        .get('/api/v1/admin/appointments?from=2026-12-21&to=2026-12-21&page=2&pageSize=1')
        .set('Authorization', `Bearer ${admin.token}`);

      const items1 = expectPage(page1);
      const items2 = expectPage(page2);

      expect(items1).toHaveLength(1);
      expect(items2).toHaveLength(1);
      expect(items1[0]?.id).not.toBe(items2[0]?.id);
      expect(page1.body.total).toBe(2);
      expect(page2.body.total).toBe(2);
    });

    it('L4 answers 400 for malformed parameters, 401 without auth, and 403 for master', async () => {
      // 400 Malformed status enum
      const bogusStatus = await request(app)
        .get('/api/v1/admin/appointments?status=bogus')
        .set('Authorization', `Bearer ${admin.token}`);
      expectProblem(bogusStatus, { status: 400, code: 'MALFORMED_REQUEST' });

      // 400 Malformed date
      const badDate = await request(app)
        .get('/api/v1/admin/appointments?from=2026-02-30')
        .set('Authorization', `Bearer ${admin.token}`);
      expectProblem(badDate, { status: 400, code: 'MALFORMED_REQUEST' });

      // 400 Malformed masterId (non-uuid)
      const badUuid = await request(app)
        .get('/api/v1/admin/appointments?masterId=not-a-uuid')
        .set('Authorization', `Bearer ${admin.token}`);
      expectProblem(badUuid, { status: 400, code: 'MALFORMED_REQUEST' });

      // 401 Unauthenticated
      const noAuth = await request(app).get('/api/v1/admin/appointments');
      expectProblem(noAuth, { status: 401, code: 'UNAUTHENTICATED' });

      // 403 Forbidden for master
      const masterAuth = await request(app)
        .get('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${masterA.token}`);
      expectProblem(masterAuth, { status: 403, code: 'FORBIDDEN' });
    });
  });

  // =========================================================================
  // G1–G2: getAppointmentAdmin (GET /admin/appointments/{appointmentId})
  // =========================================================================

  describe('getAppointmentAdmin (GET /admin/appointments/{appointmentId})', () => {
    it('G1 gets one appointment in staff view and dispatches due reminders (K8, J2, J5)', async () => {
      const created = await request(app)
        .post('/api/v1/admin/appointments')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          client: { name: 'Single Appt Client', phone: '+380501112233' },
          masterId: masterA.id,
          serviceIds: [haircut.id],
          startAt: onMonday(SECOND_MONDAY, '16:00'),
        });
      expect(created.status).toBe(201);
      const apptId = created.body.id;

      // Move 24h reminder to past
      await getPool().query(
        `update notifications set scheduled_at = $2
          where appointment_id = $1 and event_type = 'reminder_24h'`,
        [apptId, '2026-11-12T08:00:00+02:00'],
      );

      const response = await request(app)
        .get(`/api/v1/admin/appointments/${apptId}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(response.status).toBe(200);
      expect(isAppointmentAdmin(response.body), JSON.stringify(isAppointmentAdmin.errors ?? [])).toBe(true);

      const appt = response.body;
      expect(appt.id).toBe(apptId);
      expect(appt.client.name).toBe('Single Appt Client');
      expect(appt.master.id).toBe(masterA.id);

      // Staff view excludes client credentials
      expect(appt.accessToken).toBeUndefined();
      expect(appt.confirmationUrl).toBeUndefined();

      // Dispatched reminder is sent
      const reminder24h = appt.reminders.find((r: any) => r.type === '24h');
      expect(reminder24h?.status).toBe('sent');
    });

    it('G2 answers 404 for unknown or non-uuid id, 401 without auth, 403 for master (K8)', async () => {
      // 404 for unknown uuid
      const unknownUuid = '00000000-0000-4000-8000-000000000999';
      const notFoundRes = await request(app)
        .get(`/api/v1/admin/appointments/${unknownUuid}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expectProblem(notFoundRes, { status: 404, code: 'NOT_FOUND' });

      // 404 for non-uuid string (K8)
      const nonUuidRes = await request(app)
        .get('/api/v1/admin/appointments/not-a-valid-uuid')
        .set('Authorization', `Bearer ${admin.token}`);
      expectProblem(nonUuidRes, { status: 404, code: 'NOT_FOUND' });

      // 401 Unauthenticated
      const noAuth = await request(app).get(`/api/v1/admin/appointments/${unknownUuid}`);
      expectProblem(noAuth, { status: 401, code: 'UNAUTHENTICATED' });

      // 403 Forbidden for master
      const masterAuth = await request(app)
        .get(`/api/v1/admin/appointments/${unknownUuid}`)
        .set('Authorization', `Bearer ${masterA.token}`);
      expectProblem(masterAuth, { status: 403, code: 'FORBIDDEN' });
    });
  });
});
