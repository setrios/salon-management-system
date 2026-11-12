/**
 * S3.2 reminder engine — the 24 h and 2 h reminders as stored rows.
 *
 *   P8  POST /appointments                            createAppointment
 *   P9  GET  /appointments/{token}                    getAppointmentByToken
 *   P10 POST /appointments/{token}/cancel             cancelAppointmentByToken
 *   P11 POST /appointments/{token}/reschedule         rescheduleAppointmentByToken
 *   R24 GET  /admin/appointments/{id}/notifications   listAppointmentNotifications
 *
 * Source: REQ-F-010 ("The system sends a 24-hour reminder SMS, unless that time
 *         has already passed at the moment of booking or reschedule, in which
 *         case it is recorded as skipped"; AC: "otherwise `sent` at the correct
 *         time"), REQ-F-011 (the 2 h reminder, the same rule), REQ-F-029 (a
 *         skipped reminder reactivates when the new time puts it in the
 *         future);
 *         SCN-04 (booking under 24 h: the 24 h reminder is skipped, the 2 h is
 *         scheduled), SCN-05 (booking under 2 h: both are skipped), SCN-11 (a
 *         skipped 24 h reminder becomes scheduled after an early reschedule,
 *         and is sent normally 24 h before the new time);
 *         `openapi.yaml` Reminder (`type` ∈ {24h, 2h}, `status` ∈ {scheduled,
 *         skipped, sent, failed}), Notification (`eventType` includes
 *         `reminder_24h`/`reminder_2h`, and carries `scheduledAt`/`sentAt`);
 *         `error-model.md` §3.1 (the state table: a cancelled or completed
 *         record is not editable).
 * Contract: openapi.yaml#/components/schemas/Reminder, Notification.
 * Ticket: SMS-11, SMS-17 (Test)
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (S3.2 inventory, H1–H6):
 *
 *   H1  A reminder is a stored `notifications` row, not a value computed at
 *       read time. D6 (S2.1) is replaced: REQ-F-010 says "recorded", SCN-11
 *       says "recorded as scheduled", and the table already carries
 *       `scheduled_at`, `sent_at` and the two `event_type` values.
 *   H2  The skip decision is made when the `startAt` is set — at booking and at
 *       reschedule — and stored in the row's `status`.
 *   H3  A `scheduled` row whose `scheduled_at` has passed becomes `sent` on the
 *       next read of the appointment (P9, P10, P11) or of R24, with `sent_at` =
 *       that read's clock. The lab has no scheduler, and the read is the only
 *       trigger the system has.
 *   H4  A `skipped` row never becomes `sent`: the moment was already past when
 *       the record was written, so there was nothing to send.
 *   H5  A cancelled or completed record's reminders are not dispatched. What
 *       `reminders[]` should show for such a record is G2 register row 10,
 *       owned by the addendum (SMS-45); this file does not decide it.
 *   H6  A reschedule recalculates the two rows in place. No new rows and no
 *       unique index: the row is "the reminder for this appointment", and
 *       SCN-11 speaks of one reminder being recorded again.
 *
 * What this file does *not* assert:
 *
 *   - **That an SMS left the system.** `sent` means "handed to the simulated
 *     channel" (E3); delivery is simulated, as it is for the confirmation and
 *     the reschedule message.
 *   - **A background dispatch.** There is none (H3); the read is the trigger,
 *     and R4/R6/R10 are what make that observable.
 *   - **The `reminders[]` of a cancelled record as a decision.** R9 asserts
 *     only that nothing is dispatched; the shape is row 10's, not this file's.
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

type SchemaValidator = ReturnType<typeof getSchemaValidator>;

/**
 * The instant every case treats as "now" (D9). Kyiv is +02:00 in November, and
 * 2026-11-12 is a Thursday, which the short-notice cases use.
 */
const NOW = '2026-11-12T09:00:00+02:00';

/** A Monday three weeks after NOW: both reminders are in the future. */
const FAR_MONDAY = '2026-12-07';
const WINTER_OFFSET = '+02:00';

