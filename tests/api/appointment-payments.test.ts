/**
 * S5.3 appointment payments — R27 `createPayment`, the operation that records
 * the payment of a completed appointment, and the `payment` field that R20,
 * R21–R23 and `getAppointmentAdmin` then expose.
 *
 *   R27 POST /admin/appointments/{appointmentId}/payments → 201 Payment
 *
 * **The two rules the contract states.** REQ-F-021: a payment is recorded only
 * after the service has been completed — an appointment in `confirmed` or
 * `cancelled` answers 409 `APPOINTMENT_NOT_COMPLETED`, and nothing is written.
 * D12: an appointment carries at most one payment, and the row is immutable — a
 * second payment answers 409 `PAYMENT_ALREADY_RECORDED`, and the contract has no
 * operation that edits or deletes one (the path answers 405 for those methods).
 *
 * **What this file does not invent.** The contract's closed catalog decides the
 * codes; the body is `PaymentCreate`, validated from `openapi.yaml`. Three
 * points the contract leaves open are decided in the TEST-GATE:
 *
 *   - **Any amount is accepted** (N1). REQ-F-021 says the administrator records
 *     the amount; it nowhere says it must equal `totalPrice`, and `Money` allows
 *     `0`. The refusal for a wrong amount would be a rule the SRS does not state.
 *   - **`payment` is returned in the staff representation** (N2) once recorded —
 *     the field is declared in `AppointmentAdmin`, and without it the only sign
 *     that a payment exists is a second request's 409.
 *   - **No `Location` on the 201** (N3), for the reason R26 gives: no operation
 *     reads a single payment, so the header would name something unfetchable.
 *
 * Source: REQ-F-021 ("The administrator records payment (amount, status
 *         paid/unpaid, method) only after the service has been completed"),
 *         REQ-F-027 (completion is the precondition), REQ-NF-009 (no gateway:
 *         payments are recorded manually), D12 (one payment per appointment,
 *         immutable); `error-model.md` §3 (409 `APPOINTMENT_NOT_COMPLETED` and
 *         409 `PAYMENT_ALREADY_RECORDED` are R27's; §5.5 is the first one's
 *         body) and §4; `resource-model.md` §5.5 (R27).
 * Contract: openapi.yaml#/paths/~1admin~1appointments~1{appointmentId}~1payments;
 *           schemas Payment, PaymentCreate, Money, AppointmentAdmin.
 * Ticket: SMS-13, SMS-34 (Test)
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

/** The suite's fixed clock: Kyiv winter, +02:00. */
const NOW = '2026-11-12T09:00:00+02:00';

/** One money value the tests use; the appointment's own price is 40000. */
const TOTAL_PRICE_AMOUNT_MINOR = 40000;

type SchemaValidator = ReturnType<typeof getSchemaValidator>;

interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

let app: Express;
let adminToken: string;
let masterToken: string;
let masterId: string;
let serviceId: string;

const paymentSchema: SchemaValidator = getSchemaValidator('Payment');
const appointmentAdminSchema: SchemaValidator = getSchemaValidator('AppointmentAdmin');
const problemSchema: SchemaValidator = getSchemaValidator('Problem');

