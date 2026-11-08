# TDD log — SMS-44 (S1.0 infrastructure)

| Field | Value |
|---|---|
| Ticket | SMS-44 — Test S1.0 infrastructure (issue #44) |
| Stage | S1.0 |
| Date | 2026-11-08 |
| Test file | `tests/api/structural.test.ts` — 8 assertions |
| Contract | `openapi.yaml#/components/schemas/Problem`, API-GATE GO 2026-10-26 |
| Gate | `logs/gates/2026-11-08-test-SMS-44.md` — **PENDING** |

## 1. What the test commit contains

| File | Change |
|---|---|
| `tests/api/structural.test.ts` | new — eight assertions over the scaffold |
| `vitest.config.ts` | `passWithNoTests: true` removed, as the SMS-44 checklist (§8.2, item 3) requires: a missing or mistyped test path must fail the run again |

No implementation file changes. The scaffold is untouched by this commit.

The first draft of this file had six assertions. The 405 rule was extended to
parameterised contract paths after review, so the recorded RED run below is the
eight-assertion one; the six-assertion run is superseded and not kept as
evidence.

## 2. RED run — verbatim output

```
$ npx vitest run tests/api/structural.test.ts --reporter=verbose

 RUN  v4.1.12 /home/novell/Documents/VScode-projects/pis/salon-management-system

[31d65762-b396-4444-b949-4ae317ff935b] unhandled error: SyntaxError: Unexpected end of JSON input
    at JSON.parse (<anonymous>)
    at parse (/home/novell/Documents/VScode-projects/pis/salon-management-system/node_modules/body-parser/lib/types/json.js:93:21)
    at /home/novell/Documents/VScode-projects/pis/salon-management-system/node_modules/body-parser/lib/read.js:194:18
    at AsyncResource.runInAsyncScope (node:async_hooks:226:14)
    at invokeCallback (/home/novell/Documents/VScode-projects/pis/salon-management-system/node_modules/raw-body/index.js:238:16)
    at done (/home/novell/Documents/VScode-projects/pis/salon-management-system/node_modules/raw-body/index.js:227:7)
    at IncomingMessage.onEnd (/home/novell/Documents/VScode-projects/pis/salon-management-system/node_modules/raw-body/index.js:287:7)
    at IncomingMessage.emit (node:events:514:20)
    at endReadableNT (node:internal/streams/readable:1966:12)
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
 ✓ tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > answers an unknown path with 404 NOT_FOUND as application/problem+json 23ms
 × tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > answers a contract-defined path with an undefined method with 405 METHOD_NOT_ALLOWED 8ms
   → expected 404 to be 405 // Object.is equality
 × tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > recognises a parameterised contract path when the method is undefined 2ms
   → expected 404 to be 405 // Object.is equality
 ✓ tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > does not treat a path beyond a parameterised template as defined 2ms
 × tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > answers a syntactically invalid JSON body with 400 MALFORMED_REQUEST 6ms
   → expected 500 to be 400 // Object.is equality
 ✓ tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > writes the response trace id into the request log record 2ms
 ✓ tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > logs the matched route template for a request that reached a route 3ms
 × tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > logs the request path when no route matched 2ms
   → expected '' to be '/api/v1/no-such-resource' // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > answers a contract-defined path with an undefined method with 405 METHOD_NOT_ALLOWED
AssertionError: expected 404 to be 405 // Object.is equality

- Expected
+ Received

- 405
+ 404

 ❯ tests/api/structural.test.ts:118:29
    116|     const response = await request(app).post('/api/v1/services');
    117|
    118|     expect(response.status).toBe(405);
       |                             ^
    119|     expect(response.headers['content-type']).toBe('application/problem…
    120|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > recognises a parameterised contract path when the method is undefined
AssertionError: expected 404 to be 405 // Object.is equality

- Expected
+ Received

- 405
+ 404

 ❯ tests/api/structural.test.ts:139:29
    137|     const response = await request(app).post(`/api/v1/admin/masters/${…
    138|
    139|     expect(response.status).toBe(405);
       |                             ^
    140|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…
    141|     expect(response.body).toMatchObject({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > answers a syntactically invalid JSON body with 400 MALFORMED_REQUEST
AssertionError: expected 500 to be 400 // Object.is equality

- Expected
+ Received

- 400
+ 500

 ❯ tests/api/structural.test.ts:168:29
    166|       .send('{"email":');
    167|
    168|     expect(response.status).toBe(400);
       |                             ^
    169|     expect(response.headers['content-type']).toBe('application/problem…
    170|     expect(isProblem(response.body), JSON.stringify(isProblem.errors ?…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  tests/api/structural.test.ts > S1.0 infrastructure — structural behaviour > logs the request path when no route matched
AssertionError: expected '' to be '/api/v1/no-such-resource' // Object.is equality

- Expected
+ Received

- /api/v1/no-such-resource

 ❯ tests/api/structural.test.ts:224:30
    222|
    223|     expect(records).toHaveLength(1);
    224|     expect(records[0]?.path).toBe(path);
       |                              ^
    225|   });
    226| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 4 passed (8)
   Start at  15:56:10
   Duration  673ms (transform 53ms, setup 26ms, import 155ms, tests 388ms, environment 0ms)

vitest exit=1
```

## 3. Expected reason for each failure

| # | Failing assertion | Expected cause | What implementation must change |
|---|---|---|---|
| 1 | `POST /api/v1/services` → **405** (received 404) | `notFound` is the terminal handler and knows nothing about which paths exist, so every request that misses a router — including a defined path with an undefined method — is reported as 404. error-model.md §4 requires 405 for "path exists, method does not" | Recognise the path set. At S1.0 **no operation router is mounted**, so the set has to come from the contract (`loadContract().operations` in `src/contract/validators.ts`), not from Express's router: `GET /services` is defined, `POST` is not |
| 2 | `POST /api/v1/admin/masters/<uuid>` → **405** (received 404) | Same cause, one level harder: the contract path is a template, `/admin/masters/{masterId}`. A literal comparison of strings never matches a real request, so template matching is part of the rule and not a refinement of it | Match `{param}` against exactly one path segment. The sibling assertion below is the counterexample that keeps the matcher from over-matching |
| 3 | malformed JSON → **400** (received 500) | `express.json` throws a `SyntaxError` (`type: 'entity.parse.failed'`, `status: 400`) before routing, and the terminal handler maps every non-`HttpProblem` to 500 `INTERNAL_ERROR`. The `TODO(ticket-driven)` at `src/middleware/error-handler.ts:93` states this mapping arrives with this test | Map the body-parser `SyntaxError` to `MALFORMED_REQUEST`. The `[31d65762-…] unhandled error` line above is that same error being logged as unexpected, which identifies the cause as the handler, not the harness |
| 4 | unmatched request logged with `path: ''` (expected the request path) | `requestLogger` builds `path` from `req.baseUrl` and `req.route.path`. When no route matched, `req.route` is absent and `req.baseUrl` has already reset to `''` after the router exits, so the record carries an empty string | Fall back to the request path when no route matched — `req.originalUrl.split('?')[0]` is the value `Problem.instance` already uses |

Each failure is a missing behaviour, not a broken test: the received values
(404, 404, 500, `''`) are exactly the behaviours measured in plan §8.2 before
the test was written.

## 4. Assertions that are already green — characterisation, not RED evidence

Four assertions pass on the unchanged scaffold. They are kept because they pin
behaviour later tickets could regress, but **the gate must not treat them as
proof that the test drove the implementation**:

| Assertion | Why it already passes |
|---|---|
| unknown path → 404 `NOT_FOUND`, `application/problem+json`, `Problem`-valid body, `instance`, `traceId` | `notFound` + `errorHandler` + `traceMiddleware` are complete in the scaffold |
| path beyond a parameterised template → 404 | Nothing matches it today, so it falls through to `notFound`. It stays in the suite as a constraint on the new matcher, which must not turn this into 405 |
| response `traceId` equals the log record's `traceId` | `requestLogger` and `errorHandler` share `getTraceId` |
| matched route template in the log `path` (`GET /health` → `/health`) | `req.route.path` is set for a matched route |

Plan §8.2, checklist item 5, requires this split to be stated explicitly.

## 5. No implementation was written before the gate

The working tree after this run contains only the test file, the
`vitest.config.ts` change and the two records:

```
 M vitest.config.ts
?? logs/gates/2026-11-08-test-SMS-44.md
?? logs/tdd/tdd-SMS-44.md
?? tests/api/
```

`src/` is unchanged from commit `064bd0f`. Implementation starts only after the
human signs `logs/gates/2026-11-08-test-SMS-44.md`.

## 6. GREEN run

*(to be appended after the TEST-GATE signature and the implementation commit)*
