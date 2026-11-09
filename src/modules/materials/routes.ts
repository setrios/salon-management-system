/**
 * Materials — administrator operations R13–R16.
 *
 *   R13 GET   /admin/materials               listMaterialsAdmin → MaterialPage
 *   R14 POST  /admin/materials               createMaterial     → 201 Material + Location
 *   R15 GET   /admin/materials/{materialId}  getMaterialAdmin   → Material
 *   R16 PATCH /admin/materials/{materialId}  updateMaterial     → Material
 *
 * Source: REQ-F-018 (materials are created, edited and deactivated, never
 *         deleted), REQ-F-025 (a material carries a standard or custom unit),
 *         D-24 (`materials_name_unique` is the third reachable 409, on R14 and
 *         R16); `error-model.md` §3/§4.
 * Contract: openapi.yaml#/paths/~1admin~1materials,
 *           ~1admin~1materials~1{materialId}; schemas Material, MaterialCreate,
 *           MaterialPatch, MaterialPage.
 *
 * `MaterialCreate.initialStockQuantity` is the contract's create-only name for
 * the opening stock; `Material.stockQuantity` is what the response and later
 * operations expose. The mapping happens once, in the service layer.
 */

import { Router, type Request, type Response } from 'express';

import { HttpProblem } from '../../middleware/error-handler.js';
import { adminAccess } from '../../middleware/authorize.js';
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
  createMaterial,
  findMaterial,
  listMaterials,
  NAME_CONSTRAINT,
  updateMaterial,
  type MaterialCreateInput,
  type MaterialPatchInput,
} from './service.js';

/** R13 — one page of materials, optionally filtered by `active` and `q`. */
async function listMaterialsHandler(_req: Request, res: Response): Promise<void> {
  const request = pageRequest(res);
  const query = res.locals.query as { active?: boolean; q?: string } | undefined;

  const { items, total } = await listMaterials({
    ...(query?.active === undefined ? {} : { active: query.active }),
    ...(query?.q === undefined ? {} : { q: query.q }),
    limit: request.pageSize,
    offset: request.offset,
  });

  sendJson(res, 200, 'MaterialPage', pageBody(items, total, request));
}

/** R14 — a duplicate name is the reachable 409 (D-24). */
async function createMaterialHandler(_req: Request, res: Response): Promise<void> {
  const body = res.locals.body as MaterialCreateInput;

  try {
    sendCreated(res, 'Material', await createMaterial(body), '/admin/materials');
  } catch (error) {
    if (isUniqueViolation(error, NAME_CONSTRAINT)) {
      throw new HttpProblem('DUPLICATE_RESOURCE', 'A material with this name already exists.');
    }
    throw error;
  }
}

/** R15 — `active:false` is still 200; error-model §4 forbids 404 for it. */
async function getMaterialHandler(_req: Request, res: Response): Promise<void> {
  const { materialId } = res.locals.params as { materialId: string };
  const material = await findMaterial(materialId);

  if (material === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No material is defined with this id.');
  }

  sendJson(res, 200, 'Material', material);
}

/** R16 — also reachable 409, for a rename onto an existing name (D-24). */
async function updateMaterialHandler(_req: Request, res: Response): Promise<void> {
  const { materialId } = res.locals.params as { materialId: string };

  try {
    const material = await updateMaterial(materialId, res.locals.body as MaterialPatchInput);

    if (material === undefined) {
      throw new HttpProblem('NOT_FOUND', 'No material is defined with this id.');
    }

    sendJson(res, 200, 'Material', material);
  } catch (error) {
    if (isUniqueViolation(error, NAME_CONSTRAINT)) {
      throw new HttpProblem('DUPLICATE_RESOURCE', 'A material with this name already exists.');
    }
    throw error;
  }
}

/** Registers R13–R16 on the admin router, mounted behind the role gate. */
export function materialRoutes(router: Router): void {
  router.get(
    '/admin/materials',
    ...adminAccess,
    validateParams('listMaterialsAdmin'),
    asyncRoute(listMaterialsHandler),
  );
  router.post(
    '/admin/materials',
    ...adminAccess,
    validateBody('createMaterial'),
    asyncRoute(createMaterialHandler),
  );
  router.get(
    '/admin/materials/:materialId',
    ...adminAccess,
    validateParams('getMaterialAdmin'),
    asyncRoute(getMaterialHandler),
  );
  router.patch(
    '/admin/materials/:materialId',
    ...adminAccess,
    validateParams('updateMaterial'),
    validateBody('updateMaterial'),
    asyncRoute(updateMaterialHandler),
  );
}
