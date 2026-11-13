/**
 * Salon time — wall clock, dates and offsets in Europe/Kyiv.
 *
 * Knows neither Express nor SQL (plan §5: `lib/*` is the pure layer). This is
 * where the two facts the contract fixes about time are expressed once:
 *
 *   - a rule carries a **salon wall clock** (`startTime` / `endTime` as
 *     `HH:MM`) and a **date** (`YYYY-MM-DD`), both zone-less;
 *   - a slot carries an **instant** — RFC 3339 with the offset that Europe/Kyiv
 *     has on that date (`+02:00` in winter, `+03:00` in summer).
 *
 * Source: `spec/api/resource-model.md` §3 ("Timestamps: RFC 3339 with offset,
 *         Europe/Kyiv"); REQ-NF-007 (one location, one time zone — no selector
 *         exists anywhere in the contract); `WeeklyRule`/`DateRule`
 *         (`HH:MM` and `date` patterns), `AvailabilitySlot.startAt/endAt`.
 *
 * Why the offset is derived from `Intl` rather than from a stored table: the
 * zone's rules are the IANA database's, and Node ships it (ICU). A hard-coded
 * +02:00/+03:00 pair would be a second copy of those rules that goes stale.
 */

/** The salon's zone. Fixed by REQ-NF-007; there is no configuration for it. */
export const SALON_TIME_ZONE = 'Europe/Kyiv';

const MINUTES_PER_DAY = 24 * 60;

/** A `YYYY-MM-DD` date, validated as a real calendar date. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The `YYYY-MM-DD` text of a calendar date — the inverse of `parseCalendarDate`.
 *
 * The report operations echo their resolved window as `from`/`to`, which the
 * contract types as `format: date`. Building that string from the parts, rather
 * than from a `Date`, keeps the zone out of it: a date has no offset.
 */
export function formatCalendarDate(date: CalendarDate): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/**
 * Parses `YYYY-MM-DD` into its parts, or `null` when it is not a real date.
 *
 * `2026-02-30` and `2027-02-29` are rejected: a string that matches the shape
 * but names no day would otherwise become 2 March through `Date`, quietly.
 */
export function parseCalendarDate(value: string): CalendarDate | null {
  const match = DATE_PATTERN.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Round-trip through UTC: only a real date maps back to the same three parts.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * ISO weekday of a date: 1 = Monday … 7 = Sunday.
 *
 * `WeeklyRule.dayOfWeek` uses exactly this numbering, so no conversion is
 * needed between the contract and the storage.
 */
export function isoWeekday(date: CalendarDate): number {
  const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** `HH:MM` → minutes from midnight, or `null` when the string is not `HH:MM`. */
export function parseWallClock(value: string): number | null {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes from midnight → `HH:MM`. */
export function formatWallClock(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

/**
 * The UTC offset of the salon's zone on a given date, in minutes.
 *
 * Read from `Intl` at the instant of local noon, which is far from any
 * transition (Kyiv switches at 03:00/04:00 local), so the answer is the offset
 * that applies to the whole working day.
 */
export function salonOffsetMinutes(date: CalendarDate): number {
  const noonUtc = Date.UTC(date.year, date.month - 1, date.day, 12, 0, 0);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: SALON_TIME_ZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(noonUtc))
    .find((part) => part.type === 'timeZoneName')?.value;

  // `GMT+02:00` → `+02:00`; plain `GMT` would mean UTC (offset zero).
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? '');
  if (match === null) return 0;

  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/** `120` → `+02:00`; `-330` → `-05:30`. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60)
    .toString()
    .padStart(2, '0');
  const mins = (absolute % 60).toString().padStart(2, '0');
  return `${sign}${hours}:${mins}`;
}

/**
 * A wall-clock time on a date, as the RFC 3339 instant the contract's own
 * example is written in: `2026-12-07T10:00:00+02:00`.
 *
 * The offset is taken from the zone on that date, not from a constant — that is
 * what makes the same rule produce `+02:00` in December and `+03:00` in July.
 */
export function salonInstant(date: CalendarDate, minutesFromMidnight: number): string {
  const offset = formatOffset(salonOffsetMinutes(date));
  const day = `${date.year.toString().padStart(4, '0')}-${date.month
    .toString()
    .padStart(2, '0')}-${date.day.toString().padStart(2, '0')}`;

  // Callers only pass start and end minutes that lie inside the working day
  // (0–1439), and `availability.ts` refuses to build a slot that would run past
  // midnight rather than wrapping it into an untested next-day instant.
  const bounded = Math.min(Math.max(minutesFromMidnight, 0), MINUTES_PER_DAY - 1);
  return `${day}T${formatWallClock(bounded)}:00${offset}`;
}

/**
 * The calendar date `days` after `date`.
 *
 * A calendar increment, not an instant one: adding 24 hours to a Kyiv midnight
 * lands on 23:00 or 01:00 across a DST change, while the next day's midnight is
 * still the next day's midnight. `Date.UTC` is used only as a day counter — the
 * result is read back as a calendar triple, never as an instant.
 */
export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Compares two wall-clock minute values; a window is valid when the end is
 * strictly after the start.
 *
 * This is the *self-contradictory* check the SMS-15 gate fixed as decision (a):
 * a window that finishes before it begins, or has zero length, is not a window
 * under any reading. It says nothing about two windows overlapping on the same
 * weekday — that case is undefined by the SRS and the contract (gate §5 G4) and
 * is deliberately not decided here.
 */
export function isValidWindow(startMinutes: number, endMinutes: number): boolean {
  return endMinutes > startMinutes;
}
