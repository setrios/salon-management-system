# Control run 02 — S1.1 authentication (SMS-22)

| Field | Value |
|---|---|
| Run | 02 |
| Date | 2026-11-08 |
| Stage | S1.1 |
| Ticket | SMS-22 (implementation for SMS-21) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-08-test-SMS-21.md` (`SIGNED — GO`, `70c08fa`) |
| Code | `src/db/schema.ts`, `src/db/migrations/0000_organic_vapor.sql`, `src/modules/auth/{password,tokens,service,routes}.ts`, `src/middleware/{auth,validate}.ts`, `src/contract/{convert.mjs,validators.ts}`, `src/routes.ts` |
| Log file | `logs/runtime/app-2026-11-08.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc --noEmit                                   exit 0
$ npm run convert:contract                           schemas 58, operations 50
$ npx drizzle-kit generate                           masters, 8 columns
$ npx vitest run tests/api/auth.test.ts             15 passed (15), exit 0
$ npm test                                          24 passed (24), exit 0
$ npm run build                                     exit 0
$ npm run check:test-first                          1/1 entries pass, exit 0
$ node scripts/verify-contract.mjs                   contract: 3.0.3 — 50 operations, exit 0
```

The migration is applied to the **test** database (`TEST_DATABASE_URL`) by
`tests/setup.ts` on every run, through `migrate()` from
`drizzle-orm/node-postgres/migrator`; nothing is applied by hand any more. For
the development database the human runs, from the repository root:

```
$ DATABASE_URL=postgres://…/salon npx drizzle-kit migrate
```

Plan §4 gives database migrations to the agent after the first successful run
and `docker compose up -d postgres` to the human; the development database was
not started during this run, so nothing was applied to it.

**Proof that GREEN does not depend on this machine's database state.** The test
schema was dropped, then the suite was run:

```
$ # drop schema public cascade; create schema public; drop schema drizzle cascade
  tables after reset: 0

$ npm test
 Test Files  2 passed (2)
      Tests  25 passed (25)

  tables after run:
  drizzle.__drizzle_migrations
  public.masters

$ npm test                    # second run: migrator applies nothing
 Test Files  2 passed (2)
      Tests  25 passed (25)
```

## 2. Requests and responses — built artifact

The control run used `dist/` (`node` importing `dist/src/app.js`), not the
TypeScript sources. The reason is the S1.0 finding: the in-process suite cannot
see packaging defects (runs-01 §4).

```
GET  /api/v1/no-such-resource            -> 404 application/problem+json
POST /api/v1/auth/login (admin)          -> 200 application/json
     body fields: accessToken, tokenType, expiresIn, role; role=admin, expiresIn=3600
GET  /api/v1/auth/me (issued token)      -> 200 {"id":"3c6aa6a4-…","role":"admin","displayName":"Salon Administrator"}
GET  /api/v1/auth/me (expired, -60 s)    -> 401 application/problem+json UNAUTHENTICATED
POST /api/v1/auth/login (wrong password) -> 401 application/problem+json UNAUTHENTICATED
POST /api/v1/auth/login (unknown user)  -> 401 application/problem+json UNAUTHENTICATED
POST /api/v1/auth/login (no password)    -> 400 application/problem+json MALFORMED_REQUEST
```

The expired-token body, verbatim:

```
{"type":"https://api.salon.example/problems/unauthenticated","title":"Not authenticated",
 "status":401,"instance":"/api/v1/auth/me","code":"UNAUTHENTICATED",
 "traceId":"8e69da88-085a-40cd-8bc2-22463004e088","detail":"The bearer token is not valid."}
```

The missing-password body carries the CL-09 status and the field-level error:

```
{"type":"https://api.salon.example/problems/malformed-request","title":"Malformed request",
 "status":400,"instance":"/api/v1/auth/login","code":"MALFORMED_REQUEST",
 "traceId":"4b0d3a62-cf21-438d-8329-78903e225260","detail":"The body contains invalid fields.",
 "errors":[{"field":"password","code":"REQUIRED","message":"must have required property 'password'"}]}
