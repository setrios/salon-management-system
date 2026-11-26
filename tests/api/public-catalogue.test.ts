/**
 * S2.1 public catalogue: P1 `listServices`, P2 `getService`, P3
 * `listCategories`, P4 `listMasters`, P5 `getMaster` and P6
 * `listMasterServices`. Exactly six operations, all public (`security: []`).
 *
 * Source: REQ-F-001 (a service carries the base duration and each master offers
 *         it at a price — the data a booking sums), REQ-F-002 (a client picks a
 *         master and a date from that master's availability, so the master and
 *         the offered services must be readable without an account);
 *         REQ-F-014 (a master's service list is the link records, filtered to
 *         active ones); REQ-F-024 (the public category list carries the three
 *         seeds and any custom category), SCN-08;
 *         POS-16, POS-18, POS-19; `error-model.md` §3 (400 for an ill-typed
 *         query parameter; P2/P5/P6 declare 404 for an unknown id; P3 declares
 *         its 400 with no trigger — CL-10, so no case here asks for it);
 *         `resource-model.md` §5.1 (P1–P6), D19 (`MasterPublic` carries only id
 *         and full name), D27 (a category exists because a service was saved
 *         with it, never through its own operation).
 * Contract: openapi.yaml#/paths/~1services, ~1services~1{serviceId},
 *           ~1categories, ~1masters, ~1masters~1{masterId},
 *           ~1masters~1{masterId}~1services;
 *           schemas ServicePage, Service, CategoryList, MasterPage,
 *           MasterPublic, MasterServicePage; error bodies validated against
 *           Problem.
 * Ticket: SMS-25 (Test) — P1, P2 and P6 implement REQ-F-001, P4 and P5
 *         implement REQ-F-002 (SRS matrix, `spec/salon-management-system-srs-v1.3.tex`
 *         lines 897–898), and P3 serves REQ-F-024; S2.1 mounts the surface.
 *
 * ---------------------------------------------------------------------------
 * Decisions this file is written against (tdd-SMS-25, D7, D10, D11):
 *
 *   D7  P1–P6 belong to SMS-25 through the requirements they implement, not
 *       through a separate ticket. The stage plan says the public catalogue is
 *       S2.1's; the SRS matrix says the requirements are SMS-25's.
 *   D10 The public surfaces are about **booking masters only**. The
 *       administrator is a row of `masters` (D-19) with `role = 'admin'`, so
 *       without this decision P4 would list the administrator as a bookable
 *       master. P4 lists `role = 'master'`; P5 and P6 answer 404 for an
 *       administrator id, the same answer they give any id that names no
 *       bookable master.
 *   D11 A service is listed with `active: true` only. The contract's P1 summary
 *       is "List active services"; P4's and P6's `active` parameter defaults to
 *       the unfiltered set, so `active=false` is how a client asks for the
 *       deactivated ones.
 *
 * The fixture uses the API for everything it arranges — R2 for accounts is not
 * available (an administrator creates masters through R2, which is why one is
 * seeded), R6 for services, R11 for links, M4 for availability. Direct SQL is
 * used only for the administrator and the master accounts, as in S1.1.
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import {
  arrangeAdmin,
  arrangeLink,
  arrangeMaster,
  arrangeService,
  unique,
  type AdminFixture,
  type MasterFixture,
  type ServiceFixture,
} from '../helpers/booking.js';
import { ensureSeedCategories } from '../helpers/reference-data.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal view of a supertest response; see `tests/api/auth.test.ts`. */
interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

type SchemaValidator = ReturnType<typeof getSchemaValidator>;

