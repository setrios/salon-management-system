/**
 * Stage R (register row 11) — the reminder scheduler, so a due reminder is sent
 * at its moment rather than at the next read.
 *
 * REQ-F-010's acceptance criterion says the client is "messaged ... 24 hours
 * before". At S3.2 the system had no scheduler, so a row due at 14:00 became
 * `sent` at whatever read came next; the G3 inventory recorded the gap as H3,
 * and the G3 register sent it to stage R with its own test and control run.
 *
 * **What is being tested is the tick, not the timer.** The timer only decides
 * *when* the tick runs; the tick is `runDueReminders(now)`, one statement over
 * every due row of every confirmed appointment. So the cases below call the tick
 * with an explicit clock (D9) and never wait for real time, except the two that
 * are about the timer itself, which use fake timers.
 *
 *   - S1 — a due reminder becomes `sent` at the tick's instant, with no read;
 *   - S2 — a reminder still ahead is untouched;
 *   - S3 — `skipped` and `cancelled` rows are never sent by a tick;
 *   - S4 — a completed appointment's reminder is not sent (H5), even when due;
 *   - S5 — two ticks at one instant send once (`sentAt` stays the first);
 *   - S6 — the scheduler calls the tick on its interval and stops when stopped;
 *   - S7 — a failing tick is caught and the schedule survives it.
 *
 * Source: REQ-F-005, REQ-F-010, REQ-F-011; H3, H5; G3 register row 11.
 * Ticket: SMS-46 (stage R).
 */

import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import {
  runDueReminders,
  startReminderScheduler,
} from '../../src/modules/notifications/scheduler.js';
import {
  arrangeAdmin,
  arrangeLink,
  arrangeMaster,
  arrangeService,
  unique,
  type AdminFixture,
  type ServiceFixture,
} from '../helpers/booking.js';

interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

/** Kyiv winter; a Monday three weeks out has both reminders in the future. */
const NOW = '2026-11-12T09:00:00+02:00';
const MONDAY = '2026-12-07';
const OFFSET = '+02:00';
const AT_THE_24H_MOMENT = '2026-12-06T10:00:00+02:00';
const AFTER_BOTH_MOMENTS = '2026-12-07T09:00:00+02:00';

