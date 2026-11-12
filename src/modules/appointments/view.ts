/**
 * One appointment, as the client-facing `Appointment` schema states it.
 *
 * P8 answers a 201 with this body and P9 answers a 200 with the same body; the
 * contract fixes the shape once (`#/components/schemas/Appointment`), and two
 * mappers would be two places to drift. The only difference between the two
 * answers is a header (`Location` on 201), which belongs to the route, not to
 * the body.
 *
 * **What comes from where, and why it matters:**
 *
 *   - `client`, `master`, `services`, timestamps and totals come from the stored
 *     row and its snapshot lines. A later rename of a service or a re-price does
 *     not change what was booked (REQ-NF-005).
 *   - `master.fullName` is the **current** name, read through the join in
 *     `service.ts` (decision E8): the contract has no snapshot column for it, so
 *     a master renamed through R4 changes what P9 shows. Stated rather than
 *     hidden, because the two readings are observably different.
 *   - `reminders[]` is read from the two `notifications` rows S3.2 writes
 *     (decision H1, which replaces D6). The status is the stored one, so a
 *     reminder that was skipped at booking stays `skipped` however late the
 *     record is read, and one that was dispatched reads `sent`.
 *
 * Source: REQ-F-004, REQ-F-005, REQ-F-010, REQ-F-011, REQ-NF-001, REQ-NF-005;
 *         `openapi.yaml` `Appointment`, `AppointmentService`, `Reminder`; SRS
 *         v1.3 glossary "Confirmation Page"; decisions E8, H1.
 */

import { salonDateTime } from '../../lib/occupancy.js';
import { reminderViews, type ReminderRow } from '../notifications/reminders.js';

/** The stored line, as `AppointmentService` exposes it: a snapshot. */
export interface AppointmentLine {
  readonly serviceId: string;
  readonly name: string;
  readonly baseDurationMinutes: number;
  readonly priceAmountMinor: number;
  readonly priceCurrency: string;
}

/** Everything an `Appointment` body needs from the stored row and its master. */
export interface AppointmentRecord {
  readonly id: string;
  readonly status: string;
  readonly clientName: string;
  readonly clientPhone: string;
  readonly masterId: string;
  readonly masterFullName: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly totalDurationMinutes: number;
  readonly occupiedDurationMinutes: number;
  readonly totalPriceAmountMinor: number;
  readonly totalPriceCurrency: string;
  readonly accessToken: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly AppointmentLine[];
  /** The two reminder rows, in the order they occur (S3.2, H1). */
  readonly reminders: readonly ReminderRow[];
}

/**
 * The confirmation page's origin — the contract's own example.
 *
 * `openapi.yaml` shows `https://salon.example/appointments/{token}` and nothing
 * in the contract or the SRS configures another origin, so the URL is built from
 * that one. It lives here, not in `routes.ts`, because both P8's 201 body and
 * P9's 200 body build `confirmationUrl`.
 *
 * **Nothing serves this URL.** The reachable resource is
 * `/api/v1/appointments/{token}` (P9); whether an HTML page is served at
 * `salon.example` is UI work (SMS-36), and it is recorded in the G2 carry-forward
 * register rather than promised here. `confirmationUrl` is an absolute URI as the
 * schema declares, and a client that follows it reaches the page once one exists.
 */
export const CONFIRMATION_ORIGIN = 'https://salon.example';

/**
 * The `Appointment` body for one record.
 *
 * No clock is needed: the reminders are stored rows (H1), so the body is a
 * function of the record alone. The dispatch that may change them runs before
 * the record is read (`loadAppointment`), not here.
 */
export function appointmentBody(record: AppointmentRecord): Record<string, unknown> {
  return {
    id: record.id,
    status: record.status,
    client: { name: record.clientName, phone: record.clientPhone },
    master: { id: record.masterId, fullName: record.masterFullName },
    services: record.lines.map((line) => ({
      serviceId: line.serviceId,
      name: line.name,
      baseDurationMinutes: line.baseDurationMinutes,
      price: { amountMinor: line.priceAmountMinor, currency: line.priceCurrency },
    })),
    startAt: salonDateTime(record.startAt),
    endAt: salonDateTime(record.endAt),
    totalDurationMinutes: record.totalDurationMinutes,
    occupiedDurationMinutes: record.occupiedDurationMinutes,
    totalPrice: {
      amountMinor: record.totalPriceAmountMinor,
      currency: record.totalPriceCurrency,
    },
    // H1: the stored rows, not a computation from `startAt`.
    reminders: reminderViews(record.reminders),
    accessToken: record.accessToken,
    confirmationUrl: `${CONFIRMATION_ORIGIN}/appointments/${record.accessToken}`,
    createdAt: salonDateTime(record.createdAt),
    updatedAt: salonDateTime(record.updatedAt),
  };
}