```

## 3. Log records written for those requests

```
{"ts":"2026-11-08T16:31:51.772Z","level":"warn","event":"http.request","traceId":"bc7150cf-8523-4142-94aa-09d0e3de366c","method":"GET","path":"/api/v1/no-such-resource","status":404,"durationMs":2.991077}
{"ts":"2026-11-08T16:31:51.849Z","level":"info","event":"http.request","traceId":"5ac9a198-afbf-4fdb-93ea-92b6a559bcfc","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":71.4027}
{"ts":"2026-11-08T16:31:51.854Z","level":"info","event":"http.request","traceId":"bbc6d437-e643-4f69-90d0-df3167a13d64","method":"GET","path":"/api/v1/auth/me","status":200,"durationMs":3.820959}
{"ts":"2026-11-08T16:31:51.859Z","level":"warn","event":"http.request","traceId":"8e69da88-085a-40cd-8bc2-22463004e088","method":"GET","path":"/auth/me","status":401,"durationMs":0.689872}
{"ts":"2026-11-08T16:31:51.892Z","level":"warn","event":"http.request","traceId":"2c89a76c-215e-4312-a201-ee02e8f0c17d","method":"POST","path":"/auth/login","status":401,"durationMs":31.437526}
{"ts":"2026-11-08T16:31:51.920Z","level":"warn","event":"http.request","traceId":"a173a6fb-c66d-422b-9a6e-4dc7a34d4ff0","method":"POST","path":"/auth/login","status":401,"durationMs":27.277989}
{"ts":"2026-11-08T16:31:51.922Z","level":"warn","event":"http.request","traceId":"4b0d3a62-cf21-438d-8329-78903e225260","method":"POST","path":"/auth/login","status":400,"durationMs":0.524357}
```

## 4. Analysis

**Correlation.** Seven responses, seven records, seven distinct `traceId`s; each
body's `traceId` equals its record's. No request produced two records and no
record lacks a request.

**No credential material in the log.** The record schema is
`ts, level, event, traceId, method, path, status, durationMs` — no headers, no
body, no query. Checked mechanically over the whole run window: `/eyJ/` and the
word `authorization` occur in **no** record, and the issued `accessToken` is
absent. The `path` field is a route template or a contract template, never a
concrete parameter value (runs-01 §5 fixed the one case where it was not).

**Level mapping.** `200 → info`; `404/400/401 → warn`; no `error` level was
written, because no request produced a 5xx. The nine `500` records earlier in
the same file belong to the S1.0 RED cycles and are documented in runs-01; they
are not part of this window.

**Duration.** Password checks cost 27–32 ms (scrypt N=16384, r=8, p=1 — D-18),
the first one in a fresh process 71 ms (module and pool warm-up). A wrong
password costs the same as a valid one by design; an unknown username costs the
same because `burnPasswordCheck` runs the same computation. Routing-only
requests are sub-millisecond; the first contract load costs ~3 ms and is
cached.

**Defect found by this run — `path` has two spellings for one operation.**
A matched operation logs its contract path *with* the API prefix when the
response is produced by the handler, and *without* it when the response goes
through the error handler:

```
POST /api/v1/auth/login  200     ← handler produced the response
POST /auth/login         401     ← error handler produced the response
```

Cause: the record is written on `res` `finish`, and `req.baseUrl` is restored to
`''` when the router unwinds. A successful response finishes before the unwind
(`baseUrl === '/api/v1'`), an error response finishes after it
(`baseUrl === ''`). Measured directly with a probe middleware: `200 → baseUrl
"/api/v1"`, `401 → baseUrl ""`, `req.route.path === "/auth/login"` in both.

Consequence: neither form contains a token (`req.route.path` is the template),
so REQ-NF-001 and REQ-NF-006 are not affected; but the field is the join key of
every `runs-*.md` analysis, and two spellings break an exact-match query.

**Fixed test-first.** The assertion was added before the change and failed on
the second element (`['/api/v1/auth/login', '/auth/login']`), recorded in
`logs/tdd/tdd-SMS-21.md` §11.1. `middleware/logger.ts` now prefers the contract
template, which is stable and includes the prefix, and falls back to
`${baseUrl}${route.path}` only for a path the contract does not define
(`/health`, which keeps the S1.0 expectation). GREEN in §11.2 of the same file.

**No stderr noise.** The run printed nothing on stderr; unexpected errors are
the only thing that writes there.

## 5. Open items

1. **Built-artifact coverage is still a control run, not a test.** Pinning
   `node dist/src/index.js` with a test remains a candidate for the NFR/harness
   ticket (runs-01 §4).

Closed by this run: the `path` spelling (§4) and the manual migration step (§1).
Both were defects, not candidates, and both are fixed with evidence above.
