/**
 * S4.1 the caller's own notification records — M7.
 *
 *   M7  GET /me/notifications   listMyNotifications → NotificationPage
 *
 * Source: REQ-F-016 (a master receives a notification when one of their own
 *         appointments is created, rescheduled or cancelled — this is the
 *         operation that makes the master's own rows observable),
 *         REQ-F-023 (the administrator's rows are the same table, a different
 *         audience);
 *         `resource-model.md` §5.3 (M7: query `status`, `eventType`, `from`,
 *         `to`, `page`, `pageSize`; 200 `NotificationPage`; 400);
 *         `openapi.yaml` NotificationPage, Notification.
 * Contract: openapi.yaml#/paths/~1me~1notifications;
 *           schemas NotificationPage, Notification, Problem.
 * Ticket: SMS-12 (Test)
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (S4.1 inventory, I1–I8):
 *
 *   I3  M7 is `JWT`, not `JWT-M`: the contract declares no 403 for it, and the
 *       administrator has rows of their own (REQ-F-023). A master's token sees
 *       the master's rows; the administrator's token sees the administrator's.
 *   I7  The client's rows are not the caller's: a master's list never contains
 *       `audience = 'client'`, which is what keeps the confirmation SMS and the
 *       reminders out of it.
 *   I9  "The caller's rows" means: for a master, the `audience = 'master'` rows
 *       of appointments assigned to them; for the administrator, the
 *       `audience = 'admin'` rows. The table carries no principal column, and
 *       the appointment already names the master.
 *   I10 `from` and `to` filter on `createdAt`, the record's own date, and are
 *       inclusive of the whole day. `scheduledAt` is null for the confirmation
 *       and the reschedule rows, so it cannot be the filter's column.
 *   I11 The order is `createdAt` then `id`, the same as R24's, so a page is
 *       stable across calls.
 *
 * What this file does *not* assert:
 *
 *   - **That a row was delivered.** `sent` is the simulated hand-off (E3).
 *   - **The administrator's suppression.** I6; it is S5.1's, with SMS-18.
 */

import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
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

/** One row of M7's page, as these cases read it. */
interface NotificationRow {
  readonly audience: string;
  readonly eventType: string;
  readonly channel: string;
  readonly status: string;
  readonly createdAt: string;
}

/** The instant every case treats as "now" (D9). Kyiv is +02:00 in November. */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday three weeks after NOW: the booking is in the future (CL-11). */
const FAR_MONDAY = '2026-12-07';
const WINTER_OFFSET = '+02:00';

