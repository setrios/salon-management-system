# Control run 05 — S2.1 booking and public catalogue (SMS-25)

| Field | Value |
|---|---|
| Run | 05 |
| Date | 2026-11-12 |
| Stage | S2.1 |
| Ticket | SMS-25 (implementation for SMS-8, SMS-19, SMS-25) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-12-test-SMS-8-19.md` (`SIGNED — GO`, `8a27bc2`) |
| Code | `src/modules/public/{routes,service}.ts`, `src/modules/appointments/{routes,service,rules,reminders}.ts`, `src/lib/{occupancy,availability}.ts`, `src/modules/availability/{routes,service}.ts`, `src/app.ts`, `src/routes.ts`, `src/db/{schema.ts,migrations/0003_booking.sql}` |
| Log file | `logs/runtime/app-2026-11-12.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc -p tsconfig.json --noEmit                     exit 0
$ npm run build                                         exit 0
$ npm run convert:contract                              schemas 58, operations 50
$ npm test                                              223 passed (223), exit 0
$ npm test                                              223 passed (223), exit 0
$ npm test -- --sequence.shuffle                        223 passed (223), exit 0  ×6
$ npm run check:test-first                              7/7 entries pass, exit 0
```

Two unshuffled runs and six shuffled runs, as the gate's §9 requires. The
shuffled run was repeated six times because §4(a) is an order-dependence defect:
a single shuffled pass can be lucky, and the cases the fix touched (the SCN-01
block, the `detail` case, O3) are executed in a different order under each seed.
All six seeds passed. The suite
was 223 before this stage and is 223 after: no test file was added and no case
was added or removed. The two test files that did change (`booking.test.ts`,
`occupancy.test.ts`) changed their *arrangement*, not their count — see §4.

The migration `0003_booking.sql` is applied to the **test** database by
`tests/setup.ts` on every run, so it is exercised by the suite as well as by the
control run below. The development database is **not** migrated by this run and
nothing in it is claimed here: whether the human applies `0003` is a separate
human act, as it was for `0001` and `0002`.

The control run in §2 runs against a **scratch database** created for the run and
dropped afterwards, so a "fresh installation" is literal: the migrator applies
`0000`–`0003` to an empty database and nothing else writes the schema. That is
the same arrangement as runs-03 §1 and runs-04 §1.

## 2. Requests and responses — built artifact

The control run used `dist/` (`node` importing `dist/src/app.js`) after
`npm run build`, not the TypeScript sources — the S1.0 finding (runs-01 §4): the
in-process suite cannot see packaging defects. The application listens on an
ephemeral port and is driven over HTTP, not through supertest. The script is
`logs/runtime/s21-control-run.mjs`, uncommitted for the reason runs-03 §7 gives.

**`createApp()` is called with no argument**, which is the shape `index.ts` uses
and the D9 requirement: the clock has a default, and the running server is judged
against the real time. This is the gate's §9 item 4, and it holds — a 201 came
back from an app built exactly that way.

```
tables after migration: appointment_services, appointments, availability_dates,
                        availability_weekly, categories, master_services,
                        masters, materials, services

appointments indexes:
  CREATE UNIQUE INDEX appointments_access_token_unique ON public.appointments USING btree (access_token)
  CREATE UNIQUE INDEX appointments_master_start_unique ON public.appointments USING btree (master_id, start_at) WHERE (status <> 'cancelled'::text)
  CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id)

services created: 201 201
links created: 201 201

--- P1..P6 without any token ---
P1 listServices       : 200 | items: 2
P2 getService         : 200 | name: S21 Haircut
P3 listCategories     : 200 | count: 3
P4 listMasters        : 200 | items: [{"id":"6a551dab-…","fullName":"master-s21"}]
P5 getMaster          : 200 | body: {"id":"6a551dab-…","fullName":"master-s21"}
P6 listMasterServices : 200 | items: 2
P5 for an administrator id: 404 | code: NOT_FOUND

