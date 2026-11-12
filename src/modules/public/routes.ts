/**
 * Public catalogue — P1–P6. Six operations, all `security: []`.
 *
 *   P1 GET /services                    listServices        → ServicePage
 *   P2 GET /services/{serviceId}        getService          → Service
 *   P3 GET /categories                  listCategories      → CategoryList
 *   P4 GET /masters                     listMasters         → MasterPage
 *   P5 GET /masters/{masterId}          getMaster           → MasterPublic
 *   P6 GET /masters/{masterId}/services listMasterServices  → MasterServicePage
 *
 * Source: REQ-F-001, REQ-F-002, REQ-F-014, REQ-F-024, SCN-08; POS-16, POS-18,
 *         POS-19; `error-model.md` §3 (400 for a wrong-typed parameter, 404 for
 *         an unknown id), §4; `resource-model.md` §5.1 (P1–P6), D19, D27.
 * Contract: openapi.yaml#/paths/~1services, ~1services~1{serviceId},
 *           ~1categories, ~1masters, ~1masters~1{masterId},
 *           ~1masters~1{masterId}~1services; schemas listed above.
 *
 * Why these six are in one module: they are one surface — the client's view of
 * what can be booked — and every one of them is a read with no owner. Splitting
 * them across the administrator modules would put a public response shape in a
 * file whose whole contract is the admin one.
 *
 * P3 declares 400 with no declared trigger (CL-10, carried from S1.3) and no
 * `validateParams` is mounted on it: no rule is invented for a code the contract
 * does not say how to reach.
 */

import { Router, type Request, type Response } from 'express';

import { HttpProblem } from '../../middleware/error-handler.js';
import { validateParams } from '../../middleware/validate.js';
import { asyncRoute, pageBody, pageRequest, sendJson } from '../reference-data/http.js';
import {
  findBookableMaster,
  findPublicService,
  listActiveServices,
  listBookableMasters,
  listMasterLinks,
  listPublicCategories,
} from './service.js';

/** P1 — active services, filtered by `category` and `q`, paged. */
async function listServicesHandler(_req: Request, res: Response): Promise<void> {
  const request = pageRequest(res);
  const query = res.locals.query as { category?: string; q?: string } | undefined;

  const { items, total } = await listActiveServices({
    ...(query?.category === undefined ? {} : { category: query.category }),
    ...(query?.q === undefined ? {} : { q: query.q }),
    limit: request.pageSize,
    offset: request.offset,
  });

  sendJson(res, 200, 'ServicePage', pageBody(items, total, request));
}

/** P2 — one service, active or retired; an unknown id is 404. */
async function getServiceHandler(_req: Request, res: Response): Promise<void> {
  const { serviceId } = res.locals.params as { serviceId: string };
  const service = await findPublicService(serviceId);

  if (service === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No service is defined with this id.');
  }

  sendJson(res, 200, 'Service', service);
}

/** P3 — the three seeds and any custom category (REQ-F-024). */
async function listCategoriesHandler(_req: Request, res: Response): Promise<void> {
  sendJson(res, 200, 'CategoryList', await listPublicCategories());
}

/** P4 — bookable masters only (D10); `active` defaults to the unfiltered set. */
async function listMastersHandler(_req: Request, res: Response): Promise<void> {
  const request = pageRequest(res);
  const query = res.locals.query as { active?: boolean } | undefined;

  const { items, total } = await listBookableMasters({
    ...(query?.active === undefined ? {} : { active: query.active }),
    limit: request.pageSize,
    offset: request.offset,
  });

  sendJson(res, 200, 'MasterPage', pageBody(items, total, request));
}

/** P5 — one bookable master; an administrator id names none (D10). */
async function getMasterHandler(_req: Request, res: Response): Promise<void> {
  const { masterId } = res.locals.params as { masterId: string };
  const master = await findBookableMaster(masterId);

  if (master === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No master is defined with this id.');
  }

  sendJson(res, 200, 'MasterPublic', master);
}

/**
 * P6 — one master's links.
 *
 * The master is resolved first for the same reason P5 does it: an administrator
 * id names no bookable master, and answering 200 with an empty page would say
 * the id is a master with no services (D10).
 */
async function listMasterServicesHandler(_req: Request, res: Response): Promise<void> {
  const { masterId } = res.locals.params as { masterId: string };
  const request = pageRequest(res);
  const query = res.locals.query as { active?: boolean } | undefined;

  if ((await findBookableMaster(masterId)) === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No master is defined with this id.');
  }

  const { items, total } = await listMasterLinks(masterId, {
    ...(query?.active === undefined ? {} : { active: query.active }),
    limit: request.pageSize,
    offset: request.offset,
  });

  sendJson(res, 200, 'MasterServicePage', pageBody(items, total, request));
}

/** Registers P1–P6 on the API router, with no authentication on any of them. */
export function publicRoutes(router: Router): void {
  // Registering order: `/masters/:masterId/services` before the shorter
  // `/masters/:masterId` is not required by Express 5 (the patterns are
  // distinct), but listing the two-segment sub-collection first keeps the more
  // specific path visible above the more general one.
  router.get(
    '/masters/:masterId/services',
    validateParams('listMasterServices'),
    asyncRoute(listMasterServicesHandler),
  );
  router.get('/masters/:masterId', validateParams('getMaster'), asyncRoute(getMasterHandler));
  router.get('/masters', validateParams('listMasters'), asyncRoute(listMastersHandler));
  router.get('/services', validateParams('listServices'), asyncRoute(listServicesHandler));
  router.get(
    '/services/:serviceId',
    validateParams('getService'),
    asyncRoute(getServiceHandler),
  );
  router.get('/categories', asyncRoute(listCategoriesHandler));
}