/** Books through R19 and returns the new appointment's id. */
async function book(startAt: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/admin/appointments')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      client: { name: 'Payment Client', phone: '+380501234567' },
      masterId,
      serviceIds: [serviceId],
      startAt,
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

/** Books and completes, the state R27 requires. */
async function completedAppointment(startAt: string): Promise<string> {
  const id = await book(startAt);
  const completed = await request(app)
    .post(`/api/v1/admin/appointments/${id}/complete`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(completed.status).toBe(200);
  return id;
}

/** Posts a payment and returns the raw response. */
function pay(
  appointmentId: string,
  body: unknown,
  options: { readonly token?: string; readonly contentType?: string } = {},
): Promise<JsonResponse> {
  const token = options.token === undefined ? adminToken : options.token;
  const call = request(app).post(`/api/v1/admin/appointments/${appointmentId}/payments`);
  if (token !== '') call.set('Authorization', `Bearer ${token}`);
  return options.contentType === undefined
    ? call.send(body as object)
    : call
        .set('Content-Type', options.contentType)
        .send(typeof body === 'string' ? body : JSON.stringify(body));
}

const paid = (amountMinor = TOTAL_PRICE_AMOUNT_MINOR): Record<string, unknown> => ({
  amount: { amountMinor, currency: 'UAH' },
  method: 'card',
  status: 'paid',
});

/** Reads the appointment through `getAppointmentAdmin`. */
async function readAppointment(id: string): Promise<JsonResponse> {
  return await request(app)
    .get(`/api/v1/admin/appointments/${id}`)
    .set('Authorization', `Bearer ${adminToken}`);
}

/** Asserts a 201 `Payment` and returns its body. */
function expectPayment(response: JsonResponse): Record<string, any> {
  expect(response.status).toBe(201);
  expect(paymentSchema(response.body), JSON.stringify(paymentSchema.errors ?? [])).toBe(true);
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

  const master = await arrangeMaster(app, 'Payment Master');
  masterToken = master.token;
  masterId = master.id;

  const service = await arrangeService(app, adminToken, {
    name: unique('payment-service'),
    baseDurationMinutes: 30,
  });
  serviceId = service.id;
  await arrangeLink(app, adminToken, masterId, serviceId, TOTAL_PRICE_AMOUNT_MINOR);

  // Every weekday, 09:00–21:00: the tests pick their own hours on a fixed week.
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
});

describe('createPayment (R27, POST /admin/appointments/{appointmentId}/payments)', () => {
  it('P1 records a payment on a completed appointment and the staff view shows it (REQ-F-021, N2)', async () => {
    const id = await completedAppointment('2026-11-16T10:00:00+02:00');

    // A completed appointment has no payment until one is recorded.
    const before = await readAppointment(id);
    expect(before.body.payment).toBeUndefined();

    const response = await pay(id, paid());

    const body = expectPayment(response);
    expect(body).toMatchObject({
      appointmentId: id,
      amount: { amountMinor: TOTAL_PRICE_AMOUNT_MINOR, currency: 'UAH' },
      status: 'paid',
      method: 'card',
      // R27's own clock, not the appointment's.
      recordedAt: NOW,
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);

    // N3: no Location — no operation reads one payment.
    expect(response.headers.location).toBeUndefined();

    // N2: the recorded payment is part of the administrator's view of the
    // record, and the appointment's own status is untouched by it.
    const after = await readAppointment(id);
    expect(
      appointmentAdminSchema(after.body),
      JSON.stringify(appointmentAdminSchema.errors ?? []),
    ).toBe(true);
    expect(after.body.status).toBe('completed');
    expect(after.body.payment).toMatchObject({
      id: body.id,
      appointmentId: id,
      amount: { amountMinor: TOTAL_PRICE_AMOUNT_MINOR, currency: 'UAH' },
      status: 'paid',
      method: 'card',
    });
  });

  it('P2 defaults the status to paid when the body omits it (PaymentCreate default)', async () => {
    const id = await completedAppointment('2026-11-16T11:00:00+02:00');

    const body = expectPayment(
      await pay(id, { amount: { amountMinor: 25000, currency: 'UAH' }, method: 'cash' }),
    );

    expect(body.status).toBe('paid');
    expect(body.method).toBe('cash');
  });

  it('P3 records an unpaid payment and echoes the status (REQ-F-021)', async () => {
    const id = await completedAppointment('2026-11-16T12:00:00+02:00');

    const body = expectPayment(
      await pay(id, {
        amount: { amountMinor: 10000, currency: 'UAH' },
        method: 'cash',
        status: 'unpaid',
      }),
    );

    expect(body).toMatchObject({ status: 'unpaid', method: 'cash' });
    expect((await readAppointment(id)).body.payment.status).toBe('unpaid');
  });

  it('P4 refuses a confirmed appointment with 409 APPOINTMENT_NOT_COMPLETED and writes nothing (REQ-F-021)', async () => {
    const id = await book('2026-11-16T13:00:00+02:00');

    const response = await pay(id, paid());

    expectProblem(response, { status: 409, code: 'APPOINTMENT_NOT_COMPLETED' });
    // error-model.md §5.5's sentence, and the appointment is untouched.
    expect(response.body.detail).toBe(
      'A payment can be recorded only for a completed appointment.',
    );
    expect((await readAppointment(id)).body.payment).toBeUndefined();
    expect((await readAppointment(id)).body.status).toBe('confirmed');
  });

  it('P5 refuses a cancelled appointment with the same 409 (REQ-F-021)', async () => {
    const id = await book('2026-11-16T14:00:00+02:00');
    await request(app)
      .post(`/api/v1/admin/appointments/${id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);

    expectProblem(await pay(id, paid()), {
      status: 409,
      code: 'APPOINTMENT_NOT_COMPLETED',
    });
    expect((await readAppointment(id)).body.payment).toBeUndefined();
  });

  it('P6 refuses a second payment with 409 PAYMENT_ALREADY_RECORDED and keeps the first (D12)', async () => {
    const id = await completedAppointment('2026-11-16T15:00:00+02:00');
    const first = expectPayment(await pay(id, paid()));

    expectProblem(await pay(id, paid(99999)), {
      status: 409,
      code: 'PAYMENT_ALREADY_RECORDED',
    });

    // The first row is what the appointment carries, unchanged.
    const after = await readAppointment(id);
    expect(after.body.payment).toMatchObject({
      id: first.id,
      amount: { amountMinor: TOTAL_PRICE_AMOUNT_MINOR },
    });

    // D12's immutability: the contract has no method that changes a payment.
    const patch = await request(app)
      .patch(`/api/v1/admin/appointments/${id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ method: 'cash' });
    expect(patch.status).toBe(405);
  });

  it('P7 accepts an amount that is not the appointment total, including zero (N1)', async () => {
    const id = await completedAppointment('2026-11-16T16:00:00+02:00');

    // Above the total: a tip, in effect. The SRS states no equality rule.
    expect(expectPayment(await pay(id, paid(50000))).amount.amountMinor).toBe(50000);

    // Zero is the contract's own minimum (`Money.amountMinor`), so it is not a
    // schema violation and no rule elsewhere refuses it.
    const secondId = await completedAppointment('2026-11-16T17:00:00+02:00');
    const zero = await pay(secondId, {
      amount: { amountMinor: 0, currency: 'UAH' },
      method: 'cash',
    });
    expect(expectPayment(zero).amount.amountMinor).toBe(0);
  });

  it('P8 refuses every body the contract closes, and 400/415 for the envelope (D22)', async () => {
    const id = await completedAppointment('2026-11-16T18:00:00+02:00');

    const refusals: unknown[] = [
      { method: 'card' },
      { amount: { amountMinor: 100, currency: 'USD' }, method: 'card' },
      { amount: { amountMinor: -1, currency: 'UAH' }, method: 'card' },
      { amount: { amountMinor: 100.5, currency: 'UAH' }, method: 'card' },
      { amount: { amountMinor: 100, currency: 'UAH' }, method: 'transfer' },
      { amount: { amountMinor: 100, currency: 'UAH' }, method: 'card', status: 'partial' },
      { amount: { amountMinor: 100, currency: 'UAH' }, method: 'card', appointmentId: id },
    ];

    for (const body of refusals) {
      expectProblem(await pay(id, body), { status: 422, code: 'VALIDATION_ERROR' });
    }

    const noBody = await request(app)
      .post(`/api/v1/admin/appointments/${id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expectProblem(noBody, {
      status: 400,
      code: 'MALFORMED_REQUEST',
    });

    expectProblem(await pay(id, '{"amount":{}}', { contentType: 'text/plain' }), {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });

    // None of them created a payment.
    expect((await readAppointment(id)).body.payment).toBeUndefined();
  });

  it('P9 answers 404 for an unknown appointment, 400 for a non-uuid id, 401 and 403', async () => {
    expectProblem(await pay('00000000-0000-4000-8000-000000000888', paid()), {
      status: 404,
      code: 'NOT_FOUND',
    });
    expectProblem(await pay('not-a-valid-uuid', paid()), {
      status: 400,
      code: 'MALFORMED_REQUEST',
    });

    const id = await completedAppointment('2026-11-16T19:00:00+02:00');
    expectProblem(await pay(id, paid(), { token: '' }), {
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expectProblem(await pay(id, paid(), { token: masterToken }), {
      status: 403,
      code: 'FORBIDDEN',
    });

    // And the refused calls wrote nothing.
    expect((await readAppointment(id)).body.payment).toBeUndefined();
  });

  it('P10 keeps one payment per appointment across masters and gives it its own instant (D12, N2)', async () => {
    const first = await completedAppointment('2026-11-17T10:00:00+02:00');
    const second = await completedAppointment('2026-11-17T11:00:00+02:00');

    expectPayment(await pay(first, paid()));

    // The other appointment's ledger is separate: one payment each, not one
    // per master or per day.
    const other = expectPayment(await pay(second, paid()));
    expect(other.appointmentId).toBe(second);

    expect((await readAppointment(first)).body.payment.appointmentId).toBe(first);
    expect((await readAppointment(second)).body.payment.appointmentId).toBe(second);

    // Both rows carry the injected clock as `recordedAt` (the suite fixes it).
    expect((await readAppointment(first)).body.payment.recordedAt).toBe(NOW);
  });
});
