# Control run 01 — S1.0 infrastructure (SMS-44)

| Field | Value |
|---|---|
| Run | 01 |
| Date | 2026-11-08 |
| Stage | S1.0 |
| Ticket | SMS-44 (issue #44) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-08-test-SMS-44.md` |
| Code | `src/contract/paths.ts` (new), `not-found.ts`, `error-handler.ts`, `logger.ts`, build copy step |
| Log file | `logs/runtime/app-2026-11-08.jsonl` (git-ignored) |

## 1. Commands

```
$ npm test
 Test Files  1 passed (1)
      Tests  8 passed (8)
   exit 0

$ npm run build
  schemas:    58
  operations: 50
copy-contract: src/contract/openapi.json -> dist/src/contract/openapi.json
   exit 0

$ node scripts/verify-contract.mjs
contract: 3.0.3 — 50 operations
   exit 0

$ npm run check:test-first
check-test-first: manifest is empty — nothing to verify (exit 0). See tests/manifest.json.
```

The control run below uses the **built** application (`dist/`), not the
TypeScript sources, so that the packaging is exercised as it would be in
service.

## 2. Requests and responses

```
GET  /health -> 200 | application/json; charset=utf-8
     {"status":"ok"}
GET  /api/v1/no-such-resource -> 404 | application/problem+json
     {"type":"https://api.salon.example/problems/not-found","title":"Not found","status":404,"instance":"/api/v1/no-such-resource","code":"NOT_FOUND","traceId":"4f54d7f7-dfbb-4822-8786-24478ea372ff","detail":"No resource is defined at the requested path."}
POST /api/v1/services -> 405 | application/problem+json
     {"type":"https://api.salon.example/problems/method-not-allowed","title":"Method not allowed","status":405,"instance":"/api/v1/services","code":"METHOD_NOT_ALLOWED","traceId":"8fb3c0e7-17ec-4fdb-9e32-9b6797974d65","detail":"The path is defined for GET."}
GET  /api/v1/services -> 404 | application/problem+json
     {"type":"https://api.salon.example/problems/not-found","title":"Not found","status":404,"instance":"/api/v1/services","code":"NOT_FOUND","traceId":"cd931e83-a453-46c2-9c21-f6346236a76f","detail":"No resource is defined at the requested path."}
POST /api/v1/admin/masters/6f2a1c4e-8b3d-4a5f-9c7e-1d2b3a4c5d6e -> 405 | application/problem+json
     {"type":"https://api.salon.example/problems/method-not-allowed","title":"Method not allowed","status":405,"instance":"/api/v1/admin/masters/6f2a1c4e-8b3d-4a5f-9c7e-1d2b3a4c5d6e","code":"METHOD_NOT_ALLOWED","traceId":"b22623c2-1a27-420f-81d3-4b05f9cec379","detail":"The path is defined for GET, PATCH."}
POST /api/v1/admin/masters/6f2a1c4e-8b3d-4a5f-9c7e-1d2b3a4c5d6e/appointments -> 404 | application/problem+json
     {"type":"https://api.salon.example/problems/not-found","title":"Not found","status":404,"instance":"/api/v1/admin/masters/6f2a1c4e-8b3d-4a5f-9c7e-1d2b3a4c5d6e/appointments","code":"NOT_FOUND","traceId":"5fa41882-c563-4195-a385-f25334b366b9","detail":"No resource is defined at the requested path."}
POST /api/v1/auth/login -> 400 | application/problem+json
     {"type":"https://api.salon.example/problems/malformed-request","title":"Malformed request","status":400,"instance":"/api/v1/auth/login","code":"MALFORMED_REQUEST","traceId":"14703138-e980-4e3d-a070-68b2246b5707","detail":"The request body is not valid JSON."}
```

## 3. Log records written for those requests

> These are the records of the **first** control run, made before the review
> finding. The two records for `/admin/masters/…` show the concrete value
> because the redaction did not exist yet; §5 shows the behaviour after it. Kept
> verbatim because deleting the evidence would hide the defect.

```
{"ts":"2026-11-08T14:06:18.262Z","level":"info","event":"http.request","traceId":"22c8657d-348d-4044-b87b-181ac798c69b","method":"GET","path":"/health","status":200,"durationMs":3.156511}
{"ts":"2026-11-08T14:06:18.292Z","level":"warn","event":"http.request","traceId":"4f54d7f7-dfbb-4822-8786-24478ea372ff","method":"GET","path":"/api/v1/no-such-resource","status":404,"durationMs":21.401801}
{"ts":"2026-11-08T14:06:18.297Z","level":"warn","event":"http.request","traceId":"8fb3c0e7-17ec-4fdb-9e32-9b6797974d65","method":"POST","path":"/api/v1/services","status":405,"durationMs":0.485338}
{"ts":"2026-11-08T14:06:18.299Z","level":"warn","event":"http.request","traceId":"cd931e83-a453-46c2-9c21-f6346236a76f","method":"GET","path":"/api/v1/services","status":404,"durationMs":0.26792}
{"ts":"2026-11-08T14:06:18.302Z","level":"warn","event":"http.request","traceId":"b22623c2-1a27-420f-81d3-4b05f9cec379","method":"POST","path":"/api/v1/admin/masters/6f2a1c4e-8b3d-4a5f-9c7e-1d2b3a4c5d6e","status":405,"durationMs":0.244497}
{"ts":"2026-11-08T14:06:18.304Z","level":"warn","event":"http.request","traceId":"5fa41882-c563-4195-a385-f25334b366b9","method":"POST","path":"/api/v1/admin/masters/6f2a1c4e-8b3d-4a5f-9c7e-1d2b3a4c5d6e/appointments","status":404,"durationMs":0.517182}
{"ts":"2026-11-08T14:06:18.314Z","level":"warn","event":"http.request","traceId":"14703138-e980-4e3d-a070-68b2246b5707","method":"POST","path":"/api/v1/auth/login","status":400,"durationMs":4.69854}
```

## 4. Analysis

**Correlation.** Every response carries a `traceId`, and the matching record
carries the same value — checked by eye for all seven requests and by assertion
for the 404 case. No request produced more than one record.

**Level mapping.** `200 → info`, every `4xx → warn`. No `error` level was
written: after the build fix below, no request produced a 5xx.

**`path` semantics.** `/health` is logged as the matched template; unmatched
requests that name a contract path are logged as the contract template
(`/api/v1/admin/masters/{masterId}`), and only a path the contract does not
define is logged verbatim. This is the field that was empty before SMS-44.

The first version of this document said REQ-NF-001 was unaffected because
token-bearing routes match and matched routes log the template. That was wrong
for this stage: at S1.0 **no operation router is mounted**, so every `/api/v1/*`
request is unmatched, and `GET /api/v1/appointments/<token>` was logged with the
token in clear text. The defect was caught in review, asserted as a ninth test,
and fixed in the second cycle (`logs/tdd/tdd-SMS-44.md` §8).

**No stderr noise.** The malformed-JSON request no longer prints
`unhandled error: SyntaxError…`. It is a client error and is rendered as 400;
before the change it was logged as unexpected and answered with 500.

**Defect found by this run (fixed, not covered by a test).** The first control
run against `dist/` returned **500 `INTERNAL_ERROR`** for every request that
reached `notFound`:

```
[0b06b3d8-68b8-4f7f-8caa-d6db7772f8ff] unhandled error: Error: src/contract/openapi.json is missing. Run `npm run convert:contract` to generate it from spec/api/openapi.yaml.
```

Cause: `loadContract()` resolves the file relative to its module, and `tsc`
copies only `.js`. `src/contract/openapi.json` is generated and git-ignored, so
`dist/src/contract/openapi.json` never existed. Fixed by `scripts/copy-contract.mjs`,
run from `npm run build`, which also now regenerates the contract first. The
suite could not have caught this — it imports the TypeScript sources, where the
file is in place. Recorded in `logs/tdd/tdd-SMS-44.md` §7 and carried to the
verification stage as an open item: pinning the built artifact needs a test that
starts `node dist/src/index.js`, which belongs to the NFR/harness ticket, not to
SMS-44.

**Duration.** Sub-millisecond handler time for routing decisions; the 404 case
includes the first contract load (~21 ms), which is cached afterwards.

## 5. Second control run — token redaction

After the review finding, three requests were repeated against a rebuilt `dist/`:

```
POST /api/v1/appointments/9b2f7c1e-4a3d-4f6b-8e21-7c5a9d0b3f14/cancel -> 404
GET  /api/v1/appointments/9b2f7c1e-4a3d-4f6b-8e21-7c5a9d0b3f14        -> 404
GET  /api/v1/nope                                                      -> 404
```

```
{"ts":"2026-11-08T14:11:49.249Z","level":"warn","event":"http.request","traceId":"d7c0e3a2-7913-49bc-ac4d-1fea13399e5a","method":"POST","path":"/api/v1/appointments/{token}/cancel","status":404,"durationMs":3.575172}
{"ts":"2026-11-08T14:11:49.257Z","level":"warn","event":"http.request","traceId":"c11df1db-d5a1-4408-9a1b-0f7f4cd1a75c","method":"GET","path":"/api/v1/appointments/{token}","status":404,"durationMs":0.304903}
{"ts":"2026-11-08T14:11:49.260Z","level":"warn","event":"http.request","traceId":"efebf21d-cc0a-4be9-b040-13f031bea26e","method":"GET","path":"/api/v1/nope","status":404,"durationMs":0.310343}
```

The token appears in no post-fix record. One earlier line in the same file does
contain it — the record written by the RED run itself
(`14:11:06.696Z`), which is kept as evidence in `logs/tdd/tdd-SMS-44.md` §8.1
and not deleted from the runtime log, since the runtime log is git-ignored and
destructive cleanup would hide what happened.

The response body still echoes the token in `Problem.instance` for this request.
That is the path the caller sent and already knows; the requirement protects the
durable log, not the echo. Recorded here so a reviewer does not read the two as
contradictory.

## 6. Observations left alone deliberately

- **No `Allow` header on 405.** RFC 9110 §15.5.6 requires one on a 405 response.
  The approved contract does not mention it and the signed test does not assert
  it, so adding it now would be behaviour without a failing test — exactly the
  order this lab forbids. Recorded as a **ticket candidate**: write the
  assertion, then the header.
- **`HEAD`/`OPTIONS` answer 405.** `HEAD /api/v1/services` returns 405 because
  the contract lists neither method, although RFC 9110 permits `HEAD` wherever
  `GET` is allowed and `OPTIONS` describes a resource. The contract is silent,
  so this is left as a **ticket candidate** too: a contract clarification or an
  addendum decides it, not the implementation.
- **`GET /api/v1/services` → 404 until S1.2.** The contract defines the
  operation, but no router is mounted. Expected asymmetry, documented in
  `logs/gates/2026-11-08-test-SMS-44.md` §1.
- **Built-artifact check.** `npm run build && node dist/src/index.js` is now part
  of the final verification checklist (plan §10): the missing-contract defect in
  §4 was invisible to the in-process suite, and only running the built artifact
  surfaced it.

## 7. Entry-point run — environment loading (added after a manual attempt)

Running `node dist/src/index.js` directly failed with
`ConfigError: Missing required environment variable: DATABASE_URL`: nothing in
the process loaded `.env`. The tests load it themselves (`tests/setup.ts`), so
the gap only appeared when the built artifact was started by hand.

Fixed in the npm scripts, not in application code — `node` has carried the flag
since v22.9 and the project requires Node >= 24.18:

```
"dev":   "npm run build && node --watch --env-file-if-exists=.env dist/src/index.js"
"start": "node --env-file-if-exists=.env dist/src/index.js"
```

Verified: `npm start` writes `server.started` with `port: 3000` and
`nodeEnv: development`. A bare `node dist/src/index.js` still fails fast, which
is intended: the process reads `process.env` only and should not silently invent
a database.

### Observation: the final shutdown record is lost

With the server started and SIGTERM delivered, the process exits 0 (so the
graceful path runs) but the log ends at `server.stopping`:

```
{"ts":"…","level":"info","event":"server.started","port":3000,"nodeEnv":"development"}
{"ts":"…","level":"info","event":"server.stopping","signal":"SIGTERM"}
```

`server.stopped` is written inside the `server.close` callback and
`process.exit(0)` is called immediately afterwards; a `WriteStream` write is
asynchronous, so the last record is discarded. Not fixed here: the fix is a
`logger.close(callback)` that ends the stream before exiting, and the only test
that can see it spawns the built process — the same built-artifact class as §4.
Recorded as a candidate for the NFR/harness ticket, test first.
