/**
 * S5.1a administrator appointments — R19, R20 and getAppointmentAdmin.
 *
 *   R19 POST /admin/appointments                  createAppointmentAdmin → 201 Appointment
 *   R20 GET  /admin/appointments                  listAppointmentsAdmin  → 200 AppointmentAdminPage
 *       GET  /admin/appointments/{appointmentId}  getAppointmentAdmin    → 200 AppointmentAdmin
 *
 * Source: REQ-F-019 ("An administrator can create appointments on behalf of
 *         clients using the same business rules as public booking"),
 *         REQ-F-020 ("An administrator can view the appointment schedule across
 *         all masters, with filtering by date range, master, and status"),
 *         REQ-F-030 ("The acting administrator is not self-notified about
 *         actions they perform, but affected clients and masters receive
 *         notifications");
 *         `resource-model.md` §5.1 (R19, R20), §5.2;
 *         `openapi.yaml` createAppointmentAdmin, listAppointmentsAdmin,
 *         getAppointmentAdmin.
 * Contract: openapi.yaml#/paths/~1admin~1appointments,
 *           ~1admin~1appointments~1{appointmentId};
 *           schemas AppointmentCreate, Appointment, AppointmentAdminPage,
 *           AppointmentAdmin, Problem.
 * Ticket: SMS-32 (Feature)
 *
 * Decisions (S5.1 inventory, K1–K9):
 *
 *   K1  S5.1a covers the read-and-create operations (R19, R20,
 *       getAppointmentAdmin). The acting half (R21, R22, R23, SMS-18) is S5.1b.
 *   K2  R19 has no business rules of its own: it reuses the path P8 uses
 *       (`offBoundary`, `serviceRejection`, `startInPast`, the booking
 *       transaction with `bookedBlocks`, and 409 `SLOT_UNAVAILABLE`).
 *   K5  REQ-F-030 on R19: the acting administrator receives no notification row,
 *       while the client receives their confirmation SMS and the master
 *       receives their notification according to preferences.
 *   K8  An `appointmentId` that names no appointment (including a malformed or
 *       non-uuid string) answers 404 `NOT_FOUND` on getAppointmentAdmin,
 *       because the operation declares no 400.
 *   K9  The order of R20 is `startAt` then `id` ascending, the same ordering M1
 *       uses, so an appointment calendar always reads chronologically forwards.
 */

import { Router, type Request, type Response } from 'express';

import { adminAccess } from '../../middleware/authorize.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { asyncRoute, pageBody, pageRequest, sendJson } from '../reference-data/http.js';
import { bookAppointment, type AppointmentCreateBody } from './routes.js';
import { listAppointmentsAdmin, loadAppointmentById } from './service.js';
import { staffBody } from './staff-view.js';
import { appointmentBody } from './view.js';
import { nowOf } from '../../lib/clock.js';
import { appointmentNotFoundForId } from './lookup.js';

/**
 * Loads one appointment by id in staff representation (`AppointmentAdmin`).
 *
 * S5.1a: sibling of `loadAppointment` (which reads by access token). Dispatches
 * due reminders when confirmed (H3, J5) and excludes client credentials (D18, J2).
 */
export async function loadAppointmentAdmin(
  appointmentId: string,
  now: Date,
): Promise<Record<string, unknown> | undefined> {
  const record = await loadAppointmentById(appointmentId, now);
  if (record === undefined) return undefined;
  return staffBody(record);
}

/** R19 — create an appointment on a client's behalf. */
async function createAppointmentAdminHandler(req: Request, res: Response): Promise<void> {
  const body = res.locals.body as AppointmentCreateBody;
  const now = nowOf(req);

  const { created, booking } = await bookAppointment(body, now, 'admin');

  res.setHeader('Location', `${res.locals.baseUrl ?? '/api/v1'}/admin/appointments/${created.id}`);

  sendJson(
    res,
    201,
    'Appointment',
    appointmentBody({
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
      reminders: created.reminders.map((r) => ({
        type: r.type,
        scheduledAt: r.scheduledAt,
        status: r.status,
      })),
    }),
  );
}

/** R20 — list appointments across all masters. */
async function listAppointmentsAdminHandler(req: Request, res: Response): Promise<void> {
  const query = res.locals.query as
    { from?: string; to?: string; masterId?: string; status?: string } | undefined;
  const request = pageRequest(res);
  const now = nowOf(req);

  const { items, total } = await listAppointmentsAdmin(
    query ?? {},
    request.pageSize,
    request.offset,
    now,
  );

  sendJson(res, 200, 'AppointmentAdminPage', pageBody(items.map(staffBody), total, request));
}

/** getAppointmentAdmin — read one appointment in staff representation. */
async function getAppointmentAdminHandler(req: Request, res: Response): Promise<void> {
  const { appointmentId } = res.locals.params as { appointmentId: string };
  const now = nowOf(req);

  const body = await loadAppointmentAdmin(appointmentId, now);
  if (body === undefined) {
    throw appointmentNotFoundForId();
  }

  sendJson(res, 200, 'AppointmentAdmin', body);
}

/** Registers R19, R20 and getAppointmentAdmin on the admin router. */
export function adminAppointmentRoutes(router: Router): void {
  router.post(
    '/admin/appointments',
    ...adminAccess,
    validateBody('createAppointmentAdmin'),
    asyncRoute(createAppointmentAdminHandler),
  );
  router.get(
    '/admin/appointments',
    ...adminAccess,
    validateParams('listAppointmentsAdmin'),
    asyncRoute(listAppointmentsAdminHandler),
  );
  router.get(
    '/admin/appointments/:appointmentId',
    ...adminAccess,
    validateParams('getAppointmentAdmin'),
    asyncRoute(getAppointmentAdminHandler),
  );
}
