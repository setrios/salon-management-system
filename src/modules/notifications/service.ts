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
 * **The preference statements are S4.1's** (I1–I11). `readPreferences` and
 * `setPreference` are M5 and M6; `recordAppointmentEvent` is the one place an
 * appointment event becomes rows for the master and the administrator, and
 * `listMyNotifications` is M7. The client's own rows are not written here: the
 * confirmation SMS (E2) and the reminders (H1) belong to the booking and the
 * reminder engine, and REQ-F-016 is about the master's notifications (I7).
 *
 * Source: REQ-F-005 (the record a successful booking leaves), REQ-F-009,
 *         REQ-F-010, REQ-F-011, REQ-F-023, REQ-F-029 (later stages' rows on the
 *         same table); `resource-model.md:264` (R24's response set), `:99`
 *         (`Notification` is a recorded message with audience, event type,
 *         channel and status); decisions E2–E4, H1–H6.
 */

import { and, asc, count, eq, exists, gte, inArray, lt, lte, sql } from 'drizzle-orm';

import { getDb, type Database } from '../../db/client.js';
import {
  appointments,
  masters,
  notificationPreferences,
  notifications,
} from '../../db/schema.js';
import { addCalendarDays, parseCalendarDate, salonInstant } from '../../lib/time.js';
import {
  enabledChannels,
  preferenceViews,
  type PreferenceChannel,
  type PreferenceEvent,
  type PreferenceView,
} from './preferences.js';
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

// ============================================ preferences (S4.1, I1–I11)

/**
 * The caller's six combinations, with the stored overrides applied (M5).
 *
 * A sparse table is read as a whole and filled by `preferenceViews`: the
 * caller's settings are six combinations, and the table is how some of them are
 * remembered (I2).
 */
export async function readPreferences(
  executor: Executor,
  principalId: string,
): Promise<PreferenceView[]> {
  const rows = await executor
    .select({
      channel: notificationPreferences.channel,
      eventType: notificationPreferences.eventType,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.principalId, principalId));

  return preferenceViews(rows);
}

/**
 * Changes exactly one combination (M6, I4).
 *
 * An upsert, not an insert: the unique index on the three columns is what makes
 * a second toggle of the same combination an update rather than a duplicate
 * row, and REQ-F-026 is what makes it touch nothing else.
 */
export async function setPreference(
  executor: Executor,
  principalId: string,
  input: {
    readonly channel: PreferenceChannel;
    readonly eventType: PreferenceEvent;
    readonly enabled: boolean;
  },
  now: Date,
): Promise<PreferenceView> {
  await executor
    .insert(notificationPreferences)
    .values({
      principalId,
      channel: input.channel,
      eventType: input.eventType,
      enabled: input.enabled,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.principalId,
        notificationPreferences.channel,
        notificationPreferences.eventType,
      ],
      set: { enabled: input.enabled, updatedAt: now },
    });

  return {
    channel: input.channel,
    eventType: input.eventType,
    enabled: input.enabled,
  };
}

/**
 * Writes the rows one appointment event implies for the master and the
 * administrator (REQ-F-016, REQ-F-023; I5, I8).
 *
 * One row per **enabled** channel: a combination that is off contributes no
 * channel, so no row is written for it. That is REQ-F-016's AC read literally,
 * and it is why the rows are written per preference rather than written and
 * filtered on read — a row that exists is a message that was handed to the
 * channel.
 *
 * `actor` is the principal that caused the event. S4.1's three call sites all
 * pass `client`; S5.1's administrator paths pass `admin`, and the suppression
 * REQ-F-030 asks for is the `actor !== 'admin'` guard below. It is a parameter
 * from the start so the rule lives in one place rather than in each route.
 *
 * Runs on the caller's executor, so a booking that fails writes no notification.
 */
