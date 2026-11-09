# Control run 03 — S1.2 reference data (SMS-23)

| Field | Value |
|---|---|
| Run | 03 |
| Date | 2026-11-09 |
| Stage | S1.2 |
| Ticket | SMS-23 (implementation for SMS-14) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-08-test-SMS-14.md` (`SIGNED — GO`, `de6750f`) |
| Code | `src/modules/{masters,catalog,master-services,materials,units}/{routes,service}.ts`, `src/modules/reference-data/http.ts`, `src/middleware/{authorize,validate,auth,error-handler}.ts`, `src/modules/auth/password.ts`, `src/db/{schema.ts,migrations/0001_violet_medusa.sql}`, `src/routes.ts` |
| Log file | `logs/runtime/app-2026-11-09.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc --noEmit                                   exit 0
$ npm run build                                      exit 0
$ npm run convert:contract                           schemas 58, operations 50
$ node scripts/verify-contract.mjs                   contract: 3.0.3 — 50 operations, exit 0
$ npm test                                           113 passed (113), exit 0
$ npm test                                           113 passed (113), exit 0
$ npm test -- --sequence.shuffle                     113 passed (113), exit 0
$ npm run check:test-first -- --verbose              2/2 entries pass, exit 0
```

The two unshuffled runs and the shuffled run are the gate's §11 requirements
(two consecutive runs, plus shuffle). The shuffled run was repeated eight times:
five while the order-dependence in §4 was being fixed, and three after the
`not-a-uuid` probes and the `parameterProblem` rule were added.

The migration is applied to the **test** database by `tests/setup.ts` on every
run. The development database was **not** migrated *during* this run: it held
only `masters` from S1.1 at the time. **After** the run the human applied `0001`
with

```
$ DATABASE_URL=postgres://…/salon npx drizzle-kit migrate
```

and checked the result on 2026-11-09: five tables, and the three seed categories
with `seeded: true`. The migration file is therefore not untried against a
persistent database — it is simply not something this run observed, so §6 says
so.

The control run in §2 does not use the development database either way. It runs
against a **scratch database** created for the run and dropped afterwards, so a
"fresh installation" is literal: the migrator applies `0000` and `0001` to an
empty database. This departs from runs-02 §2, which used the development
database; the reason is that the seed claim (REQ-F-024) is about a *new*
installation, and a scratch database states it without needing anyone to drop a
development schema — and without depending on what the development database
happened to contain at the time.

## 2. Requests and responses — built artifact

The control run used `dist/` (`node` importing `dist/src/app.js`) after
`npm run build`, not the TypeScript sources. The reason is the S1.0 finding
(runs-01 §4): the in-process suite cannot see packaging defects. The application
listens on an ephemeral port and is driven over HTTP, not through supertest.

The output below is from the run at `11:53:25` — the one whose log records are
quoted in §5, so the bodies and the records belong to the same requests. A later
rebuild (a comment-only edit to `validate.ts`) reproduced the same five
statuses; it is not quoted, because it has no extracted record set.

```
tables after migration: categories, master_services, masters, materials, services
categories written by the migration: [{"name":"Barbering","seeded":true},
                                      {"name":"Coloring","seeded":true},
                                      {"name":"Hair","seeded":true}]

GET  /api/v1/admin/categories (admin token)  -> 200 application/json
     [{"name":"Barbering","seeded":true},{"name":"Coloring","seeded":true},{"name":"Hair","seeded":true}]
     seeded entries: 3

GET  /api/v1/admin/masters (master token)    -> 403 application/problem+json FORBIDDEN
GET  /api/v1/admin/masters (no token)        -> 401 UNAUTHENTICATED
GET  /api/v1/admin/masters/not-a-uuid        -> 404 NOT_FOUND

POST /api/v1/admin/materials (admin token)   -> 201
     Location: /api/v1/admin/materials/078bdb8c-c74e-4668-a99b-38dd0e07e97e
GET  /api/v1/admin/units (admin token)       -> 200 {"standard":["ml","l","g","kg","pcs"],"custom":["sachet"]}
```

The 403 body, verbatim:

```
{"type":"https://api.salon.example/problems/forbidden","title":"Forbidden",
 "status":403,"instance":"/api/v1/admin/masters","code":"FORBIDDEN",
 "traceId":"61e052ba-4037-4fab-8fb0-a31b0cc2152b",
 "detail":"This operation requires the administrator role."}
