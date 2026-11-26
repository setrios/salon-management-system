/**
 * Salon dates and times for the browser tests.
 *
 * The server runs on the real clock, so a test books "N days from today" in the
 * salon's zone (`Europe/Kyiv`, REQ-NF-007) rather than on a fixed date. The
 * expected labels follow UI-GATE U-4 literally — `Mon 16 Nov 2026`, `10:00` —
 * and are built from fixed English names, not from `Intl`, whose month
 * abbreviations differ between versions ("Sep" / "Sept").
 */

const ZONE = 'Europe/Kyiv';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `YYYY-MM-DD` of the salon's date `days` days from today. */
export function salonDate(days: number): string {
  const instant = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(instant);
}

/** The salon's UTC offset on a date, as `+02:00` / `+03:00`. */
function offsetOn(date: string): string {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, timeZoneName: 'longOffset' })
    .formatToParts(noonUtc)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-]\d{2}:\d{2})/.exec(name ?? '');
  if (match?.[1] === undefined) throw new Error(`no offset for ${date}: ${name}`);
  return match[1];
}

/** The instant of a wall-clock time on a salon date, as the contract writes it. */
export function salonInstant(date: string, time: string): string {
  return `${date}T${time}:00${offsetOn(date)}`;
}

/** `Mon 16 Nov 2026` for a `YYYY-MM-DD` (U-4). */
export function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]} ${year}`;
}

/** `10:00` — the wall-clock time of an instant the contract wrote (offset included). */
export function timeOf(instant: string): string {
  return instant.slice(11, 16);
}
