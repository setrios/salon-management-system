/**
 * Appointments — P8 `createAppointment`, P9 `getAppointmentByToken`, P10
 * `cancelAppointmentByToken` and P11 `rescheduleAppointmentByToken`.
 *
 *   P8  POST /appointments                    createAppointment            (public, `security: []`)
 *   P9  GET  /appointments/{token}            getAppointmentByToken        (public, `security: []`)
 *   P10 POST /appointments/{token}/cancel     cancelAppointmentByToken     (public, `security: []`)
 *   P11 POST /appointments/{token}/reschedule rescheduleAppointmentByToken (public, `security: []`)
 *
 * Source: REQ-F-001 (one or more services; totals are the sums), REQ-F-002
 *         (only a slot inside availability and not already booked), REQ-F-003
 *         (confirmed on creation; no approval state), REQ-F-004 and REQ-F-005
 *         (the record carries the token and the confirmation URL; the page is
 *         reachable again by it), REQ-F-006 (the client cancels by the link, free
 *         of charge, at any time), REQ-F-010 and REQ-F-011 (reminders 24 h and
 *         2 h ahead, skipped when already past), REQ-NF-001 (the access token is
 *         the credential), REQ-NF-008 (30-minute boundaries), REQ-F-031 (the
 *         rounded block is what is reserved); SCN-01, SCN-02, SCN-13; POS-01,
 *         POS-13, NEG-01, NEG-02, NEG-08, NEG-14, NEG-15, NEG-17;
 *         `error-model.md` §3, §3.1 (the state table), §4; `resource-model.md` §4
 *         (`cancelled` frees a block), §5.1 (P8, P9, P10), line 165 (POST
 *         actions are idempotent in effect).
 * Contract: openapi.yaml#/paths/~1appointments/post,
 *           ~1appointments~1{token}, ~1appointments~1{token}~1cancel; schemas
 *           AppointmentCreate, Appointment, AppointmentService, Reminder,
 *           Problem.
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
 * P8 writes no status other than `confirmed`: REQ-F-003 gives creation no other
 * outcome, and `AppointmentCreate` declares no `status` field (D-22).
 *
 * P9 answers 200 for **every** stored record its token names, whatever the
 * status: SRS v1.3's glossary says the page and its access token stay valid,
 * read-only, after cancellation, so a `cancelled` record is 200 with
 * `status: cancelled`, not 404. The only 404 is a token that names nothing —
 * which includes a token that is not a uuid at all, because P9 declares no 400
 * (E6).
 *
 * P10 is the only operation in this module that writes a status other than
 * `confirmed`. Its decision is `state.ts`'s (`error-model.md` §3.1), not this
 * file's: a `confirmed` record becomes `cancelled`; an already `cancelled` record
 * answers 200 unchanged and is not written; a `completed` record answers 409
 * `INVALID_STATE_TRANSITION` and is not written. The 200 body is P9's body —
 * `findByToken` re-read and `appointmentBody` — so the cancellation answer cannot
 * drift from the read that follows it.
 */

import { Router, type Request, type Response } from 'express';

import { windowsOn } from '../../lib/availability.js';
import {
  minutesOnDate,
  salonDateOfInstant,
  startOffered,
} from '../../lib/occupancy.js';
import { HttpProblem } from '../../middleware/error-handler.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { readAvailability } from '../availability/service.js';
import { asyncRoute, sendJson } from '../reference-data/http.js';
import { rescheduleDecision } from './reschedule.js';
import {
  offBoundary,
  serviceRejection,
  startInPast,
  totalsFor,
  type BookableService,
} from './rules.js';
import {
  bookedBlocks,
  cancelByToken,
  createAppointment,
  findByToken,
  findBookableServices,
  findBookingMaster,
  loadAppointment,
  rescheduleAppointment,
  type Executor,
} from './service.js';
import { appointmentBody, CONFIRMATION_ORIGIN } from './view.js';
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

  // CL-11: a start at or before the injected clock is refused. The rule is
  // `rules.ts`'s, shared with P11, so the two operations cannot disagree.
  if (startInPast(startAt, now)) {
    throw new HttpProblem('BUSINESS_RULE_VIOLATION', 'startAt must be in the future.');
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
      // The injected clock (D9): the instant the confirmation message is
      // recorded as sent, in the same transaction (E2/E3).
      now,
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

  sendJson(
    res,
    201,
    'Appointment',
    appointmentBody(
      {
        id: created.id,
        status: created.status,
        clientName: booking.client.name,
        clientPhone: booking.client.phone,
        masterId: booking.master.id,
        masterFullName: booking.master.fullName,
        startAt: created.startAt,
        endAt: created.endAt,
        totalDurationMinutes: created.totalDurationMinutes,
        occupiedDurationMinutes: created.occupiedDurationMinutes,
        totalPriceAmountMinor: created.totalPriceAmountMinor,
        totalPriceCurrency: created.totalPriceCurrency,
        accessToken: created.accessToken,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        lines: created.lines,
        reminders: created.reminders,
      },
    ),
  );
}

