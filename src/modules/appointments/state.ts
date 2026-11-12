/**
 * Appointment state transitions — the table of `error-model.md` §3.1, and
 * nothing else.
 *
 * The document calls that table "the authority for negative scenarios SCN-07
 * and the state rules in D15":
 *
 *   | current   | cancel              | complete            | edit (PATCH)        |
 *   |-----------|---------------------|---------------------|---------------------|
 *   | confirmed | 200 → cancelled     | 200 → completed     | 200, recalculated   |
 *   | completed | 409 INVALID_STATE…  | 200, unchanged      | 409 INVALID_STATE…  |
 *   | cancelled | 200, unchanged      | 409 INVALID_STATE…  | 409 INVALID_STATE…  |
 *
 * **This module is pure by construction** (gate SMS-27 §1.3): it holds the table
 * and one lookup function. No I/O, no database, no clock, and no import from
 * `src/db/`. A route that wants an answer calls `stateOutcome` and maps the
 * result to a status and a body; the mapping belongs to the route, not here.
 *
 * Only the `cancel` column is used by S2.3 (P10). The other columns are here
 * because the table is one table: `complete` is R23 (S5.3 / SMS-34) and `edit`
 * is R22 (S5.1 / SMS-32), and splitting the table by stage would be three
 * copies of one normative source.
 *
 * Source: `error-model.md` §3.1; REQ-F-006, REQ-F-027; D15.
 */

/** The three statuses the contract's `Appointment.status` enum declares. */
export type AppointmentStatus = 'confirmed' | 'completed' | 'cancelled';

/** The three actions the §3.1 table has a column for. */
export type StateAction = 'cancel' | 'complete' | 'edit';

/**
 * One cell of the table.
 *
 *   - `transition` — 200, and the stored status becomes `to`. The caller writes.
 *   - `unchanged`  — 200, and the stored record is already in that state. The
 *     caller reads and answers; it must not write (F5: a repeat cancellation
 *     writes no `updated_at`).
 *   - `allowed`    — 200 and no state rule applies; the operation does its own
 *     work (`edit` on a `confirmed` record recalculates and rewrites it).
 *   - `rejected`   — 409 `INVALID_STATE_TRANSITION`, and nothing is written.
 */
export type StateOutcome =
  | { readonly kind: 'transition'; readonly to: AppointmentStatus }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'allowed' }
  | { readonly kind: 'rejected'; readonly code: 'INVALID_STATE_TRANSITION' };

const REJECTED = { kind: 'rejected', code: 'INVALID_STATE_TRANSITION' } as const;

/**
 * `error-model.md` §3.1, cell for cell.
 *
 * `satisfies` rather than an annotation, so a mistyped status or action is a
 * compile error and the literal types stay narrow.
 */
const STATE_TABLE = {
  confirmed: {
    cancel: { kind: 'transition', to: 'cancelled' },
    complete: { kind: 'transition', to: 'completed' },
    edit: { kind: 'allowed' },
  },
  completed: {
    cancel: REJECTED,
    complete: { kind: 'unchanged' },
    edit: REJECTED,
  },
  cancelled: {
    cancel: { kind: 'unchanged' },
    complete: REJECTED,
    edit: REJECTED,
  },
} as const satisfies Record<AppointmentStatus, Record<StateAction, StateOutcome>>;

/** Whether a value is one of the three statuses the table knows. */
export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return value === 'confirmed' || value === 'completed' || value === 'cancelled';
}

/**
 * The §3.1 outcome for a current status and an action.
 *
 * The caller has already established that `status` is one the table knows (it
 * reads a column with `appointments_status_check` behind it); `isAppointmentStatus`
 * is the guard that carries that from the database into the type system.
 */
export function stateOutcome(status: AppointmentStatus, action: StateAction): StateOutcome {
  return STATE_TABLE[status][action];
}
