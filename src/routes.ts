/**
 * Route table.
 *
 * The contract defines 50 operations. They are mounted one component at a time:
 * each arrives with its own ticket, after its failing test and its TEST-GATE, so
 * that `git log` shows requirements → tests → implementation per operation.
 * Writing the routes first would be the "vibe coding" shape the task forbids.
 *
 * S1.1 mounts authentication (`login`, `getCurrentPrincipal`); S1.2 mounts the
 * five administrator reference-data modules (R1–R17); S1.3 mounts availability
 * (`getMasterAvailability` publicly, `getMyAvailability` and
 * `replaceMyAvailability` behind the master role). The remaining components are
 * listed as TODO below.
 *
 * The `/api/v1` prefix is applied here and only here. Every path of
 * `openapi.yaml#/paths` is relative to the server base path, and the contract's
 * server entry is `https://api.salon.example/api/v1`.
 *
 * Intended shape of each module (see plan §5 for the component boundary):
 *
 *   modules/<component>/routes.ts   registers its operations on the router
 *   modules/<component>/service.ts  database work; knows Drizzle, not HTTP
 *   lib/<name>.ts                   pure logic; knows neither Express nor SQL
 *
 * Open item: `GET /health` is registered in app.ts, outside this router, because
 * it is infrastructure and not part of the contract.
 */

import type { Express } from 'express';
import { Router } from 'express';

import { authRoutes } from './modules/auth/routes.js';
import { adminActionRoutes } from './modules/appointments/admin-actions.js';
import { adminAppointmentRoutes } from './modules/appointments/admin.js';
import { paymentRoutes } from './modules/appointments/payments.js';
import { reportRoutes } from './modules/reports/routes.js';
import { appointmentRoutes } from './modules/appointments/routes.js';
import { availabilityRoutes } from './modules/availability/routes.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { masterRoutes } from './modules/masters/routes.js';
import { masterServiceRoutes } from './modules/master-services/routes.js';
import { materialRoutes } from './modules/materials/routes.js';
import { materialTransactionRoutes } from './modules/materials/transactions.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { publicRoutes } from './modules/public/routes.js';
import { unitRoutes } from './modules/units/routes.js';

/** The versioned prefix of every contract operation (`servers` in `openapi.yaml`). */
export const API_PREFIX = '/api/v1';

/**
 * Mounts every operation of the contract under `API_PREFIX`, one router per
 * module, and publishes the prefix so a create operation can build its
 * `Location` header from it. Called once by `createApp`.
 */
export function registerRoutes(app: Express): void {
  const api = Router();

  // Every operation mounted below answers under the API prefix, and a create
  // operation's `Location` header is built from it. Publishing it on the API
  // router means one declaration instead of one per module; the admin router
  // re-states it because it is mounted before this handler could rely on order
  // for its own sub-paths.
  api.use((_req, res, next) => {
    res.locals.baseUrl = API_PREFIX;
    next();
  });

  api.use(authRoutes);

  // Every administrator operation is guarded by the same pair of middlewares,
  // declared once in `authorize.ts` and spread onto each operation. Mounting the
  // gate on a sub-router would instead guard the whole `/admin` path space,
  // including requests that name no operation — those must stay 404 (unknown
  // path) or 405 (path exists, method does not), not become 401.
  const admin = Router();

  // `sendCreated` builds the `Location` the create operations declare from the
  // request's mount path, so the header is an absolute path (`/api/v1/...`)
  // rather than a collection-relative one. The API router already publishes it;
  // this states the same value on the admin router so an administrator route
  // does not depend on which handler ran first.
  admin.use((_req, res, next) => {
    res.locals.baseUrl = API_PREFIX;
    next();
  });
  // Each module attaches `adminAccess` and then validates its own operation:
  // 401 → 403 → 400/415/422 in that order for every administrator route.
  masterRoutes(admin);
  catalogRoutes(admin);
  masterServiceRoutes(admin);
  materialRoutes(admin);
  // R25/R26: the material's ledger (S5.2, SMS-33).
  materialTransactionRoutes(admin);
  unitRoutes(admin);
  // R24 reads the message records of one appointment. It belongs to the
  // administrator surface and is mounted after the other admin modules because
  // its path (`/admin/appointments/...`) collides with nothing here: the
  // appointment-management operations (R19–R23) arrive with SMS-32.
  notificationRoutes(admin);
  adminAppointmentRoutes(admin);
  // R21–R23 act on one appointment: the same component, mounted after the
  // reads and creates (S5.1b, SMS-32).
  adminActionRoutes(admin);
  // R27 records the money of a completed appointment (S5.3, SMS-34).
  paymentRoutes(admin);
  // R28–R30 answer questions about the data (S5.4, SMS-35).
  reportRoutes(admin);

  api.use(admin);

  // Availability is neither an administrator surface nor an operation behind a
  // single role: P7 is public and M3/M4 carry their own `masterAccess`, which is
  // why the module mounts on `api` rather than on `admin`. Mounting it on the
  // admin router would put P7 behind the administrator gate, and a client books
  // without an account (SRS §2 Actors).
  availabilityRoutes(api);

  // The public catalogue (P1–P6) and client booking (P8), the confirmation read
  // (P9) and cancellation by token (P10) are `security: []`:
  // a client books without an account (SRS §2 Actors), so neither is mounted
  // behind a gate. They are registered after `admin` and availability because
  // their paths (`/services`, `/masters`, `/appointments`) do not collide with
  // either; an Express router matches in registration order, and putting the
  // unauthenticated surface last keeps the guarded ones first in the trace.
  publicRoutes(api);
  appointmentRoutes(api);

  // TODO(ticket-driven): the remaining components are mounted here as their
  // first ticket reaches its `feat:` commit:
  //
  //   api.use(paymentsRoutes)        payments                  SMS-22..
  //   api.use(reportsRoutes)         reports                   SMS-28..
  //
  // (Ticket numbers above are indicative; `docs/ticket-list.md` is the
  // authority and the manifest records the actual mapping.)

  app.use(API_PREFIX, api);
}