/**
 * P9 — the appointment a token names.
 *
 * One 404 and no other refusal: a token that names nothing. A uuid that names no
 * row and a value that is not a uuid are the same answer, because the token is
 * the credential and neither grants access (REQ-NF-001, E6). A record in any
 * status — including `cancelled` — is 200, because SRS v1.3's glossary keeps the
 * page and its token valid, read-only, after cancellation.
 *
 * `validateParams('getAppointmentByToken')` runs first and answers the non-uuid
 * case itself: P9 declares no 400, so its shared-rule branch produces
 * `NOT_FOUND` (see `middleware/validate.ts`), and this handler never sees it.
 */
async function getAppointmentByTokenHandler(req: Request, res: Response): Promise<void> {
  const { token } = res.locals.params as { token: string };
  const now = (req.app.locals.now as (() => Date) | undefined)?.() ?? new Date();

  // H3: the read is what dispatches a due reminder, so the record is loaded
  // through `loadAppointment`, not `findByToken`.
  const record = await loadAppointment(token, now);
  if (record === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No appointment exists for the supplied access token.');
  }

  sendJson(res, 200, 'Appointment', appointmentBody(record));
}

/**
 * P10 — cancel the appointment a token names.
 *
 * The state decision is `state.ts`'s; this handler maps its three outcomes to
 * the contract's declared set (200 `Appointment`, 404, 409, 500) and nothing
 * else. A non-uuid token never reaches here: `validateParams` answers it with
 * 404, because P10 declares no 400 (the same branch P9 takes).
 *
 * The 200 body is `appointmentBody` over the record `cancelByToken` re-read
 * through `findByToken` — the same mapper P8's 201 and P9's 200 use. There is no
 * second mapper, so the cancellation answer and the read that follows it cannot
 * disagree.
 */
async function cancelAppointmentByTokenHandler(req: Request, res: Response): Promise<void> {
  const { token } = res.locals.params as { token: string };
  const now = (req.app.locals.now as (() => Date) | undefined)?.() ?? new Date();

  const result = await cancelByToken(token, now);

  if (result.kind === 'not-found') {
    throw new HttpProblem('NOT_FOUND', 'No appointment exists for the supplied access token.');
  }

  if (result.kind === 'rejected') {
    throw new HttpProblem(
      result.code,
      'A completed appointment cannot be cancelled.',
    );
  }

  sendJson(res, 200, 'Appointment', appointmentBody(result.record));
}

/** `AppointmentReschedule` as the contract declares it (closed body, D-22). */
interface AppointmentRescheduleBody {
  readonly startAt: string;
  readonly masterId?: string;
}

/**
 * P11 — reschedule the appointment a token names.
 *
 * The decision is `reschedule.ts`'s; this handler reads what it needs, maps a
 * refusal to the contract's declared set (400/404/409/422/415/500) and a move to
 * 200 `Appointment`. The order is the gate's (§3): token → state → past →
 * master → coverage → slot. The first five are decided before the transaction;
 * only the slot check runs inside it, under the advisory lock (D2).
 *
 * A non-uuid token never reaches here: P11 declares 400, so `validateParams`
 * answers it with `MALFORMED_REQUEST` (unlike P9 and P10, which declare no 400
 * and answer 404).
 *
 * The 200 body is `appointmentBody` over the record `rescheduleAppointment`
 * re-read through `findByToken` — the same mapper P8's 201, P9's 200 and P10's
 * 200 use.
 */