M4 PUT: 200

--- P7 without any token, before booking ---
status: 200 | content-type: application/json; charset=utf-8
totalDurationMinutes: 75
occupiedDurationMinutes: 90
slot starts: ["2026-12-07T10:00:00+02:00","2026-12-07T10:30:00+02:00",
              "2026-12-07T11:00:00+02:00","2026-12-07T11:30:00+02:00",
              "2026-12-07T12:00:00+02:00", … "2026-12-07T16:30:00+02:00"]

--- P8 POST /api/v1/appointments, no token ---
status: 201 | content-type: application/json; charset=utf-8
location: /api/v1/appointments/2c643009-2b7d-4153-bc6a-bd302e085f5d
body: {"status":"confirmed",
       "startAt":"2026-12-07T10:00:00+02:00",
       "endAt":"2026-12-07T11:30:00+02:00",
       "totalDurationMinutes":75,
       "occupiedDurationMinutes":90,
       "totalPrice":{"amountMinor":85000,"currency":"UAH"},
       "services":[
         {"serviceId":"92503a3e-…","name":"S21 Haircut","baseDurationMinutes":45,
          "price":{"amountMinor":55000,"currency":"UAH"}},
         {"serviceId":"17c2c564-…","name":"S21 Trim","baseDurationMinutes":30,
          "price":{"amountMinor":30000,"currency":"UAH"}}],
       "reminders":[{"type":"24h","scheduledAt":"2026-12-06T10:00:00+02:00","status":"scheduled"},
                    {"type":"2h","scheduledAt":"2026-12-07T08:00:00+02:00","status":"scheduled"}],
       "accessToken":"888d8637-38b8-4d59-9356-32feb11b115c",
       "confirmationUrl":"https://salon.example/appointments/888d8637-38b8-4d59-9356-32feb11b115c"}

--- P7 without any token, after the booking ---
status: 200
slot starts: ["2026-12-07T11:30:00+02:00","2026-12-07T12:00:00+02:00", …]

--- P8 for the same slot again ---
status: 409 | code: SLOT_UNAVAILABLE
detail: The requested slot cannot be booked with this master: it is outside the
        master's availability or overlaps an existing appointment.