describe('S2.1 public catalogue — P1–P6', () => {
  const app = createApp();

  const isProblem = getSchemaValidator('Problem');
  const isServicePage = getSchemaValidator('ServicePage');
  const isService = getSchemaValidator('Service');
  const isCategoryList = getSchemaValidator('CategoryList');
  const isMasterPage = getSchemaValidator('MasterPage');
  const isMasterPublic = getSchemaValidator('MasterPublic');
  const isMasterServicePage = getSchemaValidator('MasterServicePage');

  let admin: AdminFixture;

  /** The master every case books or reads; has one active link and one inactive. */
  let olena: MasterFixture;
  let olenaHaircut: ServiceFixture;
  let olenaColoring: ServiceFixture;

  /** A second master, so a case can prove a list is not narrowed to one id. */
  let petro: MasterFixture;
  let petroTrim: ServiceFixture;

  beforeAll(async () => {
    // The three seeds, before any service is saved. A service saved with a
    // category before `ensureSeedCategories()` runs would create that category
    // with `seeded:false` (D-27) and P3 would then report a seed as custom.
    await ensureSeedCategories();

    admin = await arrangeAdmin(app);

    olena = await arrangeMaster(app, 'Olena Catalogue');
    petro = await arrangeMaster(app, 'Petro Catalogue');

    olenaHaircut = await arrangeService(app, admin.token, {
      name: unique('Catalogue Haircut'),
      baseDurationMinutes: 45,
    });
    olenaColoring = await arrangeService(app, admin.token, {
      name: unique('Catalogue Coloring'),
      baseDurationMinutes: 60,
      category: 'Coloring',
    });
    petroTrim = await arrangeService(app, admin.token, {
      name: unique('Catalogue Trim'),
      baseDurationMinutes: 30,
    });

    await arrangeLink(app, admin.token, olena.id, olenaHaircut.id, 55000);
    await arrangeLink(app, admin.token, olena.id, olenaColoring.id, 90000);
    await arrangeLink(app, admin.token, petro.id, petroTrim.id, 30000);
  });

  /** A service created for one case, so the file's own data stays untouched. */
  async function createService(baseDurationMinutes: number): Promise<ServiceFixture> {
    return arrangeService(app, admin.token, {
      name: unique('Catalogue Service'),
      baseDurationMinutes,
    });
  }

  function expectProblem(response: JsonResponse, expected: { status: number; code: string }): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({ status: expected.status, code: expected.code });
    expect(response.body.traceId).toMatch(UUID_V4);
    expect(response.body.instance).toBeDefined();
  }

  function expectJson(
    response: JsonResponse,
    expectedStatus: number,
    validate: SchemaValidator,
  ): void {
    expect(response.status).toBe(expectedStatus);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(validate(response.body), JSON.stringify(validate.errors ?? [])).toBe(true);
  }

  async function listServices(query: Record<string, unknown> = {}): Promise<JsonResponse> {
    return request(app).get('/api/v1/services').query(query);
  }

  async function getService(id: string): Promise<JsonResponse> {
    return request(app).get(`/api/v1/services/${id}`);
  }

  async function listCategories(): Promise<JsonResponse> {
    return request(app).get('/api/v1/categories');
  }

  async function listMasters(query: Record<string, unknown> = {}): Promise<JsonResponse> {
    return request(app).get('/api/v1/masters').query(query);
  }

  async function getMaster(id: string): Promise<JsonResponse> {
    return request(app).get(`/api/v1/masters/${id}`);
  }

  async function listMasterServices(
    masterId: string,
    query: Record<string, unknown> = {},
  ): Promise<JsonResponse> {
    return request(app).get(`/api/v1/masters/${masterId}/services`).query(query);
  }

  // ============================================ P1 — the public service page

  describe('P1 listServices — the active catalogue (REQ-F-001)', () => {
    it('lists an active service with its duration and category', async () => {
      const response = await listServices({ category: 'Hair' });

      expectJson(response, 200, isServicePage);
      const items = response.body.items as Array<{ id: string; baseDurationMinutes: number }>;
      const found = items.find((item) => item.id === olenaHaircut.id);
      expect(found).toMatchObject({ baseDurationMinutes: 45, category: 'Hair', active: true });
    });

    it('omits a service deactivated through R8', async () => {
      // REQ-F-018: deactivation hides a service from new selection and keeps it
      // for history. The public list is "new selection", so it must not show it.
      const retired = await createService(45);
      await request(app)
        .patch(`/api/v1/admin/services/${retired.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: false });

      const response = await listServices({ pageSize: 100 });

      expectJson(response, 200, isServicePage);
      const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids).not.toContain(retired.id);
    });

    it('filters by category', async () => {
      const response = await listServices({ category: 'Coloring', pageSize: 100 });

      expectJson(response, 200, isServicePage);
      const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids).toContain(olenaColoring.id);
      expect(ids).not.toContain(olenaHaircut.id);
    });

    it('matches q case-insensitively on the name', async () => {
      // The parameter description: "Case-insensitive substring match on the
      // service name." The name is created with a unique suffix, so the search
      // string is the lower-cased part that does not collide with other cases.
      const service = await arrangeService(app, admin.token, {
        name: `Zz-${randomUUID().slice(0, 8)}-Conditioner`,
        baseDurationMinutes: 20,
      });

      const response = await listServices({ q: 'zz-', pageSize: 100 });

      expectJson(response, 200, isServicePage);
      const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids).toContain(service.id);
    });

    it('pages: page 2 returns the second item and total counts the filter', async () => {
      const category = `Page-${randomUUID().slice(0, 8)}`;
      const first = await arrangeService(app, admin.token, {
        name: unique('Paged First'),
        baseDurationMinutes: 15,
        category,
      });
      const second = await arrangeService(app, admin.token, {
        name: unique('Paged Second'),
        baseDurationMinutes: 25,
        category,
      });

      const page1 = await listServices({ category, page: 1, pageSize: 1 });
      const page2 = await listServices({ category, page: 2, pageSize: 1 });

      expectJson(page1, 200, isServicePage);
      expectJson(page2, 200, isServicePage);
      expect(page1.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      expect(page2.body).toMatchObject({ page: 2, pageSize: 1, total: 2 });

      const firstIds = (page1.body.items as Array<{ id: string }>).map((item) => item.id);
      const secondIds = (page2.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(new Set([...firstIds, ...secondIds])).toEqual(new Set([first.id, second.id]));
      expect(firstIds).not.toEqual(secondIds);
    });

    it('answers 400 MALFORMED_REQUEST for a pageSize that is not an integer', async () => {
      expectProblem(await listServices({ pageSize: 'many' }), {
        status: 400,
        code: 'MALFORMED_REQUEST',
      });
    });

    it('answers without any token: the operation is public', async () => {
      // `security: []` on P1. A client books without an account (SRS §2).
      expectJson(await listServices({ pageSize: 1 }), 200, isServicePage);
    });
  });

  // ============================================ P2 — one service by id

  describe('P2 getService — one service (REQ-F-001)', () => {
    it('returns one service by id', async () => {
      const response = await getService(olenaHaircut.id);

      expectJson(response, 200, isService);
      expect(response.body).toMatchObject({
        id: olenaHaircut.id,
        baseDurationMinutes: 45,
        active: true,
      });
    });

    it('answers 404 NOT_FOUND for an unknown id', async () => {
      // The known id is read first on purpose. Without it this case would pass
      // at RED for the wrong reason: the terminal `notFound` middleware answers
      // 404 for every unmounted path, so "unknown id → 404" is true before P2
      // exists. The S1.2 gate found four assertions of exactly this shape.
      expectJson(await getService(olenaHaircut.id), 200, isService);
      expectProblem(await getService(randomUUID()), { status: 404, code: 'NOT_FOUND' });
    });
  });

  // ============================================ P3 — the category list

  describe('P3 listCategories — the seeds and the custom categories (REQ-F-024)', () => {
    it('lists the three seeds as seeded and a saved custom category as not', async () => {
      const custom = `Custom-${randomUUID().slice(0, 8)}`;
      await arrangeService(app, admin.token, {
        name: unique('Custom Category Service'),
        baseDurationMinutes: 30,
        category: custom,
      });

      const response = await listCategories();

      expectJson(response, 200, isCategoryList);
      const categories = response.body as Array<{ name: string; seeded: boolean }>;

      for (const seed of ['Hair', 'Coloring', 'Barbering']) {
        expect(categories.find((category) => category.name === seed)).toMatchObject({
          seeded: true,
        });
      }
      expect(categories.find((category) => category.name === custom)).toMatchObject({
        seeded: false,
      });
    });

    it('answers without any token: the operation is public', async () => {
      expectJson(await listCategories(), 200, isCategoryList);
    });
  });

  // ============================================ P4 — the master page

  describe('P4 listMasters — bookable masters only (REQ-F-002, D10)', () => {
    it('lists a master with an id and a full name and nothing else', async () => {
      const response = await listMasters({ pageSize: 100 });

      expectJson(response, 200, isMasterPage);
      const items = response.body.items as Array<Record<string, unknown>>;
      const found = items.find((item) => item.id === olena.id);

      expect(found).toEqual({ id: olena.id, fullName: 'Olena Catalogue' });
    });

    it('exposes no username, role or credential on the public surface', async () => {
      // REQ-NF-006: data is visible only to the parties entitled to it. D19:
      // `MasterPublic` carries id and full name. A leaked `username` would be a
      // second identity on a public endpoint; a leaked `role` would tell a
      // client which row is the administrator.
      const response = await listMasters({ pageSize: 100 });

      expectJson(response, 200, isMasterPage);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('password');
      for (const item of response.body.items as Array<Record<string, unknown>>) {
        expect(Object.keys(item).sort()).toEqual(['fullName', 'id']);
      }
    });

    it('omits the administrator, who is a row of the same table (D10)', async () => {
      const response = await listMasters({ pageSize: 100 });

      expectJson(response, 200, isMasterPage);
      const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids).not.toContain(admin.id);
    });

    it('filters by active=false and returns the retired master', async () => {
      // REQ-F-018: deactivated masters stay on record, and the filter reaches
      // them. The second assertion is a guard, not a proof of D10: the
      // administrator is created active (`masters.active` defaults to true), so
      // under `active=false` it is absent for its own reason. D10 rests on C14,
      // C19 and C24. The guard stays because it is cheap and catches a leak if
      // an administrator is ever created inactive.
      const retired = await arrangeMaster(app, 'Retired Catalogue');
      await request(app)
        .patch(`/api/v1/admin/masters/${retired.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: false });

      const response = await listMasters({ active: false, pageSize: 100 });

      expectJson(response, 200, isMasterPage);
      const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids).toContain(retired.id);
      expect(ids).not.toContain(admin.id);
    });

    it('answers 400 MALFORMED_REQUEST for an active value that is not a boolean', async () => {
      expectProblem(await listMasters({ active: 'yes' }), {
        status: 400,
        code: 'MALFORMED_REQUEST',
      });
    });
  });

  // ============================================ P5 — one master by id

  describe('P5 getMaster — one bookable master (REQ-F-002, D10)', () => {
    it('returns the public representation of a master', async () => {
      const response = await getMaster(olena.id);

      expectJson(response, 200, isMasterPublic);
      expect(response.body).toEqual({ id: olena.id, fullName: 'Olena Catalogue' });
    });

    it('answers 404 NOT_FOUND for an unknown id', async () => {
      // The known id first: the terminal `notFound` answers 404 for any
      // unmounted path, so this case would otherwise be green at RED.
      expectJson(await getMaster(olena.id), 200, isMasterPublic);
      expectProblem(await getMaster(randomUUID()), { status: 404, code: 'NOT_FOUND' });
    });

    it('answers 404 NOT_FOUND for an administrator id (D10)', async () => {
      // The id exists in `masters` but names no bookable master. 404 is inside
      // P5's declared set (200, 404, 500), so no contract change is needed.
      // The known master is read first for the same reason as the case above.
      expectJson(await getMaster(olena.id), 200, isMasterPublic);
      expectProblem(await getMaster(admin.id), { status: 404, code: 'NOT_FOUND' });
    });
  });

  // ============================================ P6 — a master's services

  describe("P6 listMasterServices — one master's offered services (REQ-F-001, REQ-F-014)", () => {
    it('lists an active link with its price', async () => {
      const response = await listMasterServices(olena.id, { pageSize: 100 });

      expectJson(response, 200, isMasterServicePage);
      const items = response.body.items as Array<Record<string, any>>;
      const found = items.find((item) => item.serviceId === olenaHaircut.id);

      expect(found).toMatchObject({
        masterId: olena.id,
        serviceId: olenaHaircut.id,
        active: true,
        price: { amountMinor: 55000, currency: 'UAH' },
      });
    });

    it('filters links with active=false', async () => {
      // REQ-F-014: the master's own list matches their MasterService records,
      // including the ones deactivated. This case deactivates one of Petro's
      // own links through R12 and reads it back with `active=false`, so the
      // filter is observable rather than inferred from an empty answer.
      const retired = await arrangeService(app, admin.token, {
        name: unique('Retired Link Service'),
        baseDurationMinutes: 20,
      });
      const created = await request(app)
        .post('/api/v1/admin/master-services')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          masterId: petro.id,
          serviceId: retired.id,
          price: { amountMinor: 20000, currency: 'UAH' },
        });

      await request(app)
        .patch(`/api/v1/admin/master-services/${created.body.id as string}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ active: false });

      const response = await listMasterServices(petro.id, { active: false, pageSize: 100 });

      expectJson(response, 200, isMasterServicePage);
      const items = response.body.items as Array<Record<string, any>>;
      expect(items.map((item) => item.serviceId)).toContain(retired.id);
      expect(items.every((item) => item.active === false)).toBe(true);
    });

    it('pages: page 2 with pageSize 1 returns the second link and total counts them', async () => {
      const page1 = await listMasterServices(olena.id, { page: 1, pageSize: 1 });
      const page2 = await listMasterServices(olena.id, { page: 2, pageSize: 1 });

      expectJson(page1, 200, isMasterServicePage);
      expectJson(page2, 200, isMasterServicePage);
      expect(page1.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      expect(page2.body).toMatchObject({ page: 2, pageSize: 1, total: 2 });

      const first = (page1.body.items as Array<{ id: string }>)[0]?.id;
      const second = (page2.body.items as Array<{ id: string }>)[0]?.id;
      expect(first).not.toBe(second);
    });

    it('answers 404 NOT_FOUND for an unknown master id', async () => {
      // The known master first: the terminal `notFound` answers 404 for any
      // unmounted path, so this case would otherwise be green at RED.
      expectJson(await listMasterServices(olena.id, { pageSize: 1 }), 200, isMasterServicePage);
      expectProblem(await listMasterServices(randomUUID()), {
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('answers 404 NOT_FOUND for an administrator id (D10)', async () => {
      expectJson(await listMasterServices(olena.id, { pageSize: 1 }), 200, isMasterServicePage);
      expectProblem(await listMasterServices(admin.id), { status: 404, code: 'NOT_FOUND' });
    });

    it('answers without any token: the operation is public', async () => {
      expectJson(await listMasterServices(olena.id, { pageSize: 1 }), 200, isMasterServicePage);
    });
  });
});
