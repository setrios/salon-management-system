/**
 * Catalog — administrator operations R5–R9.
 *
 *   R5 GET /admin/services               listServicesAdmin   → ServicePage
 *   R6 POST /admin/services              createService       → 201 Service + Location
 *   R7 GET /admin/services/{serviceId}   getServiceAdmin     → Service
 *   R8 PATCH /admin/services/{serviceId} updateService       → Service
 *   R9 GET /admin/categories             listCategoriesAdmin → CategoryList
 *
 * Source: REQ-F-018 (a service carries a category and is deactivated, never
 *         deleted), REQ-F-024 (free-form categories; the three seeds exist on a
 *         fresh installation), SCN-08, D-27; `error-model.md` §3/§4.
 * Contract: openapi.yaml#/paths/~1admin~1services,
 *           ~1admin~1services~1{serviceId}, ~1admin~1categories.
 *
 * R6 declares 409 `DUPLICATE_RESOURCE` and R8 repeats it, but there is no
 * trigger: `Service.name` is not unique and error-model §3 names no constraint
 * for it (CL-10, D-24). No uniqueness rule is added here — 409 on R6/R8 stays
 * unreachable, which is what the gate recorded.
 *
 * R9 is a read. No operation creates, renames or deletes a category: the write
 * happens inside `createService`/`updateService`, where a service's category is
 * recorded as a side effect of the save (D-27).
 */

import { Router, type Request, type Response } from 'express';

import { HttpProblem } from '../../middleware/error-handler.js';
import { adminAccess } from '../../middleware/authorize.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { asyncRoute, pageBody, pageRequest, sendCreated, sendJson } from '../reference-data/http.js';
import {
  createService,
  findService,
  listCategories,
  listServices,
  updateService,
  type ServiceCreateInput,
  type ServicePatchInput,
} from './service.js';

/** R5 — one page of services, optionally filtered by `active` and `category`. */
async function listServicesHandler(_req: Request, res: Response): Promise<void> {
  const request = pageRequest(res);
  const query = res.locals.query as { active?: boolean; category?: string } | undefined;

  const { items, total } = await listServices({
    ...(query?.active === undefined ? {} : { active: query.active }),
    ...(query?.category === undefined ? {} : { category: query.category }),
    limit: request.pageSize,
    offset: request.offset,
  });

  sendJson(res, 200, 'ServicePage', pageBody(items, total, request));
}

/** R6 — saves the service, which is what brings a new category into existence. */
async function createServiceHandler(_req: Request, res: Response): Promise<void> {
  const body = res.locals.body as ServiceCreateInput;

  sendCreated(res, 'Service', await createService(body), '/admin/services');
}

/** R7 — `active:false` is still 200; error-model §4 forbids 404 for it. */
async function getServiceHandler(_req: Request, res: Response): Promise<void> {
  const { serviceId } = res.locals.params as { serviceId: string };
  const service = await findService(serviceId);

  if (service === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No service is defined with this id.');
  }

  sendJson(res, 200, 'Service', service);
}

/** R8 — only `name`, `category`, `baseDurationMinutes` and `active` are patchable. */
async function updateServiceHandler(_req: Request, res: Response): Promise<void> {
  const { serviceId } = res.locals.params as { serviceId: string };
  const service = await updateService(serviceId, res.locals.body as ServicePatchInput);

  if (service === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No service is defined with this id.');
  }

  sendJson(res, 200, 'Service', service);
}

/** R9 — every category; `seeded` is true exactly for the three seeds. */
async function listCategoriesHandler(_req: Request, res: Response): Promise<void> {
  sendJson(res, 200, 'CategoryList', await listCategories());
}

/** Registers R5–R9 on the admin router, mounted behind the role gate. */
export function catalogRoutes(router: Router): void {
  router.get(
    '/admin/services',
    ...adminAccess,
    validateParams('listServicesAdmin'),
    asyncRoute(listServicesHandler),
  );
  router.post(
    '/admin/services',
    ...adminAccess,
    validateBody('createService'),
    asyncRoute(createServiceHandler),
  );
  router.get(
    '/admin/services/:serviceId',
    ...adminAccess,
    validateParams('getServiceAdmin'),
    asyncRoute(getServiceHandler),
  );
  router.patch(
    '/admin/services/:serviceId',
    ...adminAccess,
    validateParams('updateService'),
    validateBody('updateService'),
    asyncRoute(updateServiceHandler),
  );
  router.get('/admin/categories', ...adminAccess, asyncRoute(listCategoriesHandler));
}
