/**
 * Occupancy arithmetic — the one rule for "is this start bookable?".
 *
 * P7 (`getMasterAvailability`) and P8 (`createAppointment`) must agree: O2
 * asserts that every start P7 offers is a start P8 accepts and the first start
 * P7 withholds is one P8 refuses. The way to make that true is to have one
 * implementation, so this file is it. P7 calls `offeredStarts` to build its
 * list; P8 calls `startOffered` with the start the client asked for. A start P7
 * offers and P8 refuses can only happen if one of them stops calling here.
 *
 * Three facts are combined, all in salon wall-clock minutes from midnight:
 *
 *   1. **The window.** A start must leave the whole rounded block inside an
 *      availability window: `start + block <= window.end`. R7 depends on this
 *      being the *rounded* block — the unrounded 75 minutes fits a window that
 *      ends at 11:15, the 90-minute block does not.
 *   2. **The boundary (REQ-NF-008).** Starts fall on 30-minute multiples; a
 *      window opening at 10:15 offers its first start at 10:30.
 *   3. **Booked time (REQ-F-002).** A start whose block overlaps an existing
 *      appointment's block is withheld. Overlap, not equality: a 90-minute
 *      booking at 10:00 also removes 10:30 and 11:00 (O4).
 *
 * Intervals are half-open, `[start, end)`, which is what makes a booking that
 * ends exactly when the next one starts non-conflicting: 10:00–11:00 and
 * 11:00–12:00 do not overlap.
 *
 * Deliberately absent: any notion of "available: false". A blocked start is
 * removed, not reported (decision D1), so nothing here produces the flag.
 *
 * Source: REQ-F-002 (only slots inside availability **and not already booked**
 *         are selectable), REQ-F-031 (the block is the rounded summed duration),
 *         REQ-NF-008 (30-minute boundaries), SCN-13;
 *         `spec/api/openapi.yaml` `AvailabilitySlot`, P7's description
 *         ("filters out booked time"), `error-model.md` §3 (409
 *         `SLOT_UNAVAILABLE`).
 */

import {
  parseCalendarDate,
  salonInstant,
  salonOffsetMinutes,
  SALON_TIME_ZONE,
  type CalendarDate,
} from './time.js';

/**
 * The granularity every bookable start falls on (`REQ-NF-008`).
 *
 * Declared here rather than in `availability.ts`, because the rule about what a
 * bookable start is lives here now; `availability.ts` re-exports it so the name
 * has one definition and the import direction stays one-way.
 */
export const SLOT_GRANULARITY_MINUTES = 30;

/** A half-open interval of wall-clock minutes from midnight: `[start, end)`. */
export interface MinuteInterval {
  readonly start: number;
  readonly end: number;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * True when two half-open intervals share any instant.
 *
 * Half-open is what makes touching intervals disjoint. The alternative — closed
 * intervals — would refuse a booking that starts exactly when the previous one
 * ends, which is the normal shape of a salon day.
 */
export function overlaps(a: MinuteInterval, b: MinuteInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** True when `candidate` touches none of `booked`. */
export function isFree(candidate: MinuteInterval, booked: readonly MinuteInterval[]): boolean {
  return !booked.some((block) => overlaps(candidate, block));
}

/** The first 30-minute multiple at or after `minute` (REQ-NF-008). */
function ceilToBlock(minute: number): number {
  const remainder = minute % SLOT_GRANULARITY_MINUTES;
  return remainder === 0 ? minute : minute + (SLOT_GRANULARITY_MINUTES - remainder);
}

/**
 * True when a block starting at `start` fits one window and no booking.
 *
 * `block` is the rounded occupied duration, never the summed one: R7 exists to
 * tell those two apart.
 */
export function startOffered(
  start: number,
  windows: readonly MinuteInterval[],
  block: number,
  booked: readonly MinuteInterval[],
): boolean {
  if (start % SLOT_GRANULARITY_MINUTES !== 0) return false;
  if (!windows.some((window) => start + block <= window.end && start >= window.start)) {
    return false;
  }
  return isFree({ start, end: start + block }, booked);
}

/**
 * Every 30-minute start the windows offer, minus the ones booked time removes.
 *
 * Windows are enumerated in the order the caller supplied them and identical
 * starts are de-duplicated: two overlapping windows on one weekday are undefined
 * by the specifications (SMS-15 gate §5 G4), and the minimum needed to answer at
 * all is to answer once per start. That choice belongs to the caller's window
 * list, not to this function, which only refuses to emit the same start twice.
 */
export function offeredStarts(
  windows: readonly MinuteInterval[],
  block: number,
  booked: readonly MinuteInterval[],
): number[] {
  const starts: number[] = [];
  const seen = new Set<number>();

  for (const window of windows) {
    let start = ceilToBlock(window.start);

    while (start + block <= window.end) {
      if (!seen.has(start) && isFree({ start, end: start + block }, booked)) {
        seen.add(start);
        starts.push(start);
      }
      start += SLOT_GRANULARITY_MINUTES;
    }
  }

  return starts;
}

/**
 * Where an instant falls on a date, in salon wall-clock minutes from midnight.
 *
 * A booking can straddle midnight (a 23:45 start plus a block), and an
 * appointment on the previous day can reach into this one, so the result is
 * deliberately unbounded: negative means "before this date began", a value above
 * 1440 means "after it ended". Clamping either end would silently turn an
 * overlap into a gap.
 *
 * The offset is read from the zone for that date (`salonOffsetMinutes`), so a
 * summer date and a winter date both convert correctly.
 */
export function minutesOnDate(date: CalendarDate, instant: Date): number {
  const offset = salonOffsetMinutes(date);
  const local = instant.getTime() + offset * 60_000;
  const midnight = Date.UTC(date.year, date.month - 1, date.day);
  return Math.round((local - midnight) / 60_000);
}

/** Minutes from midnight on `date` at which `date` begins, as a UTC instant. */
export function dateStartInstant(date: CalendarDate): Date {
  const offset = salonOffsetMinutes(date);
  return new Date(Date.UTC(date.year, date.month - 1, date.day) - offset * 60_000);
}

/** The instant `minutes` after the start of `date`; negative minutes go back. */
export function instantAt(date: CalendarDate, minutes: number): Date {
  return new Date(dateStartInstant(date).getTime() + minutes * 60_000);
}

export { MINUTES_PER_DAY };

/**
 * The salon date an instant falls on.
 *
 * A booking carries an instant; a window and a set of booked blocks are
 * wall-clock facts about one date. This is the one conversion between the two,
 * and it reads the zone's offset from `Intl` rather than assuming a constant, so
 * a summer instant and a winter instant both land on the right date.
 */
export function salonDateOfInstant(instant: Date): CalendarDate {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

  const date = parseCalendarDate(formatted);
  if (date === null) {
    throw new Error(`Intl produced a value that is not a calendar date: ${formatted}`);
  }
  return date;
}

/**
 * An instant written the way every appointment field in the contract is written:
 * RFC 3339 with the salon's offset on that date.
 *
 * `toISOString()` would be UTC and would contradict the contract's own example
 * (`2026-11-03T10:00:00+02:00`); the tests assert the offset, not only the
 * instant, because the offset is what a client displays.
 */
export function salonDateTime(instant: Date): string {
  const date = salonDateOfInstant(instant);
  return salonInstant(date, minutesOnDate(date, instant));
}
