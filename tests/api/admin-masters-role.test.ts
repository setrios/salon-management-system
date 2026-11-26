/**
 * SMS-71 — the administrator is not a master.
 *
 * The single administrator is a row of `masters` with `role = 'admin'` (D-19),
 * and decision D10 makes "every master read filter on `role = 'master'`, so an
 * administrator id is a 404 on a master operation". The public reads (P4, P5)
 * and the booking path (P8, P11, R19) apply it; the administrator's own master
 * operations did not:
 *
 *   - R1 listed the administrator among the masters (found by the browser test
 *     S3 of SMS-57: A1's Master filter offered "Salon Administrator");
 *   - R3 read, and R4 changed, the administrator's row — R4 could deactivate
 *     the only administrator and lock the salon out (REQ-F-017);
 *   - R11 linked a service to the administrator as if a master, and answered
 *     500 for a `masterId` naming no row (an unchecked foreign key).
 *
 *   K1  R1 does not list the administrator
 *   K2  R3 answers 404 for the administrator's id
 *   K3  R4 answers 404 for the administrator's id, and the administrator can
 *       still sign in afterwards
 *   K4  R11 refuses the administrator's id as a master: 422 BUSINESS_RULE_VIOLATION
 *   K5  R11 refuses a masterId naming no row the same way, not with 500
 *
 * Source: REQ-F-012, REQ-F-017, REQ-F-018; D10, D-19 (src/modules/public/service.ts
 *         header, src/db/schema.ts); error-model.md §3; R11's declared 422.
 * Contract: openapi.yaml#/paths/~1admin~1masters (R1),
 *           ~1admin~1masters~1{masterId} (R3, R4), ~1admin~1master-services (R11).
 * Ticket: SMS-71 (Test)
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { seedAccount } from '../helpers/accounts.js';
import { arrangeMaster, arrangeService, unique } from '../helpers/booking.js';

describe('SMS-71 the administrator is not a master — R1, R3, R4, R11', () => {
  const app = createApp();

  const adminUsername = unique('sms71-admin');
  const adminPassword = 'sms71-admin-password';
  let adminId: string;
  let adminToken: string;
  let masterId: string;
  let serviceId: string;

  beforeAll(async () => {
    const admin = await seedAccount({
      role: 'admin',
      username: adminUsername,
      password: adminPassword,
      fullName: 'SMS-71 Administrator',
    });
    adminId = admin.id;
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword });
    adminToken = login.body.accessToken as string;

    masterId = (await arrangeMaster(app, unique('sms71 master'))).id;
    serviceId = (
      await arrangeService(app, adminToken, {
        name: unique('sms71 service'),
        baseDurationMinutes: 30,
      })
    ).id;
  });

  const auth = (): [string, string] => ['Authorization', `Bearer ${adminToken}`];

  it('K1 R1 lists the masters and not the administrator', async () => {
    const response = await request(app)
      .get('/api/v1/admin/masters?pageSize=100')
      .set(...auth());

    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(masterId);
    expect(ids).not.toContain(adminId);
  });

  it("K2 R3 answers 404 NOT_FOUND for the administrator's id", async () => {
    const response = await request(app)
      .get(`/api/v1/admin/masters/${adminId}`)
      .set(...auth());

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it("K3 R4 answers 404 for the administrator's id and leaves the account usable", async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/masters/${adminId}`)
      .set(...auth())
      .send({ active: false });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword });
    expect(login.status).toBe(200);
  });

  it("K4 R11 refuses the administrator's id as a master", async () => {
    const response = await request(app)
      .post('/api/v1/admin/master-services')
      .set(...auth())
      .send({ masterId: adminId, serviceId, price: { amountMinor: 45000, currency: 'UAH' } });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('K5 R11 refuses a masterId naming no row the same way, not with 500', async () => {
    const response = await request(app)
      .post('/api/v1/admin/master-services')
      .set(...auth())
      .send({ masterId: randomUUID(), serviceId, price: { amountMinor: 45000, currency: 'UAH' } });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('BUSINESS_RULE_VIOLATION');
  });
});
