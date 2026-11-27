/**
 * S5.1b administrator actions — R21, R22 and R23.
 *
 *   R21 PATCH /admin/appointments/{appointmentId}           updateAppointmentAdmin
 *   R22 POST  /admin/appointments/{appointmentId}/cancel    cancelAppointmentAdmin
 *   R23 POST  /admin/appointments/{appointmentId}/complete  completeAppointment
 *
 * The three operations act on one stored appointment, so they share the read
 * that names it and the staff answer that reports it; what differs is the
 * decision, which none of them invents here:
 *
 *   - **R21** is `reschedule.ts`'s decision (K3). This file only prepares it: it
 *     resolves the requested service set against the target master (L4), builds
 *     the record the decision sees, and applies the one rule the shared decision
 *     does not carry — the 30-minute boundary, which R21 answers 422 like R19
 *     and P8 (L3). The slot check runs inside the write, under the advisory lock
 *     on the master (D2), because that is the only place the answer is not
 *     stale; the write itself is `service.ts`'s `editAppointment`.
 *   - **R22 and R23** are `state.ts`'s table (`error-model.md` §3.1, K7) and
 *     `service.ts`'s `transitionAppointmentById`. R22 writes the cancellation
 *     event with `actor: 'admin'`, so the acting administrator is not
 *     self-notified while the master still is (REQ-F-030, K5); R23 writes no
 *     event at all (K6).
 *
 * **What an edit answers.** `AppointmentAdmin`, read back after the commit — the
 * same staff view R18 (the list) and R20 (`getAppointmentAdmin`) serve. It never carries the
 * client's access token (D18, REQ-NF-006).
 *
 * **Who gets a message.** A supplied `startAt` or a changed master is a
 * reschedule for the client (REQ-F-028, K3, L5): one `reschedule` SMS and one
 * set of master/administrator rows. A `serviceIds` or `client` change is a
 * correction (K4, L4): the record is rewritten, nothing is announced. The
 * reminder moments move only when the time moved (H6).
 *
 * Source: REQ-F-019 ("The administrator can create, edit, and cancel client
 *         appointments"), REQ-F-027 ("The administrator marks an appointment as
 *         completed once the service(s) have been performed; this is a
 *         precondition for payment"), REQ-F-028 ("the system applies the same
 *         reminder recalculation (REQ-F-008) and sends the client the same
 *         updated-details SMS (REQ-F-009) as for a client-initiated
 *         reschedule"), REQ-F-030 ("the administrator does not receive a
 *         notification for that specific event; the assigned master's
 *         notification (REQ-F-016) is unaffected"), REQ-F-001, REQ-F-031, REQ-NF-008,
 *         REQ-NF-006;
 *         `error-model.md` §3, §3.1; `resource-model.md` §5.5 (R21–R23);
 *         `openapi.yaml` updateAppointmentAdmin, cancelAppointmentAdmin,
 *         completeAppointment, `AppointmentPatch`.
 * Contract: openapi.yaml#/paths/~1admin~1appointments~1{appointmentId},
 *           ~1admin~1appointments~1{appointmentId}~1cancel,
 *           ~1admin~1appointments~1{appointmentId}~1complete;
 *           schemas AppointmentPatch, AppointmentAdmin, Problem.
 * Ticket: SMS-32 (Feature)
 *
 * Decisions (S5.1 inventory): K1, K3–K8; L1–L6 as defined in
 * `logs/gates/2026-11-13-test-SMS-32-b.md` §1.1.
 */

import { Router, type Request, type Response } from 'express';

import { windowsOn } from '../../lib/availability.js';
import { minutesOnDate, salonDateOfInstant, startOffered } from '../../lib/occupancy.js';
import { adminAccess } from '../../middleware/authorize.js';
import { HttpProblem } from '../../middleware/error-handler.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { readAvailability } from '../availability/service.js';
import { asyncRoute, sendJson } from '../reference-data/http.js';
import { dateKeyOf } from './routes.js';
import { rescheduleDecision } from './reschedule.js';
import { offBoundary, serviceRejection, totalsFor, type BookableService } from './rules.js';
import {
  bookedBlocks,
  editAppointment,
  findBookableServices,
  findById,
  findBookingMaster,
  transitionAppointmentById,
  type Executor,
} from './service.js';
import { isAppointmentStatus, stateOutcome } from './state.js';
import { staffBody } from './staff-view.js';
import type { AppointmentLine } from './view.js';
import { nowOf } from '../../lib/clock.js';
import { appointmentNotFoundForId } from './lookup.js';

