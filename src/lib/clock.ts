/**
 * The request clock — one place that answers "what time is it for this request?".
 *
 * `createApp({ now })` is the only place the application's clock enters (D9), so
 * every handler reads it the same way: the injected function when the
 * application has one, `new Date()` otherwise. The expression used to be written
 * out at each call site — fifteen copies of the same cast, each free to drift if
 * the injection point ever changes shape.
 *
 * Kept in `lib/` rather than beside a module because every module needs it and
 * none of them owns it. It is HTTP-scoped (it takes a `Request`) but has no
 * dependency beyond Express's type, so it adds nothing to the module graph.
 *
 * Source: D9 (the injected clock), H3 (a read is what dispatches reminders).
 */

import type { Request } from 'express';

/** The instant this request is acting at. */
export function nowOf(req: Request): Date {
  const clock = req.app.locals.now as (() => Date) | undefined;
  return clock?.() ?? new Date();
}
