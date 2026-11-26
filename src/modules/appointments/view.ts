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

import { config } from '../../config.js';
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

/**
 * `Payment`, as the contract exposes it (REQ-F-021, D12).
 *
 * The appointment's payment is at most one, and it is its own row rather than a
 * field on the appointment: D12 makes it immutable, so it must not share a row
 * that R21 rewrites. The body carries it here because `AppointmentAdmin` declares
 * the field (N2); R27 answers it as `Payment` from the same view.
 */
export interface PaymentView {
  readonly id: string;
  readonly appointmentId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: 'paid' | 'unpaid';
  readonly method: 'cash' | 'card';
  /** The instant the money was recorded, in the salon's offset. */
  readonly recordedAt: string;
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
  /** The recorded payment, when there is one (N2); absent, not `null`. */
  readonly payment?: PaymentView;
}

/**
 * The confirmation page's URL: screen C2 of `spec/ui/screens.md`, served by this
 * process at `/appointments/{token}`, on the origin `PUBLIC_BASE_URL` configures
 * (REQ-F-005, UI-GATE U-1, SMS-70). Both P8's 201 body and P9's 200 body build
 * `confirmationUrl` through it.
 */
function confirmationUrlOf(accessToken: string): string {
  return `${config.publicBaseUrl}/appointments/${accessToken}`;
}

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
    // N2: optional in the schema, so an unpaid appointment carries no key at
    // all rather than `payment: null`.
    ...(record.payment === undefined ? {} : { payment: paymentBody(record.payment) }),
    accessToken: record.accessToken,
    confirmationUrl: confirmationUrlOf(record.accessToken),
    createdAt: salonDateTime(record.createdAt),
    updatedAt: salonDateTime(record.updatedAt),
  };
}

/**
 * The `Payment` body for one stored payment (REQ-F-021).
 *
 * The stored view is flat (`amountMinor`, `currency`); the contract nests them
 * under `amount`. The mapping is here, next to `appointmentBody`, so R27's 201 and
 * the appointment's `payment` field cannot disagree about the shape.
 */
export function paymentBody(payment: PaymentView): Record<string, unknown> {
  return {
    id: payment.id,
    appointmentId: payment.appointmentId,
    amount: { amountMinor: payment.amountMinor, currency: payment.currency },
    status: payment.status,
    method: payment.method,
    recordedAt: payment.recordedAt,
  };
}