/** `AppointmentPatch` as the contract declares it (closed body, D-22). */
interface AppointmentPatchBody {
  readonly startAt?: string;
  readonly masterId?: string;
  readonly serviceIds?: readonly string[];
  readonly client?: { readonly name: string; readonly phone: string };
}

/**
 * The 409 detail for an edit whose block cannot be taken.
 *
 * Same single `code` as P8 (`SLOT_UNAVAILABLE`), a sentence that names the two
 * causes; `error-model.md` §3 lists R21 among the operations that answer it.
 */
const EDIT_SLOT_UNAVAILABLE_DETAIL =
  "The requested slot cannot be taken with this master: it is outside the master's availability or overlaps an existing appointment.";

/** R21 — edit one appointment. */
async function updateAppointmentAdminHandler(req: Request, res: Response): Promise<void> {
  const { appointmentId } = res.locals.params as { appointmentId: string };
  const body = res.locals.body as AppointmentPatchBody;
  const now = nowOf(req);

  const record = await findById(appointmentId);
  if (record === undefined) {
    throw appointmentNotFoundForId();
  }

  // K7: the state is decided before the body's rules, the order `reschedule.ts`
  // documents. The lookup is the table's, not a restatement of it.
  if (!isAppointmentStatus(record.status)) {
    throw new Error(
      `appointment ${record.id} has status "${record.status}", which error-model.md §3.1 does not define`,
    );
  }
  if (stateOutcome(record.status, 'edit').kind === 'rejected') {
    throw new HttpProblem(
      'INVALID_STATE_TRANSITION',
      'A cancelled or completed appointment cannot be edited.',
    );
  }

  const targetMasterId = body.masterId ?? record.masterId;
  const masterChanged = body.masterId !== undefined && body.masterId !== record.masterId;

  // L4: the requested set is read from the target master's links, whether or not
  // the master changes, so a service they do not offer is refused here.
  let lines: readonly AppointmentLine[] = record.lines;
  let totalDurationMinutes = record.totalDurationMinutes;
  let occupiedDurationMinutes = record.occupiedDurationMinutes;
  let totalPriceAmountMinor = record.totalPriceAmountMinor;
  let totalPriceCurrency = record.totalPriceCurrency;

  if (body.serviceIds !== undefined) {
    const resolved = await findBookableServices(targetMasterId, body.serviceIds);
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

    // The same sum and the same single rounding a booking uses (REQ-F-001,
    // REQ-F-031): one rule, one function.
    const totals = totalsFor(services);
    lines = services.map((service) => ({
      serviceId: service.id,
      name: service.name,
      baseDurationMinutes: service.baseDurationMinutes,
      priceAmountMinor: service.priceAmountMinor ?? 0,
      priceCurrency: service.currency,
    }));
    totalDurationMinutes = totals.totalDurationMinutes;
    occupiedDurationMinutes = totals.occupiedDurationMinutes;
    totalPriceAmountMinor = totals.totalPriceAmountMinor;
    totalPriceCurrency = services[0]?.currency ?? record.totalPriceCurrency;
  }

  // L1: the new master is resolved only for a change; the decision ignores the
  // resolution when the master stays (G4 applies to a change, not to the
  // record's existing master).
  const newMaster = masterChanged ? await findBookingMaster(targetMasterId) : undefined;
  const newMasterServices = masterChanged
    ? await findBookableServices(
        targetMasterId,
        lines.map((line) => line.serviceId),
      )
    : [];

  const startAt = body.startAt === undefined ? undefined : new Date(body.startAt);

  // K3: the whole time/master/coverage decision, P11's own function.
  const decision = rescheduleDecision(
    {
      status: record.status,
      masterId: record.masterId,
      startAt: record.startAt,
      occupiedDurationMinutes,
      totalPriceAmountMinor,
      totalPriceCurrency,
      lines,
    },
    { startAt, masterId: body.masterId },
    now,
    newMaster,
    newMasterServices,
  );

  if (decision.kind === 'rejected') {
    throw new HttpProblem(decision.code, decision.detail);
  }

  // L3: R21 answers 422 for a boundary R19 would refuse, where P11 answers 409
  // (register row 13). The body's fault is named before the calendar's.
  if (startAt !== undefined && offBoundary(decision.startAt)) {
    throw new HttpProblem('BUSINESS_RULE_VIOLATION', 'startAt must fall on a 30-minute boundary.');
  }

  // The slot is re-checked only when the block can move. A client-only patch
  // (K4) keeps every value the calendar depends on.
  const movesBlock = startAt !== undefined || masterChanged || body.serviceIds !== undefined;
  const blockMinutes = Math.round((decision.endAt.getTime() - decision.startAt.getTime()) / 60_000);

  let recheck: (tx: Executor) => Promise<boolean> = (): Promise<boolean> => Promise.resolve(true);
  if (movesBlock) {
    const date = salonDateOfInstant(decision.startAt);
    const dateKey = dateKeyOf(date);
    const startMinute = minutesOnDate(date, decision.startAt);
    const windows = windowsOn(dateKey, await readAvailability(decision.masterId));

    recheck = async (tx: Executor): Promise<boolean> => {
      if (!startOffered(startMinute, windows, blockMinutes, [])) return false;
      // The record is excluded: an edit must not see its own block as a
      // conflict (R18's same-time case, the reading P11 uses).
      const blocks = await bookedBlocks(
        decision.masterId,
        decision.startAt,
        decision.endAt,
        tx,
        record.id,
      );
      return blocks.length === 0;
    };
  }

  const result = await editAppointment(
    {
      appointmentId: record.id,
      masterId: decision.masterId,
      startAt: decision.startAt,
      endAt: decision.endAt,
      totalDurationMinutes,
      occupiedDurationMinutes,
      lines: decision.lines,
      reprice: decision.reprice,
      replaceLines: body.serviceIds !== undefined,
      totalPriceAmountMinor: decision.totalPriceAmountMinor,
      totalPriceCurrency: decision.totalPriceCurrency,
      client: body.client,
      // H6: only a time move rewrites the two reminder moments.
      recalculateReminders: startAt !== undefined,
      // REQ-F-028, K4, L4, L5: a time or master change is the reschedule.
      emitReschedule: startAt !== undefined || masterChanged,
      actor: 'admin',
      now,
    },
    recheck,
  );

  if (result.kind === 'slot-unavailable') {
    throw new HttpProblem('SLOT_UNAVAILABLE', EDIT_SLOT_UNAVAILABLE_DETAIL);
  }
  if (result.kind === 'rejected') {
    throw new HttpProblem(
      'INVALID_STATE_TRANSITION',
      'A cancelled or completed appointment cannot be edited.',
    );
  }

  sendJson(res, 200, 'AppointmentAdmin', staffBody(result.record));
}

