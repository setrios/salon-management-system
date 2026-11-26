/**
 * SMS-72 — R11 refuses a serviceId that names no service, instead of 500.
 *
 * SMS-71 made R11 check its `masterId` (K4, K5). The same insert has a second
 * unchecked foreign key: a `serviceId` naming no row fails in the database and
 * is answered 500 `INTERNAL_ERROR` — found while verifying SMS-71 (a probe of
 * the built server, 2026-11-26). The error handler's own rule is that 500 is
 * never used for a client-caused condition, and R11 declares 422; the
 * developer chose 422 `BUSINESS_RULE_VIOLATION` for a reference that names
 * nothing at the SMS-71 TEST-GATE.
 *
 *   K6  R11 with a serviceId naming no row → 422 BUSINESS_RULE_VIOLATION
 *   K7  the valid pair still links (201), so the check refuses only what it should
 *
 * Source: REQ-F-018; error-model.md §3; R11's declared 422; TEST-GATE
 *         logs/gates/2026-11-26-test-S6-corrections.md (code decision).
 * Contract: openapi.yaml#/paths/~1admin~1master-services (R11).
 * Ticket: SMS-72 (Test)
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { arrangeAdmin, arrangeMaster, arrangeService, unique } from '../helpers/booking.js';

describe('SMS-72 R11 checks its serviceId', () => {
  const app = createApp();
  let adminToken: string;
  let masterId: string;
  let serviceId: string;

  beforeAll(async () => {
    adminToken = (await arrangeAdmin(app)).token;
    masterId = (await arrangeMaster(app, unique('sms72 master'))).id;
    serviceId = (
      await arrangeService(app, adminToken, {
        name: unique('sms72 service'),
        baseDurationMinutes: 30,
      })
    ).id;
  });

  function link(body: Record<string, unknown>) {
    return request(app)
      .post('/api/v1/admin/master-services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: { amountMinor: 45000, currency: 'UAH' }, ...body });
  }

  it('K6 refuses a serviceId naming no row with 422, not 500', async () => {
    const response = await link({ masterId, serviceId: randomUUID() });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('K7 still links a master and a service that exist', async () => {
    const response = await link({ masterId, serviceId });
    expect(response.status).toBe(201);
  });
});
