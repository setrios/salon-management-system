# Control run 07 — S2.3 client cancellation (SMS-27)

| Field | Value |
|---|---|
| Run | 07 |
| Date | 2026-11-12 |
| Stage | S2.3 |
| Ticket | SMS-27 (implementation for SMS-27) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-12-test-SMS-27.md` (`SIGNED — GO`, `ba1d655`) |
| Code | `src/modules/appointments/{state,routes,service}.ts`, `src/routes.ts` |
| Log file | `logs/runtime/app-2026-11-12.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc -p tsconfig.json --noEmit                     exit 0
$ npm run build                                         exit 0
$ npm test                                              248 passed (248), exit 0
$ npm test                                              248 passed (248), exit 0
$ npm test -- --sequence.shuffle                        248 passed (248), exit 0
$ npm run check:test-first                              10/10 entries pass, exit 0
$ git diff --stat tests/                                (empty)
```

Two unshuffled runs and one shuffled run, as the gate's §9 requires. The
shuffled seed printed was `1794508226009`; it printed `Tests 248 passed (248)`.

The suite is **248 before this stage and 248 after**: no test file was added,
removed or edited during GREEN. `git diff --stat tests/` is empty, which is the
gate's evidence item 7 read from the tree rather than from a claim. The 8 cases
of this stage were committed with the `test:` commit `19cd83a`, before the gate
was signed, and nothing under `tests/` has changed since.

The control run in §2 runs against a **scratch database** created for the run and
dropped afterwards, so "fresh installation" is literal: the migrator applies
`0000`–`0004` to an empty database and nothing else writes the schema. Same
arrangement as runs-03 §1, runs-04 §1, runs-05 §1 and runs-06 §1.

## 2. Requests and responses — built artifact

The control run used `dist/` (`node` importing `dist/src/app.js`) after
`npm run build`, not the TypeScript sources — the S1.0 finding (runs-01 §4): the
in-process suite cannot see packaging defects. The application listens on an
ephemeral port and is driven over HTTP, not through supertest. The script is
`logs/runtime/s23-control-run.mjs`, uncommitted for the reason runs-03 §7 gives.

**`createApp()` is called with no argument**, the shape `index.ts` uses (D9): the
clock has a default and the server is judged against real time.

```
scratch database created: salon_s23_control_test
tables after migration: appointment_services, appointments, availability_dates,
                        availability_weekly, categories, master_services,
                        masters, materials, notifications, services

service created: 201
M4 PUT: 200

--- P8 POST /api/v1/appointments, no token (expect 201) ---
status: 201 | id: 48380e25-14d9-4732-93d3-6daffdd74423 | status: confirmed

--- P10 POST /api/v1/appointments/{token}/cancel, no Authorization header ---
status: 200 | content-type: application/json; charset=utf-8
body: {"id":"48380e25-14d9-4732-93d3-6daffdd74423","status":"cancelled",
       "startAt":"2026-12-07T10:00:00+02:00",
       "totalPrice":{"amountMinor":45000,"currency":"UAH"},
       "accessTokenEqualsBooking":true,
       "updatedAt":"2026-11-12T20:32:00+02:00"}

--- P10, the same cancellation again (expect 200, unchanged) ---
status: 200 | content-type: application/json; charset=utf-8
updatedAt: 2026-11-12T20:32:00+02:00
bodyEqualsFirst: true

--- P8, a second booking (expect 201) ---
status: 201 | id: ddc84238-017c-4645-9eaa-8a41857a062b

--- P10 for a completed record (expect 409) ---
status: 409 | code: INVALID_STATE_TRANSITION
read back: 200 | status: completed

--- P8, a third booking at 14:00 (expect 201) ---
status: 201 | id: 9dd73e68-c454-47c7-84e8-14546434b32b
P7 before cancellation offers 14:00: false
P10 status: 200 | status: cancelled
P7 after cancellation offers 14:00: true
P8 at the freed slot: 201 | new id: 33ad2c26-86ad-46cb-9782-2bb5c186b288
id differs from the cancelled booking: true

--- Notifications for the cancelled booking ---
R24 status: 200 | total: 1
rows by predicate: [{"audience":"client","event_type":"new","channel":"sms","status":"sent","total":1}]
cancellation rows by audience: []
cancellation rows for client: 0
cancellation rows for master: 0
cancellation rows for admin: 0

