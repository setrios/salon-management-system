/**
 * Appointments — P8 `createAppointment`.
 *
 *   P8 POST /appointments   createAppointment   (public, `security: []`)
 *
 * Source: REQ-F-001 (one or more services; totals are the sums), REQ-F-002
 *         (only a slot inside availability and not already booked), REQ-F-003
 *         (confirmed on creation; no approval state), REQ-F-004 and REQ-F-005
 *         (the record carries the token and the confirmation URL), REQ-F-010 and
 *         REQ-F-011 (reminders 24 h and 2 h ahead, skipped when already past),
 *         REQ-NF-001 (the access token is the credential), REQ-NF-008 (30-minute
 *         boundaries), REQ-F-031 (the rounded block is what is reserved);
 *         SCN-01, SCN-13; POS-01, POS-13, NEG-01, NEG-02, NEG-08, NEG-14,
 *         NEG-15, NEG-17; `error-model.md` §3, §4;
 *         `resource-model.md` §4 (only `cancelled` frees a block), §5.1 (P8).
 * Contract: openapi.yaml#/paths/~1appointments/post; schemas AppointmentCreate,
 *           Appointment, AppointmentService, Reminder, Problem.
 *
 * The refusal order is fixed, and each answer is inside P8's declared set
 * (400/409/415/422/500):
 *
 *   1. 415 / 422 `VALIDATION_ERROR` — the body is not JSON or breaks its schema.
 *      `validateBody` owns both, before this handler runs. `minItems: 1` on
 *      `serviceIds` is part of that schema, so an empty array is a body
 *      violation and never reaches the rules below.
 *   2. 422 `BUSINESS_RULE_VIOLATION` — the body is schema-valid and breaks a rule
 *      no booking could satisfy: a start off the boundary (D3), a master id that
 *      is not a bookable active master (D4, D10), a service that is unknown,
 *      retired, or not offered by the master (D4).
 *   3. 409 `SLOT_UNAVAILABLE` — the request is well-formed and the slot is
 *      genuinely outside availability or taken. Decided inside the transaction,
 *      because that is the only place the answer is not stale (D2).
 *
 * Nothing here writes a status other than `confirmed`: REQ-F-003 gives creation
 * no other outcome, and `AppointmentCreate` declares no `status` field (D-22).
 */

import { Router, type Request, type Response } from 'express';

import { windowsOn } from '../../lib/availability.js';
import {
  minutesOnDate,
  salonDateOfInstant,
  salonDateTime,
  startOffered,
} from '../../lib/occupancy.js';
import { HttpProblem } from '../../middleware/error-handler.js';
import { validateBody } from '../../middleware/validate.js';
import { readAvailability } from '../availability/service.js';
import { asyncRoute, sendJson } from '../reference-data/http.js';
import { remindersFor } from './reminders.js';
import { offBoundary, serviceRejection, totalsFor, type BookableService } from './rules.js';
import {
  bookedBlocks,
  createAppointment,
  findBookableServices,
  findBookingMaster,
  type Executor,
} from './service.js';
/** `AppointmentCreate` as the contract declares it (closed body, D-22). */
interface AppointmentCreateBody {
  readonly client: { readonly name: string; readonly phone: string };
  readonly masterId: string;
  readonly serviceIds: readonly string[];
  readonly startAt: string;
}

/**
 * One sentence for the 409, so a client can tell the two causes apart in prose
 * while the `code` stays the contract's single `SLOT_UNAVAILABLE`. B25 pins it,
 * which is the one place in the suite that compares `detail`.
 */
const SLOT_UNAVAILABLE_DETAIL =
  'The requested slot cannot be booked with this master: it is outside the master\'s availability or overlaps an existing appointment.';

/**
 * The confirmation page's origin.
 *
 * The contract's own example is `https://salon.example/appointments/{token}` and
 * nothing in the contract or the SRS configures it; the page itself arrives with
 * S2.2 (SMS-26). Until then the URL is built from the contract's origin, so the
 * field is an absolute URI rather than a relative path dressed as one.
 */
const CONFIRMATION_ORIGIN = 'https://salon.example';

/** `YYYY-MM-DD` for a salon date. */
function dateKeyOf(date: { year: number; month: number; day: number }): string {
  return `${date.year.toString().padStart(4, '0')}-${date.month
    .toString()
    .padStart(2, '0')}-${date.day.toString().padStart(2, '0')}`;
}

/** Everything decided before the transaction opens. */
interface PendingBooking {
  readonly master: { readonly id: string; readonly fullName: string };
  readonly client: { readonly name: string; readonly phone: string };
  readonly startAt: Date;
  readonly endAt: Date;
  readonly startMinute: number;
  readonly windows: readonly { readonly start: number; readonly end: number }[];
  readonly totalDurationMinutes: number;
  readonly occupiedDurationMinutes: number;
  readonly totalPriceAmountMinor: number;
  readonly currency: string;
}