```

The 201 body, verbatim — the create's `initialStockQuantity` surfaced as
`stockQuantity`, and both timestamps are ISO strings:

```
{"id":"078bdb8c-c74e-4668-a99b-38dd0e07e97e","name":"Control Shampoo","unit":"ml",
 "stockQuantity":180,"active":true,
 "createdAt":"2026-11-09T11:53:25.339Z","updatedAt":"2026-11-09T11:53:25.339Z"}
```

## 3. What each request establishes

**`GET /admin/categories` — exactly three seeds, all `seeded:true`.** This is
gate §4 G9, the one claim the suite cannot make: `tests/setup.ts` truncates every
table before each file, so the seeds the *migration* writes are invisible to it
and are arranged by `tests/helpers/reference-data.ts` instead. Here nothing but
the migrator ran, so the three rows are the migration's own
(`0001_violet_medusa.sql`, idempotent `ON CONFLICT DO NOTHING`). Three, not four:
the run had also created a service-free database, so no custom category existed.

**`GET /admin/masters` with a master token — 403, and 401 for the same path
without one.** The pair is the point: a valid token of the wrong role is
refused by the role gate, not by authentication, so the answer is 403 and not
401. `error-model.md` §4 separates the two.

**`GET /admin/masters/not-a-uuid` — 404.** `getMasterAdmin` declares
200, 401, 403, 404, 500 and no 400, so the operation cannot answer 400 for an id
that is not a uuid (see §4). 404 is "no resource has this id", which is true.

**`POST /admin/materials` — 201 with `Location`.** The header carries the
absolute path (`/api/v1/admin/materials/<id>`), which is what the contract's
`format: uri` and the client's need to follow it require. The response is
validated against `Material` before it is sent, so a `Date` field could not pass
(§4).

**`GET /admin/units` — the fixed five plus `sachet`.** The two materials created
in this run use `ml` and `sachet`; `ml` is standard and stays out of `custom`
(D-26), `sachet` is not and appears. The list is derived from live rows, not from
a unit table.

## 4. Defects found by this run

**`date-time` was a `Date` object.** `sendJson` validates a response body against
its contract schema before `res.json` serialises it, so `createdAt` typed
`string`/`date-time` failed and every create answered 500. The view mappers now
call `toISOString()`; the 201 body above is the evidence that a create is
well-formed. Found by the suite, not by this run, and fixed here.

**A duplicate answered 500 instead of 409.** Drizzle throws a
`DrizzleQueryError` whose `cause` is the `pg` error carrying `code` and
`constraint`; `isUniqueViolation` looked only at the thrown object. It now walks
the `cause` chain, and still requires the constraint *name* to match, so a future
index cannot become the trigger for the wrong resource's 409.

**An undeclared 400 on three GETs.** `validateParams` gained `format: uuid`
checking, and answered 400 `MALFORMED_REQUEST` for
`GET /admin/masters/abc`. `getMasterAdmin`, `getServiceAdmin` and
`getMaterialAdmin` declare no 400. Fixed by the CL-09 principle — the status
follows the operation's declared set — so those three answer 404 for an id that
is not a uuid. This closed a second defect at the same time: before the check,
`abc` reached PostgreSQL and failed the cast with SQLSTATE 22P02, which would
have been a 500. Confirmed directly:

```
$ # select 'not-a-uuid'::uuid
sqlstate: 22P02
message: invalid input syntax for type uuid: "not-a-uuid"
```

**The role gate could not be mounted on the router.** A first version wrapped
`/admin` in a sub-router carrying `authenticate` and `requireRole`. Six
`structural.test.ts` assertions then failed: `POST /admin/masters/{id}` (no such
operation) answered 401 where `error-model.md` §4 requires 405, and unmatched
`/admin/*` paths answered 401 instead of 404. The check still lives in exactly
one place (`middleware/authorize.ts`), but as a handler pair spread onto each
operation, so it runs only where an operation matched.

**An order dependence in the test file.** `createService`'s helper defaults to
`category: 'Hair'`; a test that created a service before any test called
`ensureSeedCategories()` brought `Hair` in through D-27's write path with
`seeded:false`, and the fixture's `on conflict do nothing` could not restore it.
One shuffle seed failed three assertions because of it. The file's `beforeAll`
now arranges the seeds first. Recorded in `logs/tdd/tdd-SMS-14.md` §11.4(b).

## 5. Log records written for those requests

The eight records of the last control run, taken from
`logs/runtime/app-2026-11-09.jsonl` and isolated by their `ts` window
(`11:53:25`) and their `traceId`s:

```
{"ts":"2026-11-09T11:53:25.318Z","level":"info","event":"http.request","traceId":"ab6c0428-2b19-478e-b456-a43f7a459941","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":30.549215}
{"ts":"2026-11-09T11:53:25.325Z","level":"info","event":"http.request","traceId":"1ea79b04-c34c-40c5-8d7e-801986a67ecb","method":"GET","path":"/api/v1/admin/categories","status":200,"durationMs":4.973882}
{"ts":"2026-11-09T11:53:25.328Z","level":"warn","event":"http.request","traceId":"61e052ba-4037-4fab-8fb0-a31b0cc2152b","method":"GET","path":"/api/v1/admin/masters","status":403,"durationMs":1.020709}
{"ts":"2026-11-09T11:53:25.331Z","level":"warn","event":"http.request","traceId":"5b100473-a980-4a4d-8d1a-6217cb380992","method":"GET","path":"/api/v1/admin/masters","status":401,"durationMs":0.317124}
{"ts":"2026-11-09T11:53:25.334Z","level":"warn","event":"http.request","traceId":"39901e02-10a6-451c-a7c0-533e53781bc4","method":"GET","path":"/api/v1/admin/masters/{masterId}","status":404,"durationMs":0.760357}
{"ts":"2026-11-09T11:53:25.346Z","level":"info","event":"http.request","traceId":"418cbc11-663a-472c-aa90-701a2483052e","method":"POST","path":"/api/v1/admin/materials","status":201,"durationMs":10.110763}
{"ts":"2026-11-09T11:53:25.351Z","level":"info","event":"http.request","traceId":"9583913c-cbca-4213-a7fe-9b92e980b5c9","method":"POST","path":"/api/v1/admin/materials","status":201,"durationMs":2.010399}
{"ts":"2026-11-09T11:53:25.355Z","level":"info","event":"http.request","traceId":"9bd7e167-46cc-45ea-88c1-f30060b4c1bd","method":"GET","path":"/api/v1/admin/units","status":200,"durationMs":2.308306}
```

**Correlation.** Eight records, eight distinct `traceId`s, one per request the
script issued. The 403 record's `traceId` (`61e052ba…`) is the one in the
response body quoted in §2, so the body's id and the record's agree.

**The template, not the path.** The 404 record for
`GET /api/v1/admin/masters/not-a-uuid` carries
`"path":"/api/v1/admin/masters/{masterId}"` — the contract template, with the
concrete id nowhere in the record. That is the runs-02 §4 fix holding for a
mounted operation, not only for the unmatched case it was introduced for.

**Level mapping.** `200/201 → info`; `401/403/404 → warn`; no `error` record was
written, because no request in this window produced a 5xx. The window cannot
show the fixes in §4 directly — those 500s were answered before the fixes, by
earlier runs of the same script; what this window shows is that the same
requests now produce no `error` record.

**No credential material.** The record schema is
`ts, level, event, traceId, method, path, status, durationMs`: no headers, no
body, no query. The admin's bearer token appears in no record.

## 6. Not established by this run

**The development database.** Not migrated and not queried during this run
(§1). Nothing in this run says what it contained. The human migrated it
afterwards and checked the result; that check is a human observation, not an
output of this run.

**The `seeded` marker is immutable by construction, not by constraint.** Nothing
in the code path can change it — the category write is `on conflict do nothing`
and never an update — but no database rule forbids an `UPDATE` issued outside
this module. The contract exposes no operation that could issue one.

**CL-10's declared-but-unreachable responses.** 409 on R4, R6, R8 and R12, and
400 on P3, are neither implemented nor asserted here. That is the accepted
disposition; this run does not change it, and R6/R8 remain unable to answer 409
because `services.name` has no unique index (D-24).

## 7. Open items

1. **Built-artifact coverage is still a control run, not a test.** Unchanged from
   runs-02 §5: pinning `dist/src/index.js` with a test is a candidate for the
   NFR/harness ticket (runs-01 §4). This run is the third occurrence of the same
   gap, and the two defects in §4 that only the built artefact could show are the
   argument for closing it.
2. **The control-run script is not committed.** It lives in `logs/runtime/`,
   which is git-ignored. If these runs are to be repeatable by someone other than
   the person who wrote them, the script belongs under `scripts/`.
