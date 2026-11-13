/**
 * Master-service links — administrator operations R10–R12 and the master's M2.
 *
 *   R10 GET   /admin/master-services                  listMasterServicesAdmin → MasterServicePage
 *   R11 POST  /admin/master-services                  createMasterService     → 201 MasterService + Location
 *   R12 PATCH /admin/master-services/{masterServiceId} updateMasterService    → MasterService
 *   M2  GET   /me/services                            listMyServices          → MasterServiceList
 *
 * Source: REQ-F-018 (the administrator sets what a master charges for a
 *         service), D-24 (`error-model.md` §3 names the link pair as one of the
 *         three uniqueness constraints, so R11's 409 is reachable), CL-10 (R12's
 *         declared 409 is not: `MasterServicePatch` cannot name a new pair).
 * Contract: openapi.yaml#/paths/~1admin~1master-services,
 *           ~1admin~1master-services~1{masterServiceId}.
 */

import { Router, type Request, type Response } from 'express';

import { HttpProblem } from '../../middleware/error-handler.js';
import { type Principal } from '../../middleware/auth.js';
import { adminAccess, masterAccess } from '../../middleware/authorize.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import {
  asyncRoute,
  isUniqueViolation,
  pageBody,
  pageRequest,
  sendCreated,
  sendJson,
} from '../reference-data/http.js';
import {
  createLink,
  LINK_CONSTRAINT,
  listLinks,
  updateLink,
  type LinkCreateInput,
  type LinkPatchInput,
} from './service.js';

/**
 * M2 — the caller's own links (REQ-F-014, J7).
 *
 * `MasterServiceList` is a bare array with no page envelope, so the filter carries
 * the master and nothing else. The order is R10's, so the two lists agree.
 */
async function listMyServicesHandler(_req: Request, res: Response): Promise<void> {
  const principal = res.locals.principal as Principal;
  const { items } = await listLinks({ masterId: principal.id });

  sendJson(res, 200, 'MasterServiceList', items);
}

/** R10 — one page of links, optionally filtered by master, service or state. */
async function listLinksHandler(_req: Request, res: Response): Promise<void> {
  const request = pageRequest(res);
  const query = res.locals.query as
    | { masterId?: string; serviceId?: string; active?: boolean }
    | undefined;

  const { items, total } = await listLinks({
    ...(query?.masterId === undefined ? {} : { masterId: query.masterId }),
    ...(query?.serviceId === undefined ? {} : { serviceId: query.serviceId }),
    ...(query?.active === undefined ? {} : { active: query.active }),
    limit: request.pageSize,
    offset: request.offset,
  });

  sendJson(res, 200, 'MasterServicePage', pageBody(items, total, request));
}

/** R11 — a second link for the same pair is the one reachable 409 (D-24). */
async function createLinkHandler(_req: Request, res: Response): Promise<void> {
  const body = res.locals.body as LinkCreateInput;

  try {
    sendCreated(res, 'MasterService', await createLink(body), '/admin/master-services');
  } catch (error) {
    if (isUniqueViolation(error, LINK_CONSTRAINT)) {
      throw new HttpProblem(
        'DUPLICATE_RESOURCE',
        'A link for this master and service already exists.',
      );
    }
    throw error;
  }
}

/** R12 — price and state only; the pair is fixed once the link exists. */
async function updateLinkHandler(_req: Request, res: Response): Promise<void> {
  const { masterServiceId } = res.locals.params as { masterServiceId: string };
  const link = await updateLink(masterServiceId, res.locals.body as LinkPatchInput);

  if (link === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No master-service link is defined with this id.');
  }

  sendJson(res, 200, 'MasterService', link);
}

/** Registers R10–R12 on the admin router, mounted behind the role gate. */
export function masterServiceRoutes(router: Router): void {
  router.get(
    '/admin/master-services',
    ...adminAccess,
    validateParams('listMasterServicesAdmin'),
    asyncRoute(listLinksHandler),
  );
  router.post(
    '/admin/master-services',
    ...adminAccess,
    validateBody('createMasterService'),
    asyncRoute(createLinkHandler),
  );
  router.patch(
    '/admin/master-services/:masterServiceId',
    ...adminAccess,
    validateParams('updateMasterService'),
    validateBody('updateMasterService'),
    asyncRoute(updateLinkHandler),
  );
  router.get('/me/services', ...masterAccess, asyncRoute(listMyServicesHandler));
}