/** P8 — the public booking operation. */
async function createAppointmentHandler(req: Request, res: Response): Promise<void> {
  const body = res.locals.body as AppointmentCreateBody;
  const now = (req.app.locals.now as (() => Date) | undefined)?.() ?? new Date();

  const startAt = new Date(body.startAt);

  // D3: the boundary is a property of the body, so it is refused before any
  // database read — a start off it can never become bookable.
  if (offBoundary(startAt)) {
    throw new HttpProblem('BUSINESS_RULE_VIOLATION', 'startAt must fall on a 30-minute boundary.');
  }

  const master = await findBookingMaster(body.masterId);
  // D4: P8 declares no 404. An id naming nothing, an administrator id (D10) and
  // a retired master are all "the body asks to book a master who is not
  // bookable".
  if (master === undefined || master.role !== 'master' || !master.active) {
    throw new HttpProblem('BUSINESS_RULE_VIOLATION', 'The requested master is not bookable.');
  }

  // D8: one entry per requested id, so a repeated id yields two lines and is
  // summed twice. A missing entry is the id the client sent that names nothing.
  const resolved = await findBookableServices(body.masterId, body.serviceIds);
  if (resolved.some((service) => service === undefined)) {
    throw new HttpProblem(
      'BUSINESS_RULE_VIOLATION',
      'serviceIds contains an id that names no service.',
    );
  }

  const services = resolved as BookableService[];
  for (const service of services) {
    const rejection = serviceRejection(service);
    if (rejection !== undefined) {
      throw new HttpProblem('BUSINESS_RULE_VIOLATION', rejection);
    }
  }

  const totals = totalsFor(services);
  const date = salonDateOfInstant(startAt);
  const dateKey = dateKeyOf(date);
  const startMinute = minutesOnDate(date, startAt);
  const currency = services[0]?.currency ?? 'UAH';

  const booking: PendingBooking = {
    master: { id: master.id, fullName: master.fullName },
    client: { name: body.client.name, phone: body.client.phone },
    startAt,
    endAt: new Date(startAt.getTime() + totals.occupiedDurationMinutes * 60_000),
    startMinute,
    windows: windowsOn(dateKey, await readAvailability(master.id)),
    totalDurationMinutes: totals.totalDurationMinutes,
    occupiedDurationMinutes: totals.occupiedDurationMinutes,
    totalPriceAmountMinor: totals.totalPriceAmountMinor,
    currency,
  };

  const created = await createAppointment(
    {
      masterId: master.id,
      clientName: booking.client.name,
      clientPhone: booking.client.phone,
      startAt: booking.startAt,
      endAt: booking.endAt,
      totalDurationMinutes: booking.totalDurationMinutes,
      occupiedDurationMinutes: booking.occupiedDurationMinutes,
      totalPriceAmountMinor: booking.totalPriceAmountMinor,
      totalPriceCurrency: booking.currency,
      lines: services.map((service) => ({
        serviceId: service.id,
        name: service.name,
        baseDurationMinutes: service.baseDurationMinutes,
        priceAmountMinor: service.priceAmountMinor ?? 0,
        priceCurrency: booking.currency,
      })),
    },
    // Runs inside the transaction, after the advisory lock (D2).
    async (tx: Executor): Promise<boolean> => {
      const fits = startOffered(booking.startMinute, booking.windows, booking.occupiedDurationMinutes, []);
      if (!fits) return false;
      const blocks = await bookedBlocks(master.id, booking.startAt, booking.endAt, tx);
      return blocks.length === 0;
    },
  );

  if (created === undefined) {
    throw new HttpProblem('SLOT_UNAVAILABLE', SLOT_UNAVAILABLE_DETAIL);
  }

  // `sent` is set before `sendJson`: the body is written in one call, and a
  // header set after it would be silently dropped.
  res.setHeader('Location', `${res.locals.baseUrl ?? '/api/v1'}/appointments/${created.id}`);

  sendJson(res, 201, 'Appointment', {
    id: created.id,
    status: created.status,
    client: booking.client,
    master: booking.master,
    services: created.lines.map((line) => ({
      serviceId: line.serviceId,
      name: line.name,
      baseDurationMinutes: line.baseDurationMinutes,
      price: { amountMinor: line.priceAmountMinor, currency: line.priceCurrency },
    })),
    startAt: salonDateTime(created.startAt),
    endAt: salonDateTime(created.endAt),
    totalDurationMinutes: created.totalDurationMinutes,
    occupiedDurationMinutes: created.occupiedDurationMinutes,
    totalPrice: {
      amountMinor: created.totalPriceAmountMinor,
      currency: created.totalPriceCurrency,
    },
    // D6: computed on read, from `startAt` and the injected clock (D9).
    reminders: remindersFor(created.startAt, now),
    accessToken: created.accessToken,
    confirmationUrl: `${CONFIRMATION_ORIGIN}/appointments/${created.accessToken}`,
    createdAt: salonDateTime(created.createdAt),
    updatedAt: salonDateTime(created.updatedAt),
  });
}

/** Registers P8 on the API router. The path takes no authentication. */
export function appointmentRoutes(router: Router): void {
  router.post(
    '/appointments',
    validateBody('createAppointment'),
    asyncRoute(createAppointmentHandler),
  );
}
