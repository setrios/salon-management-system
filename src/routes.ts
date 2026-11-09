/**
 * Route table.
 *
 * The contract defines 50 operations. They are mounted one component at a time:
 * each arrives with its own ticket, after its failing test and its TEST-GATE, so
 * that `git log` shows requirements → tests → implementation per operation.
 * Writing the routes first would be the "vibe coding" shape the task forbids.
 *
 * S1.1 mounts authentication (`login`, `getCurrentPrincipal`); S1.2 mounts the
 * five administrator reference-data modules (R1–R17). The remaining components
 * are listed as TODO below.
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
import { catalogRoutes } from './modules/catalog/routes.js';
import { masterRoutes } from './modules/masters/routes.js';
import { masterServiceRoutes } from './modules/master-services/routes.js';
import { materialRoutes } from './modules/materials/routes.js';
import { unitRoutes } from './modules/units/routes.js';

export const API_PREFIX = '/api/v1';

export function registerRoutes(app: Express): void {
  const api = Router();

  api.use(authRoutes);

  // Every administrator operation is guarded by the same pair of middlewares,
  // declared once in `authorize.ts` and spread onto each operation. Mounting the
  // gate on a sub-router would instead guard the whole `/admin` path space,
  // including requests that name no operation — those must stay 404 (unknown
  // path) or 405 (path exists, method does not), not become 401.
  const admin = Router();

  // `sendCreated` builds the `Location` the create operations declare from the
  // request's mount path, so the header is an absolute path (`/api/v1/...`)
  // rather than a collection-relative one.
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
  unitRoutes(admin);

  api.use(admin);

  // TODO(ticket-driven): the remaining components are mounted here as their
  // first ticket reaches its `feat:` commit:
  //
  //   api.use(availabilityRoutes)    availability, slots        SMS-8..
  //   api.use(appointmentsRoutes)    client booking, admin      SMS-10..
  //   api.use(paymentsRoutes)        payments                  SMS-22..
  //   api.use(reportsRoutes)         reports                   SMS-28..
  //
  // (Ticket numbers above are indicative; `docs/ticket-list.md` is the
  // authority and the manifest records the actual mapping.)

  app.use(API_PREFIX, api);
}
