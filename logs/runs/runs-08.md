# Control run 08 — S3.1 client reschedule (SMS-28)

| Field | Value |
|---|---|
| Run | 08 |
| Date | 2026-11-12 |
| Stage | S3.1 |
| Ticket | SMS-28 (implementation for SMS-10) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-12-test-SMS-28.md` (`SIGNED — GO`, `4e5581f`; §1.4 added after signature, `0a85741`) |
| Code | `src/modules/appointments/{reschedule,rules,routes,service}.ts` |
| Log file | `logs/runtime/app-2026-11-12.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc -p tsconfig.json --noEmit                     exit 0
$ npm run build                                         exit 0
$ npm test                                              269 passed (269), exit 0
$ npm test                                              269 passed (269), exit 0
$ npm test -- --sequence.shuffle                        269 passed (269), exit 0
$ npm run check:test-first                              11/11 entries pass, exit 0
$ git diff --stat tests/                                (empty)
```

Two unshuffled runs and one shuffled run, as the gate's §9 requires. The
shuffled run printed `Tests 269 passed (269)`.

The suite is **248 before this stage and 269 after**: 21 cases were added by the
`test:` commit `cc86246` (18 in `reschedule.test.ts`, 3 in `booking.test.ts`),
and none was removed. `git diff --stat tests/` is empty, which is the gate's
evidence item read from the tree rather than from a claim.

**One test file changed after `cc86246`, in its own `test:` commit `0a85741`.**
K8 in `cancellation.test.ts` arranged its record by booking a past start through
P8, which CL-11 now refuses. The arrangement was changed to book a future record
and move it into the past out of band; the assertion and the case count did not
move. The gate records this in §1.4. It is the only test change since the test
commit, and it is committed, not in the working tree.

The control run in §2 runs against a **scratch database** created for the run and
dropped afterwards, so "fresh installation" is literal: the migrator applies
`0000`–`0004` to an empty database and nothing else writes the schema. Same
arrangement as runs-03 §1, runs-04 §1, runs-05 §1, runs-06 §1 and runs-07 §1.

## 2. Requests and responses — built artifact

The control run used `dist/` (`node` importing `dist/src/app.js`) after
`npm run build`, not the TypeScript sources — the S1.0 finding (runs-01 §4): the
in-process suite cannot see packaging defects. The application listens on an
ephemeral port and is driven over HTTP, not through supertest. The script is
`logs/runtime/s31-control-run.mjs`, uncommitted for the reason runs-03 §7 gives.

**`createApp()` is called with no argument**, the shape `index.ts` uses (D9): the
clock has a default and the server is judged against real time.

```
scratch database created: salon_s31_control_test
tables after migration: appointment_services, appointments, availability_dates,
                        availability_weekly, categories, master_services,
                        masters, materials, notifications, services

service created: 201
M4 PUT: 200 for both masters

--- P8 POST /api/v1/appointments, no token (expect 201) ---
status: 201 | id: 4da2d538-399b-46bb-a6c4-db281969b4c6 | status: confirmed

--- P11 POST /api/v1/appointments/{token}/reschedule, no Authorization header ---
status: 200 | content-type: application/json; charset=utf-8
body: {"id":"4da2d538-399b-46bb-a6c4-db281969b4c6","status":"confirmed",
       "startAt":"2026-12-07T14:00:00+02:00","endAt":"2026-12-07T14:30:00+02:00",
       "totalPrice":{"amountMinor":45000,"currency":"UAH"},
       "sameId":true,"sameToken":true,
       "updatedAt":"2026-11-12T22:52:00+02:00"}
P9 read back: 200 | startAt: 2026-12-07T14:00:00+02:00

--- Notifications for the rescheduled booking ---
R24 status: 200 | total: 2
rows by predicate: [{"audience":"client","event_type":"new","channel":"sms","status":"sent","total":1},
                   {"audience":"client","event_type":"reschedule","channel":"sms","status":"sent","total":1}]

--- P11 to another master (expect 200, re-priced) ---
status: 200 | master: {"id":"a8b99f74-5df7-493f-9534-220b7a7c1cff","fullName":"master-b-s31"}
           | totalPrice: {"amountMinor":55000,"currency":"UAH"}

--- P8, a second booking at 12:00 (expect 201) ---
status: 201 | id: 2b3a3666-b903-4e4c-8a3f-409e4588a1d3

--- P11 to a taken slot (expect 409 SLOT_UNAVAILABLE) ---
status: 409 | code: SLOT_UNAVAILABLE
read back startAt: 2026-12-07T16:00:00+02:00

--- P11 outside availability (expect 409 SLOT_UNAVAILABLE) ---
status: 409 | code: SLOT_UNAVAILABLE

