# Control run 04 — S1.3 availability (SMS-24)

| Field | Value |
|---|---|
| Run | 04 |
| Date | 2026-11-09 |
| Stage | S1.3 |
| Ticket | SMS-24 (implementation for SMS-15) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-09-test-SMS-15.md` (`SIGNED — GO`, `6f66bc6`) |
| Code | `src/modules/availability/{routes,service,rules}.ts`, `src/lib/{availability,time}.ts`, `src/middleware/{authorize,validate}.ts`, `src/db/{schema.ts,migrations/0002_availability.sql}`, `src/routes.ts` |
| Log file | `logs/runtime/app-2026-11-09.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc --noEmit                                   exit 0
$ npm run build                                      exit 0
$ npm run convert:contract                           schemas 58, operations 50
$ npm test                                           156 passed (156), exit 0
$ npm test                                           156 passed (156), exit 0
$ npm test -- --sequence.shuffle                     156 passed (156), exit 0  ×8
$ npm run check:test-first                           3/3 entries pass, exit 0
```

The two unshuffled runs and the shuffled runs are the gate's §9 requirements
(two consecutive runs, plus shuffle). The shuffled run was repeated eight times:
three before the order-dependence in §4(b) was fixed, five after. A single
shuffled pass is not evidence of order independence — one seed can be lucky,
as S1.2's §4 showed — so the count is stated rather than a single green line.

Floor: the suite was 113 at the `test:` commit's predecessor and is 156 now. The
difference is exactly the 43 availability assertions the gate counts, so no test
outside S1.3 changed its verdict.

The migration is applied to the **test** database by `tests/setup.ts` on every
run, so `0002_availability.sql` is exercised by the suite as well as by the
control run below. The development database is **not** migrated by this run and
nothing in it is claimed here: whether the human applies `0002` is a separate
human act, as it was for `0001` in runs-03 §1.

The control run in §2 runs against a **scratch database** created for the run and
dropped afterwards, so a "fresh installation" is literal: the migrator applies
`0000`, `0001` and `0002` to an empty database and nothing else writes the
schema. That is the same arrangement as runs-03 §1, kept for the same reason.

## 2. Requests and responses — built artifact

The control run used `dist/` (`node` importing `dist/src/app.js`) after
`npm run build`, not the TypeScript sources — the S1.0 finding (runs-01 §4): the
in-process suite cannot see packaging defects. The application listens on an
ephemeral port and is driven over HTTP, not through supertest. The script is
`logs/runtime/s13-control-run.mjs`, uncommitted for the reason runs-03 §7 gives.

```
tables after migration: availability_dates, availability_weekly, categories,
                        master_services, masters, materials, services
services created: 201 201        (45-minute "S13 Haircut", 30-minute "S13 Trim")

--- M3 before any PUT: GET /api/v1/me/availability (master token) ---
status: 200
body: {"weekly":[],"dates":[]}

--- P7 without any token, before rules exist ---
status: 200 | content-type: application/json; charset=utf-8
slots: []

--- M4 first PUT (master token) ---
status: 200
body: {"weekly":[{"dayOfWeek":1,"startTime":"10:00","endTime":"14:00"}],"dates":[]}

--- P7 without any token, 2026-12-07 (Monday, winter) ---
status: 200 | content-type: application/json; charset=utf-8
totalDurationMinutes: 75
occupiedDurationMinutes: 90
slot starts: ["2026-12-07T10:00:00+02:00","2026-12-07T10:30:00+02:00",
              "2026-12-07T11:00:00+02:00","2026-12-07T11:30:00+02:00",
              "2026-12-07T12:00:00+02:00","2026-12-07T12:30:00+02:00"]

--- P7 without any token, 2027-07-05 (Monday, summer) ---
status: 200
slot starts: ["2027-07-05T10:00:00+03:00","2027-07-05T10:30:00+03:00",
              "2027-07-05T11:00:00+03:00","2027-07-05T11:30:00+03:00",
              "2027-07-05T12:00:00+03:00","2027-07-05T12:30:00+03:00"]

