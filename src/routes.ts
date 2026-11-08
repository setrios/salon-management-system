/**
 * Route table — DECLARATION ONLY.
 *
 * The contract defines 50 operations. None of them is registered yet: each is
 * added by its own ticket, after its failing test and its TEST-GATE, so that
 * `git log` shows requirements → tests → implementation per operation. Writing
 * the routes first would be the "vibe coding" shape the task forbids.
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

export const API_PREFIX = '/api/v1';

export function registerRoutes(app: Express): void {
  const api = Router();

  // TODO(ticket-driven): one router per system component, mounted here as that
  // component's first ticket reaches its `feat:` commit:
  //
  //   api.use(authRoutes)            authentication            SMS-1..
  //   api.use(catalogRoutes)         services, categories      SMS-2..
  //   api.use(mastersRoutes)         masters                   SMS-4..
  //   api.use(masterServicesRoutes)  master-service links       SMS-6..
  //   api.use(availabilityRoutes)    availability, slots        SMS-8..
  //   api.use(appointmentsRoutes)    client booking, admin      SMS-10..
  //   api.use(materialsRoutes)       materials, transactions    SMS-20..
  //   api.use(paymentsRoutes)        payments                  SMS-22..
  //   api.use(reportsRoutes)         reports                   SMS-28..
  //
  // (Ticket numbers above are indicative; `docs/ticket-list.md` is the
  // authority and the manifest records the actual mapping.)

  app.use(API_PREFIX, api);
}