async function rescheduleAppointmentByTokenHandler(req: Request, res: Response): Promise<void> {
  const { token } = res.locals.params as { token: string };
  const body = res.locals.body as AppointmentRescheduleBody;
  const now = (req.app.locals.now as (() => Date) | undefined)?.() ?? new Date();

  // 1. The token. Without a record there is nothing to decide.
  const record = await findByToken(token);
  if (record === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No appointment exists for the supplied access token.');
  }

  const startAt = new Date(body.startAt);

  // The new master is resolved only when the body names one. When it names the
  // record's own master, the decision ignores the resolution (G4 applies to a
  // change), so resolving it is harmless and keeps the branch simple.
  const newMaster =
    body.masterId === undefined ? undefined : await findBookingMaster(body.masterId);
  const newMasterServices =
    body.masterId === undefined
      ? []
      : await findBookableServices(
          body.masterId,
          record.lines.map((line) => line.serviceId),
        );

  // 2–5. The state, the past, the master and the coverage.
  const decision = rescheduleDecision(
    record,
    { startAt, masterId: body.masterId },
    now,
    newMaster,
    newMasterServices,
  );

  if (decision.kind === 'rejected') {
    throw new HttpProblem(decision.code, decision.detail);
  }

  const date = salonDateOfInstant(decision.startAt);
  const dateKey = dateKeyOf(date);
  const startMinute = minutesOnDate(date, decision.startAt);
  const windows = windowsOn(dateKey, await readAvailability(decision.masterId));

  // 6. The slot, inside the transaction and under the advisory lock (D2, G5).
  const result = await rescheduleAppointment(
    {
      appointmentId: record.id,
      masterId: decision.masterId,
      startAt: decision.startAt,
      endAt: decision.endAt,
      lines: decision.lines,
      reprice: decision.reprice,
      totalPriceAmountMinor: decision.totalPriceAmountMinor,
      totalPriceCurrency: decision.totalPriceCurrency,
      now,
    },
    async (tx: Executor): Promise<boolean> => {
      const fits = startOffered(
        startMinute,
        windows,
        record.occupiedDurationMinutes,
        [],
      );
      if (!fits) return false;
      // The record itself is excluded: a reschedule must not see its own block
      // as a conflict (R18, the same-time case).
      const blocks = await bookedBlocks(
        decision.masterId,
        decision.startAt,
        decision.endAt,
        tx,
        record.id,
      );
      return blocks.length === 0;
    },
  );

  if (result.kind === 'slot-unavailable') {
    throw new HttpProblem('SLOT_UNAVAILABLE', SLOT_UNAVAILABLE_DETAIL);
  }

  if (result.kind === 'rejected') {
    throw new HttpProblem(
      result.code,
      'A cancelled or completed appointment cannot be rescheduled.',
    );
  }

  sendJson(res, 200, 'Appointment', appointmentBody(result.record));
}

/** Registers P8, P9, P10 and P11 on the API router. None of the paths takes authentication. */
export function appointmentRoutes(router: Router): void {
  router.post(
    '/appointments',
    validateBody('createAppointment'),
    asyncRoute(createAppointmentHandler),
  );
  router.get(
    '/appointments/:token',
    validateParams('getAppointmentByToken'),
    asyncRoute(getAppointmentByTokenHandler),
  );
  router.post(
    '/appointments/:token/cancel',
    validateParams('cancelAppointmentByToken'),
    asyncRoute(cancelAppointmentByTokenHandler),
  );
  router.post(
    '/appointments/:token/reschedule',
    validateParams('rescheduleAppointmentByToken'),
    validateBody('rescheduleAppointmentByToken'),
    asyncRoute(rescheduleAppointmentByTokenHandler),
  );
}
