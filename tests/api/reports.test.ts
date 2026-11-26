/**
 * S5.4 reports — R28 `getRevenueReport`, R29 `getPopularServicesReport`,
 * R30 `getStockLevelsReport`.
 *
 *   R28 GET /admin/reports/revenue            → RevenueReport
 *   R29 GET /admin/reports/popular-services   → PopularServicesReport
 *   R30 GET /admin/reports/stock-levels       → StockLevelsReport
 *
 * **The period is one rule for both period operations.** `period` is a preset
 * (`day`, `week`, `month`) resolved against the application's clock in the salon
 * zone, or `from`/`to` is a custom range; exactly one form is supplied, and a
 * request with both, neither, half a range, or a range that starts after it ends
 * is 422 `INVALID_PERIOD` with `error-model.md` §5.4's sentence. An unrecognised
 * `period` value is that same 422, not a 400 (Q1) — the contract's enum is
 * applied by the operation, because §3 names this case `INVALID_PERIOD` while
 * the generic query validator would answer `MALFORMED_REQUEST`.
 *
 * **What is counted** is decided in the gate (Q2, Q3, Q4):
 *
 *   - revenue is the sum of payments with `status: paid` in the window by
 *     `recordedAt`;

 *   - popular services count **every** appointment in the window by `startAt`,
 *     whatever its status (REQ-F-032's sentence names no status) — a cancelled
 *     appointment is asserted to count, so the decision is visible;
 *   - the ranking's name is the **current** service name, not the booking
 *     snapshot.
 *
 * The clock is fixed at `NOW`, so every preset window contains the same day, and
 * the payments of the stage all carry `recordedAt === NOW`. Ranges that exclude
 * that day are asserted to be empty, which is the only way the window boundary is
 * observable from outside.
 *
 * Source: REQ-F-022, REQ-F-032, REQ-F-033, D16; `error-model.md` §3, §5.4;
 *         `resource-model.md` §5.6 (R28–R30).
 * Contract: openapi.yaml#/paths/~1admin~1reports~1revenue,
 *           ~1admin~1reports~1popular-services,
 *           ~1admin~1reports~1stock-levels; schemas RevenueReport,
 *           PopularServicesReport, StockLevelsReport, Money, ReportPeriod.
 * Ticket: SMS-16, SMS-35 (Test)
 */

import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import {
  arrangeAdmin,
  arrangeLink,
  arrangeMaster,
  arrangeService,
  unique,
} from '../helpers/booking.js';

/** The suite's fixed clock: Kyiv winter, +02:00. Thursday 12 November 2026. */
const NOW = '2026-11-12T09:00:00+02:00';

type SchemaValidator = ReturnType<typeof getSchemaValidator>;

interface JsonResponse {
  readonly status: number;
  readonly body: Record<string, any>;
}

let app: Express;
let adminToken: string;
let masterToken: string;
let masterId: string;

const revenueSchema: SchemaValidator = getSchemaValidator('RevenueReport');
const popularSchema: SchemaValidator = getSchemaValidator('PopularServicesReport');
const stockSchema: SchemaValidator = getSchemaValidator('StockLevelsReport');
const problemSchema: SchemaValidator = getSchemaValidator('Problem');

/** The three services the ranking is built from, and one appointment each way. */
const serviceIds: Record<'zeta' | 'beta' | 'alpha', string> = {
  zeta: '',
  beta: '',
  alpha: '',
};

