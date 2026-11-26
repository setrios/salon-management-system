/**
 * S1.2 reference data: masters, services and categories, master-service prices,
 * materials and units — every administrator operation R1–R17, plus SCN-08.
 *
 * Source: REQ-F-018 (the administrator manages masters, services with category,
 *         MasterService price links and materials with a unit; create, edit and
 *         deactivate, never delete, so history keeps the resource);
 *         REQ-F-024 (free-form categories; the three seeds Hair, Coloring and
 *         Barbering exist on a fresh installation); REQ-F-025 (standard units
 *         ml, l, g, kg, pcs plus custom units); SCN-08;
 *         spec/api/resource-model.md §5.4 (R1–R17);
 *         spec/api/error-model.md §3 (the closed code catalog, including which
 *         operations may answer 400/401/403/404/409/415/422) and §4 (status
 *         policy: 404 is never used for a deactivated resource, 405 is "path
 *         exists, method does not", deactivation is PATCH `active:false`).
 * Contract: openapi.yaml#/paths/~1admin~1masters …
 *           …/~1admin~1masters~1{masterId} …/~1admin~1services …
 *           …/~1admin~1services~1{serviceId} …/~1admin~1categories …
 *           …/~1admin~1master-services … …/~1admin~1master-services~1{masterServiceId}
 *           …/~1admin~1materials …/~1admin~1materials~1{materialId} …/~1admin~1units
 *           Response bodies are validated with the compiled contract schemas,
 *           never by restating a shape by hand.
 * Ticket: SMS-14 (Test)
 *
 * Scope decision (human, 2026-11-08): SMS-14 covers the whole reference-data
 * surface SMS-23 implements — every operation R1–R17, SCN-08 as a scenario, and
 * the three seed categories as present and immutable — not only SCN-08. The one
 * contract-declared outcome with no reachable trigger is listed in the TEST-GATE
 * rather than invented here: 409 on R4, R6, R8 and R12 has no defined conflict
 * (MasterPatch has no username, the patch bodies of R8/R12 cannot create a
 * duplicate). R6 does not get a service-name uniqueness rule: the error model
 * names only three unique constraints (master username, master-service link,
 * material name), so a 409 there has nothing to assert against.
 *
 * The three seed categories (REQ-F-024) are the one piece of storage this file
 * arranges directly: no contract operation creates a category — a category is
 * created implicitly by saving a service with a new one — so the Given of SCN-08
 * has to be seeded. `tests/helpers/reference-data.ts` writes only the two
 * columns `Category` exposes; the TEST-GATE declares them, as plan §5.1 did for
 * the `masters` fixture in S1.1. Whether a *fresh installation* seeds them at
 * start-up is not observable through the suite, because the harness truncates
 * every table before each file; that is an explicit item in the TEST-GATE and a
 * check for the S1.2 control run. The category list is read through R9
 * (`GET /admin/categories`): the public listing P3 belongs to S2.1, which is the
 * client booking flow, so it is outside this file's surface (TEST-GATE §4 G3).
 */

import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import { seedAccount } from '../helpers/accounts.js';
import { ensureSeedCategories, SEED_CATEGORIES } from '../helpers/reference-data.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal view of a supertest response; see `tests/api/auth.test.ts`. */
interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

type SchemaValidator = ReturnType<typeof getSchemaValidator>;
type Method = 'get' | 'post' | 'patch';

