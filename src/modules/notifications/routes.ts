/**
 * Notifications — R24 and the caller's own M5, M6 and M7.
 *
 *   R24 GET   /admin/appointments/{appointmentId}/notifications
 *       listAppointmentNotifications → NotificationPage
 *   M5  GET   /me/notification-preferences
 *       getMyNotificationPreferences → NotificationPreferenceList
 *   M6  PATCH /me/notification-preferences
 *       updateMyNotificationPreference → NotificationPreference
 *   M7  GET   /me/notifications
 *       listMyNotifications → NotificationPage
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
 *
 * **R24 dispatches the due reminders before it lists them** (H3). A read is the
 * only trigger the system has, and the page is where a reminder's `sentAt` is
 * observable. The dispatch's own `exists` clause keeps a cancelled or completed
 * record from being dispatched (H5), so no status check is repeated here.
 */

import { Router, type Request, type Response } from 'express';

import { HttpProblem } from '../../middleware/error-handler.js';
import { authenticate, type Principal } from '../../middleware/auth.js';
import { adminAccess } from '../../middleware/authorize.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { getDb } from '../../db/client.js';
import { salonDateTime } from '../../lib/occupancy.js';
import { asyncRoute, pageBody, pageRequest, sendJson } from '../reference-data/http.js';
import type { PreferenceChannel, PreferenceEvent } from './preferences.js';
import {
  appointmentExists,
  dispatchDueReminders,
  listMyNotifications,
  listNotifications,
  readPreferences,
  setPreference,
  type NotificationPageResult,
} from './service.js';
import { nowOf } from '../../lib/clock.js';

/** One `Notification` as the contract exposes it; R24 and M7 share the shape. */
function notificationBody(row: NotificationPageResult['items'][number]): Record<string, unknown> {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    audience: row.audience,
    eventType: row.eventType,
    channel: row.channel,
    status: row.status,
    ...(row.scheduledAt === null ? {} : { scheduledAt: salonDateTime(row.scheduledAt) }),
    ...(row.sentAt === null ? {} : { sentAt: salonDateTime(row.sentAt) }),
    createdAt: salonDateTime(row.createdAt),
  };
}

/** R24 — one page of an appointment's notification records. */
async function listAppointmentNotificationsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { appointmentId } = res.locals.params as { appointmentId: string };

  if (!(await appointmentExists(appointmentId))) {
    throw new HttpProblem('NOT_FOUND', 'No appointment is defined with this id.');
  }

  const now = nowOf(req);
  await dispatchDueReminders(appointmentId, now);

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
    pageBody(items.map(notificationBody), total, request),
  );
}

/**
 * M5 — the caller's six combinations.
 *
 * `authenticate` only, not `masterAccess`: the contract declares no 403 for M5,
 * and the administrator has preferences of their own (REQ-F-023, I3).
 */
async function getMyNotificationPreferencesHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const principal = res.locals.principal as Principal;
  sendJson(res, 200, 'NotificationPreferenceList', await readPreferences(getDb(), principal.id));
}

/** M6 — toggles exactly one combination (REQ-F-026, I4). */
async function updateMyNotificationPreferenceHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const principal = res.locals.principal as Principal;
  const body = res.locals.body as {
    channel: PreferenceChannel;
    eventType: PreferenceEvent;
    enabled: boolean;
  };
  const now = nowOf(req);

  sendJson(
    res,
    200,
    'NotificationPreference',
    await setPreference(getDb(), principal.id, body, now),
  );
}

/** M7 — the caller's own records, filtered and paged (I9–I11). */
async function listMyNotificationsHandler(req: Request, res: Response): Promise<void> {
  const principal = res.locals.principal as Principal;
  const query = res.locals.query as
    | { status?: string; eventType?: string; from?: string; to?: string }
    | undefined;
  const request = pageRequest(res);

  const { items, total } = await listMyNotifications(
    principal,
    query ?? {},
    request.pageSize,
    request.offset,
  );

  sendJson(res, 200, 'NotificationPage', pageBody(items.map(notificationBody), total, request));
}

/** Registers R24 (admin) and M5/M6/M7 (any authenticated caller) on the router. */
export function notificationRoutes(router: Router): void {
  router.get(
    '/admin/appointments/:appointmentId/notifications',
    ...adminAccess,
    validateParams('listAppointmentNotifications'),
    asyncRoute(listAppointmentNotificationsHandler),
  );

  router.get(
    '/me/notification-preferences',
    authenticate,
    asyncRoute(getMyNotificationPreferencesHandler),
  );

  router.patch(
    '/me/notification-preferences',
    authenticate,
    validateBody('updateMyNotificationPreference'),
    asyncRoute(updateMyNotificationPreferenceHandler),
  );

  router.get(
    '/me/notifications',
    authenticate,
    validateParams('listMyNotifications'),
    asyncRoute(listMyNotificationsHandler),
  );
}
