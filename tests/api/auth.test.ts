/**
 * Authentication for staff: login, bearer tokens, and no self-registration.
 *
 * Source: spec/salon-management-system-srs-v1.3.tex §2 (Actors) — a master
 *         "authenticates with an individual login (username and password)
 *         created by the administrator", and the administrator likewise;
 *         REQ-F-012 (the master authenticates with login and password, the
 *         account is created by the administrator, a master cannot
 *         self-register); REQ-F-017 (only one administrator account exists and
 *         can log in). Error behaviour follows spec/api/error-model.md §3
 *         (401 `UNAUTHENTICATED`, 415 `UNSUPPORTED_MEDIA_TYPE`,
 *         400 `MALFORMED_REQUEST`) and §4 (status policy).
 * Contract: openapi.yaml#/paths/~1auth~1login/post
 *           openapi.yaml#/paths/~1auth~1me/get
 * Ticket: SMS-21 (Test)
 *
 * Two decisions and one clarification this file depends on, fixed at the
 * TEST-GATE rather than silently inside the tests
 * (`logs/gates/2026-11-08-test-SMS-21.md`):
 *
 *   D-18  Passwords are stored as scrypt hashes from `node:crypto`; the fixture
 *         in `tests/helpers/accounts.ts` writes the representation the login
 *         implementation reads. No dependency is added.
 *   D-19  The single administrator is a row of the `masters` table with
 *         `role = 'admin'`, provisioned out of band: REQ-F-017 forbids a second
 *         administrator and the contract defines no operation that creates one.
 *         Master accounts are created by the administrator (`POST
 *         /admin/masters`, S1.2), so at S1.1 both kinds are seeded directly.
 *         The table's columns are declared in plan §5 and `src/db/schema.ts`
 *         before this fixture uses them.
 *   CL-09 A login body that violates `LoginRequest` is answered with 400
 *         `MALFORMED_REQUEST`, not 422 `VALIDATION_ERROR`: `login` declares no
 *         422, while error-model.md §3 assigns `VALIDATION_ERROR` to every
 *         body-taking operation. `spec/api/clarifications.md` holds the
 *         disposition; the status is derived from the operation's declared
 *         responses, never from its operationId.
 *
 * The 415 case lives here, not in `structural.test.ts`: S1.0 registered no
 * request-body route, so nothing could inspect the media type (plan §8.2).
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { getSchemaValidator } from '../../src/contract/validators.js';
import { seedAccount } from '../helpers/accounts.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One `http.request` record as `middleware/logger.ts` writes it. */
interface RequestRecord {
  readonly traceId?: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

/** The day's JSONL access log, as `middleware/logger.ts` names it. */
function logFile(): string {
  return join(config.logDir, `app-${new Date().toISOString().slice(0, 10)}.jsonl`);
}

/** Every access-log record written so far today. */
function accessRecords(): RequestRecord[] {
  let raw: string;
  try {
    raw = readFileSync(logFile(), 'utf8');
  } catch {
    return [];
  }

  return raw
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { event?: string } & RequestRecord)
    .filter((record) => record.event === 'http.request');
}

/**
 * Waits until `predicate` matches at least `count` records, then returns them.
 * The log write is asynchronous, so a fixed sleep would be a race.
 */