export async function recordAppointmentEvent(
  executor: Executor,
  input: {
    readonly appointmentId: string;
    readonly eventType: PreferenceEvent;
    readonly actor: 'client' | 'admin';
    readonly now: Date;
  },
): Promise<void> {
  const [appointment] = await executor
    .select({ masterId: appointments.masterId })
    .from(appointments)
    .where(eq(appointments.id, input.appointmentId));
  if (appointment === undefined) return;

  const [administrator] = await executor
    .select({ id: masters.id })
    .from(masters)
    .where(eq(masters.role, 'admin'));

  const rows: {
    appointmentId: string;
    audience: string;
    eventType: string;
    channel: string;
    status: string;
    sentAt: Date;
  }[] = [];

  const masterChannels = enabledChannels(
    await readPreferences(executor, appointment.masterId),
    input.eventType,
  );
  for (const channel of masterChannels) {
    rows.push({
      appointmentId: input.appointmentId,
      audience: 'master',
      eventType: input.eventType,
      channel,
      status: 'sent',
      sentAt: input.now,
    });
  }

  // REQ-F-030: the administrator is not notified about their own action. The
  // master's rows above are unaffected, which is the second half of the AC.
  if (administrator !== undefined && input.actor !== 'admin') {
    const adminChannels = enabledChannels(
      await readPreferences(executor, administrator.id),
      input.eventType,
    );
    for (const channel of adminChannels) {
      rows.push({
        appointmentId: input.appointmentId,
        audience: 'admin',
        eventType: input.eventType,
        channel,
        status: 'sent',
        sentAt: input.now,
      });
    }
  }

  if (rows.length > 0) await executor.insert(notifications).values(rows);
}

/** M7's filters, as the contract declares them. */
export interface MyNotificationFilters {
  readonly status?: string;
  readonly eventType?: string;
  readonly from?: string;
  readonly to?: string;
}

/**
 * One page of the caller's own records (M7, I9–I11).
 *
 * "The caller's rows" is derived, not stored: the table carries no principal
 * column, so a master's list is the `audience = 'master'` rows of appointments
 * assigned to them, and the administrator's is the `audience = 'admin'` rows.
 * The join is always present — the administrator's rows are joined too, and the
 * predicate simply does not narrow by master.
 *
 * `from` and `to` filter on `created_at`, inclusive of the whole day: it is the
 * only column every row has, since `scheduled_at` is null for the confirmation
 * and the reschedule rows (I10).
 */
export async function listMyNotifications(
  principal: { readonly id: string; readonly role: string },
  filters: MyNotificationFilters,
  limit: number,
  offset: number,
): Promise<NotificationPageResult> {
  const db = getDb();
  const isAdmin = principal.role === 'admin';

  const conditions = [eq(notifications.audience, isAdmin ? 'admin' : 'master')];
  if (!isAdmin) conditions.push(eq(appointments.masterId, principal.id));
  if (filters.status !== undefined) {
    conditions.push(eq(notifications.status, filters.status));
  }
  if (filters.eventType !== undefined) {
    conditions.push(eq(notifications.eventType, filters.eventType));
  }

  const from = filters.from === undefined ? null : parseCalendarDate(filters.from);
  if (from !== null) {
    conditions.push(gte(notifications.createdAt, new Date(salonInstant(from, 0))));
  }

  const to = filters.to === undefined ? null : parseCalendarDate(filters.to);
  if (to !== null) {
    conditions.push(
      lt(notifications.createdAt, new Date(salonInstant(addCalendarDays(to, 1), 0))),
    );
  }

  const where = and(...conditions);

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
    .innerJoin(appointments, eq(notifications.appointmentId, appointments.id))
    .where(where)
    .orderBy(asc(notifications.createdAt), asc(notifications.id))
    .limit(limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: count() })
    .from(notifications)
    .innerJoin(appointments, eq(notifications.appointmentId, appointments.id))
    .where(where);

  return { items: rows, total: Number(totals?.total ?? 0) };
}