/** R22 and R23 — the two status actions, one handler. */
async function transitionAdminHandler(
  req: Request,
  res: Response,
  action: 'cancel' | 'complete',
): Promise<void> {
  const { appointmentId } = res.locals.params as { appointmentId: string };
  const now = nowOf(req);

  const result = await transitionAppointmentById(appointmentId, action, now);

  if (result.kind === 'not-found') {
    throw appointmentNotFoundForId();
  }
  if (result.kind === 'rejected') {
    throw new HttpProblem(
      result.code,
      action === 'cancel'
        ? 'A completed appointment cannot be cancelled.'
        : 'A cancelled appointment cannot be completed.',
    );
  }

  sendJson(res, 200, 'AppointmentAdmin', staffBody(result.record));
}

/** R22 — cancel one appointment (REQ-F-019, REQ-F-030). */
function cancelAppointmentAdminHandler(req: Request, res: Response): Promise<void> {
  return transitionAdminHandler(req, res, 'cancel');
}

/** R23 — mark one appointment completed (REQ-F-027). */
function completeAppointmentHandler(req: Request, res: Response): Promise<void> {
  return transitionAdminHandler(req, res, 'complete');
}

/** Registers R21, R22 and R23 on the admin router. */
export function adminActionRoutes(router: Router): void {
  router.patch(
    '/admin/appointments/:appointmentId',
    ...adminAccess,
    validateParams('updateAppointmentAdmin'),
    validateBody('updateAppointmentAdmin'),
    asyncRoute(updateAppointmentAdminHandler),
  );
  router.post(
    '/admin/appointments/:appointmentId/cancel',
    ...adminAccess,
    validateParams('cancelAppointmentAdmin'),
    asyncRoute(cancelAppointmentAdminHandler),
  );
  router.post(
    '/admin/appointments/:appointmentId/complete',
    ...adminAccess,
    validateParams('completeAppointment'),
    asyncRoute(completeAppointmentHandler),
  );
}
