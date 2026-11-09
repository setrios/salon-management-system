/**
 * Availability rules — the checks that sit between the schema and storage.
 *
 * The contract's schema already enforces the shape: `dayOfWeek` 1–7, `HH:MM`
 * patterns, `date` format, closed objects. What it cannot express is the rule a
 * window carries — that it ends after it starts — and this module is where that
 * rule is stated once, for both the weekly and the date collection.
 *
 * Source: SMS-15 gate §4.2 decision (a) — an inverted or zero-length window is
 *         self-contradictory input and is 422 `BUSINESS_RULE_VIOLATION`;
 *         `error-model.md` §3 (M4 is listed for that code), §4 (422 = well formed
 *         but semantically invalid).
 *
 * What is **not** here, deliberately (SMS-15 gate §5 G4): any check of two
 * windows overlapping on one weekday. Union, intersection and rejection are all
 * defensible and no document chooses, so no rule is invented.
 */

import type { AvailabilityInput } from '../../lib/availability.js';
import { isValidWindow, parseWallClock } from '../../lib/time.js';

/** One offending window, named by the path the contract's `errors[]` uses. */
export interface WindowViolation {
  readonly field: string;
  readonly detail: string;
}

/**
 * Every window in `input` whose end is not strictly after its start.
 *
 * The schema has already rejected a non-`HH:MM` string, so a `null` from
 * `parseWallClock` here would mean the validator and this module disagree about
 * the pattern; it is reported as a violation rather than silently accepted.
 */
export function windowViolations(input: AvailabilityInput): WindowViolation[] {
  const violations: WindowViolation[] = [];

  input.weekly.forEach((rule, index) => {
    const start = parseWallClock(rule.startTime);
    const end = parseWallClock(rule.endTime);
    if (start === null || end === null || !isValidWindow(start, end)) {
      violations.push({
        field: `weekly[${index}]`,
        detail: 'endTime must be later than startTime.',
      });
    }
  });

  input.dates.forEach((rule, index) => {
    const start = parseWallClock(rule.startTime);
    const end = parseWallClock(rule.endTime);
    if (start === null || end === null || !isValidWindow(start, end)) {
      violations.push({
        field: `dates[${index}]`,
        detail: 'endTime must be later than startTime.',
      });
    }
  });

  return violations;
}