/** A unique suffix, so tests that share one database do not collide. */
function unique(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

interface OperationCase {
  readonly op: string;
  readonly method: Method;
  readonly path: string;
  readonly body?: unknown;
}

/**
 * R1–R17 with a request that is valid as a request: path parameters are UUIDs
 * and bodies satisfy their schemas, so a 401 or 403 can only come from the
 * guard, never from validation running first.
 */
const OPERATIONS: readonly OperationCase[] = [
  { op: 'R1', method: 'get', path: '/api/v1/admin/masters' },
  {
    op: 'R2',
    method: 'post',
    path: '/api/v1/admin/masters',
    body: { fullName: 'Matrix Master', username: unique('matrix'), password: 'matrix-password' },
  },
  { op: 'R3', method: 'get', path: `/api/v1/admin/masters/${randomUUID()}` },
  {
    op: 'R4',
    method: 'patch',
    path: `/api/v1/admin/masters/${randomUUID()}`,
    body: { active: false },
  },
  { op: 'R5', method: 'get', path: '/api/v1/admin/services' },
  {
    op: 'R6',
    method: 'post',
    path: '/api/v1/admin/services',
    body: { name: 'Matrix Service', category: 'Hair', baseDurationMinutes: 30 },
  },
  { op: 'R7', method: 'get', path: `/api/v1/admin/services/${randomUUID()}` },
  {
    op: 'R8',
    method: 'patch',
    path: `/api/v1/admin/services/${randomUUID()}`,
    body: { name: 'Renamed service' },
  },
  { op: 'R9', method: 'get', path: '/api/v1/admin/categories' },
  { op: 'R10', method: 'get', path: '/api/v1/admin/master-services' },
  {
    op: 'R11',
    method: 'post',
    path: '/api/v1/admin/master-services',
    body: {
      masterId: randomUUID(),
      serviceId: randomUUID(),
      price: { amountMinor: 55000, currency: 'UAH' },
    },
  },
  {
    op: 'R12',
    method: 'patch',
    path: `/api/v1/admin/master-services/${randomUUID()}`,
    body: { price: { amountMinor: 60000, currency: 'UAH' } },
  },
  { op: 'R13', method: 'get', path: '/api/v1/admin/materials' },
  {
    op: 'R14',
    method: 'post',
    path: '/api/v1/admin/materials',
    body: { name: 'Matrix Material', unit: 'ml' },
  },
  { op: 'R15', method: 'get', path: `/api/v1/admin/materials/${randomUUID()}` },
  {
    op: 'R16',
    method: 'patch',
    path: `/api/v1/admin/materials/${randomUUID()}`,
    body: { name: 'Renamed material' },
  },
  { op: 'R17', method: 'get', path: '/api/v1/admin/units' },
];

/**
 * The matrix as tuples, so a test title reads `R1 get /api/v1/admin/masters`
 * rather than the quoted property dump Vitest prints for `$name` on objects.
 */
const OPERATION_CASES = OPERATIONS.map(
  (operation) => [operation.op, operation.method, operation.path, operation] as const,
);

const ADMIN = {
  username: 'admin-reference',
  password: 'admin-reference-password',
  fullName: 'Reference Administrator',
};

const MASTER = {
  username: 'master-reference',
  password: 'master-reference-password',
  fullName: 'Reference Master',
};

describe('S1.2 reference data — administrator catalogue (R1–R17)', () => {
  const app = createApp();

  const isProblem = getSchemaValidator('Problem');
  const isMaster = getSchemaValidator('Master');
  const isMasterPage = getSchemaValidator('MasterAdminPage');
  const isService = getSchemaValidator('Service');
  const isServicePage = getSchemaValidator('ServicePage');
  const isMasterService = getSchemaValidator('MasterService');
  const isMasterServicePage = getSchemaValidator('MasterServicePage');
  const isMaterial = getSchemaValidator('Material');
  const isMaterialPage = getSchemaValidator('MaterialPage');
  const isCategoryList = getSchemaValidator('CategoryList');
  const isUnitList = getSchemaValidator('UnitList');

  let adminToken = '';
  let masterToken = '';

  beforeAll(async () => {
    // The Given of SCN-08, arranged once per file and before any test can save
    // a service. Without this, a test that creates a service with category
    // "Hair" (the create helper's default) would bring the category into
    // existence with `seeded:false` through D-27's write path, and the later
    // `ensureSeedCategories()` — `on conflict do nothing` — could not restore
    // the marker. That made the file order-dependent under `--sequence.shuffle`;
    // seeding first is what a fresh installation looks like anyway.
    await ensureSeedCategories();

    const admin = await seedAccount({
      role: 'admin',
      username: ADMIN.username,
      password: ADMIN.password,
      fullName: ADMIN.fullName,
    });
    const master = await seedAccount({
      role: 'master',
      username: MASTER.username,
      password: MASTER.password,
      fullName: MASTER.fullName,
    });

    expect(admin.id).toMatch(UUID_V4);
    expect(master.id).toMatch(UUID_V4);

    adminToken = await login(ADMIN.username, ADMIN.password);
    masterToken = await login(MASTER.username, MASTER.password);
  });

  async function login(username: string, password: string): Promise<string> {
    const response = await request(app).post('/api/v1/auth/login').send({ username, password });

    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  /** Sends one operation case with an optional bearer token. */
  async function sendOperation(operation: OperationCase, token?: string): Promise<JsonResponse> {
    const agent = request(app);
    const pending =
      operation.method === 'get'
        ? agent.get(operation.path)
        : operation.method === 'post'
          ? agent.post(operation.path)
          : agent.patch(operation.path);

    if (token !== undefined) pending.set('Authorization', `Bearer ${token}`);
    if (operation.method !== 'get') pending.send(operation.body as object);

    return pending;
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

  function expectLocation(response: JsonResponse): string {
    const location = response.headers.location;
    expect(location, 'Location header').toBeDefined();
    expect(location).toContain(String(response.body.id));
    return location as string;
  }

  // ---------------------------------------------------------------- R2 helpers

  async function createMaster(overrides: Record<string, unknown> = {}): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/admin/masters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Created Master',
        username: unique('created-master'),
        password: 'created-master-password',
        ...overrides,
      });
  }

  async function createService(overrides: Record<string, unknown> = {}): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/admin/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: unique('Service'),
        category: 'Hair',
        baseDurationMinutes: 45,
        ...overrides,
      });
  }

  async function createMaterial(overrides: Record<string, unknown> = {}): Promise<JsonResponse> {
    return request(app)
      .post('/api/v1/admin/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: unique('Material'), unit: 'ml', initialStockQuantity: 180, ...overrides });
  }

  // ------------------------------------------------- 401 / 403 for every R

  describe('authentication and role on every administrator operation', () => {
    it.each(OPERATION_CASES)(
      '%s %s %s answers 401 without a token',
      async (_op, _method, _path, operation) => {
        const response = await sendOperation(operation);
        expectProblem(response, { status: 401, code: 'UNAUTHENTICATED' });
      },
    );

    it.each(OPERATION_CASES)(
      '%s %s %s answers 403 FORBIDDEN for a master token',
      async (_op, _method, _path, operation) => {
        const response = await sendOperation(operation, masterToken);
        expectProblem(response, { status: 403, code: 'FORBIDDEN' });
      },
    );
  });

  // -------------------------------------------------------- masters R1–R4

  describe('masters (R1–R4)', () => {
    it('R2 creates a master and returns the 201 Master shape with a Location', async () => {
      const username = unique('new-master');
      const response = await createMaster({ username, fullName: 'New Master' });

      expectJson(response, 201, isMaster);
      expect(response.body).toMatchObject({
        username,
        fullName: 'New Master',
        active: true,
      });
      expect(response.body.id).toMatch(UUID_V4);
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expectLocation(response);
    });

    it('R2 answers a duplicate username with 409 DUPLICATE_RESOURCE', async () => {
      const username = unique('duplicate-master');
      const first = await createMaster({ username });
      expect(first.status).toBe(201);

      const second = await createMaster({ username });
      expectProblem(second, { status: 409, code: 'DUPLICATE_RESOURCE' });
    });

    it('R2 answers a body missing password with 422 and a field-level error', async () => {
      const response = await request(app)
        .post('/api/v1/admin/masters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'No Password', username: unique('no-password') });

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password', code: 'REQUIRED' })]),
      );
    });

    it('R2 answers an unknown body property with 422 UNKNOWN_FIELD', async () => {
      const response = await createMaster({ surprise: true });

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'surprise', code: 'UNKNOWN_FIELD' }),
        ]),
      );
    });

    it('R2 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const response = await request(app)
        .post('/api/v1/admin/masters')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('fullName=No+Json');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('R1 lists masters as a MasterAdminPage containing the created account', async () => {
      const created = await createMaster();
      const response = await request(app)
        .get('/api/v1/admin/masters')
        .set('Authorization', `Bearer ${adminToken}`);

      expectJson(response, 200, isMasterPage);
      expect(response.body).toMatchObject({ page: 1, pageSize: 20 });
      expect(response.body.total).toBeGreaterThanOrEqual(1);
      expect(response.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id })]),
      );
    });

    it('R1 filters by active after R4 deactivates an account', async () => {
      const created = await createMaster();
      const deactivated = await request(app)
        .patch(`/api/v1/admin/masters/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expect(deactivated.status).toBe(200);

      const inactive = await request(app)
        .get('/api/v1/admin/masters?active=false')
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(inactive, 200, isMasterPage);
      expect(inactive.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id, active: false })]),
      );

      const active = await request(app)
        .get('/api/v1/admin/masters?active=true')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(active.body.items).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id })]),
      );
    });

    it('R1 answers an ill-typed page parameter with 400 MALFORMED_REQUEST', async () => {
      const response = await request(app)
        .get('/api/v1/admin/masters?page=abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('R3 returns one master by id', async () => {
      const created = await createMaster();
      const response = await request(app)
        .get(`/api/v1/admin/masters/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expectJson(response, 200, isMaster);
      expect(response.body).toMatchObject({ id: created.body.id, username: created.body.username });
    });

    it('R3 answers an unknown id with 404 NOT_FOUND', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/masters/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expectProblem(response, { status: 404, code: 'NOT_FOUND' });

      // `getMasterAdmin` declares 200, 401, 403, 404 and 500 — no 400. An id
      // that is not a uuid names no resource, so it may not answer 400: the
      // status follows the declared set, as CL-09 does for its 422/400 pair.
      // The second call is also the one that would reach Postgres as `abc` and
      // fail with SQLSTATE 22P02 if the format were not checked.
      const malformed = await request(app)
        .get('/api/v1/admin/masters/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);

      expectProblem(malformed, { status: 404, code: 'NOT_FOUND' });
    });

    it('R4 changes fullName and deactivates through active:false, never deletes', async () => {
      const created = await createMaster();

      const renamed = await request(app)
        .patch(`/api/v1/admin/masters/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Renamed Master' });
      expectJson(renamed, 200, isMaster);
      expect(renamed.body).toMatchObject({ id: created.body.id, fullName: 'Renamed Master' });

      const deactivated = await request(app)
        .patch(`/api/v1/admin/masters/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expectJson(deactivated, 200, isMaster);
      expect(deactivated.body.active).toBe(false);

      // REQ-NF-005: deactivation is not deletion; the resource is still returned.
      const stillThere = await request(app)
        .get(`/api/v1/admin/masters/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(stillThere.status).toBe(200);
      expect(stillThere.body.active).toBe(false);
    });

    it('R4 answers an empty patch with 422 VALIDATION_ERROR', async () => {
      const created = await createMaster();
      const response = await request(app)
        .patch(`/api/v1/admin/masters/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
    });

    it('R4 answers an unknown id with 404 NOT_FOUND', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/masters/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });

      expectProblem(response, { status: 404, code: 'NOT_FOUND' });
    });

    it('R4 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const created = await createMaster();
      const response = await request(app)
        .patch(`/api/v1/admin/masters/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('active=false');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });
  });

  // --------------------------------------------- services and categories R5–R9

  describe('services and categories (R5–R9), including SCN-08', () => {
    it('SCN-08 saves a service with a category outside the seeds', async () => {
      await ensureSeedCategories();

      const response = await request(app)
        .post('/api/v1/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Eyebrow shaping', category: 'Cosmetology', baseDurationMinutes: 30 });

      // Then the service is saved with category "Cosmetology".
      expectJson(response, 201, isService);
      expect(response.body).toMatchObject({
        name: 'Eyebrow shaping',
        category: 'Cosmetology',
        baseDurationMinutes: 30,
        active: true,
      });
      expectLocation(response);
    });

    it('SCN-08: Hair, Coloring and Barbering are present as the Given', async () => {
      await ensureSeedCategories();

      const response = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);

      expectJson(response, 200, isCategoryList);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Hair', seeded: true }),
          expect.objectContaining({ name: 'Coloring', seeded: true }),
          expect.objectContaining({ name: 'Barbering', seeded: true }),
        ]),
      );
    });

    it('SCN-08: a custom category becomes selectable for future services', async () => {
      await ensureSeedCategories();
      const category = unique('CustomCategory');

      const first = await createService({ category });
      expect(first.status).toBe(201);

      const categories = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(categories, 200, isCategoryList);
      expect(categories.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: category, seeded: false })]),
      );

      const second = await createService({ category });
      expectJson(second, 201, isService);
      expect(second.body.category).toBe(category);
    });

    it('SCN-08: the three seeds stay seeded and unchanged after custom categories', async () => {
      await ensureSeedCategories();
      await createService({ category: unique('ImmutableCheck') });

      const response = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(response, 200, isCategoryList);

      const seededOnly = (response.body as Array<{ name: string; seeded: boolean }>)
        .filter((category) => category.seeded)
        .map((category) => category.name)
        .sort();

      expect(seededOnly).toEqual([...SEED_CATEGORIES].sort());
    });

    it('categories are immutable through the API: no create or delete operation', async () => {
      const created = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Should Not Exist' });
      expectProblem(created, { status: 405, code: 'METHOD_NOT_ALLOWED' });

      const deleted = await request(app)
        .delete('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);
      expectProblem(deleted, { status: 405, code: 'METHOD_NOT_ALLOWED' });
    });

    it('R9 lists the same categories for the administrator', async () => {
      await ensureSeedCategories();

      const response = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);

      expectJson(response, 200, isCategoryList);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Hair', seeded: true }),
          expect.objectContaining({ name: 'Coloring', seeded: true }),
          expect.objectContaining({ name: 'Barbering', seeded: true }),
        ]),
      );
    });

    it('R6 answers a zero base duration with 422 VALIDATION_ERROR', async () => {
      const response = await createService({ baseDurationMinutes: 0 });
      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
    });

    it('R6 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const response = await request(app)
        .post('/api/v1/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('name=No+Json');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('R5 lists services as a ServicePage and filters by category', async () => {
      const category = unique('FilterCategory');
      const created = await createService({ category });

      const response = await request(app)
        .get(`/api/v1/admin/services?category=${encodeURIComponent(category)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expectJson(response, 200, isServicePage);
      expect(response.body).toMatchObject({ page: 1, pageSize: 20 });
      expect(response.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id, category })]),
      );
    });

    it('R5 filters by active after R8 deactivates a service', async () => {
      const created = await createService();
      const deactivated = await request(app)
        .patch(`/api/v1/admin/services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expect(deactivated.status).toBe(200);

      const response = await request(app)
        .get('/api/v1/admin/services?active=false')
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(response, 200, isServicePage);
      expect(response.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id, active: false })]),
      );
    });

    it('R5 answers an ill-typed page parameter with 400 MALFORMED_REQUEST', async () => {
      const response = await request(app)
        .get('/api/v1/admin/services?page=abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('R7 returns one service and answers an unknown id with 404', async () => {
      const created = await createService();

      const found = await request(app)
        .get(`/api/v1/admin/services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(found, 200, isService);
      expect(found.body.id).toBe(created.body.id);

      const missing = await request(app)
        .get(`/api/v1/admin/services/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectProblem(missing, { status: 404, code: 'NOT_FOUND' });

      // `getServiceAdmin` declares no 400, so an id that is not a uuid is a
      // resource that does not exist — the same rule as R3's negative.
      const malformed = await request(app)
        .get('/api/v1/admin/services/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expectProblem(malformed, { status: 404, code: 'NOT_FOUND' });
    });

    it('R8 deactivates a service through active:false (REQ-F-018, POS-19)', async () => {
      const created = await createService();
      const response = await request(app)
        .patch(`/api/v1/admin/services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });

      expectJson(response, 200, isService);
      expect(response.body.active).toBe(false);

      const stillThere = await request(app)
        .get(`/api/v1/admin/services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(stillThere.status).toBe(200);
      expect(stillThere.body.active).toBe(false);
    });

    it('R8 answers an empty patch with 422 and an unknown id with 404', async () => {
      const created = await createService();

      const empty = await request(app)
        .patch(`/api/v1/admin/services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expectProblem(empty, { status: 422, code: 'VALIDATION_ERROR' });

      const missing = await request(app)
        .patch(`/api/v1/admin/services/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Nobody' });
      expectProblem(missing, { status: 404, code: 'NOT_FOUND' });
    });

    it('R8 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const created = await createService();
      const response = await request(app)
        .patch(`/api/v1/admin/services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('active=false');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('DELETE on a service path answers 405 METHOD_NOT_ALLOWED (no deletion)', async () => {
      const created = await createService();
      const response = await request(app)
        .delete(`/api/v1/admin/services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expectProblem(response, { status: 405, code: 'METHOD_NOT_ALLOWED' });
    });
  });

  // ------------------------------------------- master-service links R10–R12

  describe('master-service links (R10–R12)', () => {
    /** Creates a master and a service through the API and returns their ids. */
    async function createLinkFixtures(): Promise<{ masterId: string; serviceId: string }> {
      const master = await createMaster();
      const service = await createService();
      expect(master.status).toBe(201);
      expect(service.status).toBe(201);
      return { masterId: master.body.id as string, serviceId: service.body.id as string };
    }

    async function createLink(
      fixtures: { masterId: string; serviceId: string },
      price = { amountMinor: 55000, currency: 'UAH' },
    ): Promise<JsonResponse> {
      return request(app)
        .post('/api/v1/admin/master-services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...fixtures, price });
    }

    it('R11 links a service to a master with a price', async () => {
      const fixtures = await createLinkFixtures();
      const response = await createLink(fixtures);

      expectJson(response, 201, isMasterService);
      expect(response.body).toMatchObject({
        ...fixtures,
        price: { amountMinor: 55000, currency: 'UAH' },
        active: true,
      });
      expectLocation(response);
    });

    it('R11 answers a duplicate link with 409 DUPLICATE_RESOURCE', async () => {
      const fixtures = await createLinkFixtures();
      const first = await createLink(fixtures);
      expect(first.status).toBe(201);

      const second = await createLink(fixtures);
      expectProblem(second, { status: 409, code: 'DUPLICATE_RESOURCE' });
    });

    it('R11 answers a negative price with 422 VALIDATION_ERROR', async () => {
      const fixtures = await createLinkFixtures();
      const response = await createLink(fixtures, { amountMinor: -1, currency: 'UAH' });

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
    });

    it('R11 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const fixtures = await createLinkFixtures();
      const response = await request(app)
        .post('/api/v1/admin/master-services')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('masterId=no');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('R10 lists links and filters by masterId and serviceId', async () => {
      const fixtures = await createLinkFixtures();
      const created = await createLink(fixtures);

      const byMaster = await request(app)
        .get(`/api/v1/admin/master-services?masterId=${fixtures.masterId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(byMaster, 200, isMasterServicePage);
      expect(byMaster.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id })]),
      );

      const byService = await request(app)
        .get(`/api/v1/admin/master-services?serviceId=${fixtures.serviceId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(byService, 200, isMasterServicePage);
      expect(byService.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id })]),
      );
    });

    it('R10 filters by active after R12 deactivates a link', async () => {
      const fixtures = await createLinkFixtures();
      const created = await createLink(fixtures);

      const deactivated = await request(app)
        .patch(`/api/v1/admin/master-services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expect(deactivated.status).toBe(200);

      const response = await request(app)
        .get('/api/v1/admin/master-services?active=false')
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(response, 200, isMasterServicePage);
      expect(response.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id, active: false })]),
      );
    });

    it('R10 answers an ill-typed page parameter with 400 MALFORMED_REQUEST', async () => {
      const response = await request(app)
        .get('/api/v1/admin/master-services?page=abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('R12 updates the price and deactivates the link', async () => {
      const fixtures = await createLinkFixtures();
      const created = await createLink(fixtures);

      const repriced = await request(app)
        .patch(`/api/v1/admin/master-services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: { amountMinor: 60000, currency: 'UAH' } });
      expectJson(repriced, 200, isMasterService);
      expect(repriced.body.price).toEqual({ amountMinor: 60000, currency: 'UAH' });

      const deactivated = await request(app)
        .patch(`/api/v1/admin/master-services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expectJson(deactivated, 200, isMasterService);
      expect(deactivated.body.active).toBe(false);
    });

    it('R12 answers an empty patch with 422 and an unknown id with 404', async () => {
      const fixtures = await createLinkFixtures();
      const created = await createLink(fixtures);

      const empty = await request(app)
        .patch(`/api/v1/admin/master-services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expectProblem(empty, { status: 422, code: 'VALIDATION_ERROR' });

      const missing = await request(app)
        .patch(`/api/v1/admin/master-services/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expectProblem(missing, { status: 404, code: 'NOT_FOUND' });
    });

    it('R12 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const fixtures = await createLinkFixtures();
      const created = await createLink(fixtures);
      const response = await request(app)
        .patch(`/api/v1/admin/master-services/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('active=false');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });
  });

  // ---------------------------------------- materials and units R13–R17

  describe('materials and units (R13–R17)', () => {
    it('R14 creates a material with the initial stock as stockQuantity', async () => {
      const name = unique('Shampoo');
      const response = await createMaterial({ name, unit: 'ml', initialStockQuantity: 180 });

      expectJson(response, 201, isMaterial);
      expect(response.body).toMatchObject({
        name,
        unit: 'ml',
        stockQuantity: 180,
        active: true,
      });
      expectLocation(response);
    });

    it('R14 saves a material with a custom unit (REQ-F-025, POS-22)', async () => {
      const response = await createMaterial({ unit: 'sachet', initialStockQuantity: 10 });

      expectJson(response, 201, isMaterial);
      expect(response.body.unit).toBe('sachet');
    });

    it('R14 answers a duplicate material name with 409 DUPLICATE_RESOURCE', async () => {
      const name = unique('DuplicateMaterial');
      const first = await createMaterial({ name });
      expect(first.status).toBe(201);

      const second = await createMaterial({ name });
      expectProblem(second, { status: 409, code: 'DUPLICATE_RESOURCE' });
    });

    it('R14 answers a negative initial stock with 422 VALIDATION_ERROR', async () => {
      const response = await createMaterial({ initialStockQuantity: -1 });
      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
    });

    it('R14 answers a body missing unit with 422 VALIDATION_ERROR', async () => {
      const response = await request(app)
        .post('/api/v1/admin/materials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: unique('NoUnit') });

      expectProblem(response, { status: 422, code: 'VALIDATION_ERROR' });
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unit', code: 'REQUIRED' })]),
      );
    });

    it('R14 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const response = await request(app)
        .post('/api/v1/admin/materials')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('name=No+Json');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('R13 lists materials and filters by q and active', async () => {
      const name = unique('Conditioner');
      const created = await createMaterial({ name });

      const byQuery = await request(app)
        .get(`/api/v1/admin/materials?q=${encodeURIComponent(name)}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(byQuery, 200, isMaterialPage);
      expect(byQuery.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id, name })]),
      );

      const deactivated = await request(app)
        .patch(`/api/v1/admin/materials/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expect(deactivated.status).toBe(200);

      const inactive = await request(app)
        .get('/api/v1/admin/materials?active=false')
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(inactive, 200, isMaterialPage);
      expect(inactive.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.body.id, active: false })]),
      );
    });

    it('R13 answers an ill-typed page parameter with 400 MALFORMED_REQUEST', async () => {
      const response = await request(app)
        .get('/api/v1/admin/materials?page=abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('R15 returns one material and answers an unknown id with 404', async () => {
      const created = await createMaterial();

      const found = await request(app)
        .get(`/api/v1/admin/materials/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectJson(found, 200, isMaterial);
      expect(found.body.id).toBe(created.body.id);

      const missing = await request(app)
        .get(`/api/v1/admin/materials/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expectProblem(missing, { status: 404, code: 'NOT_FOUND' });

      // `getMaterialAdmin` declares no 400, so an id that is not a uuid is a
      // resource that does not exist — the same rule as R3's and R7's negatives.
      const malformed = await request(app)
        .get('/api/v1/admin/materials/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expectProblem(malformed, { status: 404, code: 'NOT_FOUND' });
    });

    it('R16 renames, changes the unit and deactivates a material', async () => {
      const created = await createMaterial();

      const renamed = await request(app)
        .patch(`/api/v1/admin/materials/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Premium Shampoo' });
      expectJson(renamed, 200, isMaterial);
      expect(renamed.body.name).toBe('Premium Shampoo');

      const reunit = await request(app)
        .patch(`/api/v1/admin/materials/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ unit: 'l' });
      expectJson(reunit, 200, isMaterial);
      expect(reunit.body.unit).toBe('l');

      const deactivated = await request(app)
        .patch(`/api/v1/admin/materials/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expectJson(deactivated, 200, isMaterial);
      expect(deactivated.body.active).toBe(false);
    });

    it('R16 answers a rename to an existing name with 409 DUPLICATE_RESOURCE', async () => {
      const existingName = unique('ExistingMaterial');
      const existing = await createMaterial({ name: existingName });
      expect(existing.status).toBe(201);
      const other = await createMaterial();

      const response = await request(app)
        .patch(`/api/v1/admin/materials/${other.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: existingName });

      expectProblem(response, { status: 409, code: 'DUPLICATE_RESOURCE' });
    });

    it('R16 answers an empty patch with 422 and an unknown id with 404', async () => {
      const created = await createMaterial();

      const empty = await request(app)
        .patch(`/api/v1/admin/materials/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expectProblem(empty, { status: 422, code: 'VALIDATION_ERROR' });

      const missing = await request(app)
        .patch(`/api/v1/admin/materials/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expectProblem(missing, { status: 404, code: 'NOT_FOUND' });
    });

    it('R16 answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const created = await createMaterial();
      const response = await request(app)
        .patch(`/api/v1/admin/materials/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('active=false');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('R17 lists the five standard units and the custom units in use', async () => {
      await createMaterial({ unit: 'sachet', initialStockQuantity: 5 });

      const response = await request(app)
        .get('/api/v1/admin/units')
        .set('Authorization', `Bearer ${adminToken}`);

      expectJson(response, 200, isUnitList);
      expect([...(response.body.standard as string[])].sort()).toEqual([
        'g',
        'kg',
        'l',
        'ml',
        'pcs',
      ]);
      expect(response.body.custom).toEqual(expect.arrayContaining(['sachet']));
      for (const standard of response.body.standard as string[]) {
        expect(response.body.custom).not.toContain(standard);
      }
    });
  });
});
