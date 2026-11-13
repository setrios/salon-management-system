/**
 * Addendum 001 — settling the reminders of a cancelled appointment (REQ-F-034).
 *
 * SRS v1.3 says when a reminder row is written and when one is `skipped` at
 * booking, and nothing about what a cancellation does to a row that is still
 * `scheduled`. The addendum settles it: those rows become `cancelled`, and a row
 * that already happened — `sent`, `skipped`, `failed` — keeps its status.
 *
 * **Why this is its own module rather than three lines in `service.ts`.** The
 * settlement has one rule (*only* `scheduled` rows) and two callers (the client's
 * P10 and the administrator's R22). Written twice, the two cancellation paths
 * would be free to disagree about what happens to a reminder, and that
 * disagreement is exactly what this addendum exists to end. The statement lives
 * here; the callers decide *when* it runs, never *what* it does.
 *
 * **The `where` clause is the rule, not an optimisation.** Rewriting only
 * `status = 'scheduled'` is what keeps `sent` and `skipped` intact — a blanket
 * `update` would rewrite the history of the appointment, which is the one thing
 * the addendum's second sentence forbids.
 *
 * **It writes nothing when there is nothing to settle**, so a repeat
 * cancellation (which does not even reach this code, F1) and a cancellation of a
 * record whose reminders were all `skipped` both leave the rows untouched.
 *
 * Source: addendum 001 (`spec/addenda/001-cancelled-reminders.md`, REQ-F-034);
 *         REQ-F-005, REQ-F-010, REQ-F-011 (when the rows are written);
 *         REQ-F-029 (the reactivation this rule must not disturb).
 * Contract: openapi.yaml#/components/schemas/Reminder (`status` ∈ {scheduled,
 *           skipped, sent, failed, cancelled}), Notification.
 * Ticket: SMS-45 (Addendum)
 */

import { and, eq } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { notifications } from '../../db/schema.js';
import type { ReminderStatus } from './reminders.js';
import type { Executor } from './service.js';

/** The status a cancelled appointment's unsent reminders take. */
export const CANCELLED_REMINDER_STATUS = 'cancelled' satisfies ReminderStatus;

/**
 * Rewrites one appointment's `scheduled` reminder rows to `cancelled`.
 *
 * Returns the number of rows the statement changed, so a caller can tell "there
 * was nothing pending" from "two rows settled" without a second read. The rows
 * are matched by appointment **and** status: the two reminder rows are not the
 * only notification rows an appointment may carry (the confirmation and the
 * cancellation messages are rows too, and they are never `scheduled`), so the
 * statement is safe for all of them.
 */
export async function settleCancelledReminders(
  appointmentId: string,
  executor: Executor = getDb(),
): Promise<number> {
  const settled = await executor
    .update(notifications)
    .set({ status: CANCELLED_REMINDER_STATUS })
    .where(
      and(
        eq(notifications.appointmentId, appointmentId),
        eq(notifications.status, 'scheduled'),
      ),
    )
    .returning({ id: notifications.id });

  return settled.length;
}