/** The Sunday before FAR_MONDAY: the 24 h moment of a Monday 10:00 start. */
const SUNDAY = '2026-12-06';

/** A wall-clock instant on the test's Monday. */
function onMonday(time: string): string {
  return `${FAR_MONDAY}T${time}:00${WINTER_OFFSET}`;
}

/** A wall-clock instant on the test's Sunday. */
function onSunday(time: string): string {
  return `${SUNDAY}T${time}:00${WINTER_OFFSET}`;
}

/** A wall-clock instant on the test's Thursday (the day NOW falls on). */
function onThursday(time: string): string {
  return `2026-11-12T${time}:00${WINTER_OFFSET}`;
}

/**
 * The 24 h moment of a Monday 10:00 start, and an hour after it.
 *
 * Two clocks are the only way to make a moment pass without a scheduler (H3):
 * the appointment is written by the `NOW` app and read by these.
 */
const AT_THE_24H_MOMENT = '2026-12-06T10:00:00+02:00';
const AN_HOUR_LATER = '2026-12-06T11:00:00+02:00';

/** One weekly window, as M4 takes it. */
interface WeeklyWindow {
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly endTime: string;
}

const MONDAY_WINDOW: WeeklyWindow = { dayOfWeek: 1, startTime: '10:00', endTime: '18:00' };
const THURSDAY_WINDOW: WeeklyWindow = { dayOfWeek: 4, startTime: '08:00', endTime: '18:00' };

