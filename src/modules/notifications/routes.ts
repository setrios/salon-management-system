/**
 * Notifications — administrator operation R24.
 *
 *   R24 GET /admin/appointments/{appointmentId}/notifications
 *       listAppointmentNotifications → NotificationPage
 *
 * Source: REQ-F-005 (exactly one confirmation SMS is recorded per booking — this
 *         is the operation that makes that observable), REQ-F-009, REQ-F-023,
 *         REQ-F-029 (later rows on the same table); SCN-01;
 *         `resource-model.md:264` (R24: 200 `NotificationPage`, 400, 404),
 *         `:37` (REQ-F-005 → P8, R24); `api-traceability.md:31`;
 *         `error-model.md` §3–§4.
 * Contract: openapi.yaml#/paths/~1admin~1appointments~1{appointmentId}~1notifications;
 *           schemas NotificationPage, Notification, Problem.
 *
 * The operation belongs to the administrator (`tags: [Admin]`, global
 * `bearerAuth`), so it is mounted behind `adminAccess`: 401 without credentials,
 * 403 for a master's token, in that order. A non-uuid id is 400
 * `MALFORMED_REQUEST` — R24 declares 400, so the shared parameter rule takes that
 * branch (CL-09's mirror; P9, which declares no 400, answers 404 for the same
 * shape instead).
 *
 * The 404 is for an id that names no appointment, not for one with no messages:
 * a booking always writes its confirmation record (E2), and a later stage that
 * writes none must still answer 200 with an empty page rather than suggesting the
 * appointment does not exist.
 */

import { Router, type Request, type Response } from 'express';

import { HttpProblem } from '../../middleware/error-handler.js';
import { adminAccess } from '../../middleware/authorize.js';
import { validateParams } from '../../middleware/validate.js';
import { salonDateTime } from '../../lib/occupancy.js';
import { asyncRoute, pageBody, pageRequest, sendJson } from '../reference-data/http.js';
import { appointmentExists, listNotifications } from './service.js';

/** R24 — one page of an appointment's notification records. */
async function listAppointmentNotificationsHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const { appointmentId } = res.locals.params as { appointmentId: string };

  if (!(await appointmentExists(appointmentId))) {
    throw new HttpProblem('NOT_FOUND', 'No appointment is defined with this id.');
  }

  const request = pageRequest(res);
  const { items, total } = await listNotifications(
    appointmentId,
    request.pageSize,
    request.offset,
  );

  sendJson(
    res,
    200,
    'NotificationPage',
    pageBody(
      items.map((row) => ({
        id: row.id,
        appointmentId: row.appointmentId,
        audience: row.audience,
        eventType: row.eventType,
        channel: row.channel,
        status: row.status,
        ...(row.scheduledAt === null ? {} : { scheduledAt: salonDateTime(row.scheduledAt) }),
        ...(row.sentAt === null ? {} : { sentAt: salonDateTime(row.sentAt) }),
        createdAt: salonDateTime(row.createdAt),
      })),
      total,
      request,
    ),
  );
}

/** Registers R24 on the admin router, mounted behind the role gate. */
export function notificationRoutes(router: Router): void {
  router.get(
    '/admin/appointments/:appointmentId/notifications',
    ...adminAccess,
    validateParams('listAppointmentNotifications'),
    asyncRoute(listAppointmentNotificationsHandler),
  );
}
