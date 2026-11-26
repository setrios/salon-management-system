/**
 * The one statement that turns a due reminder into a sent one (H3, H5).
 *
 * **Why it is a module rather than a statement in each caller.** Two paths send
 * reminders: the read-triggered dispatch (`dispatchDueReminders`, which settles
 * the rows of the appointment a client has just read) and the scheduler's tick
 * (`runDueReminders`, which settles every appointment in one pass). The rule is
 * identical in both — the row is a reminder, it is still `scheduled`, its moment
 * has passed, and its own appointment is still `confirmed` — so the statement
 * lives here. Written twice, a change to the rule (a new event type, a different
 * guard) could land in one path and miss the other, and the read-triggered path
 * and the tick would disagree about which reminders are due.
 *
 * **The only difference between the callers is the scope**, and it is the third
 * argument: omitted means every appointment (the tick), a value means that one
 * appointment (the read). The `exists` clause stays correlated in both forms —
 * the row's own appointment is the one that must still be `confirmed` — so the
 * scoped form is the correlated form plus one condition, not a second statement.
 *
 * **The `where` clause is the guard, not an optimisation.** A row that has been
 * settled, skipped, cancelled or whose appointment was cancelled or completed is
 * outside the predicate, which is what makes a concurrent tick harmless: the
 * second pass updates nothing because the first one already moved the status.
 *
 * Source: REQ-F-010 (the reminder moments), REQ-F-029 (a record that is no longer
 *         `confirmed` is not dispatched); decisions H3, H4, H5;
 *         `resource-model.md:264` (R24's response set).
 * Ticket: SMS-49 (refactoring after addendum 001).
 */

import { and, eq, exists, inArray, lte, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { appointments, notifications } from '../../db/schema.js';
import { REMINDER_EVENT_TYPES } from './reminders.js';

/**
 * Marks every due reminder as `sent` at `now` and returns how many rows changed.
 *
 * `appointmentId` narrows the statement to one record; omitted, it covers every
 * appointment in the database, which is what the scheduler's tick needs.
 */
export async function markDueRemindersSent(
  db: Database,
  now: Date,
  appointmentId?: string,
): Promise<number> {
  const sent = await db
    .update(notifications)
    .set({ status: 'sent', sentAt: now })
    .where(
      and(
        ...(appointmentId === undefined ? [] : [eq(notifications.appointmentId, appointmentId)]),
        inArray(notifications.eventType, [...REMINDER_EVENT_TYPES]),
        eq(notifications.status, 'scheduled'),
        lte(notifications.scheduledAt, now),
        exists(
          db
            .select({ one: sql`1` })
            .from(appointments)
            .where(
              and(
                eq(appointments.id, notifications.appointmentId),
                eq(appointments.status, 'confirmed'),
              ),
            ),
        ),
      ),
    )
    .returning({ id: notifications.id });

  return sent.length;
}
