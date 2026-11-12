/**
 * Test fixture: the arrangements a booking test needs, made through the API.
 *
 * Every operation used here already exists at S1.2/S1.3, so this helper can be
 * imported by a test file that is written before P1–P8 exist: the fixture is
 * arrangement, and arrangement must not be the reason a RED is red. (The only
 * reason a case in the booking files is red at RED is that the operation it
 * calls is not mounted.)
 *
 * Three choices this file makes, each visible rather than implied:
 *
 *   - **Accounts** come from `tests/helpers/accounts.ts`, because no operation
 *     creates an administrator and REQ-F-012 forbids self-registration. This
 *     is the same out-of-band provisioning S1.1 used.
 *   - **Services** are created through R6 (`POST /admin/services`) and **links**
 *     through R11 (`POST /admin/master-services`). Both are contract
 *     operations, so the suite arranges them the way an administrator would.
 *   - **Availability** is set through M4 (`PUT /me/availability`), the master's
 *     own operation, rather than written to `availability_weekly`.
 *
 * Nothing here asserts. A fixture that failed its own expectations would make a
 * RED run ambiguous — the failure could belong to the arrangement instead of to
 * the operation under test.
 *
 * Source: REQ-F-001 (services with prices), REQ-F-002 (slots come from the
 *         master's availability), REQ-F-012, REQ-F-017;
 *         spec/api/resource-model.md §5.1, §5.3, §5.4.
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';

import type { Express } from 'express';

import { seedAccount } from './accounts.js';

/** A service as the booking files need it: id, duration and its price. */
export interface ServiceFixture {
  readonly id: string;
  readonly baseDurationMinutes: number;
  readonly priceAmountMinor: number;
}

/** A master as the booking files need them: id and a bearer token of their own. */
export interface MasterFixture {
  readonly id: string;
  readonly fullName: string;
  readonly token: string;
}

/** A unique suffix, so two files that share one database do not collide. */
export function unique(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** The administrator: id (to prove P4/P5/P6 keep it off the public surface) and token. */
export interface AdminFixture {
  readonly id: string;
  readonly token: string;
}

/**
 * Creates the single administrator and logs in.
 *
 * The username is unique per call: the suite truncates between files, but a
 * file may call this more than once while its cases run.
 */
export async function arrangeAdmin(app: Express): Promise<AdminFixture> {
  const username = unique('booking-admin');
  const password = 'booking-admin-password';

  const account = await seedAccount({
    role: 'admin',
    username,
    password,
    fullName: 'Booking Administrator',
  });

  const response = await request(app).post('/api/v1/auth/login').send({ username, password });
  return { id: account.id, token: response.body.accessToken as string };
}

/** Creates a master account, logs in, and returns the id with the token. */
export async function arrangeMaster(
  app: Express,
  fullName = 'Booking Master',
): Promise<MasterFixture> {
  const username = unique('booking-master');
  const password = 'booking-master-password';

  const account = await seedAccount({ role: 'master', username, password, fullName });

  const response = await request(app).post('/api/v1/auth/login').send({ username, password });
  return { id: account.id, fullName, token: response.body.accessToken as string };
}

/**
 * Creates a service through R6.
 *
 * `category` defaults to the seeded `Hair`, which is why a booking file calls
 * `ensureSeedCategories()` first when it also reads P3: a service saved with a
 * category the seed fixture has not written would create that category with
 * `seeded: false` (D-27) and change what P3 is asked to return.
 */
export async function arrangeService(
  app: Express,
  adminToken: string,
  options: {
    readonly name: string;
    readonly baseDurationMinutes: number;
    readonly category?: string;
  },
): Promise<ServiceFixture> {
  const priceAmountMinor = options.baseDurationMinutes * 1000;

  const response = await request(app)
    .post('/api/v1/admin/services')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: options.name,
      category: options.category ?? 'Hair',
      baseDurationMinutes: options.baseDurationMinutes,
    });

  return {
    id: response.body.id as string,
    baseDurationMinutes: options.baseDurationMinutes,
    priceAmountMinor,
  };
}

/** Links a service to a master through R11, at the given price in minor units. */
export async function arrangeLink(
  app: Express,
  adminToken: string,
  masterId: string,
  serviceId: string,
  priceAmountMinor: number,
): Promise<void> {
  await request(app)
    .post('/api/v1/admin/master-services')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ masterId, serviceId, price: { amountMinor: priceAmountMinor, currency: 'UAH' } });
}

/**
 * Replaces the master's rule set through M4 with a single weekly window.
 *
 * `dayOfWeek` is the ISO numbering the contract uses (1 = Monday … 7 = Sunday).
 */
export async function arrangeWeeklyWindow(
  app: Express,
  masterToken: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
): Promise<void> {
  await request(app)
    .put('/api/v1/me/availability')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ weekly: [{ dayOfWeek, startTime, endTime }], dates: [] });
}
