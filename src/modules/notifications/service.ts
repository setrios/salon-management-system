/**
 * Notifications — database access for R24 and the reminder engine.
 *
 * R24 lists the message records of one appointment. It reads what the operations
 * that cause messages wrote (S2.2 writes the booking confirmation; S2.3 writes
 * the cancellation alert, S3.1 the reschedule message, S3.2 the two reminders,
 * S4.1 the preference-driven ones), so no rule lives here — only a paged read
 * and an existence check that tells an unknown appointment id from one with no
 * messages yet.
 *
 * `Notification` in the contract has optional `scheduledAt` and `sentAt`, and
 * both are optional here too: a `sent` record carries `sentAt` and no moment to
 * come, a `scheduled` one (SMS-29) carries the reverse.
 *
 * **The reminder statements are S3.2's** (H1–H6). The rows are written by the
 * booking transaction, recalculated by the reschedule transaction, and
 * dispatched by a read: `dispatchDueReminders` is the one `update` that turns a
 * due `scheduled` row into `sent`, and its `exists` clause is what keeps a
 * cancelled or completed record from being dispatched by any caller (H5).
 *
 * Source: REQ-F-005 (the record a successful booking leaves), REQ-F-009,
 *         REQ-F-010, REQ-F-011, REQ-F-023, REQ-F-029 (later stages' rows on the
 *         same table); `resource-model.md:264` (R24's response set), `:99`
 *         (`Notification` is a recorded message with audience, event type,
 *         channel and status); decisions E2–E4, H1–H6.
 */

import { and, asc, count, eq, exists, inArray, lte, sql } from 'drizzle-orm';

import { getDb, type Database } from '../../db/client.js';
import { appointments, notifications } from '../../db/schema.js';
import {
  eventTypeOf,
  isDue,
  reminderRowsFor,
  reminderTypeOf,
  type ReminderRow,
  type ReminderStatus,
} from './reminders.js';

/**
 * The executor a reminder statement runs on: the pool, or a transaction.
 *
 * The same shape `appointments/service.ts` uses, restated here so the
 * notifications module does not depend on the appointments one for a type.
 */
type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** One row of `NotificationPage.items`, as the contract exposes it. */
export interface NotificationView {
  readonly id: string;
  readonly appointmentId: string;
  readonly audience: string;
  readonly eventType: string;
  readonly channel: string;
  readonly status: string;
  readonly scheduledAt?: string;
  readonly sentAt?: string;
  readonly createdAt: string;
}

/** The paged result R24 answers with. */
export interface NotificationPageResult {
  readonly items: readonly {
    readonly id: string;
    readonly appointmentId: string;
    readonly audience: string;
    readonly eventType: string;
    readonly channel: string;
    readonly status: string;
    readonly scheduledAt: Date | null;
    readonly sentAt: Date | null;
    readonly createdAt: Date;
  }[];
  readonly total: number;
}

/** True when the id names an appointment; `false` is R24's 404. */
export async function appointmentExists(appointmentId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: appointments.id })
    .from(appointments)
    .where(eq(appointments.id, appointmentId));

  return row !== undefined;
}

/**
 * One page of an appointment's message records, oldest first.
 *
 * The order is by `created_at` then `id`: the first two records of one booking
 * can share an instant (E2 writes one; S4.1 may write more in the same
 * transaction), and a stable secondary key keeps a page reproducible. The total
 * is counted over the same predicate, not over the page, so `total` is what the
 * envelope means.
 */
export async function listNotifications(
  appointmentId: string,
  limit: number,
  offset: number,
): Promise<NotificationPageResult> {
  const db = getDb();

  const rows = await db
    .select({
      id: notifications.id,
      appointmentId: notifications.appointmentId,
      audience: notifications.audience,
      eventType: notifications.eventType,
      channel: notifications.channel,
      status: notifications.status,
      scheduledAt: notifications.scheduledAt,
      sentAt: notifications.sentAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.appointmentId, appointmentId))
    .orderBy(asc(notifications.createdAt), asc(notifications.id))
    .limit(limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: count() })
    .from(notifications)
    .where(eq(notifications.appointmentId, appointmentId));

  return { items: rows, total: Number(totals?.total ?? 0) };
}

// ============================================ the reminder engine (S3.2)

/**
 * Writes the two reminder rows a booking implies, inside the booking
 * transaction (H1, H2).
 *
 * The status is decided here, once: a moment that is already past is `skipped`
 * and never becomes `sent` (H4). `sent_at` stays null until the dispatch.
 */
