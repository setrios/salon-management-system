/**
 * Notifications — database access for R24.
 *
 * R24 lists the message records of one appointment. It reads what the operations
 * that cause messages wrote (S2.2 writes the booking confirmation; S2.3 writes
 * the cancellation alert, S3.1 the reschedule message, S4.1 the preference-driven
 * ones), so no rule lives here — only a paged read and an existence check that
 * tells an unknown appointment id from one with no messages yet.
 *
 * `Notification` in the contract has optional `scheduledAt` and `sentAt`, and
 * both are optional here too: a `sent` record carries `sentAt` and no moment to
 * come, a `scheduled` one (SMS-29) carries the reverse.
 *
 * Source: REQ-F-005 (the record a successful booking leaves), REQ-F-009,
 *         REQ-F-023, REQ-F-029 (later stages' rows on the same table);
 *         `resource-model.md:264` (R24's response set), `:99` (`Notification` is
 *         a recorded message with audience, event type, channel and status);
 *         decisions E2–E4.
 */

import { asc, count, eq } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { appointments, notifications } from '../../db/schema.js';

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
