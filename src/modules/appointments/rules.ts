/**
 * Booking rules — the checks that sit between the request body and storage.
 *
 * Three things a body can get wrong that its schema cannot express, each with a
 * decided answer (`logs/tdd/tdd-SMS-25.md` §5):
 *
 *   - **The boundary (D3).** `AppointmentCreate.startAt` is described as "Must
 *     fall on a 30-minute boundary (REQ-NF-008)." A start off the boundary is
 *     422 `BUSINESS_RULE_VIOLATION`, not 409: it never becomes bookable, while
 *     409 invites a retry with another slot.
 *   - **The bookable master and the offered services (D4, D5).** P8 declares no
 *     404, so an unknown master id, an inactive master, an unknown service id, a
 *     deactivated service and a service the master does not offer are all 422
 *     `BUSINESS_RULE_VIOLATION` — the body is schema-valid and breaks a rule.
 *   - **Duplicate service ids (D8).** There is deliberately no rule. The schema
 *     declares `minItems: 1`, `maxItems: 20` and no `uniqueItems`, so a repeated
 *     id is a permitted body; REQ-F-001's "sum of the selected services" is read
 *     literally, so a repeat produces two lines and counts twice.
 *
 * The functions here are pure: they take what the database returned and answer a
 * question. The reads live in `service.ts`; the status mapping lives in
 * `routes.ts`.
 *
 * Source: REQ-F-001, REQ-F-002, REQ-F-031, REQ-NF-008; `openapi.yaml`
 *         `AppointmentCreate`, P8's declared responses (400, 409, 422, 415,
 *         500); `error-model.md` §3.
 */

import {
  SLOT_GRANULARITY_MINUTES,
  minutesOnDate,
  salonDateOfInstant,
} from '../../lib/occupancy.js';

/**
 * True when `startAt` does not fall on a 30-minute boundary of the salon's own
 * wall clock (REQ-NF-008).
 *
 * The boundary is a salon fact, so it is tested in salon minutes, not in UTC
 * minutes: `10:00+02:00` and `12:00+02:00` are both on a boundary, and a UTC
 * computation would agree for Kyiv's whole-hour offsets only by luck.
 */
export function offBoundary(startAt: Date): boolean {
  const minutes = minutesOnDate(salonDateOfInstant(startAt), startAt);
  return (
    ((minutes % SLOT_GRANULARITY_MINUTES) + SLOT_GRANULARITY_MINUTES) % SLOT_GRANULARITY_MINUTES !==
    0
  );
}

/**
 * True when a requested start is not in the future (CL-11).
 *
 * The boundary is `<=`, not `<`: a start that is not in the future is refused.
 * With `<`, booking at 09:00 when it is 09:00 would be allowed — a client
 * booking a slot that has already begun.
 *
 * **One rule, one place.** P8 (`createAppointment`) and P11
 * (`rescheduleAppointmentByToken`) both call this, so the two operations cannot
 * disagree about what "past" means. The clock is the injected one (D9), never
 * `Date.now()`.
 *
 * Source: CL-11 (`spec/api/clarifications.md`); `error-model.md` §3 (422
 *         `BUSINESS_RULE_VIOLATION`).
 */
export function startInPast(startAt: Date, now: Date): boolean {
  return startAt.getTime() <= now.getTime();
}

/** One requested service as the booking rule needs it. */
export interface BookableService {
  readonly id: string;
  readonly name: string;
  readonly baseDurationMinutes: number;
  readonly active: boolean;
  /** The link's price, or `undefined` when the master does not offer the service. */
  readonly priceAmountMinor: number | undefined;
  /** The link's currency; `Money.currency` is `UAH` today and comes from the link. */
  readonly currency: string;
  /** True when a link exists and is active. */
  readonly offered: boolean;
  /** True when the link exists but has been deactivated through R12. */
  readonly linkInactive: boolean;
}

/** Why a requested service cannot be booked, or `undefined` when it can. */
export function serviceRejection(service: BookableService | undefined): string | undefined {
  if (service === undefined) return 'No service is defined with this id.';
  if (!service.active) return 'The service is not active.';
  if (service.linkInactive || !service.offered) return 'This master does not offer the service.';
  return undefined;
}

/** The totals a booking records, derived once so the record and the check agree. */
export interface BookingTotals {
  readonly totalDurationMinutes: number;
  readonly occupiedDurationMinutes: number;
  readonly totalPriceAmountMinor: number;
}

/**
 * Sums the service lines and rounds the block once (REQ-F-001, REQ-F-031).
 *
 * The rounding is applied to the **sum**, not to each line: two 45-minute
 * services occupy 90 minutes, not 120 (R6). `totalDurationMinutes` keeps the
 * unrounded sum, because that is what the client asked for.
 */
export function totalsFor(services: readonly BookableService[]): BookingTotals {
  const total = services.reduce((sum, service) => sum + service.baseDurationMinutes, 0);
  const remainder = total % SLOT_GRANULARITY_MINUTES;
  const occupied = remainder === 0 ? total : total + (SLOT_GRANULARITY_MINUTES - remainder);

  const totalPriceAmountMinor = services.reduce(
    (sum, service) => sum + (service.priceAmountMinor ?? 0),
    0,
  );

  return {
    totalDurationMinutes: total,
    occupiedDurationMinutes: Math.max(occupied, SLOT_GRANULARITY_MINUTES),
    totalPriceAmountMinor,
  };
}