describe('S3.2 reminders — the 24 h and 2 h rows', () => {
  const app = createApp({ now: () => new Date(NOW) });
  // The same database, a later clock. `createApp` is the only place "now"
  // enters the application (D9), so a second app is a second clock over the
  // same rows.
  const atTheMoment = createApp({ now: () => new Date(AT_THE_24H_MOMENT) });
  const anHourLater = createApp({ now: () => new Date(AN_HOUR_LATER) });

  const isAppointment = getSchemaValidator('Appointment');

  let admin: AdminFixture;
  let haircut: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    haircut = await arrangeService(app, admin.token, {
      name: unique('Reminder Haircut'),
      baseDurationMinutes: 30,
    });
  });

  /** Replaces a master's rule set through M4 (a full replacement, §4). */
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
   * A master of this case's own, with the shared haircut linked and the given
   * windows. A master per case keeps the cases independent: several book the
   * same 10:00 slot, and a shared calendar would answer the second 409.
   */
  async function freshMaster(
    windows: readonly WeeklyWindow[] = [MONDAY_WINDOW],
  ): Promise<MasterFixture> {
    const master = await arrangeMaster(app, unique('Reminder Master'));
    await arrangeLink(app, admin.token, master.id, haircut.id, 40000);
    await arrangeWindows(master.token, windows);
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

  /** P9 through the given clock. */
  async function readWith(clockApp: Express, token: string): Promise<JsonResponse> {
    return request(clockApp).get(`/api/v1/appointments/${token}`);
  }

  /** R24 through the given clock. */
  async function notifications(clockApp: Express, appointmentId: string): Promise<JsonResponse> {
    return request(clockApp)
      .get(`/api/v1/admin/appointments/${appointmentId}/notifications`)
      .set('Authorization', `Bearer ${admin.token}`);
  }

  function expectAppointment(response: JsonResponse, status = 200): void {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(
      isAppointment(response.body),
      JSON.stringify(isAppointment.errors ?? []),
    ).toBe(true);
  }

  /** The reminder rows of an R24 page, in the order the page returns them. */
  function reminderRows(page: JsonResponse): Record<string, any>[] {
    return (page.body.items as Record<string, any>[]).filter((item) =>
      String(item.eventType).startsWith('reminder_'),
    );
  }

  // ============================================ the rows a booking writes

  describe('the rows a booking writes (REQ-F-010, REQ-F-011)', () => {
    it('R1 records two scheduled rows when the booking is far enough ahead', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      expectAppointment(created, 201);

      const page = await notifications(app, created.body.id as string);
      expect(page.status).toBe(200);
      expect(reminderRows(page)).toEqual([
        expect.objectContaining({
          audience: 'client',
          eventType: 'reminder_24h',
          channel: 'sms',
          status: 'scheduled',
          scheduledAt: onSunday('10:00'),
        }),
        expect.objectContaining({
          audience: 'client',
          eventType: 'reminder_2h',
          channel: 'sms',
          status: 'scheduled',
          scheduledAt: onMonday('08:00'),
        }),
      ]);

      // The appointment body carries the same two, in the contract's shape.
      expect(created.body.reminders).toEqual([
        { type: '24h', scheduledAt: onSunday('10:00'), status: 'scheduled' },
        { type: '2h', scheduledAt: onMonday('08:00'), status: 'scheduled' },
      ]);
    });

    it('R2 records the 24 h reminder as skipped for a booking under 24 hours ahead (SCN-04)', async () => {
      const master = await freshMaster([THURSDAY_WINDOW]);
      const created = await book(master.id, onThursday('12:00'));
      expectAppointment(created, 201);

      // NOW is 09:00; the appointment is at 12:00, three hours away. The 24 h
      // moment (Wednesday 12:00) has passed, the 2 h moment (10:00) has not.
      expect(created.body.reminders).toEqual([
        { type: '24h', scheduledAt: '2026-11-11T12:00:00+02:00', status: 'skipped' },
        { type: '2h', scheduledAt: onThursday('10:00'), status: 'scheduled' },
      ]);

      const page = await notifications(app, created.body.id as string);
      expect(reminderRows(page).map((row) => row.status)).toEqual(['skipped', 'scheduled']);
    });

    it('R3 records both reminders as skipped for a booking under two hours ahead (SCN-05)', async () => {
      const master = await freshMaster([THURSDAY_WINDOW]);
      const created = await book(master.id, onThursday('10:00'));
      expectAppointment(created, 201);

      // NOW is 09:00; the appointment is at 10:00, one hour away, so both
      // moments are past.
      expect(created.body.reminders).toEqual([
        { type: '24h', scheduledAt: '2026-11-11T10:00:00+02:00', status: 'skipped' },
        { type: '2h', scheduledAt: onThursday('08:00'), status: 'skipped' },
      ]);

      // The rows, not only the computed view: D6's read-time answer is the same
      // here, so the body alone would be green before the engine exists.
      const page = await notifications(app, created.body.id as string);
      expect(reminderRows(page).map((row) => row.status)).toEqual(['skipped', 'skipped']);
    });
  });

  // ============================================ the transition to sent

  describe('the transition to sent (REQ-F-010, H3, H4)', () => {
    it('R4 turns a due reminder into sent on the next read', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      // Before the moment: both are still scheduled.
      const before = await readWith(app, token);
      expect(before.body.reminders).toEqual([
        { type: '24h', scheduledAt: onSunday('10:00'), status: 'scheduled' },
        { type: '2h', scheduledAt: onMonday('08:00'), status: 'scheduled' },
      ]);

      // At the moment: the 24 h reminder is due and is sent; the 2 h is not.
      const at = await readWith(atTheMoment, token);
      expect(at.body.reminders).toEqual([
        { type: '24h', scheduledAt: onSunday('10:00'), status: 'sent' },
        { type: '2h', scheduledAt: onMonday('08:00'), status: 'scheduled' },
      ]);

      const page = await notifications(atTheMoment, created.body.id as string);
      const rows = reminderRows(page);
      expect(rows[0]).toMatchObject({ status: 'sent', sentAt: AT_THE_24H_MOMENT });
      expect(rows[1]).toMatchObject({ status: 'scheduled' });
      expect(rows[1]?.sentAt).toBeUndefined();
    });

    it('R5 never turns a skipped reminder into sent (H4)', async () => {
      const master = await freshMaster([THURSDAY_WINDOW]);
      const created = await book(master.id, onThursday('12:00'));
      const token = created.body.accessToken as string;

      // The 24 h reminder was skipped at booking; the 2 h one was scheduled and
      // its moment has passed by the later clock. Only the second becomes sent.
      const later = await readWith(atTheMoment, token);
      expect(later.body.reminders).toEqual([
        { type: '24h', scheduledAt: '2026-11-11T12:00:00+02:00', status: 'skipped' },
        { type: '2h', scheduledAt: onThursday('10:00'), status: 'sent' },
      ]);
    });

    it('R6 dispatches on R24 and shows sentAt', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));

      // No appointment read first: R24 is the trigger here.
      const page = await notifications(atTheMoment, created.body.id as string);
      const rows = reminderRows(page);
      expect(rows.map((row) => row.status)).toEqual(['sent', 'scheduled']);
      expect(rows[0]?.sentAt).toBe(AT_THE_24H_MOMENT);
    });

    it('R10 does not rewrite sentAt on a second read', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      await readWith(atTheMoment, token);
      await readWith(anHourLater, token);

      // The first read sent it at 10:00; the second must not move the instant.
      const page = await notifications(anHourLater, created.body.id as string);
      expect(reminderRows(page)[0]).toMatchObject({
        status: 'sent',
        sentAt: AT_THE_24H_MOMENT,
      });
    });
  });

  // ============================================ the reschedule recalculates

  describe('the reschedule recalculates the rows (REQ-F-029, SCN-11)', () => {
    it('R7 reactivates a skipped 24 h reminder when the new time is far enough ahead (SCN-11)', async () => {
      const master = await freshMaster([MONDAY_WINDOW, THURSDAY_WINDOW]);
      const created = await book(master.id, onThursday('12:00'));
      const token = created.body.accessToken as string;
      expect(created.body.reminders[0].status).toBe('skipped');

      const moved = await request(app)
        .post(`/api/v1/appointments/${token}/reschedule`)
        .send({ startAt: onMonday('10:00') });
      expectAppointment(moved);

      expect(moved.body.reminders).toEqual([
        { type: '24h', scheduledAt: onSunday('10:00'), status: 'scheduled' },
        { type: '2h', scheduledAt: onMonday('08:00'), status: 'scheduled' },
      ]);

      // H6: the same two rows, recalculated — not two more.
      const page = await notifications(app, created.body.id as string);
      const rows = reminderRows(page);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ status: 'scheduled', scheduledAt: onSunday('10:00') });
    });

    it('R8 skips a scheduled reminder when the new time is too close', async () => {
      const master = await freshMaster([MONDAY_WINDOW, THURSDAY_WINDOW]);
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      const moved = await request(app)
        .post(`/api/v1/appointments/${token}/reschedule`)
        .send({ startAt: onThursday('12:00') });
      expectAppointment(moved);

      expect(moved.body.reminders).toEqual([
        { type: '24h', scheduledAt: '2026-11-11T12:00:00+02:00', status: 'skipped' },
        { type: '2h', scheduledAt: onThursday('10:00'), status: 'scheduled' },
      ]);

      // The rows, not only the computed view: the reschedule must rewrite them.
      const page = await notifications(app, created.body.id as string);
      expect(reminderRows(page).map((row) => row.status)).toEqual(['skipped', 'scheduled']);
    });
  });

  // ============================================ the record that is not live

  describe('the record that is not live (H5, G2 register row 10)', () => {
    it('R9 does not dispatch the reminders of a cancelled record', async () => {
      const master = await freshMaster();
      const created = await book(master.id, onMonday('10:00'));
      const token = created.body.accessToken as string;

      const cancelled = await request(app).post(`/api/v1/appointments/${token}/cancel`);
      expectAppointment(cancelled);

      // The moment has passed, but the record is cancelled: nothing is sent.
      const later = await readWith(atTheMoment, token);
      expect(later.body.reminders).toEqual([
        { type: '24h', scheduledAt: onSunday('10:00'), status: 'scheduled' },
        { type: '2h', scheduledAt: onMonday('08:00'), status: 'scheduled' },
      ]);

      const page = await notifications(atTheMoment, created.body.id as string);
      expect(reminderRows(page).map((row) => row.status)).toEqual(['scheduled', 'scheduled']);
    });
  });
});
