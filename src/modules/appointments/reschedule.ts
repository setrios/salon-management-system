/**
 * The reschedule decision — what P11 does with a record and a body, before any
 * write.
 *
 * P11 (`rescheduleAppointmentByToken`) updates the **same** record: same `id`,
 * same `accessToken`, no new appointment (SRS v1.3:371). The decision is pure:
 * it takes the stored record, the request, the injected clock and the new
 * master's links, and answers either a refusal or the values to write. The reads
 * live in `service.ts`; the status mapping lives in `routes.ts`.
 *
 * **The order of the checks is the design** (gate SMS-28 §3):
 *
 *   1. **The state** — `state.ts`'s `edit` column (`error-model.md` §3.1). A
 *      `cancelled` or `completed` record is 409 `INVALID_STATE_TRANSITION`
 *      whatever the body says. The table is not restated here: `stateOutcome`
 *      is the one normative source (G2).
 *   2. **The past** — `startInPast` (CL-11, G1). A start at or before the clock
 *      is 422 `BUSINESS_RULE_VIOLATION`. It precedes the slot check: a past
 *      start inside a free window is the body's fault, not the calendar's. The
 *      check applies only when the request supplies a start: R21 may edit the
 *      master or the services of a record whose stored time has passed (L4).
 *   3. **The master** — a supplied `masterId` that differs must name a bookable
 *      master: active and role `master`, P8's rule (D4, G4). Otherwise 422.
 *   4. **The coverage** — the new master must offer every service of the record
 *      (G4). Otherwise 422.
 *   5. **The price** — when the master changes, the lines are re-priced from the
 *      new master's links and `totalPrice` follows (G8). When it does not, the
 *      snapshot is untouched.
 *
 * The slot check is **not** here: it is the only answer that can change between
 * the check and the write, so it runs inside the transaction under the advisory
 * lock on `master_id` (D2, G5), in `service.ts`.
 *
 * **The service set and the duration do not change** for P11 (G3):
 * `AppointmentReschedule` has no `serviceIds`, and the block is the stored
 * `occupiedDurationMinutes`. R21 (S5.1b, L4) does change them; it passes the
 * re-derived lines and the re-derived block as `current`, so this decision still
 * sees one record and one block and needs no second copy of the rules.
 *
 * Source: REQ-F-007, REQ-F-008, REQ-F-009, REQ-F-028, REQ-F-029; SRS v1.3:371;
 *         SCN-03, SCN-11; `error-model.md` §3, §3.1; `openapi.yaml`
 *         `AppointmentReschedule`, P11's declared responses, `AppointmentPatch`;
 *         CL-11, CL-12; decisions G1–G10, K3, K4, L1, L4.
 */

import { serviceRejection, startInPast, type BookableService } from './rules.js';
import { isAppointmentStatus, stateOutcome } from './state.js';
import type { AppointmentLine } from './view.js';

/** The stored record, as the decision needs it. */
export interface RescheduleCurrent {
  readonly status: string;
  readonly masterId: string;
  /** The stored start: the effective one when a request does not move the time. */
  readonly startAt: Date;
  readonly occupiedDurationMinutes: number;
  readonly totalPriceAmountMinor: number;
  readonly totalPriceCurrency: string;
  readonly lines: readonly AppointmentLine[];
}

/**
 * The body, as `AppointmentReschedule` declares it (closed, D-22), plus R21's
 * optional time.
 *
 * P11 always names `startAt` (`AppointmentReschedule` requires it). R21 may omit
 * it — an edit of the master, the service set or the client — and then the
 * decision keeps the stored start (L4, K4).
 */
export interface RescheduleRequest {
  readonly startAt?: Date;
  /** Omitted means "keep the current master" (the schema's own words). */
  readonly masterId?: string;
}

/** The master a supplied `masterId` names, or `undefined` when it names none. */
export interface RescheduleMaster {
  readonly id: string;
  readonly fullName: string;
  readonly active: boolean;
  readonly role: string;
}

/** What P11 should do: refuse, or move the record to these values. */
export type RescheduleDecision =
  | {
      readonly kind: 'rejected';
      readonly code: 'INVALID_STATE_TRANSITION' | 'BUSINESS_RULE_VIOLATION';
      readonly detail: string;
    }
  | {
      readonly kind: 'move';
      readonly masterId: string;
      readonly startAt: Date;
      readonly endAt: Date;
      readonly lines: readonly AppointmentLine[];
      /** True when the master changed, so the line prices follow the new links. */
      readonly reprice: boolean;
      readonly totalPriceAmountMinor: number;
      readonly totalPriceCurrency: string;
    };

