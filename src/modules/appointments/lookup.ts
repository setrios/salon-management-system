/**
 * The 404s of the appointment operations, written once.
 *
 * Six handlers answer "no such appointment" — three by access token (P9, P10,
 * P11) and three by id (R20, R21, R22, R23, R27). Each used to construct its own
 * `HttpProblem` with its own copy of the message, so a change of wording was six
 * edits and five chances to miss one, and the two messages were free to drift
 * apart in punctuation without any test noticing.
 *
 * A factory rather than a shared constant: an `Error` carries a stack trace and
 * is thrown at most once, so reusing one instance across requests would make the
 * trace point at the first caller. Each call is a fresh problem.
 *
 * Source: error-model.md §3 (`404 NOT_FOUND`), P9/P10/P11 and R20–R23/R27.
 * Ticket: SMS-46 (refactoring, §9).
 */

import { HttpProblem } from '../../middleware/error-handler.js';

/** P9, P10 and P11: the token names no appointment. */
export function appointmentNotFoundForToken(): HttpProblem {
  return new HttpProblem('NOT_FOUND', 'No appointment exists for the supplied access token.');
}

/** R20–R23 and R27: the id names no appointment. */
export function appointmentNotFoundForId(): HttpProblem {
  return new HttpProblem('NOT_FOUND', 'No appointment exists with the supplied id.');
}
