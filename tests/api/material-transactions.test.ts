/**
 * S5.2 material transactions — R25 `listMaterialTransactions` and R26
 * `createMaterialTransaction`, the two operations behind REQ-F-020.
 *
 *   R25 GET  /admin/materials/{materialId}/transactions   → MaterialTransactionPage
 *   R26 POST /admin/materials/{materialId}/transactions   → 201 MaterialTransaction
 *
 * **What a transaction does.** REQ-F-020 (SRS v1.3:530): "Each transaction
 * updates the material's stock level by the recorded quantity." A `receipt`
 * adds, an `issue` subtracts, and the material's `stockQuantity` is the running
 * total — the transaction rows are the ledger, the column is the balance. The
 * one refusal the SRS and D13 name is an issue larger than the balance:
 * 409 `MATERIAL_STOCK_INSUFFICIENT`, never negative stock.
 *
 * **What this file does not invent.** The contract fixes the shapes, the error
 * set and the closed code catalog; `resource-model.md` §5.5 fixes both
 * operations' surface. Four points the contract leaves open are decided here and
 * recorded in the TEST-GATE:
 *
 *   - **No `Location` header on R26** (M5). The contract declares the header but
 *     no operation reads one transaction, so the only honest values would be a
 *     dead URI or the material's — both worse than absent.
 *   - **The ledger order**: `occurredAt` descending, `id` descending as the
 *     tie-break (M3), the order the contract's own example implies (one row) and
 *     the one a ledger is read in.
 *   - **An inactive material still takes transactions** (M6): `active` filters
 *     catalogues (R13), not history, and the SRS attaches no rule to it.
 *   - **Any `occurredAt` instant is accepted** (M7), including the future: the
 *     SRS and the contract bound the quantity, not the date, and the list's
 *     `from`/`to` filters (M4, inclusive days in Kyiv) are the only date rules
 *     either document states.
 *
 * **Where the stock rules are asserted.** T1–T5 establish the arithmetic and
 * the refusal; T6–T8 establish that the contract's body and the operation's
 * guards are enforced; L1–L6 establish the ledger's reading surface —
 * ordering, type and date filters, paging and the same guards.
 *
 * Source: REQ-F-020; D13 (`logs/2026-10-26-api-design-plan.md`:491, reject with
 *         409 `MATERIAL_STOCK_INSUFFICIENT` rather than allow negative stock);
 *         `error-model.md` §3 (409 `MATERIAL_STOCK_INSUFFICIENT` is R26's) and
 *         §5.6 (the sentence the refusal carries);
 *         `resource-model.md` §5.5 (R25, R26); `openapi.yaml` operations
 *         listMaterialTransactions, createMaterialTransaction, schemas
 *         MaterialTransaction, MaterialTransactionCreate,
 *         MaterialTransactionPage, Material.
 * Contract: openapi.yaml#/paths/~1admin~1materials~1{materialId}~1transactions.
 * Ticket: SMS-33 (Test)
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import { arrangeAdmin, arrangeMaster, unique } from '../helpers/booking.js';

/** The suite's fixed clock: Kyiv winter, +02:00. */
const NOW = '2026-11-12T09:00:00+02:00';

/** The contract's default page size (PageSize in openapi.yaml). */
const DEFAULT_PAGE_SIZE = 20;

type SchemaValidator = ReturnType<typeof getSchemaValidator>;

interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

let app: Express;
let adminToken: string;
let masterToken: string;

const transactionSchema: SchemaValidator = getSchemaValidator('MaterialTransaction');
const pageSchema: SchemaValidator = getSchemaValidator('MaterialTransactionPage');
const problemSchema: SchemaValidator = getSchemaValidator('Problem');

/** A material arranged through R14, the way an administrator creates one. */
async function arrangeMaterial(
  options: {
    readonly unit?: string;
    readonly stockQuantity?: number;
  } = {},
): Promise<{ id: string; name: string; unit: string; stockQuantity: number }> {
  const response = await request(app)
    .post('/api/v1/admin/materials')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: unique('material'),
      unit: options.unit ?? 'ml',
      initialStockQuantity: options.stockQuantity ?? 0,
    });
  expect(response.status).toBe(201);
  return response.body as { id: string; name: string; unit: string; stockQuantity: number };
}

