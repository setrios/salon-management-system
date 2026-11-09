/**
 * Availability arithmetic — pure functions over rules, not rows.
 *
 * Knows neither Express nor SQL. Three rules live here, each traceable to one
 * place in the specifications:
 *
 *   1. **Rounding (REQ-F-031).** A multi-service booking's summed duration is
 *      rounded *up* to the next 30-minute boundary for occupancy: 75 → 90, 90 →
 *      90, 45 → 60. `totalDurationMinutes` keeps the unrounded sum.
 *   2. **Boundary rule (REQ-NF-008).** No bookable start falls off a 30-minute
 *      boundary. The rule constrains *starts*, not windows, so a window opening
 *      at 10:15 offers its first start at 10:30 rather than being rejected.
 *   3. **Date override (REQ-F-015, SCN-09).** A `dates` rule *replaces* the
 *      weekly rule for its date; it does not add to it. A date with no rule of
 *      either kind offers nothing.
 *
 * What this file deliberately does **not** do, because the specifications do not:
 *
 *   - it does not subtract booked appointments (`appointments` arrives in S2.1;
 *     the SMS-15 gate §4.4 records that `available` is a constant at S1.3);
 *   - it does not reject or merge two windows on the same weekday. Union,
 *     intersection and rejection are all defensible and no document chooses
 *     (SMS-15 gate §5 G4). The one thing it *must* do to produce an answer is
 *     enumerate both, in the order the caller supplied them, de-duplicating
 *     identical starts; that choice is recorded in `logs/tdd/tdd-SMS-24.md` §11
 *     as a decision, not as a conclusion.
 *
 * Source: REQ-F-002 (a slot lies inside availability), REQ-F-015, REQ-F-031,
 *         REQ-NF-008, SCN-09, SCN-13; `spec/api/openapi.yaml`
 *         (`Availability`, `WeeklyRule`, `DateRule`, `AvailabilityResponse`,
 *         `AvailabilitySlot`).
 */

import {
  parseCalendarDate,
  parseWallClock,
  salonInstant,
  isoWeekday,
  type CalendarDate,
} from './time.js';

/** The granularity every bookable start falls on (`REQ-NF-008`). */
export const SLOT_GRANULARITY_MINUTES = 30;

/** One weekly rule as the contract writes it. */
export interface WeeklyRuleInput {
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly endTime: string;
}

/** One date rule as the contract writes it. */
export interface DateRuleInput {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}

/** `Availability` as the contract writes it. */
export interface AvailabilityInput {
  readonly weekly: readonly WeeklyRuleInput[];
  readonly dates: readonly DateRuleInput[];
}

/** `AvailabilitySlot` as the contract writes it. */
export interface SlotView {
  startAt: string;
  endAt: string;
  durationMinutes: number;
  available: boolean;
}

/** A wall-clock window in minutes from midnight. */
interface Window {
  readonly start: number;
  readonly end: number;
}

/**
 * Rounds a duration up to the next boundary: 75 → 90, 90 → 90, 45 → 60.
 *
 * "Next boundary" is inclusive of one already on it, because REQ-F-031 says a
 * booking occupies the *rounded* block and REQ-NF-008 makes the block a multiple
 * of 30: a 90-minute booking that became 120 would contradict SCN-13's "spans 90
 * minutes".
 */
export function roundUpToBlock(totalMinutes: number): number {
  const remainder = totalMinutes % SLOT_GRANULARITY_MINUTES;
  if (remainder === 0) return totalMinutes;
  return totalMinutes + (SLOT_GRANULARITY_MINUTES - remainder);
}

/** The first 30-minute multiple at or after `minute`. */
function ceilToBlock(minute: number): number {
  const remainder = minute % SLOT_GRANULARITY_MINUTES;
  return remainder === 0 ? minute : minute + (SLOT_GRANULARITY_MINUTES - remainder);
}

/**
 * The windows that apply on `date`.
 *
 * A date rule for that date replaces the weekly rules entirely — the contract's
 * own words for `dates` are "a date rule replaces the weekly rule for that
 * date". Otherwise the weekly rules whose `dayOfWeek` matches the date's ISO
 * weekday apply. Duplicate rules for one date (the schema permits them) are
 * enumerated in the order they were supplied.
 */
function windowsFor(date: CalendarDate, dateKey: string, input: AvailabilityInput): Window[] {
  const toWindow = (rule: { startTime: string; endTime: string }): Window | null => {
    const start = parseWallClock(rule.startTime);
    const end = parseWallClock(rule.endTime);
    if (start === null || end === null) return null;
    return { start, end };
  };

  const overrides = input.dates
    .filter((rule) => rule.date === dateKey)
    .map(toWindow)
    .filter((window): window is Window => window !== null);

  if (overrides.length > 0) return overrides;

  const weekday = isoWeekday(date);
  return input.weekly
    .filter((rule) => rule.dayOfWeek === weekday)
    .map(toWindow)
    .filter((window): window is Window => window !== null);
}

/**
 * `slots` for a date: every 30-minute start inside a window from which the
 * occupied block still fits.
 *
 * The fitting test is `start + occupied <= windowEnd`. `start` is snapped up to
 * the boundary first, because REQ-NF-008 makes a start off the boundary
 * unbookable — a window opening at 10:15 therefore begins at 10:30.
 *
 * A window has no effect when the *distance from the boundary-snapped start to
 * the window end* is shorter than the block — that is the "window shorter than
 * the occupied block yields no slots" case.
 */
export function slotsFor(
  dateKey: string,
  input: AvailabilityInput,
  occupiedMinutes: number,
): SlotView[] {
  const date = parseCalendarDate(dateKey);
  if (date === null) return [];

  const block = Math.max(roundUpToBlock(occupiedMinutes), SLOT_GRANULARITY_MINUTES);
  const slots: SlotView[] = [];
  const seen = new Set<number>();

  for (const window of windowsFor(date, dateKey, input)) {
    let start = ceilToBlock(window.start);

    while (start + block <= window.end) {
      if (!seen.has(start)) {
        seen.add(start);
        slots.push({
          startAt: salonInstant(date, start),
          endAt: salonInstant(date, start + block),
          durationMinutes: block,
          // S1.3 computes availability, not occupancy: no appointment can exist
          // until S2.1, so every slot this stage offers is available. See the
          // SMS-15 gate §4.4 — S2.1 replaces this with the real subtraction.
          available: true,
        });
      }
      start += SLOT_GRANULARITY_MINUTES;
    }
  }

  return slots;
}

/**
 * The parsed-duration helper: the sum of the requested services' base durations.
 *
 * Kept separate from rounding so `totalDurationMinutes` (the unrounded sum) and
 * `occupiedDurationMinutes` (rounded) are computed from the same input and
 * cannot disagree.
 */
export function totalMinutes(durations: readonly number[]): number {
  return durations.reduce((sum, value) => sum + value, 0);
}
