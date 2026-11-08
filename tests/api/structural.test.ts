/**
 * Structural behaviour of the S1.0 infrastructure.
 *
 * Source: spec/api/error-model.md §2 (`Problem` and its media type), §3 (the
 *         closed 16-code catalog and the `type` URI per code), §4 (status
 *         policy: 404 = unknown path, 405 = path exists and method does not);
 *         spec/api/openapi.yaml (`Problem`; `GET /services` is the contract-
 *         defined path used by the 405 case);
 *         logs/2026-11-08-implementation-plan.md §8 and §8.2.
 * Contract: openapi.yaml#/components/schemas/Problem
 * Ticket: SMS-44 (Test)
 *
 * S1.0 is infrastructure, so no REQ or SCN id applies: the header cites the
 * contract and the plan instead. SMS-44 deliberately has no `tests/manifest.json`
 * entry (plan D-17) — it creates no implementation file, and its ordering
 * evidence is the RED run in `logs/tdd/tdd-SMS-44.md`, not git history.
 *
 * Parser precedence (plan §8.2): `express.json` is mounted globally, before the
 * router, so a body-parser rejection yields 400 before method routing is ever
 * considered. The 405 case therefore sends no request body at all; otherwise it
 * would be answered by the parser and prove nothing about method routing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { getSchemaValidator } from '../../src/contract/validators.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One `http.request` record as `middleware/logger.ts` writes it. */
interface RequestRecord {
  ts: string;
  level: string;
  event: string;
  traceId: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

function logFile(): string {
  const day = new Date().toISOString().slice(0, 10);
  return join(config.logDir, `app-${day}.jsonl`);
}

/** Every access-log record written so far today. */
function accessRecords(): RequestRecord[] {
  let raw = '';
  try {
    raw = readFileSync(logFile(), 'utf8');
  } catch {
    return []; // The file appears on the first write of the day.
  }

  return raw
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as RequestRecord)
    .filter((record) => record.event === 'http.request');
}

/**
 * Waits until at least `minimumCount` records satisfy `predicate`.
 *
 * The record is written from the response's `finish` listener, so it can trail
 * the HTTP reply by a few milliseconds; the loop waits for it instead of
 * assuming an ordering the logger never promised.
 */
async function waitForRecords(
  predicate: (record: RequestRecord) => boolean,
  minimumCount: number,
  timeoutMs = 3_000,
): Promise<RequestRecord[]> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const matching = accessRecords().filter(predicate);
    if (matching.length >= minimumCount || Date.now() > deadline) return matching;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('S1.0 infrastructure — structural behaviour', () => {
  const app = createApp();
  const isProblem = getSchemaValidator('Problem');

  it('answers an unknown path with 404 NOT_FOUND as application/problem+json', async () => {
    const path = '/api/v1/no-such-resource';
    const response = await request(app).get(path);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);

    expect(response.body).toMatchObject({
      type: 'https://api.salon.example/problems/not-found',
      title: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
      instance: path,
    });
    expect(response.body.traceId).toMatch(UUID_V4);
  });

  it('answers a contract-defined path with an undefined method with 405 METHOD_NOT_ALLOWED', async () => {
    // `GET /services` is in the contract; `POST` is not defined for the path, so
    // error-model.md §4 requires 405 rather than 404. The path is recognised
    // from the contract, because S1.0 has mounted no operation router yet.
    const response = await request(app).post('/api/v1/services');

    expect(response.status).toBe(405);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);

    expect(response.body).toMatchObject({
      type: 'https://api.salon.example/problems/method-not-allowed',
      title: 'Method not allowed',
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      instance: '/api/v1/services',
    });
    expect(response.body.traceId).toMatch(UUID_V4);
  });

  it('recognises a parameterised contract path when the method is undefined', async () => {
    // The contract defines `GET` and `PATCH` for `/admin/masters/{masterId}` and
    // no `POST`. `{masterId}` must match exactly one path segment; without
    // template matching this request would be reported as an unknown path.
    const masterId = '6f2a1c4e-8b3d-4a5f-9c7e-1d2b3a4c5d6e';
    const response = await request(app).post(`/api/v1/admin/masters/${masterId}`);

    expect(response.status).toBe(405);
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);
    expect(response.body).toMatchObject({
      code: 'METHOD_NOT_ALLOWED',
      instance: `/api/v1/admin/masters/${masterId}`,
    });
  });

  it('does not treat a path beyond a parameterised template as defined', async () => {
    // The counterexample that keeps the matcher honest: `{masterId}` is one
    // segment, so a longer path is not a contract path and must stay 404
    // (error-model.md §4: 405 is never used for an unknown path).
    const response = await request(app).post(
      '/api/v1/admin/masters/6f2a1c4e-8b3d-4a5f-9c7e-1d2b3a4c5d6e/appointments',
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('answers a syntactically invalid JSON body with 400 MALFORMED_REQUEST', async () => {
    // error-model.md §4: 400 is for a request that cannot be parsed. The route
    // is irrelevant — `express.json` rejects the body before routing (plan §8.2)
    // — but a contract path keeps the case realistic.
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toBe('application/problem+json');
    expect(isProblem(response.body), JSON.stringify(isProblem.errors ?? [])).toBe(true);

    expect(response.body).toMatchObject({
      type: 'https://api.salon.example/problems/malformed-request',
      title: 'Malformed request',
      status: 400,
      code: 'MALFORMED_REQUEST',
      instance: '/api/v1/auth/login',
    });
    expect(response.body.traceId).toMatch(UUID_V4);
  });

  it('writes the response trace id into the request log record', async () => {
    const response = await request(app).get('/api/v1/no-such-resource');
    const traceId = response.body.traceId as string;

    const records = await waitForRecords(
      (record) => record.traceId === traceId,
      1,
    );

    // `traceId` is a fresh UUID per request, so an exact match is unambiguous
    // even though the log is append-only and shared with every other run.
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 'warn',
      traceId,
      method: 'GET',
      status: 404,
    });
    expect(records[0]?.durationMs).toBeTypeOf('number');
  });

  it('logs the matched route template for a request that reached a route', async () => {
    const isHealthCall = (record: RequestRecord): boolean =>
      record.method === 'GET' && record.path === '/health' && record.status === 200;
    const seen = accessRecords().filter(isHealthCall).length;

    const response = await request(app).get('/health');
    expect(response.status).toBe(200);

    const records = await waitForRecords(isHealthCall, seen + 1);
    expect(records.length).toBeGreaterThanOrEqual(seen + 1);
    expect(records.at(-1)?.path).toBe('/health');
  });

  it('logs the request path when no route matched', async () => {
    const path = '/api/v1/no-such-resource';
    const response = await request(app).get(path);
    const traceId = response.body.traceId as string;

    const records = await waitForRecords((record) => record.traceId === traceId, 1);

    expect(records).toHaveLength(1);
    expect(records[0]?.path).toBe(path);
  });
});
