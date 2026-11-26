/**
 * Material transactions — administrator operations R25 and R26, the ledger
 * behind REQ-F-020.
 *
 *   R25 GET  /admin/materials/{materialId}/transactions   listMaterialTransactions → MaterialTransactionPage
 *   R26 POST /admin/materials/{materialId}/transactions   createMaterialTransaction → 201 MaterialTransaction
 *
 * A transaction is one recorded movement: a `receipt` raises the material's
 * balance by its quantity, an `issue` lowers it. The balance is
 * `materials.stockQuantity`; this module never recomputes it from the ledger —
 * the write itself moves it (M2), in one database transaction, so the two cannot
 * disagree.
 *
 * **What the routes decide, and what they do not.** The body and the query are
 * the contract's (validated from `openapi.yaml`, never restated here); the stock
 * rule is D13's and lives in `service.ts` under the row lock. This file maps
 * three outcomes to HTTP and formats the refusal sentence `error-model.md` §5.6
 * documents.
 *
 * **The 201 carries no `Location`** (M5). Every other create operation answers
 * with the URI of what it made, but no operation in the contract reads a single
 * transaction: a `Location` here would name a resource that cannot be fetched.
 * The omission is a recorded deviation, not an oversight; the gate lists it.
 *
 * Source: REQ-F-020 ("Each transaction updates the material's stock level by the
 *         recorded quantity"); D13 (`logs/2026-10-26-api-design-plan.md`:491,
 *         reject rather than allow negative stock); `error-model.md` §3 (the
 *         closed code catalog) and §5.6 (the refusal example); `resource-model.md`
 *         §5.5 (R25, R26).
 * Contract: openapi.yaml#/paths/~1admin~1materials~1{materialId}~1transactions;
 *           schemas MaterialTransaction, MaterialTransactionCreate,
 *           MaterialTransactionPage, Problem.
 * Ticket: SMS-33 (Feature)
 *
 * Decisions (S5.2 inventory): M1–M10 as defined in
 * `logs/gates/2026-11-13-test-SMS-33.md` §1.1.
 */

import { Router, type Request, type Response } from 'express';

import { adminAccess } from '../../middleware/authorize.js';
import { HttpProblem } from '../../middleware/error-handler.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { asyncRoute, pageBody, pageRequest, sendJson } from '../reference-data/http.js';
import {
  listMaterialTransactions,
  recordMaterialTransaction,
  type MaterialTransactionInput,
} from './service.js';
import { nowOf } from '../../lib/clock.js';

/** `MaterialTransactionCreate` as the contract declares it. */
interface TransactionBody {
  readonly type: 'receipt' | 'issue';
  readonly quantity: number;
  readonly occurredAt: string;
  readonly note?: string;
}

/** One page of the ledger (R25). */
async function listTransactionsHandler(_req: Request, res: Response): Promise<void> {
  const { materialId } = res.locals.params as { materialId: string };
  const query = res.locals.query as
    { type?: 'receipt' | 'issue'; from?: string; to?: string } | undefined;
  const request = pageRequest(res);

  const page = await listMaterialTransactions(materialId, {
    ...(query?.type === undefined ? {} : { type: query.type }),
    ...(query?.from === undefined ? {} : { from: query.from }),
    ...(query?.to === undefined ? {} : { to: query.to }),
    limit: request.pageSize,
    offset: request.offset,
  });

  // 404 belongs to the material, not the page: an unknown material has no
  // ledger to page through.
  if (page === undefined) {
    throw new HttpProblem('NOT_FOUND', 'No material exists with the supplied id.');
  }

  sendJson(res, 200, 'MaterialTransactionPage', pageBody(page.items, page.total, request));
}

/** R26 — record one receipt or issue and answer 201. */
async function createTransactionHandler(req: Request, res: Response): Promise<void> {
  const { materialId } = res.locals.params as { materialId: string };
  const body = res.locals.body as TransactionBody;
  const now = nowOf(req);

  const input: MaterialTransactionInput = {
    type: body.type,
    quantity: body.quantity,
    // `date-time` is checked by the body validator, so this parse cannot fail.
    occurredAt: new Date(body.occurredAt),
    ...(body.note === undefined ? {} : { note: body.note }),
  };

  const result = await recordMaterialTransaction(materialId, input, now);

  if (result.kind === 'not-found') {
    throw new HttpProblem('NOT_FOUND', 'No material exists with the supplied id.');
  }
  if (result.kind === 'insufficient') {
    // error-model.md §5.6: both numbers and the material's own unit.
    throw new HttpProblem(
      'MATERIAL_STOCK_INSUFFICIENT',
      `Requested issue quantity ${formatQuantity(result.requested)} ${result.unit} ` +
        `exceeds the current stock of ${formatQuantity(result.balance)} ${result.unit}.`,
    );
  }

  // M5: no Location — see the header.
  sendJson(res, 201, 'MaterialTransaction', result.transaction);
}

/**
 * A quantity as the refusal's sentence writes it.
 *
 * The column is `double precision`, so `String` is the shortest exact form for
 * the values the contract carries: `250` stays `250`, `180.5` stays `180.5`, and
 * no rounding is invented at the boundary.
 */
function formatQuantity(value: number): string {
  return String(value);
}

/** Registers R25 and R26 on the admin router. */
export function materialTransactionRoutes(router: Router): void {
  router.get(
    '/admin/materials/:materialId/transactions',
    ...adminAccess,
    validateParams('listMaterialTransactions'),
    asyncRoute(listTransactionsHandler),
  );
  router.post(
    '/admin/materials/:materialId/transactions',
    ...adminAccess,
    validateParams('createMaterialTransaction'),
    validateBody('createMaterialTransaction'),
    asyncRoute(createTransactionHandler),
  );
}
