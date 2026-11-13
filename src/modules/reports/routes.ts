/**
 * The administrator's reports — R28 revenue, R29 popular services, R30 stock
 * levels (REQ-F-022, REQ-F-032, REQ-F-033).
 *
 * Three reads, one shape of handler: resolve what was asked for, refuse what
 * cannot be answered, read, answer. The only shared rule is the window, which
 * lives in `period.ts` because both period operations must resolve it the same
 * way; R30 has no window at all (REQ-F-033) and deliberately reads no query.
 *
 * **The 422 and the 400 are drawn by the parser, not here.** `resolvePeriod`
 * returns either a window, `invalid` (422 `INVALID_PERIOD` — both forms, neither,
 * half a range, a reversed range, an unknown preset) or `malformed` (400 — a
 * value that is not a real date, or a repeated parameter). The handler maps
 * those three outcomes and adds nothing, so the two period operations cannot
 * drift apart in how they refuse.
 *
 * **Unknown query parameters are ignored** (D17): each operation reads only the
 * names it declares, so `?period=day&trace=1` on R28 is a valid window and
 * `?period=day` on R30 is a stock snapshot (R4).
 *
 * Source: REQ-F-022, REQ-F-032, REQ-F-033; `error-model.md` §3 and §5.4;
 *         `resource-model.md` §5.6 (R28–R30).
 * Contract: openapi.yaml#/paths/~1admin~1reports~1revenue,
 *           ~1admin~1reports~1popular-services,
 *           ~1admin~1reports~1stock-levels.
 * Ticket: SMS-35 (Feature)
 */

import { Router, type Request, type Response } from 'express';

import { adminAccess } from '../../middleware/authorize.js';
import { HttpProblem } from '../../middleware/error-handler.js';
import { asyncRoute, sendJson } from '../reference-data/http.js';
import { resolvePeriod, type ResolvedPeriod } from './period.js';
import { popularServicesReport, revenueReport, stockLevelsReport } from './service.js';
import { nowOf } from '../../lib/clock.js';

/** The clock, as injected at the app (D9). */
function clockOf(req: Request): Date {
  return nowOf(req);
}

/**
 * Resolves the window or throws the refusal the parser named.
 *
 * §5.4's sentence is used for every conflict, including the reversed range: the
 * contract gives one example, and a second sentence would be a detail the
 * contract does not have.
 */
function windowOf(req: Request): ResolvedPeriod {
  const resolution = resolvePeriod(req.query as Record<string, unknown>, clockOf(req));

  if (resolution.kind === 'invalid') {
    throw new HttpProblem(
      'INVALID_PERIOD',
      'Supply either period or both from and to, not both forms.',
    );
  }
  if (resolution.kind === 'malformed') {
    throw new HttpProblem('MALFORMED_REQUEST', 'The query parameters are malformed.');
  }

  return resolution;
}

/** R28 — the revenue of a window. */
async function getRevenueReportHandler(req: Request, res: Response): Promise<void> {
  sendJson(res, 200, 'RevenueReport', await revenueReport(windowOf(req)));
}

/** R29 — the services booked most often in a window. */
async function getPopularServicesReportHandler(req: Request, res: Response): Promise<void> {
  sendJson(res, 200, 'PopularServicesReport', await popularServicesReport(windowOf(req)));
}

/** R30 — the current stock snapshot. Reads no query (REQ-F-033). */
async function getStockLevelsReportHandler(req: Request, res: Response): Promise<void> {
  sendJson(res, 200, 'StockLevelsReport', await stockLevelsReport(clockOf(req)));
}

/** Registers R28–R30 on the admin router. */
export function reportRoutes(router: Router): void {
  router.get(
    '/admin/reports/revenue',
    ...adminAccess,
    asyncRoute(getRevenueReportHandler),
  );
  router.get(
    '/admin/reports/popular-services',
    ...adminAccess,
    asyncRoute(getPopularServicesReportHandler),
  );
  router.get(
    '/admin/reports/stock-levels',
    ...adminAccess,
    asyncRoute(getStockLevelsReportHandler),
  );
}
