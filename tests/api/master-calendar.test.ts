/**
 * S4.2 the master's own calendar and own services — M1 and M2.
 *
 *   M1  GET /me/appointments   listMyAppointments → AppointmentAdminPage
 *   M2  GET /me/services       listMyServices     → MasterServiceList
 *
 * Source: REQ-F-013 ("A master can view their own appointment calendar"; AC:
 *         "The calendar shown to a logged-in master contains only that master's
 *         appointments"), REQ-F-014 ("The list shown matches exactly the
 *         MasterService records for that master");
 *         `resource-model.md` §5.3 (M1: query `from`, `to`, `status`, `page`,
 *         `pageSize`; 200 `AppointmentAdminPage`; 400. M2: no query; 200
 *         `MasterServiceList`);
 *         `openapi.yaml` AppointmentAdmin, AppointmentAdminPage,
 *         MasterServiceList, MasterService.
 * Contract: openapi.yaml#/paths/~1me~1appointments, ~1me~1services;
 *           schemas AppointmentAdminPage, MasterServiceList, Problem.
 * Ticket: SMS-31 (Test)
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (S4.2 inventory, J1–J8):
 *
 *   J1  M1's scope is the token's subject, not a parameter. There is no
 *       `masterId` in the contract, and REQ-F-013's AC is exactly that the
 *       calendar contains only the caller's appointments.
 *   J2  The staff representation is `AppointmentAdmin`: the client view minus
 *       `accessToken` and `confirmationUrl` (D18, REQ-NF-006). `payment` and
 *       `notificationsSummary` are optional in the contract and are not
 *       produced here — S5.3 and S5.1 are the stages that have something to put
 *       in them.
 *   J3  `from` and `to` filter on `startAt`, inclusive of the whole day. The
 *       calendar's axis is when the appointment starts, not when the row was
 *       written (which is what M7's `from`/`to` filter on).
 *   J4  The order is `startAt` then `id`: a calendar reads forwards, and two
 *       appointments can start at the same instant.
 *   J5  M1 dispatches a due reminder, like P9 and R24 (H3). A calendar that
 *       showed a `scheduled` reminder whose moment had passed would be the one
 *       read that did not.
 *   J6  M1 is `JWT-M`: the contract declares 403, and the administrator's own
 *       calendar is R20's (S5.1), not this operation's.
 *   J7  M2 returns the caller's links unpaged, in `createdAt` then `id` order —
 *       R10's order, so the two lists agree.
 *   J8  M2 is `JWT-M`, for the same reason as J6.
 *
 * What this file does *not* assert:
 *
 *   - **That the administrator's calendar works.** R20 is S5.1's.
 *   - **`payment` or `notificationsSummary`.** J2.
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
  unique,
  type AdminFixture,
  type MasterFixture,
  type ServiceFixture,
} from '../helpers/booking.js';

/** Minimal view of a supertest response; see `tests/api/auth.test.ts`. */
interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

/** One item of M1's page, as these cases read it. */
interface CalendarRow {
  readonly id: string;
  readonly status: string;
  readonly startAt: string;
  readonly reminders: { readonly type: string; readonly status: string }[];
}

/** The instant every case treats as "now" (D9). Kyiv is +02:00 in November. */
const NOW = '2026-11-12T09:00:00+02:00';

/** Two Mondays after NOW: both bookings are in the future (CL-11). */
const FIRST_MONDAY = '2026-12-07';
const SECOND_MONDAY = '2026-12-14';
const WINTER_OFFSET = '+02:00';

