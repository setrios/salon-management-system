/**
 * Reminders — the two moments an appointment implies, computed at read time.
 *
 * REQ-F-010 schedules a reminder 24 hours before the appointment and REQ-F-011
 * one 2 hours before. Neither is a stored row at S2.1 (decision D6): nothing
 * dispatches a message yet, so a stored row would be a row nothing reads, and
 * the dispatch engine (SMS-29) decides what to persist when it exists.
 *
 * What is decided here is the **skip rule**: a reminder whose moment is already
 * past is reported `skipped`, not scheduled retroactively (REQ-F-010: "a
 * reminder whose scheduled time is already past is skipped"). "Already past" is
 * measured against the injected clock (D9), not `Date.now()`, so a test fixes
 * "now" and the answer is the same on any day.
 *
 * The consequence of computing on read is stated in the decision and repeated
 * here because it is visible in the API: the same appointment read later can
 * report a different status once the moment has passed. That is intended at this
 * stage; S2.2/S4 replace it with stored state.
 *
 * Source: REQ-F-010, REQ-F-011; `openapi.yaml` `Reminder`
 *         (`type` ∈ {24h, 2h}, `status` ∈ {scheduled, skipped, sent, failed}).
 */

import { salonDateTime } from '../../lib/occupancy.js';

/** `Reminder.type` as the contract enumerates it. */
export type ReminderType = '24h' | '2h';

/** `Reminder.status` as the contract enumerates it. */
export type ReminderStatus = 'scheduled' | 'skipped' | 'sent' | 'failed';

/** `Reminder` as the contract exposes it. */
export interface ReminderView {
  type: ReminderType;
  scheduledAt: string;
  status: ReminderStatus;
}

/** Minutes ahead of the appointment at which each reminder is due. */
const REMINDER_OFFSETS: readonly { type: ReminderType; minutesBefore: number }[] = [
  // 24 h first: the contract's example lists it first, and a client reading the
  // array in order sees the reminders in the order they occur.
  { type: '24h', minutesBefore: 24 * 60 },
  { type: '2h', minutesBefore: 2 * 60 },
];

/**
 * The two reminders for an appointment starting at `startAt`, as of `now`.
 *
 * Both are always present: `Appointment.reminders[]` has no `minItems`, but the
 * contract's example and SCN-01 both show two, and a client needs to know the
 * 24-hour reminder was skipped rather than never considered. Whether a skipped
 * reminder is *omitted* is a later stage's decision; at S2.1 the status carries
 * the fact.
 */
export function remindersFor(startAt: Date, now: Date): ReminderView[] {
  return REMINDER_OFFSETS.map(({ type, minutesBefore }) => {
    const moment = new Date(startAt.getTime() - minutesBefore * 60_000);
    return {
      type,
      scheduledAt: salonDateTime(moment),
      status: moment.getTime() <= now.getTime() ? 'skipped' : 'scheduled',
    };
  });
}