--- P8, two simultaneous requests for 15:00 ---
statuses: 201, 409
codes: SLOT_UNAVAILABLE, — (no `code` on a 201 body; that label is the script's)

--- P8, a start off the 30-minute boundary ---
status: 422 | code: BUSINESS_RULE_VIOLATION

non-cancelled appointments in the scratch database: 2
```

## 3. What each request establishes

**`P1`–`P6` with no `Authorization` header at all — 200, and `P8` — 201.** The
six public reads and the one public write are `security: []` in the contract, and
the compiled router mounts them on the unauthenticated path. A supertest
assertion says the middleware chain does not demand a token; this says the
*build* does not either. P5 for the administrator's id answered 404, which is
D10's rejection of a `masters` row that names no bookable master.

**`P8` — 201, with `endAt` 90 minutes after `startAt`, `totalDurationMinutes` 75
and `occupiedDurationMinutes` 90.** This is SCN-13 on the record: the block
reserved is the rounded one, while the summed duration reported is the unrounded
one. `totalPrice.amountMinor` is 85000 — the sum of the two links' prices, not a
function of duration. The two `services[]` entries carry the name, duration and
price as snapshots, and the two reminders are 24 h and 2 h before `startAt`.
`accessToken` is a uuid and `confirmationUrl` carries it, which is REQ-F-004's
link and REQ-NF-001's credential.

**`P7` before and after the booking — 200 both times, and the 10:00/10:30/11:00
starts gone.** The operation's own description says it "filters out booked time",
and it does: the 90-minute block removes three starts, not one. This is what
proves D1 in the built artifact — a booked slot is absent rather than
present-and-false — and it is the same result the suite's O3/O4 assert in
process.

**`P8` again — 409 `SLOT_UNAVAILABLE`.** The detail names both causes the code
covers, which is what B25 compares.

**Two simultaneous requests for 15:00 — 201 and 409.** Issued together over one
socket. The advisory lock serialises the check-then-insert for this master, and
the loser is a business refusal, not a 500. The partial unique index is the
backstop: its violation is mapped to the same 409 in `service.ts`, so a loser is
a 409 whichever half of D2 caught it.

**A start at 13:15 — 422 `BUSINESS_RULE_VIOLATION`.** D3: the boundary is a
property of the request body, refused before any database read.

**Two non-cancelled appointments at the end.** The successful booking and the
winner of the race. The refused requests left nothing behind — the loser's
transaction rolled back, which is O9's claim read from the other side.

## 4. Defects found at GREEN

Three. (b) and (c) are defects in the code written for this stage; (a) is a defect
in the tests. All three are fixed in the working tree this run describes. Because
(a) touches only `tests/api/booking.test.ts` and `tests/api/occupancy.test.ts`, it
is a `test:` change and (b)/(c) are `feat:` changes, so the two groups belong in
separate commits, in that order of subject matter — `feat:` then `test:`, as
`d6047d5` did for S1.3. (a) was found by the suite at its first run against the
implementation; (b) and (c) were found by reading the new code against its own
comments while that first run's failures were being diagnosed.

**(a) Eight booking cases shared one slot, and O3's "rest" contradicted O4.**

The first GREEN run answered `409` where `booking.test.ts`'s SCN-01 block
expected `201`. The cause was not in the implementation: eight cases in that
block each booked the **same** 10:00 slot for the **same** pair of services on
the **same** master (`olena`). The first case to run consumed the slot, and every
later case was answered 409 — correctly, because by then the slot was taken.
`occupancy.test.ts`'s O3 was a different shape of the same family: its assertion
`after === before minus the 10:00 start` stated that only the booked start
disappears, which contradicts O4 in the same file — a 90-minute block also
removes 10:30 and 11:00. O3's own agreement with the implementation was luck, not
a claim.

Both are defects in the tests, not in the code, and both are exactly the class
runs-04 §4(b) recorded: a case whose Given is "nobody has used this yet". Their
fixes, not the counts, are what changed:

- `booking.test.ts` gained `freshPairMaster()` / `bookPair()`: each SCN-01 case
  gets a master of its own with the two services linked and one Monday window,
  so its "Given" is stated in the case rather than inherited from the file's
  order. The `detail` case builds its own master for the same reason.
- `occupancy.test.ts`'s O3 now filters `before` to the starts at or after 11:30,
  which is the "rest" O4 defines — the starts outside the booked block. Its name
  ("keeps the rest") and its intent are unchanged.

The case count did not move: 223 before the fix, 223 after, `Tests 223 passed`
each time.

**(b) The advisory lock was keyed with 32-bit `hashtext`.**

`pg_advisory_xact_lock(hashtext($1))` takes a 32-bit key, so two masters whose
ids hash to the same value would serialise against each other for no reason.
Nothing in the suite would have shown it — a false serialisation is invisible to
correctness tests — but it is a real (if rare) coupling between unrelated
bookings. Changed to `hashtextextended($1::text, 0)`, which returns 64 bits. The
control run's race still reads `201, 409`, so the lock still works.

**(c) The unique-index backstop was described but not mapped.**

`service.ts`'s header said a unique violation would be mapped to 409 "so the
backstop and the lock produce one answer", and nothing caught it: the exception
would have reached the 500 branch. O8 ("not 500") would only catch that if the
race ever lost by the index rather than by the lock, which the lock makes rare.
Now `createAppointment` wraps its transaction and returns `undefined` for
`isUniqueViolation(error, 'appointments_master_start_unique')`, which the route
turns into the same 409. The claim and the code now agree.

**Also corrected, not a defect in behaviour:** `Appointment`'s `Location` header
was set after `sendJson`, where `res.json` has already flushed the response, so
the header was silently dropped. B6 asserts it, which is why the suite caught it
before the commit; it is now set before the body is written. Two unused exports
(`blocksOverlap`, a first-draft instant comparator) were removed rather than left
in a `lib/` file for a later stage to find; P8 compares booked rows by instants
through the SQL predicate in `bookedBlocks`, and P7 converts the same rows to
wall-clock minutes. Finally, the `Location` base path moved from two per-module
`router.use` handlers to one on the API router in `routes.ts` (the admin router
keeps its own, because it is mounted as a sub-router and states the value itself),
so a create operation in any module answers the same header.

## 5. Log records written for those requests

The last records of the control run, taken from
`logs/runtime/app-2026-11-12.jsonl` and isolated by their `ts` window
(`14:03:43`):

```
{"ts":"2026-11-12T14:03:43.031Z","level":"info","event":"http.request","traceId":"182a48b1-f425-4d89-89e6-6f3d0576f0ac","method":"GET","path":"/api/v1/services","status":200,"durationMs":4.90317}
{"ts":"2026-11-12T14:03:43.034Z","level":"info","event":"http.request","traceId":"4f35517f-e5c4-4923-bc4a-125c318f9665","method":"GET","path":"/api/v1/services/{serviceId}","status":200,"durationMs":1.06262}
{"ts":"2026-11-12T14:03:43.037Z","level":"info","event":"http.request","traceId":"5ae99631-ff91-4253-acee-f84906ae4bb5","method":"GET","path":"/api/v1/categories","status":200,"durationMs":1.657469}
{"ts":"2026-11-12T14:03:43.042Z","level":"info","event":"http.request","traceId":"16c0226e-23e0-4fef-add8-ec53a2190a74","method":"GET","path":"/api/v1/masters","status":200,"durationMs":2.640962}
{"ts":"2026-11-12T14:03:43.045Z","level":"info","event":"http.request","traceId":"af569e43-9bf7-481c-9af1-f67a03f1a1dc","method":"GET","path":"/api/v1/masters/{masterId}","status":200,"durationMs":1.425118}
{"ts":"2026-11-12T14:03:43.050Z","level":"info","event":"http.request","traceId":"7f214b06-5955-4bef-97bb-41b0fa6714f9","method":"GET","path":"/api/v1/masters/{masterId}/services","status":200,"durationMs":2.914266}
{"ts":"2026-11-12T14:03:43.053Z","level":"warn","event":"http.request","traceId":"355ec2f9-4213-4a9c-8089-c2a05f20d047","method":"GET","path":"/api/v1/masters/{masterId}","status":404,"durationMs":0.853204}
{"ts":"2026-11-12T14:03:43.061Z","level":"info","event":"http.request","traceId":"8a2ed48c-d05d-4729-a532-6510378f2912","method":"PUT","path":"/api/v1/me/availability","status":200,"durationMs":6.552656}
{"ts":"2026-11-12T14:03:43.083Z","level":"info","event":"http.request","traceId":"8e029d3a-4c57-4438-a2a3-dbf98b597a2c","method":"GET","path":"/api/v1/masters/{masterId}/availability","status":200,"durationMs":19.73122}
{"ts":"2026-11-12T14:03:43.109Z","level":"info","event":"http.request","traceId":"49027df2-a59d-4dfa-b128-4abc056facba","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":24.511726}
{"ts":"2026-11-12T14:03:43.116Z","level":"info","event":"http.request","traceId":"6b8d6c36-51dc-4f26-905c-658df7e30b54","method":"GET","path":"/api/v1/masters/{masterId}/availability","status":200,"durationMs":4.823374}
{"ts":"2026-11-12T14:03:43.122Z","level":"warn","event":"http.request","traceId":"92ab417d-ae52-4ce2-8b0e-58ba3b3b6b46","method":"POST","path":"/api/v1/appointments","status":409,"durationMs":3.962991}
{"ts":"2026-11-12T14:03:43.131Z","level":"info","event":"http.request","traceId":"6f5c5b5c-68b7-4a42-b3fb-93f706f162b3","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":7.917807}
{"ts":"2026-11-12T14:03:43.134Z","level":"warn","event":"http.request","traceId":"d7232419-e68b-4ce0-ba79-0946a5f97066","method":"POST","path":"/api/v1/appointments","status":409,"durationMs":10.605747}
{"ts":"2026-11-12T14:03:43.137Z","level":"warn","event":"http.request","traceId":"5328472f-012d-4951-a3f3-1b438b6f869d","method":"POST","path":"/api/v1/appointments","status":422,"durationMs":0.541488}
```

The two `POST /api/v1/appointments` records 3 ms apart (`.131` 201 and `.134`
409) are the race in §2: two requests in flight together, one of which the lock
serialised. The `404` at `.053` is the administrator id read through P5. Neither
record carries a client phone, an access token or a concrete master id — the
logger writes the contract template, as S1.0 established.

## 6. Migration 0003

Generated by `npx drizzle-kit generate --name booking` from `src/db/schema.ts`,
and the statement the gate names (§9 item 5) is present verbatim:

```
CREATE UNIQUE INDEX "appointments_master_start_unique" ON "appointments" USING btree ("master_id","start_at") WHERE "appointments"."status" <> 'cancelled';
```

The control run read the index back from `pg_indexes` on the migrated scratch
database (§2), so the statement is not merely in the file: it is in the schema
PostgreSQL built from it.

## 7. The two halves of D2, as they exist in the code

- **The lock** — `src/modules/appointments/service.ts`, inside the booking
  transaction: `select pg_advisory_xact_lock(hashtextextended($1::text, 0))`.
  `_xact_` means it is released on commit or rollback and there is no unlock path
  to forget.
- **The index** — `0003_booking.sql` above, partial on `status <> 'cancelled'`,
  so a cancelled appointment frees its block and a live one cannot share the
  start.

The suite proves both: O7 (overlapping starts, different `start_at`) can only be
refused by the lock; O6 (same start) is refused by either, and O8 asserts the
answer is 409 rather than 500.

## 8. Not established by this run

- **The confirmation page is not served.** `confirmationUrl` is built from the
  contract's own origin, `https://salon.example`. Whether that URL resolves is
  S2.2's (SMS-26); the record cannot claim it.
- **No reminder was sent.** Both are `scheduled`, computed on read (D6). The
  `sent`/`failed` statuses are SMS-29's.
- **`Location` is a path, not an absolute URI.** `/api/v1/appointments/{id}`,
  because the application does not know its public hostname. The contract
  declares `format: uri`; a relative reference is resolved against the request
  URI by a client, and every prior create operation (R2, R6, R11) has answered
  the same way. Recorded rather than changed here.
- **`startAt` in the past is not refused.** No document defines it (G2
  carry-forward register, row 4); this run makes no claim about it.
- **The development database was not migrated.** `0003_booking.sql` was applied
  to the test database and to the scratch database only.
- **`P1`'s `q` matching and `P4`/`P6` filters are exercised by the suite, not by
  this script.** The control run's subject is the public surface's mounting and
  the booking path; the query-parameter matrix is C3–C6, C16, C21–C22.

## 9. Open items

1. **The `test:` fixes in §4(a) are in the working tree, uncommitted, alongside
   the `feat:` changes.** They belong in a `test:` commit after the `feat:` one,
   per the instruction for this stage; splitting the working tree is the human's
   act, and the agent does not commit.
2. **`confirmationUrl`'s origin** is the contract's example origin. If S2.2 gets
   a configured base URL, this constant is where it changes.
3. **The `Location` header's relative form** (§8) is the same on every create
   operation since S1.2, and is a contract question (CL candidate), not an S2.1
   defect.