describe("S4.2 the master's own calendar and own services (M1, M2)", () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isCalendarPage = getSchemaValidator('AppointmentAdminPage');
  const isServiceList = getSchemaValidator('MasterServiceList');
  const isProblem = getSchemaValidator('Problem');

  let admin: AdminFixture;
  let haircut: ServiceFixture;
  let colouring: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    haircut = await arrangeService(app, admin.token, {
      name: unique('Calendar Haircut'),
      baseDurationMinutes: 30,
    });
    colouring = await arrangeService(app, admin.token, {
      name: unique('Calendar Colouring'),
      baseDurationMinutes: 60,
    });
  });

  /** M1 through the given token, with an optional query string. */
  async function myAppointments(token: string, query = ''): Promise<JsonResponse> {
    return request(app)
      .get(`/api/v1/me/appointments${query}`)
      .set('Authorization', `Bearer ${token}`);
  }

  /** M2 through the given token. */
  async function myServices(token: string): Promise<JsonResponse> {
    return request(app).get('/api/v1/me/services').set('Authorization', `Bearer ${token}`);
  }

  /** A master of this case's own, bookable on the test's Mondays. */
  async function arrangeBookable(): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('Calendar Master'));
    await arrangeLink(app, admin.token, master.id, haircut.id, 40000);
    await request(app)
      .put('/api/v1/me/availability')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ weekly: [{ dayOfWeek: 1, startTime: '10:00', endTime: '18:00' }], dates: [] });
    return master;
  }

  /** Books the shared haircut through P8 and returns the created record. */
  async function book(masterId: string, day = FIRST_MONDAY, time = '10:00'): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        masterId,
        serviceIds: [haircut.id],
        startAt: `${day}T${time}:00${WINTER_OFFSET}`,
      });
  }

  function expectPage(response: JsonResponse): CalendarRow[] {
    expect(response.status).toBe(200);
    expect(isCalendarPage(response.body), JSON.stringify(isCalendarPage.errors ?? [])).toBe(true);
    return response.body.items as CalendarRow[];
  }

  function expectProblem(response: JsonResponse, expected: { status: number; code: string }): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({ status: expected.status, code: expected.code });
  }

  // ======================================== the calendar (M1)

  describe('the calendar (M1, REQ-F-013)', () => {
    it('A1 shows a master only their own appointments, earliest first', async () => {
      const first = await arrangeBookable();
      const second = await arrangeBookable();

      const later = await book(first.id, SECOND_MONDAY, '10:00');
      const earlier = await book(first.id, FIRST_MONDAY, '14:00');
      expect(later.status).toBe(201);
      expect(earlier.status).toBe(201);
      expect((await book(second.id, FIRST_MONDAY, '10:00')).status).toBe(201);

      const items = expectPage(await myAppointments(first.token));

      expect(items.map((row) => row.id)).toEqual([earlier.body.id, later.body.id]);
      expect(items.map((row) => row.startAt)).toEqual([
        `${FIRST_MONDAY}T14:00:00${WINTER_OFFSET}`,
        `${SECOND_MONDAY}T10:00:00${WINTER_OFFSET}`,
      ]);
    });

    it('A2 answers the staff representation, without the client token (J2)', async () => {
      const master = await arrangeBookable();
      const created = await book(master.id);
      expect(created.status).toBe(201);

      const items = expectPage(await myAppointments(master.token));
      expect(items).toHaveLength(1);

      const row = items[0] as unknown as Record<string, unknown>;
      expect(row).not.toHaveProperty('accessToken');
      expect(row).not.toHaveProperty('confirmationUrl');
      // The client's own view does carry them, which is what makes the absence
      // above a decision rather than a shape that never had them.
      expect(created.body).toHaveProperty('accessToken');
      expect(created.body).toHaveProperty('confirmationUrl');
      expect(row).toMatchObject({
        id: created.body.id,
        status: 'confirmed',
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        master: { id: master.id, fullName: master.fullName },
      });
    });

    it('A3 filters by from and to on startAt, inclusive of the whole day (J3)', async () => {
      const master = await arrangeBookable();
      expect((await book(master.id, FIRST_MONDAY, '10:00')).status).toBe(201);
      expect((await book(master.id, SECOND_MONDAY, '10:00')).status).toBe(201);

      const firstDay = expectPage(
        await myAppointments(master.token, `?from=${FIRST_MONDAY}&to=${FIRST_MONDAY}`),
      );
      expect(firstDay).toHaveLength(1);
      expect(firstDay[0]?.startAt).toBe(`${FIRST_MONDAY}T10:00:00${WINTER_OFFSET}`);

      const fromSecond = expectPage(await myAppointments(master.token, `?from=${SECOND_MONDAY}`));
      expect(fromSecond).toHaveLength(1);
      expect(fromSecond[0]?.startAt).toBe(`${SECOND_MONDAY}T10:00:00${WINTER_OFFSET}`);

      const beforeAll = expectPage(await myAppointments(master.token, '?to=2026-12-01'));
      expect(beforeAll).toEqual([]);
    });

    it('A4 filters by status', async () => {
      const master = await arrangeBookable();
      const created = await book(master.id);
      expect(created.status).toBe(201);

      const cancelled = await request(app)
        .post(`/api/v1/appointments/${created.body.accessToken}/cancel`)
        .send({});
      expect(cancelled.status).toBe(200);

      const confirmedOnly = expectPage(await myAppointments(master.token, '?status=confirmed'));
      expect(confirmedOnly).toEqual([]);

      const cancelledOnly = expectPage(await myAppointments(master.token, '?status=cancelled'));
      expect(cancelledOnly.map((row) => row.id)).toEqual([created.body.id]);
    });

    it('A5 pages: one item per page, the unpaged total', async () => {
      const master = await arrangeBookable();
      expect((await book(master.id, FIRST_MONDAY, '10:00')).status).toBe(201);
      expect((await book(master.id, SECOND_MONDAY, '10:00')).status).toBe(201);

      const firstPage = await myAppointments(master.token, '?page=1&pageSize=1');
      const secondPage = await myAppointments(master.token, '?page=2&pageSize=1');

      expect(expectPage(firstPage)).toHaveLength(1);
      expect(expectPage(secondPage)).toHaveLength(1);
      expect(firstPage.body.total).toBe(2);
      expect(secondPage.body.total).toBe(2);
      expect(firstPage.body.items[0].id).not.toBe(secondPage.body.items[0].id);
    });

    it('A6 answers 400 for an unknown status and for a date that names no day', async () => {
      const master = await arrangeBookable();

      expectProblem(await myAppointments(master.token, '?status=bogus'), {
        status: 400,
        code: 'MALFORMED_REQUEST',
      });
      expectProblem(await myAppointments(master.token, '?from=2026-02-30'), {
        status: 400,
        code: 'MALFORMED_REQUEST',
      });
    });

    it('A7 answers 401 without a token', async () => {
      expectProblem(await request(app).get('/api/v1/me/appointments'), {
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    });

    it('A8 answers 403 for the administrator (J6)', async () => {
      expectProblem(await myAppointments(admin.token), {
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('A9 answers an empty page for a master with no appointments', async () => {
      const master = await arrangeBookable();

      const response = await myAppointments(master.token);
      expect(expectPage(response)).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('A10 dispatches a due reminder on the calendar read (J5)', async () => {
      const master = await arrangeBookable();
      const created = await book(master.id);
      expect(created.status).toBe(201);

      // The booking is in the future, so both reminders are `scheduled`. Moving
      // the 24 h one into the past is the arrangement K8 uses: the clock is the
      // injected one, and a moment cannot be made to pass by waiting.
      await getPool().query(
        `update notifications set scheduled_at = $2
          where appointment_id = $1 and event_type = 'reminder_24h'`,
        [created.body.id, '2026-11-12T08:00:00+02:00'],
      );

      const items = expectPage(await myAppointments(master.token));
      expect(items).toHaveLength(1);

      const reminder = items[0]?.reminders.find((row) => row.type === '24h');
      expect(reminder?.status).toBe('sent');
    });
  });

  // ======================================== the own services (M2)

  describe('the own services (M2, REQ-F-014)', () => {
    it('B1 shows a master only their own links', async () => {
      const first = await arrangeBookable();
      const second = await arrangeBookable();
      await arrangeLink(app, admin.token, first.id, colouring.id, 70000);

      const response = await myServices(first.token);
      expect(response.status).toBe(200);
      expect(isServiceList(response.body), JSON.stringify(isServiceList.errors ?? [])).toBe(true);

      const items = response.body as { masterId: string; serviceId: string }[];
      expect(items).toHaveLength(2);
      expect(items.every((row) => row.masterId === first.id)).toBe(true);
      expect(items.map((row) => row.serviceId).sort()).toEqual([haircut.id, colouring.id].sort());

      const other = await myServices(second.token);
      expect(
        (other.body as { masterId: string }[]).every((row) => row.masterId === second.id),
      ).toBe(true);
      expect(other.body).toHaveLength(1);
    });

    it('B2 answers the MasterService shape', async () => {
      const master = await arrangeBookable();

      const response = await myServices(master.token);
      expect(response.status).toBe(200);

      const [link] = response.body as Record<string, unknown>[];
      expect(link).toMatchObject({
        masterId: master.id,
        serviceId: haircut.id,
        price: { amountMinor: 40000, currency: 'UAH' },
        active: true,
      });
      expect(typeof link?.id).toBe('string');
    });

    it('B3 answers 401 without a token', async () => {
      expectProblem(await request(app).get('/api/v1/me/services'), {
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    });

    it('B4 answers 403 for the administrator (J8)', async () => {
      expectProblem(await myServices(admin.token), {
        status: 403,
        code: 'FORBIDDEN',
      });
    });

    it('B5 answers an empty list for a master with no links', async () => {
      const master = await arrangeMaster(app, unique('Calendar Unlinked'));

      const response = await myServices(master.token);
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });
});
