/**
 * Addendum 001 — the reminders of a cancelled appointment (REQ-F-034, SMS-45).
 *
 * SRS v1.3 says when a reminder is written and when one is skipped at booking,
 * and nothing about what a cancellation does to a reminder that is already
 * `scheduled`. The contract's P10 example showed `skipped`; S3.2 left the rows
 * `scheduled` and refused to dispatch them. Addendum 001 settles the question
 * with a third value, because `skipped` already means something else.
 *
 * **What this file asserts** (the addendum's §3, one case each):
 *
 *   - C1 — cancellation settles every `scheduled` reminder to `cancelled`;
 *   - C2 — the administrator's cancellation (R22) does the same as the client's;
 *   - C3 — a reminder that was already `skipped` keeps that status;
 *   - C4 — a reminder that was already `sent` keeps that status;
 *   - C5 — a `cancelled` reminder is never dispatched, however late it is read;
 *   - C6 — a second cancellation is a 200 that changes nothing;
 *   - C7 — the notification list (R24) shows the rows, and the `status` filter
 *     accepts the new value;
 *   - C8 — the two schemas accept `cancelled` and still refuse anything else.
 *
 * The dispatched-before-cancellation case (C4) is why the settlement only
 * touches `scheduled` rows: `sent` records what happened, and a cancellation
 * does not rewrite the past.
 *
 * Source: addendum 001 (`spec/addenda/001-cancelled-reminders.md`, REQ-F-034);
 *         REQ-F-005, REQ-F-010, REQ-F-011 (when the rows are written) and
 *         REQ-F-029 (reactivation on reschedule, which a cancelled record cannot
 *         reach — P11 is 409 on it); G3 register row 10.
 * Contract: openapi.yaml#/components/schemas/Reminder, Notification; P10's
 *           cancelled-record example.
 * Ticket: SMS-45 (Addendum, test half)
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

type SchemaValidator = ReturnType<typeof getSchemaValidator>;

interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

/** The suite's clock: Kyiv winter, Thursday 12 November 2026. */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday three weeks out: both reminders are in the future when booked. */
const FAR_MONDAY = '2026-12-07';
const OFFSET = '+02:00';

/** The 24 h moment of a `FAR_MONDAY 10:00` start, and a clock after both. */
const AT_THE_24H_MOMENT = '2026-12-06T10:00:00+02:00';
const AFTER_BOTH_MOMENTS = '2026-12-07T09:00:00+02:00';

const reminderSchema: SchemaValidator = getSchemaValidator('Reminder');
const notificationSchema: SchemaValidator = getSchemaValidator('Notification');
const appointmentSchema: SchemaValidator = getSchemaValidator('Appointment');