--- P11 for a cancelled record (expect 409 INVALID_STATE_TRANSITION) ---
status: 409 | code: INVALID_STATE_TRANSITION

--- P11 for a completed record (expect 409 INVALID_STATE_TRANSITION) ---
status: 409 | code: INVALID_STATE_TRANSITION

--- P11 with a past startAt (expect 422 BUSINESS_RULE_VIOLATION) ---
status: 422 | code: BUSINESS_RULE_VIOLATION

--- P8 with a past startAt (expect 422 BUSINESS_RULE_VIOLATION) ---
status: 422 | code: BUSINESS_RULE_VIOLATION

P11 for an unknown uuid: 404 | code: NOT_FOUND
P11 for a non-uuid token: 400 | code: MALFORMED_REQUEST
P11 with no startAt: 422 | code: VALIDATION_ERROR
P11 with an unknown property: 422 | code: VALIDATION_ERROR
P11 with a text/plain body: 415 | code: UNSUPPORTED_MEDIA_TYPE

scratch database dropped: salon_s31_control_test
```

## 3. What each request establishes

**`P11` with no `Authorization` header at all — 200, `status: confirmed`, the
same id, the same token, the new time.** The contract declares P11
`security: []`; a supertest assertion says the middleware chain does not demand a
token, and this says the *built* router does not either. `sameId: true` and
`sameToken: true` are the comparisons the script performs against the 201 body:
the reschedule updates the record the client already holds, and creates no new
appointment (SRS v1.3:371, G10). The body is the same `Appointment` shape P8's
201, P9's 200 and P10's 200 return, because all four are produced by one mapper
(`view.ts`).

**`P9` read back — 200, `startAt: 2026-12-07T14:00:00+02:00`.** The move is
visible through the read that follows it, and the read is by the same token, so
the credential did not change.

**R24 — `total: 2`, one `new` and one `reschedule`, both `client`/`sms`/`sent`.**
REQ-F-009: exactly one reschedule SMS per successful reschedule. The booking's
own confirmation row is still there, so the reschedule row is an addition, not a
replacement. There is no unique index for `reschedule`, because REQ-F-007 allows
any number of reschedules (G6).

**A master change — 200, `master-b-s31`, `totalPrice` 55000.** The record was
booked with master A at 45000 and moved to master B, whose link is 55000. The
price follows the new master's link, not the old snapshot (G8; `MasterService`
carries "that master's individual price", SRS:363–365).

**A taken slot — 409 `SLOT_UNAVAILABLE`, and the read back still shows 16:00.**
The second booking occupies 12:00; the reschedule to 12:00 is refused and writes
nothing. The read-back is what shows the refusal left the record where it was.
The check ran inside the transaction under the advisory lock on the new master
(D2, G5); the partial unique index is the backstop.

**A start outside availability — 409 `SLOT_UNAVAILABLE`.** 09:00 is before the
master's 10:00 window. The same `startOffered` P8 uses answers it, so P7 and P11
cannot disagree about what is bookable.

**A `cancelled` record and a `completed` record — 409
`INVALID_STATE_TRANSITION`.** `error-model.md` §3.1's `edit` column, read through
`state.ts` (G2). The completed record was arranged out of band with one `update`,
because the operation that produces it is R23 (S5.3 / SMS-34). The state check
precedes the slot check, so a cancelled record on a taken slot answers 409
`INVALID_STATE_TRANSITION`, not `SLOT_UNAVAILABLE` — the gate's §3 order.

**A past `startAt` — 422 `BUSINESS_RULE_VIOLATION` on P11 and on P8.** CL-11's
one rule, `rules.ts`'s `startInPast`, called by both handlers. The Thursday
08:30 start is inside the master's 08:00–18:00 window and on the boundary, so
the refusal is the clock's, not the window's. This is the row G2 register row 4
closed.

**The declared 400/404/415/422 answers.** An unknown uuid is 404 `NOT_FOUND`; a
non-uuid token is 400 `MALFORMED_REQUEST`, because P11 declares 400 (unlike P9
and P10, which declare no 400 and answer 404); a missing `startAt` and an
unknown property are 422 `VALIDATION_ERROR` (`AppointmentReschedule` is closed,
D-22); a `text/plain` body is 415 `UNSUPPORTED_MEDIA_TYPE`.

## 4. Defects

**One defect was found during GREEN, in a pre-existing test, and fixed before
this run.** K8 in `cancellation.test.ts` booked a past start through P8, which
CL-11 now refuses. The case is about P10, not about P8's acceptance, so its
arrangement changed: book a future record, move it into the past with one
`update` through `getPool()` (the way K3 arranges `completed`), then cancel. The
`startAt < NOW` assertion moved to the cancellation response. The F7 comment in
the file header, which stated that P8 accepts a past start, was corrected. The
change is `0a85741`; the case count did not move (269 before and after), and K8
was green before and after. The gate records it in §1.4.

**No defect was found in the new code.** The suite was 269/269 on its first run
against the implementation, and it stayed 269/269 across two unshuffled and one
shuffled run.

## 5. Log records written for those requests

The complete control run, taken from `logs/runtime/app-2026-11-12.jsonl` and
isolated by its `ts` window (`20:51:32.884`–`20:51:33.144` UTC — one run, 260 ms
end to end):

```
{"ts":"2026-11-12T20:51:32.884Z","level":"info","event":"http.request","traceId":"90dba59a-3d9a-4c68-a1b9-13d573d3f3f7","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":68.288674}
{"ts":"2026-11-12T20:51:32.921Z","level":"info","event":"http.request","traceId":"3711c08d-cf29-41ea-9818-c19b7b9f2e10","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":30.170897}
{"ts":"2026-11-12T20:51:32.954Z","level":"info","event":"http.request","traceId":"a8d2dc77-3a1d-4a82-aefc-ff5f5b77529e","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":30.795231}
{"ts":"2026-11-12T20:51:32.965Z","level":"info","event":"http.request","traceId":"c11211d7-1554-45a7-b0c9-6a08ca2fe8e6","method":"POST","path":"/api/v1/admin/services","status":201,"durationMs":8.702948}
{"ts":"2026-11-12T20:51:32.972Z","level":"info","event":"http.request","traceId":"cf8a8cdd-e462-4971-8619-986c9a37af2f","method":"POST","path":"/api/v1/admin/master-services","status":201,"durationMs":6.217745}
{"ts":"2026-11-12T20:51:32.976Z","level":"info","event":"http.request","traceId":"6e471e6c-025e-4a4a-b2cc-e0136de80be6","method":"POST","path":"/api/v1/admin/master-services","status":201,"durationMs":2.163078}
{"ts":"2026-11-12T20:51:32.987Z","level":"info","event":"http.request","traceId":"9ce404ce-be38-449b-a8e5-ee00b212e367","method":"PUT","path":"/api/v1/me/availability","status":200,"durationMs":8.541583}
{"ts":"2026-11-12T20:51:32.993Z","level":"info","event":"http.request","traceId":"bbf462ca-a90e-4b35-a039-16a41f3a4876","method":"PUT","path":"/api/v1/me/availability","status":200,"durationMs":3.400452}
{"ts":"2026-11-12T20:51:33.033Z","level":"info","event":"http.request","traceId":"862d04ab-c4f5-421c-9119-66d61429d952","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":37.567669}
{"ts":"2026-11-12T20:51:33.051Z","level":"info","event":"http.request","traceId":"2a288a06-434d-4ac3-b057-2e53f0eac414","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":200,"durationMs":15.091604}
{"ts":"2026-11-12T20:51:33.055Z","level":"info","event":"http.request","traceId":"1aaf5679-a710-4c4d-9014-f5b6032104af","method":"GET","path":"/api/v1/appointments/{token}","status":200,"durationMs":2.927787}
{"ts":"2026-11-12T20:51:33.063Z","level":"info","event":"http.request","traceId":"e8d8ff48-5b4b-47f2-9fd3-eaf78d55eaf5","method":"GET","path":"/api/v1/admin/appointments/{appointmentId}/notifications","status":200,"durationMs":5.872996}
{"ts":"2026-11-12T20:51:33.074Z","level":"info","event":"http.request","traceId":"7812b2cc-975d-46e9-881d-e87d77e7d496","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":200,"durationMs":9.012595}
{"ts":"2026-11-12T20:51:33.083Z","level":"info","event":"http.request","traceId":"90c7db05-7a55-4b33-8eb4-a43ec52f34af","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":6.826467}
{"ts":"2026-11-12T20:51:33.090Z","level":"warn","event":"http.request","traceId":"6efc07ee-bd73-4b21-954c-3e34fe605769","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":409,"durationMs":4.591479}
{"ts":"2026-11-12T20:51:33.094Z","level":"info","event":"http.request","traceId":"6ce80ee4-52dc-48e8-a842-3ab2a4485926","method":"GET","path":"/api/v1/appointments/{token}","status":200,"durationMs":2.779649}
{"ts":"2026-11-12T20:51:33.100Z","level":"warn","event":"http.request","traceId":"22bd39fd-07e1-4168-9a67-9002b85fd558","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":409,"durationMs":3.855201}
{"ts":"2026-11-12T20:51:33.108Z","level":"info","event":"http.request","traceId":"56e8dd40-8743-4092-899f-754d55734a9e","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":6.71862}
{"ts":"2026-11-12T20:51:33.114Z","level":"info","event":"http.request","traceId":"ca4996fc-cdff-4764-8a4d-f96399e62b52","method":"POST","path":"/api/v1/appointments/{token}/cancel","status":200,"durationMs":4.37994}
{"ts":"2026-11-12T20:51:33.118Z","level":"warn","event":"http.request","traceId":"b1d1c159-de34-43b0-a049-48f7dd49cef7","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":409,"durationMs":1.599119}
{"ts":"2026-11-12T20:51:33.125Z","level":"info","event":"http.request","traceId":"ef6e4371-9945-4a71-9e52-9b2abd806ffb","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":6.867483}
{"ts":"2026-11-12T20:51:33.129Z","level":"warn","event":"http.request","traceId":"f0d558e0-597e-42bc-a27b-4aef73abf955","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":409,"durationMs":1.415778}
{"ts":"2026-11-12T20:51:33.133Z","level":"warn","event":"http.request","traceId":"bf5b7503-f3b3-4a97-947c-a752903348db","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":422,"durationMs":1.257256}
{"ts":"2026-11-12T20:51:33.135Z","level":"warn","event":"http.request","traceId":"4e31297e-927b-4784-affe-b020fa8aea52","method":"POST","path":"/api/v1/appointments","status":422,"durationMs":0.656409}
{"ts":"2026-11-12T20:51:33.138Z","level":"warn","event":"http.request","traceId":"0bc94be4-3002-434d-9374-c31412d73767","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":404,"durationMs":0.957884}
{"ts":"2026-11-12T20:51:33.139Z","level":"warn","event":"http.request","traceId":"fbcbd55f-6074-4ffd-a09c-5a7670f68acf","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":400,"durationMs":0.294765}
{"ts":"2026-11-12T20:51:33.141Z","level":"warn","event":"http.request","traceId":"f61bd47b-e668-428a-87cb-3fd7941e86e1","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":422,"durationMs":0.415248}
{"ts":"2026-11-12T20:51:33.142Z","level":"warn","event":"http.request","traceId":"4c479c52-9c1d-43c7-abf3-cb3c7ead81f4","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":422,"durationMs":0.280052}
{"ts":"2026-11-12T20:51:33.144Z","level":"warn","event":"http.request","traceId":"92c4fb23-7f5c-4712-a480-62d4f02669cb","method":"POST","path":"/api/v1/appointments/{token}/reschedule","status":415,"durationMs":0.286269}
```

Twenty-nine records in 260 ms, in the order §2 issued them. Neither the request
records nor the responses carry a client phone, an access token or a concrete
master id — the logger writes the contract template, as S1.0 established. The
`200` at `.051` is the first reschedule; the `200` at `.074` is the master
change; the `409` at `.090` is the taken slot; the `409` at `.100` is outside
availability; the `409` at `.118` is the cancelled record; the `409` at `.129` is
the completed record; the `422` at `.133` is P11's past start and the `422` at
`.135` is P8's; the `404`/`400`/`422`/`422`/`415` at `.138`–`.144` are the
declared answers.

**The `updatedAt` in §2 and this window are the same instant.** `22:52:00+02:00`
is `20:51:33Z` written by `salonDateTime`, which rounds to the minute
(`Math.round` on minutes-from-midnight) — the convention every timestamp in this
API has used since S1.2. The 27-second difference is representation, not a second
event.

## 6. The decision module

`src/modules/appointments/reschedule.ts` is the whole of P11's decision and
nothing else: the state via `state.ts`, the past via `rules.ts`'s `startInPast`,
the master and coverage checks, and the new lines and totals. It imports no
database, reads no clock, and performs no I/O — the gate's §8 condition, and the
reason `check:test-first` can prove its ordering: the file did not exist at
`cc86246`.

The order is the gate's §3, and it is observable:

```
state   → 409 INVALID_STATE_TRANSITION   (cancelled, completed)
past    → 422 BUSINESS_RULE_VIOLATION    (startAt <= now)
master  → 422 BUSINESS_RULE_VIOLATION    (not active, not role master)
coverage→ 422 BUSINESS_RULE_VIOLATION    (a service the new master does not offer)
slot    → 409 SLOT_UNAVAILABLE           (outside availability, or taken)
```

The two 409s bracket the 422s: the state 409 is about the record, the slot 409 is
about the calendar, and everything between is the body's fault. Only the slot
check runs inside the transaction, under the advisory lock on the new master
(D2), because it is the only answer that can change between the check and the
write.

`service.ts`'s `rescheduleAppointment` carries the decision out: the lock, the
recheck excluding the record itself, the guarded `update` (`status =
'confirmed'`), the `reschedule` row, and the re-read through `findByToken` after
the commit. The guard is the same precondition `state.ts` names, so a concurrent
cancel or complete wins cleanly and the route answers 409 rather than writing
over the winner.
