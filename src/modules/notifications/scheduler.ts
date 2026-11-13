/**
 * The reminder scheduler — the tick that makes REQ-F-010's "24 hours before"
 * true at the moment rather than at the next read.
 *
 * At S3.2 a reminder was dispatched by whatever read came next (H3): a row due
 * at 14:00 became `sent` when someone opened the appointment, which could be
 * minutes or days later. G3 recorded the gap (register row 11) and sent it to
 * stage R. This module is the fix, in two halves that are deliberately separate:
 *
 *   - `runDueReminders(now)` — the behaviour: one statement that sends every due
 *     reminder row of every **confirmed** appointment. It takes the clock, so it
 *     is tested without a timer and without waiting.
 *   - `startReminderScheduler(...)` — the shape: a `setInterval` around that
 *     function, with a stop function and an error hook. It owns no logic, so a
 *     timer bug cannot hide a behaviour bug.
 *
 * **Why one statement rather than a scan and a loop.** The `update` is the
 * decision: a row is sent if and only if it is `scheduled`, its moment has
 * passed, and its appointment is still `confirmed`. Two concurrent ticks cannot
 * double-send, because the first commits the row out of `scheduled` before the
 * second sees it — the same guard that makes a second read a no-op (R10).
 *
 * **The read-triggered dispatch stays.** `dispatchDueReminders` (H3) is still
 * correct and is still what runs when no scheduler is started (the test app, a
 * one-off script); the tick is an addition, not a replacement. Both write
 * `sent_at` the same way, so the suite's reminder cases cannot tell which one
 * sent a row — except that `sentAt` is the tick's instant rather than a read's.
 *
 * Source: REQ-F-005, REQ-F-010, REQ-F-011; H3 (dispatch on read), H5 (a
 *         non-confirmed record is never dispatched); G3 register row 11.
 * Ticket: SMS-46 (stage R).
 */

import { getDb } from '../../db/client.js';
import { markDueRemindersSent } from './dispatch.js';

/** How often the process ticks, and why. */
export const DEFAULT_REMINDER_INTERVAL_MS = 60_000;

/**
 * Sends every reminder that is due at `now`, for every confirmed appointment.
 *
 * Returns the number of rows sent, which is what the control run and the tests
 * assert on; a scheduler in production ignores it.
 *
 * **The statement is not written here** (SMS-49): the read-triggered dispatch
 * uses the same one, so the tick and a read cannot disagree about which rows are
 * due. This function is the tick's scope — every appointment — and nothing else.
 */
export async function runDueReminders(now: Date): Promise<number> {
  return markDueRemindersSent(getDb(), now);
}

/** What the scheduler needs to run: the clock, the period, and the tick. */
export interface ReminderSchedulerOptions {
  /** The clock to tick at — the process clock in production, a fixed one in tests. */
  readonly now: () => Date;
  /** The period between ticks, in milliseconds. */
  readonly intervalMs: number;
  /** The tick itself; defaults to `runDueReminders`. */
  readonly run?: (now: Date) => Promise<number>;
  /** Called with whatever a tick threw, so the process can log it. */
  readonly onError?: (error: unknown) => void;
}

/**
 * Starts the timer and returns the function that stops it.
 *
 * The first tick runs immediately rather than one interval later: a process that
 * has just started should not wait a minute to send what is already due. The
 * interval is `unref`ed so a short-lived process (a script that imports the app)
 * can still exit; `stop()` clears it and is what the shutdown path calls.
 *
 * A tick that throws is caught and reported through `onError`; the interval
 * survives, because one failed statement should not silence every reminder that
 * follows it. The tick is not awaited by the timer, so a slow tick cannot pile
 * up: the next interval starts its own, and the database's own guard (a row that
 * is no longer `scheduled`) makes the overlap harmless.
 */
export function startReminderScheduler(options: ReminderSchedulerOptions): () => void {
  const run = options.run ?? runDueReminders;
  const tick = (): void => {
    run(options.now()).catch((error: unknown) => {
      options.onError?.(error);
    });
  };

  tick();
  const timer = setInterval(tick, options.intervalMs);
  timer.unref();

  return (): void => {
    clearInterval(timer);
  };
}
