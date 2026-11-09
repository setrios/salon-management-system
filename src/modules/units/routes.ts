/**
 * Units — administrator operation R17.
 *
 *   R17 GET /admin/units   listUnits → UnitList
 *
 * There is no create, rename or delete: the standard five are fixed by
 * REQ-F-025 and a custom unit comes into existence by being named on a
 * material, not by an operation of its own (D-26).
 *
 * Source: REQ-F-025, D-26; `openapi.yaml#/paths/~1admin~1units`.
 */

import { Router, type Request, type Response } from 'express';

import { adminAccess } from '../../middleware/authorize.js';
import { asyncRoute, sendJson } from '../reference-data/http.js';
import { listUnits } from './service.js';

async function listUnitsHandler(_req: Request, res: Response): Promise<void> {
  sendJson(res, 200, 'UnitList', await listUnits());
}

/** Registers R17 on the admin router, mounted behind the role gate. */
export function unitRoutes(router: Router): void {
  router.get('/admin/units', ...adminAccess, asyncRoute(listUnitsHandler));
}
