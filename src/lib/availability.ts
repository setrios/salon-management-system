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
 *   - it does not re-state the booking rule. Subtracting booked time and the
 *     fit test both live in `lib/occupancy.ts`, which P8 calls with the same
 *     inputs, so P7 and P8 cannot diverge (O2). `slotsFor` here takes the
 *     already-computed booked intervals and delegates;
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
import { SLOT_GRANULARITY_MINUTES, offeredStarts, type MinuteInterval } from './occupancy.js';

/** The granularity every bookable start falls on (`REQ-NF-008`). */
export { SLOT_GRANULARITY_MINUTES } from './occupancy.js';

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

/** A half-open interval in minutes from midnight on one date: `[start, end)`. */
export type { MinuteInterval };

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

/**
 * The windows that apply on `date`, as wall-clock minute intervals.
 *
 * Exported because P8 needs the same windows P7 enumerates: the fit test for a
 * requested start must be made against the same list, or the two operations
 * could disagree about a window that opens at 10:15 (O2).
 */
export function windowsOn(dateKey: string, input: AvailabilityInput): MinuteInterval[] {
  const date = parseCalendarDate(dateKey);
  if (date === null) return [];
  return windowsFor(date, dateKey, input);
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
 * occupied block still fits **and** which no booking already covers.
 *
 * The fitting test and the subtraction are not restated here: both live in
 * `lib/occupancy.ts`, which P8 calls with the same inputs. That is what makes
 * O2 ("P7 offers exactly the starts P8 accepts") a property of the code rather
 * than of two implementations that happen to agree today.
 *
 * `booked` is the day's existing appointments as wall-clock intervals on this
 * date. A start whose block overlaps one of them is removed, not reported with
 * `available: false` (decision D1): the operation's description says it
 * "filters out booked time", and filtering is removal.
 */
export function slotsFor(
  dateKey: string,
  input: AvailabilityInput,
  occupiedMinutes: number,
  booked: readonly MinuteInterval[] = [],
): SlotView[] {
  const date = parseCalendarDate(dateKey);
  if (date === null) return [];

  const block = Math.max(roundUpToBlock(occupiedMinutes), SLOT_GRANULARITY_MINUTES);
  const windows = windowsFor(date, dateKey, input);

  return offeredStarts(windows, block, booked).map((start) => ({
    startAt: salonInstant(date, start),
    endAt: salonInstant(date, start + block),
    durationMinutes: block,
    // Every slot this function returns is bookable by construction: a blocked
    // start was removed above. The field is required by `AvailabilitySlot`, so
    // it is `true` here and O10 asserts it after a booking, which is the only
    // state in which "filtered out" and "hard-coded true" differ.
    available: true,
  }));
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