/** Books through R19 and returns the id. */
async function book(serviceId: string, startAt: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/admin/appointments')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      client: { name: 'Report Client', phone: '+380501234567' },
      masterId,
      serviceIds: [serviceId],
      startAt,
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function complete(id: string): Promise<void> {
  const response = await request(app)
    .post(`/api/v1/admin/appointments/${id}/complete`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(response.status).toBe(200);
}

async function cancel(id: string): Promise<void> {
  const response = await request(app)
    .post(`/api/v1/admin/appointments/${id}/cancel`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(response.status).toBe(200);
}

async function pay(
  appointmentId: string,
  amountMinor: number,
  method: 'cash' | 'card',
  status: 'paid' | 'unpaid',
): Promise<void> {
  const response = await request(app)
    .post(`/api/v1/admin/appointments/${appointmentId}/payments`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ amount: { amountMinor, currency: 'UAH' }, method, status });
  expect(response.status).toBe(201);
}

/** GET with the admin token, or with the given one. */
function get(path: string, token = adminToken): Promise<JsonResponse> {
  const call = request(app).get(path);
  if (token !== '') call.set('Authorization', `Bearer ${token}`);
  return call;
}

/** Asserts a 200 body against the operation's schema. */
function expectBody(response: JsonResponse, schema: SchemaValidator): Record<string, any> {
  expect(response.status).toBe(200);
  expect(schema(response.body), JSON.stringify(schema.errors ?? [])).toBe(true);
  return response.body;
}

/** Asserts a `Problem` with the expected status and code. */
function expectProblem(
  response: JsonResponse,
  expected: { readonly status: number; readonly code: string },
): void {
  expect(response.status).toBe(expected.status);
  expect(response.body.code).toBe(expected.code);
  expect(problemSchema(response.body), JSON.stringify(problemSchema.errors ?? [])).toBe(true);
}

beforeAll(async () => {
  app = createApp({ now: () => new Date(NOW) });
  adminToken = (await arrangeAdmin(app)).token;

  const master = await arrangeMaster(app, 'Report Master');
  masterToken = master.token;
  masterId = master.id;

  for (const [key, name] of [
    ['zeta', 'Zeta Cut'],
    ['beta', 'Beta Wash'],
    ['alpha', 'Alpha Cut'],
  ] as const) {
    const service = await arrangeService(app, adminToken, {
      name: `${name} ${unique('')}`.trim(),
      baseDurationMinutes: 30,
    });
    serviceIds[key] = service.id;
    await arrangeLink(app, adminToken, masterId, service.id, 40000);
  }

  await request(app)
    .put('/api/v1/me/availability')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      weekly: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: '09:00',
        endTime: '21:00',
      })),
      dates: [],
    });

  // The current day, week and month: Thursday 12 November 2026.
  await book(serviceIds.zeta, '2026-11-12T10:00:00+02:00');

  const paidByCard = await book(serviceIds.zeta, '2026-11-12T11:00:00+02:00');
  await complete(paidByCard);
  await pay(paidByCard, 40000, 'card', 'paid');

  const cancelled = await book(serviceIds.beta, '2026-11-12T12:00:00+02:00');
  await cancel(cancelled);

  await book(serviceIds.alpha, '2026-11-12T13:00:00+02:00');
  await book(serviceIds.alpha, '2026-11-12T14:00:00+02:00');

  // Outside the current week, inside the current month, and its money is
  // recorded as unpaid: excluded from revenue (Q2), counted as a booking (Q3).
  const unpaid = await book(serviceIds.zeta, '2026-11-16T10:00:00+02:00');
  await complete(unpaid);
  await pay(unpaid, 15000, 'cash', 'unpaid');

  // Outside the current month, with a paid payment.
  const december = await book(serviceIds.beta, '2026-12-02T10:00:00+02:00');
  await complete(december);
  await pay(december, 20000, 'cash', 'paid');

  // Stock levels: one active and one inactive material, the first restocked
  // through R26 so the report is asserted against the ledger's effect.
  const shampoo = await request(app)
    .post('/api/v1/admin/materials')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Zeta Shampoo ${unique('')}`.trim(), unit: 'ml', initialStockQuantity: 5 });
  expect(shampoo.status).toBe(201);

  const wax = await request(app)
    .post('/api/v1/admin/materials')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Alpha Wax ${unique('')}`.trim(), unit: 'g', active: false });
  expect(wax.status).toBe(201);

  const receipt = await request(app)
    .post(`/api/v1/admin/materials/${shampoo.body.id}/transactions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ type: 'receipt', quantity: 95, occurredAt: '2026-11-12T08:00:00+02:00' });
  expect(receipt.status).toBe(201);
  expect(receipt.body).toBeDefined();
});

describe('getRevenueReport (R28, GET /admin/reports/revenue)', () => {
  it('R1 sums only paid payments recorded in the window and breaks them down by method (Q2)', async () => {
    const body = expectBody(await get('/api/v1/admin/reports/revenue?period=day'), revenueSchema);

    expect(body).toMatchObject({
      period: 'day',
      from: '2026-11-12',
      to: '2026-11-12',
      totalAmount: { amountMinor: 60000, currency: 'UAH' },
      paymentsCount: 2,
    });
    // Cash before card, as the contract's example orders them; the unpaid
    // 15000 is not revenue.
    expect(body.byMethod).toEqual([
      { method: 'cash', amount: { amountMinor: 20000, currency: 'UAH' }, count: 1 },
      { method: 'card', amount: { amountMinor: 40000, currency: 'UAH' }, count: 1 },
    ]);
  });

  it('R2 resolves the week and month presets around the clock, and echoes a custom range as custom', async () => {
    const week = expectBody(await get('/api/v1/admin/reports/revenue?period=week'), revenueSchema);
    // Thursday 12 November 2026 sits in the ISO week Monday 9 – Sunday 15.
    expect(week).toMatchObject({ period: 'week', from: '2026-11-09', to: '2026-11-15' });

    const month = expectBody(
      await get('/api/v1/admin/reports/revenue?period=month'),
      revenueSchema,
    );
    expect(month).toMatchObject({ period: 'month', from: '2026-11-01', to: '2026-11-30' });

    const custom = expectBody(
      await get('/api/v1/admin/reports/revenue?from=2026-11-01&to=2026-11-30'),
      revenueSchema,
    );
    expect(custom).toMatchObject({
      period: 'custom',
      from: '2026-11-01',
      to: '2026-11-30',
      totalAmount: { amountMinor: 60000, currency: 'UAH' },
      paymentsCount: 2,
    });
  });

  it('R3 reports zero for a window with no payments and keeps the shape', async () => {
    const october = expectBody(
      await get('/api/v1/admin/reports/revenue?from=2026-10-01&to=2026-10-31'),
      revenueSchema,
    );

    expect(october.totalAmount).toEqual({ amountMinor: 0, currency: 'UAH' });
    expect(october.paymentsCount).toBe(0);
    expect(october.byMethod).toEqual([]);
  });

  it('R4 refuses every invalid period with 422 INVALID_PERIOD, including an unknown preset (Q1)', async () => {
    const conflicts = [
      '/api/v1/admin/reports/revenue',
      '/api/v1/admin/reports/revenue?period=day&from=2026-11-01&to=2026-11-30',
      '/api/v1/admin/reports/revenue?from=2026-11-01',
      '/api/v1/admin/reports/revenue?to=2026-11-30',
      '/api/v1/admin/reports/revenue?period=quarter',
    ];

    for (const path of conflicts) {
      const response = await get(path);
      expectProblem(response, { status: 422, code: 'INVALID_PERIOD' });
      // error-model.md §5.4's sentence.
      expect(response.body.detail).toBe(
        'Supply either period or both from and to, not both forms.',
      );
    }

    // A range that ends before it starts is invalid for a different reason, and
    // §5.4's sentence describes the wrong one; the code is what is asserted.
    expectProblem(await get('/api/v1/admin/reports/revenue?from=2026-11-30&to=2026-11-01'), {
      status: 422,
      code: 'INVALID_PERIOD',
    });
  });

  // SMS-69. Q1 makes every unrecognised preset 422, whatever the word; the word
  // `repeated` is no exception, and must not be read as "the parameter was
  // given twice", which is the only 400 for `period`.
  it('R4b refuses period=repeated as an unknown preset with 422 INVALID_PERIOD (Q1)', async () => {
    for (const path of [
      '/api/v1/admin/reports/revenue?period=repeated',
      '/api/v1/admin/reports/popular-services?period=repeated',
    ]) {
      expectProblem(await get(path), { status: 422, code: 'INVALID_PERIOD' });
    }

    // The parameter really given twice stays 400, as before.
    expectProblem(await get('/api/v1/admin/reports/revenue?period=day&period=week'), {
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
  });

  it('R5 answers 400 for a value that is not a calendar date, and 401/403 for the guards', async () => {
    for (const value of ['2026-02-30', 'not-a-date', '2026-11-31']) {
      const response = await get(`/api/v1/admin/reports/revenue?from=${value}&to=2026-12-01`);
      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    }

    expectProblem(await get('/api/v1/admin/reports/revenue?period=day', ''), {
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expectProblem(await get('/api/v1/admin/reports/revenue?period=day', masterToken), {
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('getPopularServicesReport (R29, GET /admin/reports/popular-services)', () => {
  it('R6 ranks by booking count and breaks ties by name ascending (D16, Q3)', async () => {
    const body = expectBody(
      await get('/api/v1/admin/reports/popular-services?period=day'),
      popularSchema,
    );

    expect(body).toMatchObject({ period: 'day', from: '2026-11-12', to: '2026-11-12' });
    // Two bookings each for Alpha and Zeta — the tie is broken by name — and the
    // cancelled Beta appointment still counts (Q3).
    expect(
      body.items.map((item: any) => [item.rank, item.name.split(' ')[0], item.bookingsCount]),
    ).toEqual([
      [1, 'Alpha', 2],
      [2, 'Zeta', 2],
      [3, 'Beta', 1],
    ]);
  });

  it('R7 counts the month across two weeks and a custom day on its own (REQ-F-032)', async () => {
    const month = expectBody(
      await get('/api/v1/admin/reports/popular-services?period=month'),
      popularSchema,
    );
    expect(month.items.map((item: any) => [item.name.split(' ')[0], item.bookingsCount])).toEqual([
      ['Zeta', 3],
      ['Alpha', 2],
      ['Beta', 1],
    ]);

    // The November 16 appointment is outside the current week and inside the
    // month; a custom window on that day sees only it.
    const day = expectBody(
      await get('/api/v1/admin/reports/popular-services?from=2026-11-16&to=2026-11-16'),
      popularSchema,
    );
    expect(day).toMatchObject({ period: 'custom' });
    expect(day.items.map((item: any) => [item.name.split(' ')[0], item.bookingsCount])).toEqual([
      ['Zeta', 1],
    ]);

    // A window with no appointments has no items, not an error.
    const empty = expectBody(
      await get('/api/v1/admin/reports/popular-services?from=2027-01-01&to=2027-01-31'),
      popularSchema,
    );
    expect(empty.items).toEqual([]);
  });

  it('R8 refuses the invalid periods as R28 does, and answers 400/401/403', async () => {
    expectProblem(await get('/api/v1/admin/reports/popular-services'), {
      status: 422,
      code: 'INVALID_PERIOD',
    });
    expectProblem(
      await get('/api/v1/admin/reports/popular-services?period=day&from=2026-11-01&to=2026-11-30'),
      { status: 422, code: 'INVALID_PERIOD' },
    );
    expectProblem(await get('/api/v1/admin/reports/popular-services?period=year'), {
      status: 422,
      code: 'INVALID_PERIOD',
    });
    expectProblem(await get('/api/v1/admin/reports/popular-services?from=2026-11-01'), {
      status: 422,
      code: 'INVALID_PERIOD',
    });
    expectProblem(
      await get('/api/v1/admin/reports/popular-services?from=2026-13-01&to=2026-12-01'),
      { status: 400, code: 'MALFORMED_REQUEST' },
    );
    expectProblem(await get('/api/v1/admin/reports/popular-services?period=day', ''), {
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expectProblem(await get('/api/v1/admin/reports/popular-services?period=day', masterToken), {
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('getStockLevelsReport (R30, GET /admin/reports/stock-levels)', () => {
  it('R9 returns every material with its current quantity, inactive ones included (REQ-F-033)', async () => {
    const body = expectBody(await get('/api/v1/admin/reports/stock-levels'), stockSchema);

    expect(body.asOf).toBe(NOW);

    const items = body.items.map((item: any) => [
      item.name.split(' ')[0],
      item.unit,
      item.quantity,
    ]);
    // Ordered by name; the inactive material is a level too, and the shampoo's
    // quantity is 5 + the 95 the ledger received.
    expect(items).toEqual([
      ['Alpha', 'g', 0],
      ['Zeta', 'ml', 100],
    ]);
  });

  it('R10 ignores a period parameter, has no request body, and answers 401/403', async () => {
    // REQ-F-033: no period selection applies — the parameter is not an error,
    // it is simply not read.
    const withPeriod = await get('/api/v1/admin/reports/stock-levels?period=day');
    expect(expectBody(withPeriod, stockSchema).items).toHaveLength(2);

    expectProblem(await get('/api/v1/admin/reports/stock-levels', ''), {
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expectProblem(await get('/api/v1/admin/reports/stock-levels', masterToken), {
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
