/**
 * Display formats of the interface (UI-GATE U-4).
 *
 * Money is `1250.00 UAH` (REQ-NF-004); a date is `Mon 16 Nov 2026`; a time is
 * `10:00`, 24-hour. Times are the salon's wall clock exactly as the contract
 * writes them (`2026-11-16T10:00:00+02:00` → `10:00`): the interface never
 * converts to the browser's zone and shows no zone label (REQ-NF-007).
 *
 * Names come from fixed English tables, not `Intl`, so the text is the same in
 * every browser and every locale (REQ-NF-003).
 */

/** The contract's `Money`. */
export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `45000` minor units → `450.00 UAH`. Every amount on every screen goes through here. */
export function formatMoney(money: Money): string {
  return `${formatAmount(money.amountMinor)} UAH`;
}

/** `45000` → `450.00`: the number without the currency, for inputs and sums. */
export function formatAmount(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

/** `450` or `450.5` (hryvnias, as typed) → minor units, or `null` when not an amount. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

/** `75` → `75 min`. */
export function formatMinutes(minutes: number): string {
  return `${minutes} min`;
}

/** `2026-11-16` → `Mon 16 Nov 2026`. */
export function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return date;
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[weekday] ?? ''} ${day} ${MONTHS[month - 1] ?? ''} ${year}`;
}

/** The salon date of a contract instant: `2026-11-16T10:00:00+02:00` → `2026-11-16`. */
export function dateOf(instant: string): string {
  return instant.slice(0, 10);
}

/** The wall-clock time of a contract instant: `…T10:00:00+02:00` → `10:00`. */
export function formatTime(instant: string): string {
  return instant.slice(11, 16);
}

/** `Mon 16 Nov 2026, 10:00` — a start. */
export function formatStart(instant: string): string {
  return `${formatDate(dateOf(instant))}, ${formatTime(instant)}`;
}

/** `Mon 16 Nov 2026, 10:00–11:30` — a start and an end on the same day. */
export function formatSpan(startAt: string, endAt: string): string {
  return `${formatStart(startAt)}–${formatTime(endAt)}`;
}

/** `2026-11-16T10:00:00+02:00` → `Mon 16 Nov 2026, 10:00`, or `—` when absent. */
export function formatInstant(instant: string | null | undefined): string {
  return instant === null || instant === undefined ? '—' : formatStart(instant);
}

const STATUS: Readonly<Record<string, string>> = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  scheduled: 'Scheduled',
  sent: 'Sent',
  skipped: 'Skipped',
  failed: 'Failed',
  paid: 'Paid',
  unpaid: 'Unpaid',
};

/** A contract status → its English label (`confirmed` → `Confirmed`). */
export function formatStatus(status: string): string {
  return STATUS[status] ?? status;
}

const EVENTS: Readonly<Record<string, string>> = {
  new: 'New',
  reschedule: 'Reschedule',
  cancellation: 'Cancellation',
  reminder_24h: '24h reminder',
  reminder_2h: '2h reminder',
};

/** A notification event type → its label (N1, N2). */
export function formatEvent(eventType: string): string {
  return EVENTS[eventType] ?? eventType;
}

/** A notification channel → its label: `sms` → `SMS`, `in_app` → `In-app`. */
export function formatChannel(channel: string): string {
  return channel === 'sms' ? 'SMS' : channel === 'in_app' ? 'In-app' : channel;
}

/** `cash` → `Cash`, `card` → `Card` (K11). */
export function formatMethod(method: string): string {
  return method === 'cash' ? 'Cash' : method === 'card' ? 'Card' : method;
}

/** `true` → `Yes` (K8). */
export function formatActive(active: boolean): string {
  return active ? 'Yes' : 'No';
}

/**
 * Today's date in the salon (`Europe/Kyiv`), `YYYY-MM-DD`. The browser's own
 * zone is never used: the salon has one zone, and the interface offers no other
 * (REQ-NF-007).
 */
export function salonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

/** A `YYYY-MM-DD` shifted by whole days (calendar arithmetic, no zone involved). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

/** The Monday of the ISO week that contains `date`. */
export function mondayOf(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday =
    (new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

/**
 * The delivery status of a reminder or notification. Distinct from an
 * appointment's status on purpose: a reminder of a cancelled appointment is
 * `cancelled` too (REQ-F-034), and the page must not show two "Cancelled"
 * that mean different things.
 */
export function formatDelivery(status: string): string {
  return status === 'cancelled' ? 'Cancelled — not sent' : formatStatus(status);
}

/**
 * Midday of a salon date as a contract instant (`2026-11-16T12:00:00+02:00`),
 * for a field that asks only for a date. Midday stays on the same date in any
 * offset the salon's zone has, summer or winter.
 */
export function salonMidday(date: string): string {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    timeZoneName: 'longOffset',
  })
    .formatToParts(noonUtc)
    .find((part) => part.type === 'timeZoneName')?.value;
  const offset = /GMT([+-]\d{2}:\d{2})/.exec(zone ?? '')?.[1] ?? '+02:00';
  return `${date}T12:00:00${offset}`;
}