async function waitForRecords(
  predicate: (record: RequestRecord) => boolean,
  count: number,
): Promise<RequestRecord[]> {
  const deadline = Date.now() + 2_000;

  for (;;) {
    const matched = accessRecords().filter(predicate);
    if (matched.length >= count) return matched;
    if (Date.now() > deadline) return matched;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** The two accounts the SRS knows (REQ-F-012, REQ-F-017), filled by the fixture. */
const ADMIN = {
  id: '',
  role: 'admin' as const,
  username: 'admin',
  password: 'admin-password-1',
  fullName: 'Salon Administrator',
};

const MASTER = {
  id: '',
  role: 'master' as const,
  username: 'olena',
  password: 'correct-horse-battery',
  fullName: 'Olena Kovalenko',
};

const signingKey = new TextEncoder().encode(config.jwtSecret);
const otherKey = new TextEncoder().encode('a-key-the-service-does-not-use');

/**
 * Minimal view of a supertest response, so the helper does not depend on the
 * typings of a transitive package.
 */
interface JsonResponse {
  readonly status: number;
  readonly headers: Record<string, string | undefined>;
  readonly body: Record<string, any>;
}

/**
 * A well-formed HS256 token the service must decide about.
 *
 * Only the negative cases use it, so the claim set deliberately carries nothing
 * the service needs to trust: rejection must happen on signature or lifetime,
 * before any lookup of the account.
 */
async function signedToken(options: {
  subject: string;
  key: Uint8Array;
  expiresInSeconds: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(options.subject)
    .setIssuedAt(now)
    .setExpirationTime(now + options.expiresInSeconds)
    .sign(options.key);
}

describe('S1.1 authentication — login and bearer tokens', () => {
  const app = createApp();
  const isProblem = getSchemaValidator('Problem');
  const isLoginResponse = getSchemaValidator('LoginResponse');
  const isPrincipal = getSchemaValidator('Principal');

  /** Asserts a Problem response carrying the expected status and code. */
  function expectProblem(response: JsonResponse, expected: { status: number; code: string }): void {
    expect(response.status).toBe(expected.status);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({
      status: expected.status,
      code: expected.code,
    });
    expect(response.body.traceId).toMatch(UUID_V4);
  }

  describe('login — request shape, no account needed', () => {
    it('answers a non-JSON body with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      // error-model.md §3/§4: the body is present but not application/json.
      // 415 is never used for a missing body — that case is asserted below.
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'text/plain')
        .send('username=admin&password=admin-password-1');

      expectProblem(response, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
      expect(response.body.instance).toBe('/api/v1/auth/login');
    });

    it('answers a login without a body with 400 MALFORMED_REQUEST', async () => {
      // error-model.md §4: a missing body is 400, never 415.
      const response = await request(app).post('/api/v1/auth/login');

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });

    it('answers a login missing the password with 400 MALFORMED_REQUEST', async () => {
      // CL-09: `login` declares no 422 response, unlike every other operation
      // with a request body, so the schema violation is reported as 400.
      const response = await request(app).post('/api/v1/auth/login').send({ username: 'admin' });

      expectProblem(response, { status: 400, code: 'MALFORMED_REQUEST' });
    });
  });

  describe('bearer token — rejected credentials, no account needed', () => {
    it('answers GET /auth/me without an Authorization header with 401 UNAUTHENTICATED', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expectProblem(response, { status: 401, code: 'UNAUTHENTICATED' });
    });

    it('answers GET /auth/me with a token that is not a JWT with 401 UNAUTHENTICATED', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-jwt');

      expectProblem(response, { status: 401, code: 'UNAUTHENTICATED' });
    });

    it('answers GET /auth/me with a token signed by another key with 401 UNAUTHENTICATED', async () => {
      // The token parses and carries a valid lifetime; only the signature is
      // wrong. Accepting it would let anyone mint an administrator token.
      const token = await signedToken({
        subject: randomUUID(),
        key: otherKey,
        expiresInSeconds: 3_600,
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expectProblem(response, { status: 401, code: 'UNAUTHENTICATED' });
    });

    it('answers GET /auth/me with an expired token with 401 UNAUTHENTICATED', async () => {
      const token = await signedToken({
        subject: randomUUID(),
        key: signingKey,
        expiresInSeconds: -60,
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expectProblem(response, { status: 401, code: 'UNAUTHENTICATED' });
    });
  });

  describe('login — valid and invalid credentials', () => {
    beforeAll(async () => {
      const admin = await seedAccount({
        role: ADMIN.role,
        username: ADMIN.username,
        password: ADMIN.password,
        fullName: ADMIN.fullName,
      });
      const master = await seedAccount({
        role: MASTER.role,
        username: MASTER.username,
        password: MASTER.password,
        fullName: MASTER.fullName,
      });

      ADMIN.id = admin.id;
      MASTER.id = master.id;
    });

    async function login(username: string, password: string): Promise<JsonResponse> {
      const response = await request(app).post('/api/v1/auth/login').send({ username, password });
      return response;
    }

    it('issues an administrator token with role admin', async () => {
      const response = await login(ADMIN.username, ADMIN.password);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(isLoginResponse(response.body), JSON.stringify(isLoginResponse.errors ?? [])).toBe(
        true,
      );

      expect(response.body).toMatchObject({
        tokenType: 'Bearer',
        role: 'admin',
        expiresIn: config.jwtExpiresIn,
      });
      expect(typeof response.body.accessToken).toBe('string');
      expect((response.body.accessToken as string).length).toBeGreaterThan(0);
    });

    it('issues a master token with role master', async () => {
      // REQ-F-012: a master authenticates with login and password.
      const response = await login(MASTER.username, MASTER.password);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ tokenType: 'Bearer', role: 'master' });
    });

    it('returns no credential material in the login response', async () => {
      const response = await login(ADMIN.username, ADMIN.password);
      const serialised = JSON.stringify(response.body);

      expect(serialised).not.toContain(ADMIN.password);
      expect(serialised).not.toContain('scrypt$');
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('answers a wrong password with 401 UNAUTHENTICATED', async () => {
      const response = await login(ADMIN.username, 'not-the-password');

      expectProblem(response, { status: 401, code: 'UNAUTHENTICATED' });
    });

    it('answers an unknown username with the same 401 UNAUTHENTICATED', async () => {
      const unknown = await login('nobody-here', 'not-the-password');
      const wrongPassword = await login(ADMIN.username, 'not-the-password');

      expectProblem(unknown, { status: 401, code: 'UNAUTHENTICATED' });

      // The two answers must not differ in any way that tells an unauthenticated
      // caller which usernames exist; traceId is the only intended difference,
      // and it is per request.
      expect({ ...unknown.body, traceId: undefined }).toEqual({
        ...wrongPassword.body,
        traceId: undefined,
      });
    });

    it('authorises GET /auth/me with the issued token', async () => {
      const credentials = await login(ADMIN.username, ADMIN.password);
      const accessToken = credentials.body.accessToken as string;

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(isPrincipal(response.body), JSON.stringify(isPrincipal.errors ?? [])).toBe(true);
      expect(response.body).toMatchObject({
        id: ADMIN.id,
        role: 'admin',
        displayName: ADMIN.fullName,
      });
    });

    it('logs the same contract path for a login that succeeds and one that fails', async () => {
      // The access log is the join key for every runs-*.md analysis, so one
      // operation must appear under one `path` regardless of which layer produced
      // the response. The contract template includes the `/api/v1` prefix, so a
      // successful login and a rejected one must both be recorded as
      // `/api/v1/auth/login` — not once with the prefix and once without.
      const isLoginRecord = (record: RequestRecord): boolean =>
        record.method === 'POST' && (record.status === 200 || record.status === 401);
      const seen = accessRecords().filter(isLoginRecord).length;

      const accepted = await login(ADMIN.username, ADMIN.password);
      const rejected = await login(ADMIN.username, 'not-the-password');
      expect(accepted.status).toBe(200);
      expect(rejected.status).toBe(401);

      const records = await waitForRecords(isLoginRecord, seen + 2);
      const fresh = records.slice(seen);

      expect(fresh).toHaveLength(2);
      expect(fresh.map((record) => record.path)).toEqual([
        '/api/v1/auth/login',
        '/api/v1/auth/login',
      ]);
    });
  });

  describe('self-registration is not an operation', () => {
    it('answers POST /auth/register with 404 NOT_FOUND', async () => {
      // REQ-F-012: "A master cannot self-register." The contract defines no such
      // path, and error-model.md §4 makes an unknown path 404, not 405.
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ username: 'intruder', password: 'intruder-password' });

      expectProblem(response, { status: 404, code: 'NOT_FOUND' });
    });

    it('answers POST /masters with 405 METHOD_NOT_ALLOWED', async () => {
      // The public collection is read-only in the contract; creating a master is
      // the administrator's operation at /admin/masters (S1.2).
      const response = await request(app)
        .post('/api/v1/masters')
        .send({ fullName: 'Intruder', username: 'intruder', password: 'intruder-password' });

      expectProblem(response, { status: 405, code: 'METHOD_NOT_ALLOWED' });
    });
  });
});