P10 for an unknown uuid: 404 | code: NOT_FOUND
P10 for a non-uuid token: 404 | code: NOT_FOUND

scratch database dropped: salon_s23_control_test
```

## 3. What each request establishes

**`P10` with no `Authorization` header at all — 200, `status: cancelled`, the
same id, the same token, the same price.** The contract declares P10
`security: []`; a supertest assertion says the middleware chain does not demand a
token, and this says the *built* router does not either. `accessTokenEqualsBooking:
true` is the comparison the script performs against the 201 body: the credential
a client was given at booking is the credential that cancels the record
(REQ-F-006, REQ-NF-001). The body is the same `Appointment` shape P8's 201 and
P9's 200 return, because all three are produced by one mapper (`view.ts`) — the
200 cannot drift from the read that follows it by construction.

**`P10` again — 200, `bodyEqualsFirst: true`, `updatedAt` still
`2026-11-12T20:32:00+02:00`.** This is F1's first cell and F5 together: the
repeat answers the current state and writes nothing. The comparison is the whole
body, not only the status, and the `updatedAt` is the first cancellation's
instant — a second write would have moved it. `resource-model.md:165` and
`error-model.md` §3.1 say the same thing in prose.

**`P10` for a `completed` record — 409 `INVALID_STATE_TRANSITION`, and a read
back still shows `completed`.** F1's second cell. The state was arranged out of
band with one `update`, because the operation that produces it is R23 (S5.3 /
SMS-34); the read-back is what shows the refusal wrote nothing. This is the only
reachable trigger of P10's 409.

**The slot chain — P7 before `false`, P10 200, P7 after `true`, P8 201 with a new
id.** `resource-model.md` §4: only `cancelled` frees a block. The "before" read
is what makes the "after" meaningful: without it, "the slot is offered" could be
a slot that was never taken. The rebooking's id differs from the cancelled
booking's, so the 201 is a new record, not a replay. The machine behind it is the
partial unique index `appointments_master_start_unique` (`where status <>
'cancelled'`), which the migrator built from `0003_booking.sql`.

**No `cancellation` row for any audience — `[]`, and 0 for `client`, `master`
and `admin`.** SRS v1.3 lines 253–256: "No additional SMS is sent specifically
for cancellation — the client sees the updated status on the confirmation page."
Lines 397–400 assign the master's and administrator's cancellation alerts to the
notification service (SMS-30). The booking's own `client`/`new`/`sms`/`sent` row
is still there and is the only row (`total: 1`), so the absence is not an empty
table.

**`P10` for an unknown uuid — 404, and for a non-uuid token — 404.** The first is
the contract's declared 404. The second is E6's mirror: P10 declares no 400, so
the shared parameter rule takes the 404 branch instead of `MALFORMED_REQUEST`.

## 4. Defects

**None was found during GREEN.** The suite was 248/248 on its first run against
the implementation, and it stayed 248/248 across two unshuffled and one shuffled
run. No test file was touched after the `test:` commit, so no separate `test:`
commit follows the `feat:` one.

**One defect was found producing RED, in the tests, and fixed before the gate.**
K4 and K5 expect 404, and the unmounted route also answers 404, so their first
draft was green at RED for the wrong reason. They were rewritten to cancel a real
record first and assert that 200 before the 404. The file's case count did not
move (8 before and after), but the failure count did: 6 failed and 2 passed
before the fix, 8 failed after it. It is named in `tdd-SMS-27.md` §3 and gate §6,
and it is inside the `test:` commit `19cd83a`.

## 5. Log records written for those requests

The complete control run, taken from `logs/runtime/app-2026-11-12.jsonl` and
isolated by its `ts` window (`18:32:04` UTC — one run, 187 ms end to end):

```
{"ts":"2026-11-12T18:32:04.261Z","level":"info","event":"http.request","traceId":"31bf535b-3a52-4d72-b017-13f72552146a","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":62.975671}
{"ts":"2026-11-12T18:32:04.294Z","level":"info","event":"http.request","traceId":"d8cc3d79-bd25-4070-ac98-560d64e542d3","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":27.344339}
{"ts":"2026-11-12T18:32:04.304Z","level":"info","event":"http.request","traceId":"abef7d71-9b89-4568-afdf-43a5061fb6ec","method":"POST","path":"/api/v1/admin/services","status":201,"durationMs":8.482377}
{"ts":"2026-11-12T18:32:04.314Z","level":"info","event":"http.request","traceId":"700d7295-4480-4129-b31d-fe2bd5b4269a","method":"POST","path":"/api/v1/admin/master-services","status":201,"durationMs":7.07234}
{"ts":"2026-11-12T18:32:04.325Z","level":"info","event":"http.request","traceId":"c4a91c27-b078-4399-bed7-6c5684a125d7","method":"PUT","path":"/api/v1/me/availability","status":200,"durationMs":8.495863}
{"ts":"2026-11-12T18:32:04.361Z","level":"info","event":"http.request","traceId":"606a9769-245f-4c35-8688-d87738f28eab","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":34.640979}
{"ts":"2026-11-12T18:32:04.370Z","level":"info","event":"http.request","traceId":"dd00e393-7a09-47fc-8669-e1f3f65d9967","method":"POST","path":"/api/v1/appointments/{token}/cancel","status":200,"durationMs":5.869142}
{"ts":"2026-11-12T18:32:04.375Z","level":"info","event":"http.request","traceId":"904af999-1ea0-437c-9689-3351dbe5875c","method":"POST","path":"/api/v1/appointments/{token}/cancel","status":200,"durationMs":3.136135}
{"ts":"2026-11-12T18:32:04.385Z","level":"info","event":"http.request","traceId":"dde820a6-4457-456c-8c32-fd88e7ed8c73","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":7.937532}
{"ts":"2026-11-12T18:32:04.392Z","level":"warn","event":"http.request","traceId":"f828c1c0-cd69-4897-b2e0-3ca2a6466ab4","method":"POST","path":"/api/v1/appointments/{token}/cancel","status":409,"durationMs":1.054522}
{"ts":"2026-11-12T18:32:04.397Z","level":"info","event":"http.request","traceId":"d73e48ba-292d-4113-a128-16fd932d4c98","method":"GET","path":"/api/v1/appointments/{token}","status":200,"durationMs":3.229751}
{"ts":"2026-11-12T18:32:04.406Z","level":"info","event":"http.request","traceId":"075d455e-0d55-4a06-a69b-509a6dbbb345","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":6.586086}
{"ts":"2026-11-12T18:32:04.415Z","level":"info","event":"http.request","traceId":"5c8ad11d-9350-4ec0-a0b4-6d03a4159815","method":"GET","path":"/api/v1/masters/{masterId}/availability","status":200,"durationMs":7.638697}
{"ts":"2026-11-12T18:32:04.421Z","level":"info","event":"http.request","traceId":"fa29bf69-7f66-4280-8cfc-ade7c31f68a4","method":"POST","path":"/api/v1/appointments/{token}/cancel","status":200,"durationMs":3.911023}
{"ts":"2026-11-12T18:32:04.428Z","level":"info","event":"http.request","traceId":"76815f0b-1583-4f0e-a770-a22191e9effe","method":"GET","path":"/api/v1/masters/{masterId}/availability","status":200,"durationMs":4.761649}
{"ts":"2026-11-12T18:32:04.436Z","level":"info","event":"http.request","traceId":"286d32c2-eba1-41c6-a71d-f2fc6a0497dd","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":6.083985}
{"ts":"2026-11-12T18:32:04.443Z","level":"info","event":"http.request","traceId":"89b8e679-8306-4494-b5fb-f35a12e7497e","method":"GET","path":"/api/v1/admin/appointments/{appointmentId}/notifications","status":200,"durationMs":4.857744}
{"ts":"2026-11-12T18:32:04.445Z","level":"warn","event":"http.request","traceId":"232bb44f-0e54-4ab2-88d4-caa0e18cc576","method":"POST","path":"/api/v1/appointments/{token}/cancel","status":404,"durationMs":0.85046}
{"ts":"2026-11-12T18:32:04.448Z","level":"warn","event":"http.request","traceId":"1af84a4e-7504-4094-863a-8ab0401549fc","method":"POST","path":"/api/v1/appointments/{token}/cancel","status":404,"durationMs":0.298232}
```

Nineteen records in 187 ms, in the order §2 issued them. Neither the request
records nor the responses carry a client phone, an access token or a concrete
master id — the logger writes the contract template, as S1.0 established. The
two `200`s at `.370` and `.375` are the cancellation and its repeat; the `409` at
`.392` is the completed record; the `404`s at `.445` and `.448` are the unknown
uuid and the non-uuid token.

**The `updatedAt` in §2 and this window are the same instant.** `20:32:00+02:00`
is `18:32:04Z` written by `salonDateTime`, which rounds to the minute
(`Math.round` on minutes-from-midnight) — the convention every timestamp in this
API has used since S1.2. The 4-second difference is representation, not a second
event.

## 6. The state table in the code

`src/modules/appointments/state.ts` is the whole of `error-model.md` §3.1 and
nothing else: the three statuses, the three actions, one cell per pair, and
`stateOutcome(status, action)`. It imports nothing from `src/db/`, reads no
clock, and performs no I/O — the gate's §1.3 condition, and the reason
`check:test-first` can prove its ordering.

P10 uses one column of it:

```
confirmed → { kind: 'transition', to: 'cancelled' }   // one guarded update
cancelled → { kind: 'unchanged' }                     // no write, re-read
completed → { kind: 'rejected', code: 'INVALID_STATE_TRANSITION' }
```

The other two columns are present because the table is one table: `complete` is
R23 (S5.3 / SMS-34) and `edit` is R21 (S5.1 / SMS-32). Splitting it by stage
would be three copies of one normative source.

## 7. The two halves of "unchanged"

- **The guard** — `service.ts`, `cancelByToken`: the `update` is
  `.where(and(eq(appointments.id, current.id), eq(appointments.status,
  'confirmed')))`. A concurrent cancellation that wins the race leaves this one
  with zero rows instead of writing a second `updated_at`; the re-read then
  answers the state the winner wrote, which is the same 200 the table gives a
  repeat. The guard is the table's own precondition, so the two cannot disagree.
- **The re-read** — `findByToken(token)` after the update (or after no update),
  mapped by `appointmentBody` from `view.ts`. There is no second mapper: the
  cancellation's 200 and P9's 200 are the same function over the same row, which
  is why §2's `bodyEqualsFirst` is a meaningful comparison rather than a
  coincidence.

The suite proves both: K2 by the whole body under a later clock, K3 by the
read-back after the 409. The control run proves the same two from outside the
process, on the built artifact.

## 8. Not established by this run

- **`reminders[]` of a cancelled record.** F2 = (b): the field is computed as
  before (`scheduled` for a future reminder), and nothing here claims it is
  right. The contract's P10 example shows `skipped`; SRS v1.3 is silent; D-11
  sends the decision to an addendum. Register row 10, owner addendum SMS-45.
- **A cancellation message to master or administrator.** SRS line 400 assigns it
  to the notification service (SMS-30). §2 shows the absence, not the future
  message.
- **`completeAppointment` (R23).** The `completed` state in §2 was arranged with
  one `update`; the operation that produces it is S5.3 / SMS-34, and that
  `update` is the direct write R23 replaces.
- **Two simultaneous cancellations of one record.** The guard makes the outcome
  one 200 and one write, but the run is sequential; the race is not exercised.
- **A cancellation fee.** No field carries one; REQ-F-006's "free of charge" is
  observed as "the price the booking reported is the price the cancelled record
  reports".
- **The development database was not migrated.** No migration exists in this
  stage; the scratch database was built from `0000`–`0004` and dropped.

## 9. Open items

1. **Nothing is committed.** The `feat:` commit for SMS-27 is the human's act,
   and this run describes the working tree as it stands for it. The files it
   covers are the three modified (`src/modules/appointments/routes.ts`,
   `src/modules/appointments/service.ts`, `src/routes.ts`) and the one new
   (`src/modules/appointments/state.ts`).
2. **Register row 3 is reduced, not closed.** The `cancel` column of the §3.1
   table is closed at the resource level by P10; `complete` (R23, SMS-34) and
   `PATCH` (R21, SMS-32) remain, and the administrator's cancel
   (`cancelAppointmentAdmin`, S5.1 / SMS-32) is a separate operation that will
   reuse the same table.
3. **Register row 10 — `reminders[]` of a cancelled record** is the addendum
   candidate (SMS-45): SRS silent, contract suggestive, code different.
