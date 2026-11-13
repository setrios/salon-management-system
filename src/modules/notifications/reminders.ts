/**
 * The reminder engine — the 24 h and 2 h reminders as stored rows.
 *
 * REQ-F-010 schedules a reminder 24 hours before the appointment and REQ-F-011
 * one 2 hours before. Since S3.2 each is a `notifications` row (H1): the SRS
 * says "recorded", SCN-11 says "recorded as `scheduled`", and the table already
 * carries `scheduled_at`, `sent_at` and the two `event_type` values.
 *
 * This file is the pure half: the two rows a `startAt` implies, the contract's
 * view of them, and the predicate that says whether a row is due. The
 * statements that write and read them are `service.ts`'s, and the dispatch is
 * one `update` there (H3).
 *
 * **The skip decision is made when the `startAt` is set** (H2), not when the
 * reminder is read: a moment that was already past at booking or reschedule is
 * `skipped` and stays `skipped` (H4). A `scheduled` row whose moment passes
 * becomes `sent` on the next read (H3).
 *
 * **A cancelled record's rows are settled at cancellation** (addendum 001,
 * REQ-F-034, `cancellation.ts`): `scheduled` becomes `cancelled`, and `isDue`
 * below already ignores anything that is not `scheduled`, so the dispatch needs
 * no new branch. `sent` and `skipped` are history and keep their value.
 *
 * Source: REQ-F-010, REQ-F-011, REQ-F-029; SCN-04, SCN-05, SCN-11;
 *         `openapi.yaml` `Reminder` (`type` ∈ {24h, 2h}, `status` ∈
 *         {scheduled, skipped, sent, failed, cancelled}), `Notification`;
 *         decisions H1–H6 (S3.2 inventory).
 */

import { salonDateTime } from '../../lib/occupancy.js';

/** `Reminder.type` as the contract enumerates it. */
export type ReminderType = '24h' | '2h';

/**
 * `Reminder.status` as the contract enumerates it.
 *
 * `cancelled` is addendum 001 (REQ-F-034): the appointment was cancelled while
 * this reminder was still `scheduled`. It is not `skipped` — that value means
 * the moment had already passed when the record was written, and it is decided
 * at booking or reschedule, not by a later transition.
 */
export type ReminderStatus = 'scheduled' | 'sent' | 'skipped' | 'failed' | 'cancelled';

/** One reminder as the engine and the table hold it. */
export interface ReminderRow {
  readonly type: ReminderType;
  readonly scheduledAt: Date;
  readonly status: ReminderStatus;
}

/** `Reminder` as the contract exposes it. */
export interface ReminderView {
  readonly type: ReminderType;
  readonly scheduledAt: string;
  readonly status: ReminderStatus;
}

/** Minutes ahead of the appointment at which each reminder is due. */
const REMINDER_OFFSETS: readonly { type: ReminderType; minutesBefore: number }[] = [
  // 24 h first: the contract's example lists it first, and a client reading the
  // array in order sees the reminders in the order they occur.
  { type: '24h', minutesBefore: 24 * 60 },
  { type: '2h', minutesBefore: 2 * 60 },
];

/** The `event_type` a reminder of this type is stored under. */
export function eventTypeOf(type: ReminderType): 'reminder_24h' | 'reminder_2h' {
  return type === '24h' ? 'reminder_24h' : 'reminder_2h';
}

/**
 * The `event_type` values a reminder is stored under, derived from the offsets
 * above so the two cannot drift: a new reminder moment adds its event type here
 * without a second list having to be remembered.
 */
export const REMINDER_EVENT_TYPES: readonly string[] = REMINDER_OFFSETS.map(({ type }) =>
  eventTypeOf(type),
);

/** The reminder type an `event_type` names, or `undefined` for any other row. */
export function reminderTypeOf(eventType: string): ReminderType | undefined {
  if (eventType === 'reminder_24h') return '24h';
  if (eventType === 'reminder_2h') return '2h';
  return undefined;
}

/**
 * The two rows a `startAt` implies, as of `now`.
 *
 * Both are always present: `Appointment.reminders[]` has no `minItems`, but the
 * contract's example and SCN-01 both show two, and a client needs to know the
 * 24-hour reminder was skipped rather than never considered.
 */
export function reminderRowsFor(startAt: Date, now: Date): ReminderRow[] {
  return REMINDER_OFFSETS.map(({ type, minutesBefore }) => {
    const moment = new Date(startAt.getTime() - minutesBefore * 60_000);
    return {
      type,
      scheduledAt: moment,
      status: moment.getTime() <= now.getTime() ? 'skipped' : 'scheduled',
    };
  });
}

/**
 * True when a `scheduled` row's moment has passed and it is due to be sent.
 *
 * A `skipped` row is never due (H4): the moment was already past when the
 * record was written, so there was nothing to send. A `cancelled` row is never
 * due for a different reason — the appointment no longer exists as a service to
 * remind anyone about — and the same `status === 'scheduled'` test covers both
 * without a second branch.
 */
export function isDue(row: ReminderRow, now: Date): boolean {
  return row.status === 'scheduled' && row.scheduledAt.getTime() <= now.getTime();
}

/** The contract's view of the rows, in the order the engine holds them. */
export function reminderViews(rows: readonly ReminderRow[]): ReminderView[] {
  return rows.map((row) => ({
    type: row.type,
    scheduledAt: salonDateTime(row.scheduledAt),
    status: row.status,
  }));
}