--- M3 with an administrator token ---
status: 403 | code: FORBIDDEN
body: {"type":"https://api.salon.example/problems/forbidden","title":"Forbidden",
       "status":403,"instance":"/api/v1/me/availability","code":"FORBIDDEN",
       "traceId":"a4cd75d3-cb0d-455c-9681-39890eb02903",
       "detail":"This operation requires the master role."}
--- M3 without a token ---
status: 401 | code: UNAUTHENTICATED

--- M4 second PUT, a different set (master token) ---
status: 200
body: {"weekly":[{"dayOfWeek":5,"startTime":"09:00","endTime":"11:00"}],
       "dates":[{"date":"2026-12-31","startTime":"12:00","endTime":"16:00"}]}
--- M3 read back after the second PUT ---
body: {"weekly":[{"dayOfWeek":5,"startTime":"09:00","endTime":"11:00"}],
       "dates":[{"date":"2026-12-31","startTime":"12:00","endTime":"16:00"}]}
equals what was sent: true

--- M4 PUT with both collections empty ---
status: 200 | body: {"weekly":[],"dates":[]}

--- P7 with a date that is not a calendar date ---
status: 400 | code: MALFORMED_REQUEST
```

## 3. What each request establishes

**`M3` before any PUT — 200 `{"weekly":[],"dates":[]}`.** The gate's third GREEN
condition, and the one the suite could not state without a fresh master of its
own (§4(b)). A master who has never written a rule has two empty collections, not
404: `Availability` makes both properties required, so "nothing configured" is an
empty set rather than a missing resource. No `beforeEach` or fixture wrote these
collections — the account was inserted by this script, so the empty answer is
about the storage layer, not about a test's arrangement.

**`P7` with no `Authorization` header at all — 200.** P7 is the public operation
of this stage. The suite asserts it through a helper that omits the header, which
proves the handler does not require one, but not that the *compiled* router
mounts it outside the authenticated path — a router-level `authenticate` would
still let supertest's no-header case pass if the middleware only checked when a
header existed. Here the request carries no credential of any kind and answers
200, and `src/routes.ts` mounts it on the API router rather than the admin one.

The same call before any rule exists returns `slots: []` — also 200. A master
with no availability is not a 404 from P7 either; the master exists, the slot set
is empty.

**Both offsets from one rule.** The first PUT declares Monday 10:00–14:00 in
wall-clock terms only, with no zone. P7 on `2026-12-07` (ISO Monday) returns
starts carrying `+02:00`; the same rules on `2027-07-05` (ISO Monday, no second
PUT) return `+03:00`. Nothing in the stored rule changed between the two
requests, so the offset is being derived from the date through the zone — which
is what resource-model §3 requires and what an implementation hard-coding
`+02:00` or normalising to `Z` cannot do. Both dates and both offsets were
checked against ICU before the suite's assertions were written (tdd-SMS-15 §5.2).

**75 → 90, and six starts.** The two services are 45 and 30 minutes, so
`totalDurationMinutes` is the unrounded 75 and `occupiedDurationMinutes` is 90
(REQ-F-031). The window is 10:00–14:00, four hours; at 30-minute granularity the
last start from which a 90-minute block still fits is 12:30, so six starts. A
75-minute block would have offered seven (…13:00); the difference between the two
numbers is the rounding made visible.

**`M3` with an administrator token — 403, and 401 without a token.** The pair is
the stage's role-matrix point (`error-model.md` §4: 401 is *no* credentials, 403
is the wrong role). `/me/availability` is JWT-M, so an administrator is refused by
`requireRole('master')` rather than admitted or met with 401. The body's
`detail` names the **master** role — see §4(a), where a wrong one was found.

**The second PUT — full replacement, verified by identity.** The first PUT left
Monday 10:00–14:00 and no date rules. The second PUT sends one Friday rule and
one date rule; the read-back equals the second request byte for byte (`equals what
was sent: true`), so Monday is gone. A merge would have left it. The empty PUT
then clears both collections and answers 200 with two empty arrays — clearing is a
replacement like any other, not a 422 for "nothing to store".

**A date that is not a calendar date — 400.** `date=not-a-date` is not a
`YYYY-MM-DD` string, so it is a wrongly typed query parameter and answers 400
`MALFORMED_REQUEST` (P7 declares 400). See §4(c): before the fix this answered
500.

## 4. Defects found at GREEN

Three, all fixed before the `feat:` commit. One was found only by this control run
(§4a), two by the suite — the second of those only under shuffle (§4b), and the
third as a wrong status under RED (§4c). That distribution is the argument for
running the built artefact rather than trusting the suite.

**(a) The 403 body described the wrong role.** `requireRole` had one message,
written when `adminAccess` was its only caller: "This operation requires the
**administrator** role." S1.3 is the first `requireRole('master')`, so an
administrator refused on `/me/availability` was told the operation needs the role
they already have. The status was right and the sentence contradicted it.

This is what the first control run — before the fix — actually answered. The
body is quoted from that run's output; the record is the one at `12:45:23.490`
whose `traceId` matches the body's:

```
--- M3 with an administrator token ---
status: 403 | code: FORBIDDEN
body: {"type":"https://api.salon.example/problems/forbidden","title":"Forbidden",
       "status":403,"instance":"/api/v1/me/availability","code":"FORBIDDEN",
       "traceId":"edea7c50-d713-4860-9844-832073fe481c",
       "detail":"This operation requires the administrator role."}