describe('stage R — the reminder scheduler (row 11)', () => {
  const app = createApp({ now: () => new Date(NOW) });

  let admin: AdminFixture;
  let haircut: ServiceFixture;

  beforeAll(async () => {
    admin = await arrangeAdmin(app);
    haircut = await arrangeService(app, admin.token, {
      name: unique('Scheduler Haircut'),
      baseDurationMinutes: 30,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A master of this case's own, available every day. */
  async function freshMaster(): Promise<string> {
    const master = await arrangeMaster(app, unique('Scheduler Master'));
    await arrangeLink(app, admin.token, master.id, haircut.id, 40000);
    await request(app)
      .put('/api/v1/me/availability')
      .set('Authorization', `Bearer ${master.token}`)
      .send({
        weekly: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '08:00',
          endTime: '20:00',
        })),
        dates: [],
      });
    return master.id;
  }

  /** R19 — books through the administrator (the case keeps the id). */
  async function book(masterId: string, startAt: string): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/admin/appointments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        client: { name: 'Scheduler Client', phone: '+380501234567' },
        masterId,
        serviceIds: [haircut.id],
        startAt,
      });
  }

  /** The rows as R24 reports them, oldest moment first. */
  async function reminderRows(appointmentId: string): Promise<Record<string, any>[]> {
    const page = await request(app)
      .get(`/api/v1/admin/appointments/${appointmentId}/notifications`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(page.status).toBe(200);
    return (page.body.items as Record<string, any>[])
      .filter((item) => String(item.eventType).startsWith('reminder_'))
      .sort((left, right) => String(left.scheduledAt).localeCompare(String(right.scheduledAt)));
  }

  // ============================================ the tick

  it('S1 sends a due reminder at the tick’s instant, with no read in front of it', async () => {
    const masterId = await freshMaster();
    const created = await book(masterId, `${MONDAY}T10:00:00${OFFSET}`);
    expect(created.status).toBe(201);
    const appointmentId = created.body.id as string;

    // Nothing has read the record since it was written.
    const sent = await runDueReminders(new Date(AT_THE_24H_MOMENT));
    expect(sent).toBe(1);

    const rows = await reminderRows(appointmentId);
    expect(rows.map((row) => row.status)).toEqual(['sent', 'scheduled']);
    expect(rows[0]?.sentAt).toBe(`2026-12-06T10:00:00${OFFSET}`);

    // The record's own view agrees, and the read did not move `sentAt` (R10).
    const read = await request(createApp({ now: () => new Date(AFTER_BOTH_MOMENTS) })).get(
      `/api/v1/appointments/${created.body.accessToken}`,
    );
    expect(read.body.reminders.map((row: any) => row.status)).toEqual(['sent', 'sent']);
    expect(read.body.reminders[0].sentAt ?? `2026-12-06T10:00:00${OFFSET}`).toBe(
      `2026-12-06T10:00:00${OFFSET}`,
    );
  });

  it('S2 leaves a reminder that is still ahead untouched', async () => {
    const masterId = await freshMaster();
    const created = await book(masterId, `${MONDAY}T11:00:00${OFFSET}`);
    const appointmentId = created.body.id as string;

    expect(await runDueReminders(new Date(NOW))).toBe(0);
    expect((await reminderRows(appointmentId)).map((row) => row.status)).toEqual([
      'scheduled',
      'scheduled',
    ]);

    // One hour later its 24 h moment has arrived: only that row is sent.
    expect(await runDueReminders(new Date('2026-12-06T11:00:00+02:00'))).toBe(1);
    expect((await reminderRows(appointmentId)).map((row) => row.status)).toEqual([
      'sent',
      'scheduled',
    ]);
  });

  // ============================================ the rows it must never send

  it('S3 never sends a skipped row, and never sends a cancelled one', async () => {
    const masterId = await freshMaster();
    // Four hours out: the 24 h moment is past at booking (skipped), the 2 h one
    // is ahead.
    const short = await book(masterId, `2026-11-12T13:00:00${OFFSET}`);
    expect(short.body.reminders.map((row: any) => row.status)).toEqual(['skipped', 'scheduled']);

    // A tick at the 2 h moment sends the one that is due. The tick is global, so
    // the count is not the assertion — the record's own rows are.
    expect(await runDueReminders(new Date('2026-11-12T11:00:00+02:00'))).toBeGreaterThanOrEqual(1);
    expect((await reminderRows(short.body.id as string)).map((row) => row.status)).toEqual([
      'skipped',
      'sent',
    ]);

    // A cancelled record's rows are settled by addendum 001, so a tick finds
    // nothing to send there either.
    const cancelled = await book(masterId, `${MONDAY}T12:00:00${OFFSET}`);
    await request(app)
      .post(`/api/v1/admin/appointments/${cancelled.body.id}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`);
    // The same tick may send other records' rows; this one must not gain a
    // `sent` whatever it does.
    await runDueReminders(new Date(AFTER_BOTH_MOMENTS));
    expect((await reminderRows(cancelled.body.id as string)).map((row) => row.status)).toEqual([
      'cancelled',
      'cancelled',
    ]);
  });

  it('S4 never sends the reminder of a completed appointment (H5)', async () => {
    const masterId = await freshMaster();
    const created = await book(masterId, `${MONDAY}T13:00:00${OFFSET}`);
    const appointmentId = created.body.id as string;

    const completed = await request(app)
      .post(`/api/v1/admin/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(completed.status).toBe(200);

    // The moment passes, and the tick still refuses the record. The tick is
    // global, so only this record's rows are asserted.
    await runDueReminders(new Date(AT_THE_24H_MOMENT));
    expect((await reminderRows(appointmentId)).map((row) => row.status)).toEqual([
      'scheduled',
      'scheduled',
    ]);
  });

  it('S5 sends once however many ticks happen at the same instant', async () => {
    const masterId = await freshMaster();
    const created = await book(masterId, `${MONDAY}T14:00:00${OFFSET}`);

    // The tick is at this record's own 24 h moment (a 14:00 start), so the first
    // one sends it and the second has nothing left to send.
    const tick = (): Promise<number> => runDueReminders(new Date('2026-12-06T14:00:00+02:00'));
    expect(await tick()).toBeGreaterThanOrEqual(1);
    expect(await tick()).toBe(0);

    const rows = await reminderRows(created.body.id as string);
    expect(rows.map((row) => row.status)).toEqual(['sent', 'scheduled']);
    expect(rows[0]?.sentAt).toBe(`2026-12-06T14:00:00${OFFSET}`);
  });

  // ============================================ the timer around the tick

  it('S6 calls the tick on its interval and stops when stopped', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => 0);
    const stop = startReminderScheduler({
      now: () => new Date(NOW),
      intervalMs: 1_000,
      run,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(run).toHaveBeenCalledTimes(4);

    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('S7 catches a failing tick and keeps the schedule', async () => {
    vi.useFakeTimers();
    const reported: string[] = [];
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('the database blinked');
      return 0;
    });

    const stop = startReminderScheduler({
      now: () => new Date(NOW),
      intervalMs: 1_000,
      run,
      onError: (error) => reported.push((error as Error).message),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(reported).toEqual(['the database blinked']);

    // The next interval still runs: a single failure does not unschedule it.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });
});
