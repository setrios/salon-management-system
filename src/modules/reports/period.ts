/**
 * The report window — one rule, shared by R28 and R29 (REQ-F-022).
 *
 *   - `period=day|week|month` is a preset resolved against the application's
 *     clock in `Europe/Kyiv`;
 *   - `from` and `to` are a custom range, both supplied;
 *   - exactly one of the two forms is supplied, and a request that carries both,
 *     neither, or half a range is refused with `INVALID_PERIOD`.
 *
 * **The presets, as resolved here.** `day` is today; `week` is the ISO week
 * containing today, Monday to Sunday (the numbering `isoWeekday` already uses
 * for the availability rules); `month` is the calendar month of today. All three
 * are inclusive of both endpoints, and the window's *instants* are
 * `[from 00:00, to+1 00:00)` in the salon's offset — a range whose end is
 * included in full, which is what a date range means to a reader.
 *
 * **Why the enum is applied here rather than by the query validator.** The
 * contract declares `period` as an enum, so the generic validator would answer
 * 400 `MALFORMED_REQUEST` for `period=quarter`. `error-model.md` §3 names that
 * exact input in the `INVALID_PERIOD` row and assigns it 422, and the operation's
 * response set declares 422 (`Q1`). The value is therefore read as text and
 * classified here, and a date that is not a real calendar date stays a malformed
 * query parameter (400, `R5`) — it is not a period conflict.
 *
 * Source: REQ-F-022; `error-model.md` §3 and §5.4; D17 (unknown query
 *         parameters are ignored — this module reads only the three it names).
 * Contract: openapi.yaml parameter `period`, and `RevenueReport.period`.
 * Ticket: SMS-35 (Feature)
 *
 * Decisions (S5.4 inventory): Q1, R1, R5 as defined in
 * `logs/gates/2026-11-13-test-SMS-35.md` §1.1.
 */

import { salonDateOfInstant } from '../../lib/occupancy.js';
import {
  addCalendarDays,
  formatCalendarDate,
  isoWeekday,
  parseCalendarDate,
  salonInstant,
  type CalendarDate,
} from '../../lib/time.js';

/** The label the response echoes. */
export type PeriodLabel = 'day' | 'week' | 'month' | 'custom';

/** A resolved window: the label, the inclusive dates, and the instant bounds. */
export interface ResolvedPeriod {
  readonly kind: 'ok';
  readonly period: PeriodLabel;
  readonly from: string;
  readonly to: string;
  /** First instant of the window (from, 00:00 Kyiv). */
  readonly start: Date;
  /** First instant after the window (to + 1 day, 00:00 Kyiv). */
  readonly end: Date;
}

/** What the query resolved to: a window, a period conflict, or a bad date. */
export type PeriodResolution =
  ResolvedPeriod | { readonly kind: 'invalid' } | { readonly kind: 'malformed' };

const PRESETS: ReadonlySet<string> = new Set(['day', 'week', 'month']);

/** Reads one query value, or `undefined`; a repeated parameter is malformed. */
function readOne(query: Record<string, unknown>, name: string): string | undefined | 'repeated' {
  const value = query[name];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return 'repeated';
  if (typeof value !== 'string') return 'repeated';
  return value;
}

/** A calendar date and its textual form, derived from an instant. */
function dateOfInstant(instant: Date): { date: CalendarDate; text: string } {
  const date = salonDateOfInstant(instant);
  return { date, text: formatCalendarDate(date) };
}

/** Builds the window from inclusive dates. */
function window(label: PeriodLabel, from: CalendarDate, to: CalendarDate): ResolvedPeriod {
  return {
    kind: 'ok',
    period: label,
    from: formatCalendarDate(from),
    to: formatCalendarDate(to),
    start: new Date(salonInstant(from, 0)),
    end: new Date(salonInstant(addCalendarDays(to, 1), 0)),
  };
}

/**
 * Resolves the query of R28/R29 — `period` XOR (`from` and `to`).
 *
 * The three outcomes are the three answers the route can give: a window, 422
 * `INVALID_PERIOD`, or 400 `MALFORMED_REQUEST`.
 */
export function resolvePeriod(query: Record<string, unknown>, now: Date): PeriodResolution {
  const period = readOne(query, 'period');
  const from = readOne(query, 'from');
  const to = readOne(query, 'to');

  if (period === 'repeated' || from === 'repeated' || to === 'repeated') {
    return { kind: 'malformed' };
  }

  // Both forms, or a preset with half a range, is a conflict — not a typo.
  if (period !== undefined) {
    if (from !== undefined || to !== undefined) return { kind: 'invalid' };
    if (!PRESETS.has(period)) return { kind: 'invalid' };

    const today = dateOfInstant(now);
    if (period === 'day') {
      return window('day', today.date, today.date);
    }
    if (period === 'week') {
      // The ISO week: Monday is day 1, so today - (n - 1) is its Monday.
      const monday = addCalendarDays(today.date, -(isoWeekday(today.date) - 1));
      return window('week', monday, addCalendarDays(monday, 6));
    }
    return window('month', { ...today.date, day: 1 }, lastDayOfMonth(today.date));
  }

  // No preset: the range must be complete.
  if (from === undefined || to === undefined) return { kind: 'invalid' };

  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (start === null || end === null) return { kind: 'malformed' };
  if (from > to) return { kind: 'invalid' };

  return window('custom', start, end);
}

/** The last day of the month the date falls in. */
function lastDayOfMonth(date: CalendarDate): CalendarDate {
  // Day 0 of the next month is the last day of this one — in the pure calendar
  // arithmetic `Date.UTC` does, not in the salon zone, which the date has left.
  const next = new Date(Date.UTC(date.year, date.month, 0));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}