/** Posts one transaction and returns the raw response. */
function postTransaction(
  materialId: string,
  body: unknown,
  options: { readonly token?: string; readonly contentType?: string } = {},
): Promise<JsonResponse> {
  const call = request(app)
    .post(`/api/v1/admin/materials/${materialId}/transactions`)
    .set('Authorization', `Bearer ${options.token ?? adminToken}`);
  return (options.contentType === undefined
    ? call.send(body as object)
    : call.set('Content-Type', options.contentType).send(
        typeof body === 'string' ? body : JSON.stringify(body),
      )) as unknown as Promise<JsonResponse>;
}

/** The material's current balance through R15. */
async function stockOf(materialId: string): Promise<number> {
  const response = await request(app)
    .get(`/api/v1/admin/materials/${materialId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(response.status).toBe(200);
  return response.body.stockQuantity as number;
}

/** The ledger through R25, unfiltered. */
async function ledgerOf(materialId: string): Promise<JsonResponse> {
  const response = await request(app)
    .get(`/api/v1/admin/materials/${materialId}/transactions`)
    .set('Authorization', `Bearer ${adminToken}`);
  return response as unknown as JsonResponse;
}

/** Asserts a 201 `MaterialTransaction` and returns its body. */
function expectTransaction(response: JsonResponse): Record<string, any> {
  expect(response.status).toBe(201);
  expect(transactionSchema(response.body), JSON.stringify(transactionSchema.errors ?? [])).toBe(
    true,
  );
  return response.body;
}

/** Asserts a `Problem` with the expected status and code. */
function expectProblem(
  response: JsonResponse,
  expected: { readonly status: number; readonly code: string },
): void {
  expect(response.status).toBe(expected.status);
  expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
  expect(problemSchema(response.body), JSON.stringify(problemSchema.errors ?? [])).toBe(true);
  expect(response.body.code).toBe(expected.code);
}

beforeAll(async () => {
  app = createApp({ now: () => new Date(NOW) });
  adminToken = (await arrangeAdmin(app)).token;
  masterToken = (await arrangeMaster(app)).token;
});

describe('createMaterialTransaction (R26, POST /admin/materials/{materialId}/transactions)', () => {
  it('T1 records a receipt that raises the balance by the quantity (REQ-F-020)', async () => {
    const material = await arrangeMaterial({ unit: 'ml', stockQuantity: 100 });
    const occurredAt = '2026-11-13T10:00:00+02:00';

    const response = await postTransaction(material.id, {
      type: 'receipt',
      quantity: 250,
      occurredAt,
      note: 'Delivery from supplier',
    });

    const body = expectTransaction(response);
    expect(body).toMatchObject({
      materialId: material.id,
      type: 'receipt',
      quantity: 250,
      occurredAt,
      note: 'Delivery from supplier',
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(typeof body.createdAt).toBe('string');

    // M5: the 201 carries no Location — no operation reads one transaction.
    expect(response.headers.location).toBeUndefined();

    expect(await stockOf(material.id)).toBe(350);
  });

  it('T2 records an issue that lowers the balance and moves the material (REQ-F-020, M9)', async () => {
    const material = await arrangeMaterial({ unit: 'ml', stockQuantity: 180 });
    const before = await request(app)
      .get(`/api/v1/admin/materials/${material.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const response = await postTransaction(material.id, {
      type: 'issue',
      quantity: 20,
      occurredAt: '2026-11-13T11:40:00+02:00',
      note: 'Haircut service usage',
    });

    const body = expectTransaction(response);
    expect(body).toMatchObject({
      materialId: material.id,
      type: 'issue',
      quantity: 20,
      note: 'Haircut service usage',
    });

    expect(await stockOf(material.id)).toBe(160);

    // Stock is part of the material's state, so the balance change is a write
    // to the material row (M9) — `updatedAt` moves with it.
    const after = await request(app)
      .get(`/api/v1/admin/materials/${material.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.body.updatedAt).toBe(NOW);
    expect(after.body.updatedAt).not.toBe(before.body.updatedAt);
  });

  it('T3 allows an issue exactly equal to the balance, leaving zero (D13)', async () => {
    const material = await arrangeMaterial({ unit: 'pcs', stockQuantity: 12 });

    expectTransaction(
      await postTransaction(material.id, {
        type: 'issue',
        quantity: 12,
        occurredAt: '2026-11-13T12:00:00+02:00',
      }),
    );

    expect(await stockOf(material.id)).toBe(0);
  });

  it('T4 refuses an issue above the balance with 409 and writes nothing (D13, REQ-F-020)', async () => {
    const material = await arrangeMaterial({ unit: 'ml', stockQuantity: 180 });

    const response = await postTransaction(material.id, {
      type: 'issue',
      quantity: 250,
      occurredAt: '2026-11-13T12:30:00+02:00',
    });

    expectProblem(response, { status: 409, code: 'MATERIAL_STOCK_INSUFFICIENT' });
    // error-model.md §5.6: the sentence names both numbers and the unit.
    expect(response.body.detail).toBe(
      'Requested issue quantity 250 ml exceeds the current stock of 180 ml.',
    );

    // The refusal is total: neither the balance nor the ledger moved.
    expect(await stockOf(material.id)).toBe(180);
    const ledger = await ledgerOf(material.id);
    expect(ledger.body.items).toEqual([]);
    expect(ledger.body.total).toBe(0);
  });

  it('T5 refuses the second issue when the running balance no longer covers it (D13)', async () => {
    const material = await arrangeMaterial({ unit: 'ml', stockQuantity: 150 });

    expectTransaction(
      await postTransaction(material.id, {
        type: 'issue',
        quantity: 100,
        occurredAt: '2026-11-13T13:00:00+02:00',
      }),
    );
    expect(await stockOf(material.id)).toBe(50);

    // The check is against the balance at the moment of the write, not the
    // opening stock: 150 − 100 = 50, and the second 100 does not fit.
    expectProblem(
      await postTransaction(material.id, {
        type: 'issue',
        quantity: 100,
        occurredAt: '2026-11-13T14:00:00+02:00',
      }),
      { status: 409, code: 'MATERIAL_STOCK_INSUFFICIENT' },
    );

    expect(await stockOf(material.id)).toBe(50);
    expect((await ledgerOf(material.id)).body.total).toBe(1);
  });

  it('T6 refuses every body the contract closes: quantity, type, instant, note, extra keys (422)', async () => {
    const material = await arrangeMaterial();

    const refusals: unknown[] = [
      { type: 'receipt', quantity: 0, occurredAt: '2026-11-13T10:00:00+02:00' },
      { type: 'issue', quantity: -5, occurredAt: '2026-11-13T10:00:00+02:00' },
      { type: 'transfer', quantity: 1, occurredAt: '2026-11-13T10:00:00+02:00' },
      { type: 'receipt', quantity: 1 },
      { type: 'receipt', quantity: 1, occurredAt: 'not-a-date' },
      {
        type: 'receipt',
        quantity: 1,
        occurredAt: '2026-11-13T10:00:00+02:00',
        note: 'x'.repeat(501),
      },
      {
        type: 'receipt',
        quantity: 1,
        occurredAt: '2026-11-13T10:00:00+02:00',
        materialId: randomUUID(),
      },
    ];

    for (const body of refusals) {
      expectProblem(await postTransaction(material.id, body), {
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    }

    // No body at all is a malformed request, not a schema violation.
    const noBody = await request(app)
      .post(`/api/v1/admin/materials/${material.id}/transactions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expectProblem(noBody as unknown as JsonResponse, { status: 400, code: 'MALFORMED_REQUEST' });

    // And nothing was written by any of them.
    expect(await stockOf(material.id)).toBe(0);
    expect((await ledgerOf(material.id)).body.total).toBe(0);
  });

  it('T7 answers 404 for an unknown material and 400 for a non-uuid id', async () => {
    expectProblem(
      await postTransaction('00000000-0000-4000-8000-000000000777', {
        type: 'receipt',
        quantity: 1,
        occurredAt: '2026-11-13T10:00:00+02:00',
      }),
      { status: 404, code: 'NOT_FOUND' },
    );

    // R26 declares 400, so a path parameter that names no resource is a
    // malformed request here (validate.ts: the operation's own declaration
    // chooses between 400 and 404).
    expectProblem(
      await postTransaction('not-a-valid-uuid', {
        type: 'receipt',
        quantity: 1,
        occurredAt: '2026-11-13T10:00:00+02:00',
      }),
      { status: 400, code: 'MALFORMED_REQUEST' },
    );
  });

  it('T8 answers 401 without auth, 403 for a master and 415 for a wrong media type', async () => {
    const material = await arrangeMaterial();
    const body = {
      type: 'receipt',
      quantity: 1,
      occurredAt: '2026-11-13T10:00:00+02:00',
    };

    expectProblem(
      await postTransaction(material.id, body, { token: '' }),
      { status: 401, code: 'UNAUTHENTICATED' },
    );
    expectProblem(await postTransaction(material.id, body, { token: masterToken }), {
      status: 403,
      code: 'FORBIDDEN',
    });
    expectProblem(
      await postTransaction(material.id, body, { contentType: 'text/plain' }),
      { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' },
    );

    // A transaction on an inactive material is not refused (M6).
    await request(app)
      .patch(`/api/v1/admin/materials/${material.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    expectTransaction(await postTransaction(material.id, body));
    expect(await stockOf(material.id)).toBe(1);
  });
});

describe('listMaterialTransactions (R25, GET /admin/materials/{materialId}/transactions)', () => {
  it('L1 answers an empty page in the contract shape for a material without a ledger', async () => {
    const material = await arrangeMaterial();

    const response = await ledgerOf(material.id);

    expect(response.status).toBe(200);
    expect(pageSchema(response.body), JSON.stringify(pageSchema.errors ?? [])).toBe(true);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      total: 0,
    });
  });

  it('L2 returns the ledger newest first and filters by type (M3)', async () => {
    const material = await arrangeMaterial({ unit: 'g', stockQuantity: 1000 });

    const first = expectTransaction(
      await postTransaction(material.id, {
        type: 'receipt',
        quantity: 500,
        occurredAt: '2026-11-10T09:00:00+02:00',
      }),
    );
    const second = expectTransaction(
      await postTransaction(material.id, {
        type: 'issue',
        quantity: 40,
        occurredAt: '2026-11-12T09:00:00+02:00',
      }),
    );
    const third = expectTransaction(
      await postTransaction(material.id, {
        type: 'issue',
        quantity: 10,
        occurredAt: '2026-11-11T09:00:00+02:00',
      }),
    );

    const all = await ledgerOf(material.id);
    expect(all.status).toBe(200);
    expect(pageSchema(all.body), JSON.stringify(pageSchema.errors ?? [])).toBe(true);
    expect(all.body.total).toBe(3);
    expect(all.body.items.map((item: { id: string }) => item.id)).toEqual([
      second.id,
      third.id,
      first.id,
    ]);
    expect(all.body.items[0]).toMatchObject({
      materialId: material.id,
      type: 'issue',
      quantity: 40,
    });

    // `type` is the contract's filter; it selects, it does not reorder.
    const issues = await request(app)
      .get(`/api/v1/admin/materials/${material.id}/transactions?type=issue`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(issues.status).toBe(200);
    expect(issues.body.total).toBe(2);
    expect(issues.body.items.map((item: { id: string }) => item.id)).toEqual([
      second.id,
      third.id,
    ]);

    const receipts = await request(app)
      .get(`/api/v1/admin/materials/${material.id}/transactions?type=receipt`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(receipts.body.total).toBe(1);
    expect(receipts.body.items[0].id).toBe(first.id);
  });

  it('L3 filters by from and to as inclusive Kyiv days (M4)', async () => {
    const material = await arrangeMaterial({ unit: 'ml', stockQuantity: 0 });

    for (const occurredAt of [
      '2026-12-01T10:00:00+02:00',
      '2026-12-02T10:00:00+02:00',
      '2026-12-03T10:00:00+02:00',
    ]) {
      expectTransaction(
        await postTransaction(material.id, { type: 'receipt', quantity: 1, occurredAt }),
      );
    }

    // One day, both bounds the same day: the two edges are included.
    const oneDay = await request(app)
      .get(`/api/v1/admin/materials/${material.id}/transactions?from=2026-12-02&to=2026-12-02`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(oneDay.status).toBe(200);
    expect(oneDay.body.total).toBe(1);
    expect(oneDay.body.items[0].occurredAt).toBe('2026-12-02T10:00:00+02:00');

    // An open-ended lower bound: from 12-02 includes 12-02 and 12-03.
    const openEnd = await request(app)
      .get(`/api/v1/admin/materials/${material.id}/transactions?from=2026-12-02`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(openEnd.body.total).toBe(2);

    // An open-ended upper bound: to 12-02 includes 12-01 and 12-02.
    const openStart = await request(app)
      .get(`/api/v1/admin/materials/${material.id}/transactions?to=2026-12-02`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(openStart.body.total).toBe(2);
  });

  it('L4 pages with page and pageSize and keeps the total', async () => {
    const material = await arrangeMaterial({ unit: 'pcs', stockQuantity: 0 });

    for (const [index, occurredAt] of [
      '2026-12-05T10:00:00+02:00',
      '2026-12-06T10:00:00+02:00',
      '2026-12-07T10:00:00+02:00',
    ].entries()) {
      expectTransaction(
        await postTransaction(material.id, {
          type: 'receipt',
          quantity: index + 1,
          occurredAt,
        }),
      );
    }

    const first = await request(app)
      .get(`/api/v1/admin/materials/${material.id}/transactions?page=1&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ page: 1, pageSize: 1, total: 3 });
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0].occurredAt).toBe('2026-12-07T10:00:00+02:00');

    const second = await request(app)
      .get(`/api/v1/admin/materials/${material.id}/transactions?page=2&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.body.items[0].occurredAt).toBe('2026-12-06T10:00:00+02:00');

    // A page past the end is an empty page, not a 404 (the page is the
    // collection's, and the collection exists).
    const past = await request(app)
      .get(`/api/v1/admin/materials/${material.id}/transactions?page=9&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(past.status).toBe(200);
    expect(past.body.items).toEqual([]);
    expect(past.body.total).toBe(3);
  });

  it('L5 answers 404 for an unknown material, 400 for a non-uuid id and for bad query values', async () => {
    expectProblem(
      (await request(app)
        .get('/api/v1/admin/materials/00000000-0000-4000-8000-000000000777/transactions')
        .set('Authorization', `Bearer ${adminToken}`)) as unknown as JsonResponse,
      { status: 404, code: 'NOT_FOUND' },
    );

    expectProblem(
      (await request(app)
        .get('/api/v1/admin/materials/not-a-valid-uuid/transactions')
        .set('Authorization', `Bearer ${adminToken}`)) as unknown as JsonResponse,
      { status: 400, code: 'MALFORMED_REQUEST' },
    );

    const material = await arrangeMaterial();
    for (const query of ['type=transfer', 'from=2026-02-30', 'to=not-a-date', 'pageSize=0']) {
      expectProblem(
        (await request(app)
          .get(`/api/v1/admin/materials/${material.id}/transactions?${query}`)
          .set('Authorization', `Bearer ${adminToken}`)) as unknown as JsonResponse,
        { status: 400, code: 'MALFORMED_REQUEST' },
      );
    }
  });

  it('L6 answers 401 without auth and 403 for a master', async () => {
    const material = await arrangeMaterial();
    const path = `/api/v1/admin/materials/${material.id}/transactions`;

    expectProblem(
      (await request(app).get(path)) as unknown as JsonResponse,
      { status: 401, code: 'UNAUTHENTICATED' },
    );
    expectProblem(
      (await request(app)
        .get(path)
        .set('Authorization', `Bearer ${masterToken}`)) as unknown as JsonResponse,
      { status: 403, code: 'FORBIDDEN' },
    );
  });
});