describe("S4.1 the caller's own notification records (M7)", () => {
  const app = createApp({ now: () => new Date(NOW) });

  const isNotificationPage = getSchemaValidator('NotificationPage');
  const isProblem = getSchemaValidator('Problem');

  let admin: AdminFixture;
  let haircut: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    haircut = await arrangeService(app, admin.token, {
      name: unique('My Notifications Haircut'),
      baseDurationMinutes: 30,
    });
  });

  /** M7 through the given token, with an optional query string. */
  async function myNotifications(token: string, query = ''): Promise<JsonResponse> {
    return request(app)
      .get(`/api/v1/me/notifications${query}`)
      .set('Authorization', `Bearer ${token}`);
  }

  /** A master of this case's own, bookable on the test's Monday. */
  async function arrangeBookable(): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('My Notifications Master'));
    await arrangeLink(app, admin.token, master.id, haircut.id, 40000);
    await request(app)
      .put('/api/v1/me/availability')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ weekly: [{ dayOfWeek: 1, startTime: '10:00', endTime: '18:00' }], dates: [] });
    return master;
  }

  /** Books the shared haircut through P8 and returns the created record. */
  async function book(masterId: string): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Iryna Kovalenko', phone: '+380501234567' },
        masterId,
        serviceIds: [haircut.id],
        startAt: `${FAR_MONDAY}T10:00:00${WINTER_OFFSET}`,
      });
  }

  function expectPage(response: JsonResponse): NotificationRow[] {
    expect(response.status).toBe(200);
    expect(isNotificationPage(response.body), JSON.stringify(isNotificationPage.errors ?? [])).toBe(
      true,
    );
    return response.body.items as NotificationRow[];
  }

  function expectProblem(response: JsonResponse, expected: { status: number; code: string }): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({ status: expected.status, code: expected.code });
  }

  // ======================================== whose rows are these

  describe('whose rows the list contains (I9)', () => {
    it('N1 shows a master their own rows and no client row', async () => {
      const master = await arrangeBookable();
      const created = await book(master.id);
      expect(created.status).toBe(201);

      const items = expectPage(await myNotifications(master.token));

      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.audience === 'master')).toBe(true);
      expect(items.every((row) => row.eventType === 'new')).toBe(true);
      expect(items.map((row) => row.channel).sort()).toEqual(['in_app', 'sms']);
    });

    it("N2 shows the administrator the administrator rows, not a master's", async () => {
      const master = await arrangeBookable();
      const created = await book(master.id);
      expect(created.status).toBe(201);

      const items = expectPage(await myNotifications(admin.token));

      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.audience === 'admin')).toBe(true);
    });

    it("N3 keeps one master's rows out of another master's list", async () => {
      const first = await arrangeBookable();
      const second = await arrangeBookable();
      expect((await book(first.id)).status).toBe(201);

      const items = expectPage(await myNotifications(second.token));

      expect(items).toEqual([]);
    });
  });

  // ======================================== filters and paging

  describe('filters and paging (I10, I11)', () => {
    it('N4 filters by eventType and by status', async () => {
      const master = await arrangeBookable();
      const created = await book(master.id);
      expect(created.status).toBe(201);

      const byEvent = expectPage(await myNotifications(master.token, '?eventType=new'));
      expect(byEvent.length).toBe(2);

      const byOtherEvent = expectPage(
        await myNotifications(master.token, '?eventType=cancellation'),
      );
      expect(byOtherEvent).toEqual([]);

      const byStatus = expectPage(await myNotifications(master.token, '?status=sent'));
      expect(byStatus.length).toBe(2);

      const byOtherStatus = expectPage(await myNotifications(master.token, '?status=skipped'));
      expect(byOtherStatus).toEqual([]);
    });

    it("N5 filters by from and to on the record's own date (I10)", async () => {
      const master = await arrangeBookable();
      const created = await book(master.id);
      expect(created.status).toBe(201);

      const all = expectPage(await myNotifications(master.token));
      expect(all.length).toBe(2);

      // `createdAt` is the database's clock, not the injected one: the row is
      // written by `defaultNow()`, so the case reads the date back rather than
      // assuming it.
      const day = all[0]?.createdAt.slice(0, 10) ?? '';

      const sameDay = expectPage(await myNotifications(master.token, `?from=${day}&to=${day}`));
      expect(sameDay.length).toBe(2);

      const later = expectPage(await myNotifications(master.token, '?from=2099-01-01'));
      expect(later).toEqual([]);

      const earlier = expectPage(await myNotifications(master.token, '?to=2000-01-01'));
      expect(earlier).toEqual([]);
    });

    it('N6 pages the list and reports the unpaged total', async () => {
      const master = await arrangeBookable();
      const created = await book(master.id);
      expect(created.status).toBe(201);

      const first = await myNotifications(master.token, '?page=1&pageSize=1');
      const items = expectPage(first);

      expect(items.length).toBe(1);
      expect(first.body.page).toBe(1);
      expect(first.body.pageSize).toBe(1);
      expect(first.body.total).toBe(2);

      const second = await myNotifications(master.token, '?page=2&pageSize=1');
      const secondItems = expectPage(second);
      expect(secondItems.length).toBe(1);
      expect(secondItems[0]).not.toEqual(items[0]);
    });

    it('N7 rejects an unknown filter value with 400 MALFORMED_REQUEST', async () => {
      const master = await arrangeMaster(app, unique('My Notifications Bad Query'));

      expectProblem(await myNotifications(master.token, '?status=bogus'), {
        status: 400,
        code: 'MALFORMED_REQUEST',
      });
    });

    it('N8 answers 401 without a token', async () => {
      expectProblem(await request(app).get('/api/v1/me/notifications'), {
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    });
  });
});
