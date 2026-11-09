/**
 * Masters — administrator operations R1–R4.
 *
 *   R1 GET   /admin/masters              listMastersAdmin   → MasterAdminPage
 *   R2 POST  /admin/masters              createMaster       → 201 Master + Location
 *   R3 GET   /admin/masters/{masterId}   getMasterAdmin     → Master
 *   R4 PATCH /admin/masters/{masterId}   updateMaster       → Master
 *
 * Source: REQ-F-012 (accounts are created by the administrator, never by
 *         self-registration), REQ-F-018 (create, edit and deactivate; never
 *         delete, consistent with REQ-NF-005); `error-model.md` §3 (409 for a
 *         duplicate username, 404 for an unknown id) and §4 (deactivation is
 *         `PATCH active:false`, and a deactivated account is still returned).
 * Contract: openapi.yaml#/paths/~1admin~1masters,
 *           ~1admin~1masters~1{masterId}; schemas Master, MasterCreate,
 *           MasterPatch, MasterAdminPage.
 *
 * The password is hashed with D-18's scrypt and never leaves the database:
 * `Master` has no credential property and the service projects fields
 * explicitly rather than spreading a row.
 */

import { Router, type Request, type Response } from 'express';

import {
  asyncRoute,
  isUniqueViolation,
  pageBody,
  pageRequest,
  sendCreated,
  sendJson,
} from '../reference-data/http.js';
import { HttpProblem } from '../../middleware/error-handler.js';
import { adminAccess } from '../../middleware/authorize.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import {
  createMaster,
  findMaster,
  listMasters,
  updateMaster,
  USERNAME_CONSTRAINT,
  type MasterCreateInput,
  type MasterPatchInput,
} from './service.js';

/** R1 — one page of accounts, optionally filtered by `active`. */
async function listMastersHandler(_req: Request, res: Response): Promise<void> {
  const request = pageRequest(res);
  const query = res.locals.query as { active?: boolean } | undefined;

  const { items, total } = await listMasters({
    ...(query?.active === undefined ? {} : { active: query.active }),
    limit: request.pageSize,
    offset: request.offset,
  });

  sendJson(res, 200, 'MasterAdminPage', pageBody(items, total, request));
}

/** R2 — a duplicate username violates the one constraint error-model §3 names. */
async function createMasterHandler(_req: Request, res: Response): Promise<void> {
  const body = res.locals.body as MasterCreateInput;

  try {
    sendCreated(res, 'Master', await createMaster(body), '/admin/masters');
  } catch (error) {
    if (isUniqueViolation(error, USERNAME_CONSTRAINT)) {
      throw new HttpProblem('DUPLICATE_RESOURCE', 'A master with this username already exists.');
    }
    throw error;
  }
}

/** R3 — `active:false` is still 200; error-model §4 forbids 404 for it. */
async function getMasterHandler(_req: Request, res: Response): Promise<void> {
  const { masterId } = res.locals.params as { masterId: string };
  const master = await findMaster(masterId);

  if (master === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No master is defined with this id.');
  }

  sendJson(res, 200, 'Master', master);
}

/** R4 — an empty patch was rejected by the schema (minProperties: 1) before this. */
async function updateMasterHandler(_req: Request, res: Response): Promise<void> {
  const { masterId } = res.locals.params as { masterId: string };
  const master = await updateMaster(masterId, res.locals.body as MasterPatchInput);

  if (master === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No master is defined with this id.');
  }

  sendJson(res, 200, 'Master', master);
}

/** Registers R1–R4 on the admin router, mounted behind the role gate. */
export function masterRoutes(router: Router): void {
  router.get(
    '/admin/masters',
    ...adminAccess,
    validateParams('listMastersAdmin'),
    asyncRoute(listMastersHandler),
  );
  router.post(
    '/admin/masters',
    ...adminAccess,
    validateBody('createMaster'),
    asyncRoute(createMasterHandler),
  );
  router.get(
    '/admin/masters/:masterId',
    ...adminAccess,
    validateParams('getMasterAdmin'),
    asyncRoute(getMasterHandler),
  );
  router.patch(
    '/admin/masters/:masterId',
    ...adminAccess,
    validateParams('updateMaster'),
    validateBody('updateMaster'),
    asyncRoute(updateMasterHandler),
  );
}