/**
 * The decision for one reschedule.
 *
 * `newMaster` and `newMasterServices` are read by the caller only when the body
 * names a master; the decision ignores them when the master does not change, so
 * a record whose own master has since been deactivated can still be moved in
 * time (G4 applies to a change, not to the record's existing master).
 */
export function rescheduleDecision(
  current: RescheduleCurrent,
  request: RescheduleRequest,
  now: Date,
  newMaster: RescheduleMaster | undefined,
  newMasterServices: ReadonlyArray<BookableService | undefined>,
): RescheduleDecision {
  // The column has `appointments_status_check` behind it, so a value outside the
  // enum is a broken invariant, not a client mistake: it becomes a 500 rather
  // than a status the contract does not define.
  if (!isAppointmentStatus(current.status)) {
    throw new Error(`appointment status "${current.status}" is not defined by error-model.md §3.1`);
  }

  // 1. The state (G2). `edit` on `confirmed` is `allowed`; on `completed` and
  //    `cancelled` it is `rejected` with the contract's code.
  const state = stateOutcome(current.status, 'edit');
  if (state.kind === 'rejected') {
    return {
      kind: 'rejected',
      code: state.code,
      detail: 'A cancelled or completed appointment cannot be rescheduled.',
    };
  }

  // 2. The past (CL-11, G1). The body is wrong; the calendar is not. Only a
  //    supplied start can be in the past: R21 may edit the master or the
  //    services of a record whose stored time has already passed (L4).
  if (request.startAt !== undefined && startInPast(request.startAt, now)) {
    return {
      kind: 'rejected',
      code: 'BUSINESS_RULE_VIOLATION',
      detail: 'startAt must be in the future.',
    };
  }

  const startAt = request.startAt ?? current.startAt;

  // G3: the block is the stored one, so the end follows from the new start.
  const endAt = new Date(startAt.getTime() + current.occupiedDurationMinutes * 60_000);

  // The master does not change: the snapshot is untouched (G8).
  if (request.masterId === undefined || request.masterId === current.masterId) {
    return {
      kind: 'move',
      masterId: current.masterId,
      startAt,
      endAt,
      lines: current.lines,
      reprice: false,
      totalPriceAmountMinor: current.totalPriceAmountMinor,
      totalPriceCurrency: current.totalPriceCurrency,
    };
  }

  // 3. The master (G4, D4): active and role `master`, or 422.
  if (newMaster === undefined || newMaster.role !== 'master' || !newMaster.active) {
    return {
      kind: 'rejected',
      code: 'BUSINESS_RULE_VIOLATION',
      detail: 'The requested master is not bookable.',
    };
  }

  // 4. The coverage (G4): every service of the record must be offered by the
  //    new master. `serviceRejection` is P8's rule, not a second copy.
  for (const service of newMasterServices) {
    const rejection = serviceRejection(service);
    if (rejection !== undefined) {
      return { kind: 'rejected', code: 'BUSINESS_RULE_VIOLATION', detail: rejection };
    }
  }

  // 5. The price (G8): the new master's link, not the old snapshot.
  const priceByService = new Map<string, { amountMinor: number; currency: string }>();
  for (const service of newMasterServices) {
    if (service === undefined) continue;
    priceByService.set(service.id, {
      amountMinor: service.priceAmountMinor ?? 0,
      currency: service.currency,
    });
  }

  const lines = current.lines.map((line) => {
    const price = priceByService.get(line.serviceId);
    if (price === undefined) {
      // The caller resolved exactly the record's service ids, so a miss is a
      // broken invariant, not a client mistake.
      throw new Error(`service ${line.serviceId} was not resolved for master ${newMaster.id}`);
    }
    return {
      ...line,
      priceAmountMinor: price.amountMinor,
      priceCurrency: price.currency,
    };
  });

  return {
    kind: 'move',
    masterId: newMaster.id,
    startAt,
    endAt,
    lines,
    reprice: true,
    totalPriceAmountMinor: lines.reduce((sum, line) => sum + line.priceAmountMinor, 0),
    totalPriceCurrency: lines[0]?.priceCurrency ?? current.totalPriceCurrency,
  };
}