export async function insertReminders(
  executor: Executor,
  appointmentId: string,
  startAt: Date,
  now: Date,
): Promise<ReminderRow[]> {
  const rows = reminderRowsFor(startAt, now);

  await executor.insert(notifications).values(
    rows.map((row) => ({
      appointmentId,
      audience: 'client',
      eventType: eventTypeOf(row.type),
      channel: 'sms',
      status: row.status,
      scheduledAt: row.scheduledAt,
    })),
  );

  // Returned so the booking's 201 body can carry them without a second read.
  return rows;
}

/**
 * Recalculates the two rows after a reschedule, in place (H6).
 *
 * The row is "the reminder for this appointment", so a reschedule rewrites it
 * rather than adding a third: SCN-11 speaks of one reminder being recorded
 * again, and R24 would otherwise grow on every reschedule. `sent_at` is cleared
 * because the new moment has not been sent.
 *
 * A record written before the engine has no rows; the reschedule is the moment
 * to create them, so a missing row is inserted rather than left absent.
 */
export async function recalculateReminders(
  executor: Executor,
  appointmentId: string,
  startAt: Date,
  now: Date,
): Promise<void> {
  for (const row of reminderRowsFor(startAt, now)) {
    const updated = await executor
      .update(notifications)
      .set({ status: row.status, scheduledAt: row.scheduledAt, sentAt: null })
      .where(
        and(
          eq(notifications.appointmentId, appointmentId),
          eq(notifications.eventType, eventTypeOf(row.type)),
        ),
      )
      .returning({ id: notifications.id });

    if (updated.length === 0) {
      await executor.insert(notifications).values({
        appointmentId,
        audience: 'client',
        eventType: eventTypeOf(row.type),
        channel: 'sms',
        status: row.status,
        scheduledAt: row.scheduledAt,
      });
    }
  }
}

/**
 * Turns the due `scheduled` rows of one appointment into `sent` (H3).
 *
 * The read is what triggers it: the lab has no scheduler, so the next read of
 * the appointment or of R24 is the moment the message is handed to the channel.
 * `sent_at` is that read's clock, not the moment the reminder was due — the row
 * records when the hand-off happened.
 *
 * The `exists` clause is H5: a cancelled or completed record is not dispatched,
 * whatever the caller does, so the rule is stated once rather than in four
 * places. The `status = 'scheduled'` guard makes a second read a no-op, which is
 * what keeps `sent_at` at the first read's instant (R10).
 *
 * Returns the number of rows dispatched, so a caller can skip a re-read.
 *
 * It takes the pool rather than an executor: a dispatch is never part of a
 * transaction. The booking and the reschedule write their rows inside theirs,
 * and a dispatch that ran inside one would be rolled back with it.
 */
export async function dispatchDueReminders(
  appointmentId: string,
  now: Date,
): Promise<number> {
  const db = getDb();

  const rows = await readReminders(db, appointmentId);
  if (!rows.some((row) => isDue(row, now))) return 0;

  const updated = await db
    .update(notifications)
    .set({ status: 'sent', sentAt: now })
    .where(
      and(
        eq(notifications.appointmentId, appointmentId),
        inArray(notifications.eventType, ['reminder_24h', 'reminder_2h']),
        eq(notifications.status, 'scheduled'),
        lte(notifications.scheduledAt, now),
        exists(
          db
            .select({ one: sql`1` })
            .from(appointments)
            .where(
              and(
                eq(appointments.id, appointmentId),
                eq(appointments.status, 'confirmed'),
              ),
            ),
        ),
      ),
    )
    .returning({ id: notifications.id });

  return updated.length;
}

/**
 * The two reminder rows of one appointment, in the order they occur.
 *
 * A row whose `event_type` is not a reminder is skipped, and so is one with no
 * `scheduled_at`: the engine writes both, so either would be a broken invariant
 * rather than a client mistake, and a read is not the place to raise it.
 */
export async function readReminders(
  executor: Executor,
  appointmentId: string,
): Promise<ReminderRow[]> {
  const rows = await executor
    .select({
      eventType: notifications.eventType,
      scheduledAt: notifications.scheduledAt,
      status: notifications.status,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.appointmentId, appointmentId),
        inArray(notifications.eventType, ['reminder_24h', 'reminder_2h']),
      ),
    )
    .orderBy(asc(notifications.scheduledAt));

  return rows.flatMap((row) => {
    const type = reminderTypeOf(row.eventType);
    if (type === undefined || row.scheduledAt === null) return [];
    // The table's CHECK constraint limits `status` to the four values the
    // contract enumerates, so the cast is the schema's guarantee, not a guess.
    return [{ type, scheduledAt: row.scheduledAt, status: row.status as ReminderStatus }];
  });
}