{"ts":"2026-11-09T12:45:23.490Z","level":"warn","event":"http.request","traceId":"edea7c50-d713-4860-9844-832073fe481c","method":"GET","path":"/api/v1/me/availability","status":403,"durationMs":0.650186}
```

An administrator holding the administrator role, refused by an operation and told
in the same response that the operation requires the administrator role. The
suite was green over this: it asserts status, `code`, content-type and a
`traceId` of the right shape, and no test pins `detail`.

The detail is now derived from `role` through a map that is exhaustive over
`PrincipalRole` (`'master' | 'admin'`), so a third role would fail to compile
until it is named. The same request after the fix answers the body quoted in §2,
with `detail: "This operation requires the master role."` Both trees were built
with `npm run build` and driven over the same socket by the same script; the body
above and the body in §2 differ in the `detail` string and, because the two runs
were separate, in `traceId` and duration.

**(b) Two order dependences in the test file — the second found by shuffle.**
The gate signs 43 assertions, and those 43 are the count that must not move; but
two of them asserted something true only when a *different* test ran first, and
that had to be repaired before the `feat:` commit. Both repairs are in the test
file, so they belong in a `test:` commit before the `feat:` one.

1. **"never set any"** asked Petro, whose rule set is written by the P7 block's
   `beforeEach`. It passed only if it ran before that block. Now it creates a
   master with `seedAccount` and reads that master's own record — the same
   finding as runs-03 §4, one stage later.

2. **"keeps each rule set private"** asserted that Ihor's set was empty while
   other cases in its own block write Ihor's rules. It passed under the file's
   natural order and failed under `--sequence.shuffle`, at the assertion that
   Ihor's side was empty:

   ```
   FAIL tests/api/availability.test.ts > S1.3 availability — P7, M3, M4
        > M3 / M4 — full replacement of the rule set (REQ-F-015, POS-26)
        > keeps each rule set private to its own master
   AssertionError: … expected [ …(1) ] to deeply equal []

     391|
     392|       expect(mine.body.weekly).toHaveLength(1);
     393|       expect(theirs.body.weekly).toEqual([]);
        |                                  ^
   ```

   Ihor had one weekly rule at that point, left by whichever case in the block
   ran earlier. Now both sides are written in the case and read back by their own
   owners: two independent writes prove isolation without depending on who ran
   first. The assertion count is unchanged at 43; what changed is that each one
   states its own Given.

   This is the second time shuffle has found this class of defect (runs-03 §4,
   tdd-SMS-14 §11.4(b)). The pattern is the same each time: a case whose Given is
   "nobody has touched this yet".

**(c) A query `date` of the wrong type reached the database — 500 instead of
400.** `validateParams` coerces a query parameter to the type its schema
declares, and had branches for `integer`, `number`, `boolean` and `format: uuid`
— but none for `format: date`, so `date=not-a-date` was passed through as a
string, reached PostgreSQL, and failed the cast with SQLSTATE 22P02. The
assertion's first GREEN attempt answered **500** where the contract requires 400;
the suite reported `expected 500 to be 400`. This is a defect in code written for
this stage, not a property of the design: the correct answer was known from the
contract and the code fell short of it.

`coerce` now rejects a value that is not a real calendar date, using
`parseCalendarDate` from `src/lib/time.ts` — so `2026-02-30` is refused too, not
by passing a round-trip check but by naming no day. The reject is contract-safe
everywhere it can apply: all eleven `date` query parameters in the contract sit
on operations that declare 400, so the MALFORMED_REQUEST this produces is inside
each operation's declared set (CL-09's principle, applied to parameters). The fix
is in `src/middleware/validate.ts`, which the SMS-15 manifest already lists under
`"touches"` — it existed at the test commit and is only modified, so
`check:test-first` is unaffected.

**Also removed, not a defect: two unused exports.** `normaliseAvailability` was
never called — the route persists the body as validated, and the schema already
enforces `HH:MM` — and `isValidWindow` in `lib/time.ts` was imported by
`lib/availability.ts` and unused there; when `hasOnlyValidWindows` was removed
from `lib` so `modules/availability/rules.ts` became the single source, the import
stayed and `rules.ts` re-spelled the comparison inline. `rules.ts` now calls
`isValidWindow` and `lib` no longer imports it. No assertion changed; 156 stayed
156 throughout.

## 5. Log records written for those requests

The fifteen records of the control run, taken from
`logs/runtime/app-2026-11-09.jsonl` and isolated by their `ts` window
(`12:48:53`) and their `traceId`s:

```
{"ts":"2026-11-09T12:48:53.793Z","level":"info","event":"http.request","traceId":"0ab01973-9052-4612-8e6e-a6a09457318c","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":58.566472}
{"ts":"2026-11-09T12:48:53.827Z","level":"info","event":"http.request","traceId":"0c2969de-8386-40e5-ba26-8066b2ca89c5","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":28.470914}
{"ts":"2026-11-09T12:48:53.841Z","level":"info","event":"http.request","traceId":"0a7e6014-40d6-46e5-a6a6-099928ce3e08","method":"POST","path":"/api/v1/admin/services","status":201,"durationMs":11.191425}
{"ts":"2026-11-09T12:48:53.846Z","level":"info","event":"http.request","traceId":"8c435386-722c-4697-83dc-1aa8fdd51ed5","method":"POST","path":"/api/v1/admin/services","status":201,"durationMs":2.725038}
{"ts":"2026-11-09T12:48:53.854Z","level":"info","event":"http.request","traceId":"7d33e064-bc07-4c63-971f-8dc866bf6ecf","method":"GET","path":"/api/v1/me/availability","status":200,"durationMs":5.883202}
{"ts":"2026-11-09T12:48:53.862Z","level":"info","event":"http.request","traceId":"18238d27-4db4-4673-b82a-8176d84430bf","method":"GET","path":"/api/v1/masters/{masterId}/availability","status":200,"durationMs":5.561774}
{"ts":"2026-11-09T12:48:53.868Z","level":"info","event":"http.request","traceId":"4a65fd1a-9e52-40b0-bfc6-86530d7be6c8","method":"PUT","path":"/api/v1/me/availability","status":200,"durationMs":4.032691}
{"ts":"2026-11-09T12:48:53.885Z","level":"info","event":"http.request","traceId":"a84dbfdd-47a4-41e6-994b-39b62bbf7aa3","method":"GET","path":"/api/v1/masters/{masterId}/availability","status":200,"durationMs":14.663622}
{"ts":"2026-11-09T12:48:53.890Z","level":"info","event":"http.request","traceId":"51d9ae3a-0b63-4f11-a76a-d97f4bfa6206","method":"GET","path":"/api/v1/masters/{masterId}/availability","status":200,"durationMs":3.286723}
{"ts":"2026-11-09T12:48:53.894Z","level":"warn","event":"http.request","traceId":"a4cd75d3-cb0d-455c-9681-39890eb02903","method":"GET","path":"/api/v1/me/availability","status":403,"durationMs":0.689985}
{"ts":"2026-11-09T12:48:53.896Z","level":"warn","event":"http.request","traceId":"cdb5c3ce-b445-4f02-9321-ace22b5be0aa","method":"GET","path":"/api/v1/me/availability","status":401,"durationMs":0.154631}
{"ts":"2026-11-09T12:48:53.902Z","level":"info","event":"http.request","traceId":"bc079b0f-b3ce-4fb9-82e5-8dbee1976b5d","method":"PUT","path":"/api/v1/me/availability","status":200,"durationMs":4.573644}
{"ts":"2026-11-09T12:48:53.905Z","level":"info","event":"http.request","traceId":"c468de7f-48ab-48eb-a2a4-e6285ea049ba","method":"GET","path":"/api/v1/me/availability","status":200,"durationMs":1.455561}
{"ts":"2026-11-09T12:48:53.911Z","level":"info","event":"http.request","traceId":"bd7d47cb-60e1-405d-a54a-dfb507ff2b24","method":"PUT","path":"/api/v1/me/availability","status":200,"durationMs":3.163595}
{"ts":"2026-11-09T12:48:53.913Z","level":"warn","event":"http.request","traceId":"3f4cbe2b-6dc4-4232-a625-cacfa80aa5dc","method":"GET","path":"/api/v1/masters/{masterId}/availability","status":400,"durationMs":0.249712}
```

**Correlation.** Fifteen records, fifteen distinct `traceId`s, one per request
the script issued. The 403 record's `traceId` (`a4cd75d3…`) is the one in the
response body quoted in §2, so the body's id and the record's agree — and it is a
*different* id from the pre-fix 403 quoted in §4(a) (`edea7c50…`), which is what
distinguishes the two runs in the log.

**The template, not the path.** Every `/api/v1/masters/{masterId}/availability`
record carries the contract template with the concrete master id nowhere in the
record — four records here, all templated, including the 400. That is the
runs-02 §4 fix holding for a parameterised path under a real socket.

**Level mapping.** `200/201 → info`; `400/401/403 → warn`. No `error` record was
written, because no request in this window produced a 5xx — which is the
after-state of §4(c)'s 500. The window cannot show the 500 directly; what it
shows is that the same request is now a 400.

**No credential material.** The record schema is
`ts, level, event, traceId, method, path, status, durationMs`: no headers, no
body, no query. The master's and administrator's bearer tokens appear in no
record, and neither does the `date` or `serviceIds` query string.

## 6. Not established by this run

**Overlapping windows remain undefined.** Nothing in this run exercises two
weekly rules on one weekday, because no document says what they mean (gate §5
G4). The implementation enumerates both windows in supplied order and
de-duplicates identical starts, which is the minimum needed to answer at all;
that choice is recorded as a *decision* in `tdd-SMS-24.md` §11, not as a finding.
This run neither confirms nor refutes any reading of overlap, because it never
produces one.

**P7's declared 422 was never reached, and must not be.** No request here has an
input for it (gate §5 G13). The 400 in §2 is a *type* failure, the 404s are
unknown ids, and no service-master pairing or booking conflict was attempted —
inventing a trigger would be the one thing the gate forbids.

**The development database.** Not migrated and not queried during this run.
Nothing here says what it contains.

**`available: false` and appointment subtraction.** No slot here is unavailable
and none is subtracted, because `appointments` does not exist until S2.1
(gate §4.4, §5 G2/G12). Every `available` in §2 is `true` by construction, not by
checking anything.

**The DST gap.** Both dates are far from a transition. A window spanning
2027-03-28's skipped 03:00–04:00 is not exercised (gate §5 G7).

## 7. Open items

1. **Built-artifact coverage is still a control run, not a test.** Fourth
   occurrence (runs-01 §4, runs-02 §5, runs-03 §7). §4(a) is a fresh argument for
   closing it: the role gate's status was asserted by the suite and correct,
   while the sentence beside it was wrong, and only reading the built body
   showed it.
2. **The control-run script is still not committed** (`logs/runtime/`, ignored).
   Unchanged from runs-03 §7.
3. **The `detail` text of a Problem is asserted nowhere.** §4(a) could regress
   silently. Pinning it per operation would be a test of prose, which the S1.x
   gates have deliberately avoided; recording it here is the cheaper alternative,
   and the map's exhaustiveness catches the structural half of the change.