describe('addendum 001 — cancelled reminders (REQ-F-034)', () => {
  const app = createApp({ now: () => new Date(NOW) });
  // The same rows under later clocks: `createApp` is the only place "now"
  // enters (D9), so a second app is a second clock over the same database.
  const atThe24hMoment = createApp({ now: () => new Date(AT_THE_24H_MOMENT) });
  const afterBoth = createApp({ now: () => new Date(AFTER_BOTH_MOMENTS) });

  let admin: AdminFixture;
  let haircut: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    haircut = await arrangeService(app, admin.token, {
      name: unique('Addendum Haircut'),
      baseDurationMinutes: 30,
    });
  });

  /** A master of this case's own, so no two cases share a calendar. */
  async function freshMaster(
    windows = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '08:00',
      endTime: '18:00',
    })),
  ): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('Addendum Master'));
    await arrangeLink(app, admin.token, master.id, haircut.id, 40000);
    await request(app)
      .put('/api/v1/me/availability')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ weekly: windows, dates: [] });
    return master;
  }

  /** Books through P8 (so the case owns the token as well as the id). */
  async function book(masterId: string, startAt: string): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/appointments')
      .send({
        client: { name: 'Olena Tkachenko', phone: '+380501234567' },
        masterId,
        serviceIds: [haircut.id],
        startAt,
      });
  }

  /** Books through R19 (the administrator's path, for R22's cases). */
  async function bookAsAdmin(masterId: string, startAt: string): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/admin/appointments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        client: { name: 'Olena Tkachenko', phone: '+380501234567' },
        masterId,
        serviceIds: [haircut.id],
        startAt,
      });
  }

  /** R24's page of notification rows, filtered to the reminders. */
  async function remindersOf(
    clock: Express,
    appointmentId: string,
  ): Promise<Record<string, any>[]> {
    const page = await request(clock)
      .get(`/api/v1/admin/appointments/${appointmentId}/notifications`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(page.status).toBe(200);
    return (page.body.items as Record<string, any>[])
      .filter((item) => String(item.eventType).startsWith('reminder_'))
      .sort((left, right) => String(left.scheduledAt).localeCompare(String(right.scheduledAt)));
  }

  // ============================================ the settlement

  it('C1 settles both scheduled reminders to cancelled on the client’s cancellation (REQ-F-034)', async () => {
    const master = await freshMaster();
    const created = await book(master.id, `${FAR_MONDAY}T10:00:00${OFFSET}`);
    expect(created.status).toBe(201);
    const token = created.body.accessToken as string;
    const appointmentId = created.body.id as string;

    expect(created.body.reminders).toEqual([
      { type: '24h', scheduledAt: `2026-12-06T10:00:00${OFFSET}`, status: 'scheduled' },
      { type: '2h', scheduledAt: `${FAR_MONDAY}T08:00:00${OFFSET}`, status: 'scheduled' },
    ]);

    const cancelled = await request(app).post(`/api/v1/appointments/${token}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(appointmentSchema(cancelled.body), JSON.stringify(appointmentSchema.errors ?? [])).toBe(
      true,
    );

    // The answer to the cancellation already carries the settled rows.
    expect(cancelled.body.reminders.map((row: any) => row.status)).toEqual([
      'cancelled',
      'cancelled',
    ]);

    // And a later read agrees, whichever clock reads it.
    const later = await request(afterBoth).get(`/api/v1/appointments/${token}`);
    expect(later.body.reminders.map((row: any) => row.status)).toEqual(['cancelled', 'cancelled']);
    expect((await remindersOf(afterBoth, appointmentId)).map((row) => row.status)).toEqual([
      'cancelled',
      'cancelled',
    ]);
  });

  it('C2 settles them on the administrator’s cancellation too (R22)', async () => {
    const master = await freshMaster();
    const created = await bookAsAdmin(master.id, `${FAR_MONDAY}T11:00:00${OFFSET}`);
    expect(created.status).toBe(201);
    const appointmentId = created.body.id as string;

    const cancelled = await request(app)
      .post(`/api/v1/admin/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.reminders.map((row: any) => row.status)).toEqual([
      'cancelled',
      'cancelled',
    ]);
  });

  // ============================================ what is not rewritten

  it('C3 leaves a reminder that was skipped at booking as skipped (REQ-F-029)', async () => {
    const master = await freshMaster();
    // Four hours out: the 24 h moment is already past at booking, the 2 h one is
    // not. This is the row REQ-F-029's reactivation rule would act on — if the
    // record were reschedulable, which a cancelled one is not.
    const created = await book(master.id, `2026-11-12T13:00:00${OFFSET}`);
    expect(created.status).toBe(201);
    expect(created.body.reminders.map((row: any) => row.status)).toEqual(['skipped', 'scheduled']);
    const token = created.body.accessToken as string;

    const cancelled = await request(app).post(`/api/v1/appointments/${token}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.reminders.map((row: any) => row.status)).toEqual([
      'skipped',
      'cancelled',
    ]);
  });

  it('C4 leaves a reminder that was already sent as sent', async () => {
    const master = await freshMaster();
    // A 10:00 start puts the 24 h moment exactly at `AT_THE_24H_MOMENT`.
    const created = await book(master.id, `${FAR_MONDAY}T10:00:00${OFFSET}`);
    expect(created.status).toBe(201);
    const token = created.body.accessToken as string;

    // Reading at the 24 h moment dispatches that reminder (H3); the 2 h one is
    // still ahead.
    const dispatched = await request(atThe24hMoment).get(`/api/v1/appointments/${token}`);
    expect(dispatched.body.reminders.map((row: any) => row.status)).toEqual(['sent', 'scheduled']);

    const cancelled = await request(atThe24hMoment).post(`/api/v1/appointments/${token}/cancel`);
    expect(cancelled.status).toBe(200);
    // `sent` records what happened; the cancellation does not rewrite it.
    expect(cancelled.body.reminders.map((row: any) => row.status)).toEqual(['sent', 'cancelled']);
  });

  // ============================================ never dispatched, never re-written

  it('C5 never dispatches a cancelled reminder, however late it is read', async () => {
    const master = await freshMaster();
    const created = await book(master.id, `${FAR_MONDAY}T13:00:00${OFFSET}`);
    const token = created.body.accessToken as string;
    const appointmentId = created.body.id as string;

    await request(app).post(`/api/v1/appointments/${token}/cancel`);

    // Both moments are long past, and a read is the only thing that could send.
    const late = await request(atThe24hMoment).get(`/api/v1/appointments/${token}`);
    expect(late.body.reminders.map((row: any) => row.status)).toEqual(['cancelled', 'cancelled']);

    const later = await request(afterBoth).get(`/api/v1/appointments/${token}`);
    expect(later.body.reminders.map((row: any) => row.status)).toEqual(['cancelled', 'cancelled']);
    expect((await remindersOf(afterBoth, appointmentId)).map((row) => row.sentAt ?? null)).toEqual([
      null,
      null,
    ]);
  });

  it('C6 answers a second cancellation with 200 and changes nothing', async () => {
    const master = await freshMaster();
    const created = await bookAsAdmin(master.id, `${FAR_MONDAY}T14:00:00${OFFSET}`);
    const appointmentId = created.body.id as string;

    const first = await request(app)
      .post(`/api/v1/admin/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(first.status).toBe(200);

    // A later clock, so a rewrite of `updatedAt` or of the rows would show.
    const again = await request(afterBoth)
      .post(`/api/v1/admin/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(again.status).toBe(200);
    expect(again.body.updatedAt).toBe(first.body.updatedAt);
    expect(again.body.reminders.map((row: any) => row.status)).toEqual(['cancelled', 'cancelled']);
  });

  // ============================================ the contract's surface

  it('C7 exposes the rows through R24 and accepts the value as a filter (M7)', async () => {
    const master = await freshMaster();
    const created = await book(master.id, `${FAR_MONDAY}T15:00:00${OFFSET}`);
    const appointmentId = created.body.id as string;
    await request(app).post(`/api/v1/appointments/${created.body.accessToken}/cancel`);

    const rows = await remindersOf(app, appointmentId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(notificationSchema(row), JSON.stringify(notificationSchema.errors ?? [])).toBe(true);
      expect(row.status).toBe('cancelled');
    }

    // The query parameter's enum carries the new value: the filter is accepted
    // and answers a page rather than a 400.
    const filtered = await request(app)
      .get('/api/v1/me/notifications?status=cancelled&page=1&pageSize=10')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(filtered.status).toBe(200);
    expect(Array.isArray(filtered.body.items)).toBe(true);

    const unknown = await request(app)
      .get('/api/v1/me/notifications?status=cancelledX')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(unknown.status).toBe(400);
  });

  it('C8 lets the two schemas carry the value and still refuse anything else', () => {
    const reminder = {
      type: '24h',
      scheduledAt: '2026-12-06T10:00:00+02:00',
      status: 'cancelled',
    };
    expect(reminderSchema(reminder), JSON.stringify(reminderSchema.errors ?? [])).toBe(true);
    expect(reminderSchema({ ...reminder, status: 'cancelledX' })).toBe(false);

    const notification = {
      id: '00000000-0000-4000-8000-000000000001',
      appointmentId: '00000000-0000-4000-8000-000000000002',
      audience: 'client',
      eventType: 'reminder_24h',
      channel: 'sms',
      status: 'cancelled',
      scheduledAt: '2026-12-06T10:00:00+02:00',
      createdAt: '2026-11-12T09:00:00+02:00',
    };
    expect(notificationSchema(notification), JSON.stringify(notificationSchema.errors ?? [])).toBe(
      true,
    );
    expect(notificationSchema({ ...notification, status: 'cancelledX' })).toBe(false);

    // The old values still validate: the addendum widens, it does not replace.
    expect(reminderSchema({ ...reminder, status: 'skipped' })).toBe(true);
    expect(reminderSchema({ ...reminder, status: 'sent' })).toBe(true);
    expect(reminderSchema({ ...reminder, status: 'scheduled' })).toBe(true);
    expect(reminderSchema({ ...reminder, status: 'failed' })).toBe(true);
  });
});
