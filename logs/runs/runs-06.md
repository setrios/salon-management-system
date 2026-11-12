# Control run 06 — S2.2 confirmation page, access token, confirmation SMS (SMS-26)

| Field | Value |
|---|---|
| Run | 06 |
| Date | 2026-11-12 |
| Stage | S2.2 |
| Ticket | SMS-26 (implementation for SMS-26) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-12-test-SMS-26.md` (`SIGNED — GO`, `07ee4d3`) |
| Code | `src/modules/appointments/{routes,service,view}.ts`, `src/modules/notifications/{routes,service}.ts`, `src/db/schema.ts`, `src/db/migrations/0004_notifications.sql`, `src/routes.ts` |
| Log file | `logs/runtime/app-2026-11-12.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc -p tsconfig.json --noEmit                     exit 0
$ npm run build                                         exit 0
$ npm test                                              240 passed (240), exit 0
$ npm test                                              240 passed (240), exit 0
$ npm test -- --sequence.shuffle                        240 passed (240), exit 0  ×5
$ npm run check:test-first                              9/9 entries pass, exit 0
$ git diff --stat tests/                                (empty)
```

Two unshuffled runs and five shuffled runs, as the gate's §9 requires. The
shuffled seeds printed were `1794500858316`, `1794500873121`, `1794500887735`,
`1794500903184`, `1794501814268`; every one printed `Tests 240 passed (240)`.

The suite is **240 before this stage and 240 after**: no test file was added,
removed or edited during GREEN. `git diff --stat tests/` is empty, which is the
gate's §9 evidence item 8 read from the tree rather than from a claim. The 17
cases of this stage were committed with the `test:` commit `7005a65`, before the
gate was signed, and nothing under `tests/` has changed since.

The migration `0004_notifications.sql` is applied to the **test** database by
`tests/setup.ts` on every run, so the suite exercises it as well as the control
run below. The development database is **not** migrated by this run and nothing
in it is claimed here: whether the human applies `0004` is a separate human act,
as it was for `0001`–`0003`.

The control run in §2 runs against a **scratch database** created for the run and
dropped afterwards, so "fresh installation" is literal: the migrator applies
`0000`–`0004` to an empty database and nothing else writes the schema. Same
arrangement as runs-03 §1, runs-04 §1 and runs-05 §1.

## 2. Requests and responses — built artifact

The control run used `dist/` (`node` importing `dist/src/app.js`) after
`npm run build`, not the TypeScript sources — the S1.0 finding (runs-01 §4): the
in-process suite cannot see packaging defects. The application listens on an
ephemeral port and is driven over HTTP, not through supertest. The script is
`logs/runtime/s22-control-run.mjs`, uncommitted for the reason runs-03 §7 gives.

**`createApp()` is called with no argument**, the shape `index.ts` uses (D9): the
clock has a default and the server is judged against real time.

```
scratch database created: salon_s22_control_test
tables after migration: appointment_services, appointments, availability_dates,
                        availability_weekly, categories, master_services,
                        masters, materials, notifications, services

notifications indexes:
  CREATE UNIQUE INDEX notifications_appointment_new_client_sms_unique ON public.notifications USING btree (appointment_id) WHERE ((event_type = 'new'::text) AND (audience = 'client'::text) AND (channel = 'sms'::text))
  CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)

service created: 201
M4 PUT: 200

--- P8 POST /api/v1/appointments, no token (expect 201) ---
status: 201 | content-type: application/json; charset=utf-8
location: /api/v1/appointments/54425dd6-e851-4aa9-b553-88c6860d3602
body: {"id":"54425dd6-e851-4aa9-b553-88c6860d3602","status":"confirmed",
       "accessToken":"332ca30b-ffd8-4cb1-9607-9e35a5b742a8",
       "confirmationUrl":"https://salon.example/appointments/332ca30b-ffd8-4cb1-9607-9e35a5b742a8"}

--- P9 GET /api/v1/appointments/{token}, no Authorization header ---
status: 200 | content-type: application/json; charset=utf-8
body: {"id":"54425dd6-e851-4aa9-b553-88c6860d3602","status":"confirmed",
       "client":{"name":"Iryna Kovalenko","phone":"+380501234567"},
       "master":{"id":"4faa35b9-ce9b-4383-b8ee-b8b5a9be3eda","fullName":"master-s22"},
       "services":[{"serviceId":"812f7fa6-c0d4-47ec-95dd-5c7bfcb8ec30",
                    "name":"S22 Haircut","baseDurationMinutes":45,
                    "price":{"amountMinor":55000,"currency":"UAH"}}],
       "startAt":"2026-12-07T10:00:00+02:00",
       "endAt":"2026-12-07T11:00:00+02:00",
       "accessTokenEqualsBooking":true,
       "confirmationUrl":"https://salon.example/appointments/332ca30b-ffd8-4cb1-9607-9e35a5b742a8"}
P9 for an unknown uuid: 404 | code: NOT_FOUND
P9 for a non-uuid token: 404 | code: NOT_FOUND

--- R24, administrator token ---
status: 200 | content-type: application/json; charset=utf-8
envelope: {"page":1,"pageSize":20,"total":1}
items: [{"id":"f2223a92-cca9-4995-8821-f5747f358ceb",
         "appointmentId":"54425dd6-e851-4aa9-b553-88c6860d3602",
         "audience":"client","eventType":"new","channel":"sms","status":"sent",
         "sentAt":"2026-11-12T18:31:00+02:00",
         "createdAt":"2026-11-12T18:31:00+02:00"}]
R24 without a token: 401 | code: UNAUTHENTICATED
R24 with a master's token: 403 | code: FORBIDDEN

--- P8, the same booking again (expect 409) ---
status: 409 | code: SLOT_UNAVAILABLE

--- After the refusal ---
R24 total: 1
rows by predicate: [{"audience":"client","event_type":"new","channel":"sms","status":"sent","total":1}]
notifications table total: 1

--- A second booking ---
P8 status: 201
its R24 total: 1
first booking R24 total: 1

scratch database dropped: salon_s22_control_test
```

## 3. What each request establishes

**`P9` with no `Authorization` header at all — 200, same id, same token, same
`confirmationUrl`.** The contract declares P9 `security: []`; a supertest
assertion says the middleware chain does not demand a token, and this says the
*built* router does not either. `accessTokenEqualsBooking: true` is the
comparison the script performs against the 201 body: the credential a client was
given at booking is the credential that reads the record back (REQ-F-004,
REQ-NF-001). The body is the same `Appointment` shape the 201 returned, because
both are produced by one mapper (`view.ts`) — the 200 cannot drift from the 201
by construction.

**`P9` for an unknown uuid — 404, and for a non-uuid token — 404.** The first is
the contract's declared 404. The second is E6: P9 declares no 400, so the shared
parameter rule takes the 404 branch instead of `MALFORMED_REQUEST`. R24's mirror
of the same rule is the 400 in §2's suite case N7.

**`R24` with the administrator's token — 200, `{"page":1,"pageSize":20,"total":1}`,
one item.** REQ-F-005's "exactly one confirmation SMS is recorded" is observable
here: one booking, one `client`/`new`/`sms`/`sent` record, carrying the booking's
own `appointmentId`. `sent` means "handed to the simulated channel" (E3), not
delivered. There is no text field on `Notification`, and the record does not
pretend to have one (E10).

**`R24` without a token — 401, with a master's token — 403.** The operation is
`tags: [Admin]` behind the global bearer, and the built route puts the role gate
in front of it: 401 before 403, as every administrator operation since S1.2.

**`P8` again — 409 `SLOT_UNAVAILABLE`.** The refusal is a business refusal, and
§2's row read after it shows the count still at one: the loser's transaction
rolled back, so it wrote no message. This is the "at most one" half of REQ-F-005
(N3), read from the table rather than from a test's socket.

**`rows by predicate` — one group, total 1, and `notifications table total: 1`.**
Both readings are in §2: the grouped query scoped to the booking, and the whole
table. They agree, so the "one" is not an artefact of a filter.

**A second booking — 201, its own R24 total 1, the first still 1.** "Exactly one
per booking" in the other direction: the unique index is per `appointment_id`, so
a second booking is not blocked by the first, and each gets one record.

## 4. Defects

**None was found during GREEN.** The suite was 240/240 on its first run against
the implementation, and it stayed 240/240 across two unshuffled and five shuffled
runs. No test file was touched after the `test:` commit, so no separate `test:`
commit follows the `feat:` one.

**One defect was found producing RED, in the tests, and fixed before the gate.**
The first draft of `confirmation.test.ts` arranged its Monday and Thursday windows
with two sequential `PUT /me/availability` calls. M4 is a full replacement
(`resource-model.md` §4), so the second call discarded Monday and every Monday
booking was answered 409 (`expected 409 to be 201`). The fix is one `PUT` with
both windows. It is named in `tdd-SMS-26.md` §3 and gate §6, and it is inside the
`test:` commit `7005a65` — the count did not move, 17 failed before the fix and 17
after.

**Also corrected inside this stage's scope, not a defect in behaviour:** the
`CONFIRMATION_ORIGIN` comment in `appointments/routes.ts` said the page arrives
with S2.2. After E5 that is false — nothing serves that URL — and the gate's §8
requires the correction in the same `feat:` commit. The constant moved to
`view.ts`, where the 201 and the 200 both read it, and its comment now says what
is true (gate evidence item 7).

## 5. Log records written for those requests

The complete control run, taken from `logs/runtime/app-2026-11-12.jsonl` and
isolated by its `ts` window (`16:30:52` UTC — one run, 151 ms end to end):

```
{"ts":"2026-11-12T16:30:52.206Z","level":"info","event":"http.request","traceId":"3ff6129d-682d-4b7d-a718-d49607547a34","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":59.214844}
{"ts":"2026-11-12T16:30:52.239Z","level":"info","event":"http.request","traceId":"ffd9fcae-da46-46fe-8fd9-2cce4aa099c9","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":26.939874}
{"ts":"2026-11-12T16:30:52.250Z","level":"info","event":"http.request","traceId":"66ef2e01-5f19-429d-bd61-1c6578ca14f5","method":"POST","path":"/api/v1/admin/services","status":201,"durationMs":8.522362}
{"ts":"2026-11-12T16:30:52.259Z","level":"info","event":"http.request","traceId":"efc1db82-aa10-4d07-a902-e3c259f590c7","method":"POST","path":"/api/v1/admin/master-services","status":201,"durationMs":6.491552}
{"ts":"2026-11-12T16:30:52.270Z","level":"info","event":"http.request","traceId":"21dbd71d-e625-4158-ad40-e47dafbc115d","method":"PUT","path":"/api/v1/me/availability","status":200,"durationMs":8.227133}
{"ts":"2026-11-12T16:30:52.306Z","level":"info","event":"http.request","traceId":"d3d76955-68fa-4c60-a3f8-ec241c2d2a0c","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":33.832843}
{"ts":"2026-11-12T16:30:52.312Z","level":"info","event":"http.request","traceId":"5ab79dde-fbd6-4aaf-938a-457415c38f0f","method":"GET","path":"/api/v1/appointments/{token}","status":200,"durationMs":3.817102}
{"ts":"2026-11-12T16:30:52.314Z","level":"warn","event":"http.request","traceId":"a3e473c0-cb28-462f-8a73-e290a8854e15","method":"GET","path":"/api/v1/appointments/{token}","status":404,"durationMs":1.092376}
{"ts":"2026-11-12T16:30:52.316Z","level":"warn","event":"http.request","traceId":"d38951b6-267c-416e-ae20-f2ddc53f8826","method":"GET","path":"/api/v1/appointments/{token}","status":404,"durationMs":0.273349}
{"ts":"2026-11-12T16:30:52.323Z","level":"info","event":"http.request","traceId":"282f604e-c133-4799-8491-e7830a9a6f8f","method":"GET","path":"/api/v1/admin/appointments/{appointmentId}/notifications","status":200,"durationMs":5.102681}
{"ts":"2026-11-12T16:30:52.329Z","level":"warn","event":"http.request","traceId":"55447a9b-4fb4-451a-b6f8-c3c69d1682fa","method":"GET","path":"/api/v1/admin/appointments/{appointmentId}/notifications","status":401,"durationMs":0.219354}
{"ts":"2026-11-12T16:30:52.331Z","level":"warn","event":"http.request","traceId":"b338751b-23db-470e-8e28-079f2e4cd4bc","method":"GET","path":"/api/v1/admin/appointments/{appointmentId}/notifications","status":403,"durationMs":0.412873}
{"ts":"2026-11-12T16:30:52.336Z","level":"warn","event":"http.request","traceId":"5ed6c9f9-c5f4-4136-aace-30cabf96459a","method":"POST","path":"/api/v1/appointments","status":409,"durationMs":4.040533}
{"ts":"2026-11-12T16:30:52.340Z","level":"info","event":"http.request","traceId":"11f88196-89c6-4e29-b0e7-462c059886c9","method":"GET","path":"/api/v1/admin/appointments/{appointmentId}/notifications","status":200,"durationMs":2.284767}
{"ts":"2026-11-12T16:30:52.349Z","level":"info","event":"http.request","traceId":"6bcb95f0-988d-4359-85ed-8c59f7eae9b3","method":"POST","path":"/api/v1/appointments","status":201,"durationMs":6.880335}
{"ts":"2026-11-12T16:30:52.353Z","level":"info","event":"http.request","traceId":"79a52ef5-8e61-4fea-a038-8e853761282a","method":"GET","path":"/api/v1/admin/appointments/{appointmentId}/notifications","status":200,"durationMs":2.094496}
{"ts":"2026-11-12T16:30:52.357Z","level":"info","event":"http.request","traceId":"22efcd5a-b1b0-4c64-9b0c-ae090f868e2a","method":"GET","path":"/api/v1/admin/appointments/{appointmentId}/notifications","status":200,"durationMs":2.051909}
```

Seventeen records in 151 ms, in the order §2 issued them. Neither the request
records nor the responses carry a client phone, an access token or a concrete
master id — the logger writes the contract template, as S1.0 established. The
`401` at `.329` and the `403` at `.331` are the same path as the `200` at `.323`:
the gate is in the route, not in the client.

**The `sentAt` in §2 and this window are the same instant.** `18:31:00+02:00` is
`16:30:52Z` written by `salonDateTime`, which rounds to the minute
(`Math.round` on minutes-from-midnight) — the convention every timestamp in this
API has used since S1.2. The 8-second difference is representation, not a second
event.

## 6. Migration 0004

Generated by `npx drizzle-kit generate --name notifications` from
`src/db/schema.ts`. The statement the gate names (§9 evidence item 5) is present
verbatim in the file:

```
CREATE UNIQUE INDEX "notifications_appointment_new_client_sms_unique" ON "notifications" USING btree ("appointment_id") WHERE "notifications"."event_type" = 'new' and "notifications"."audience" = 'client' and "notifications"."channel" = 'sms';
```

and the control run read it back from `pg_indexes` on the migrated scratch
database (§2), so it is in the schema PostgreSQL built, not only in the file.

The table itself carries four `CHECK` constraints, one per enum the contract
declares — `audience`, `event_type`, `channel`, `status` — plus the foreign key to
`appointments.id`. `scheduled_at` and `sent_at` are nullable, matching
`Notification.required` (`[id, audience, eventType, channel, status, createdAt]`).

**Why the index is partial on those three predicates:** a reschedule of the same
appointment must record a second SMS with `eventType: reschedule` (REQ-F-009). A
full unique on the three columns would forbid it.

## 7. The two halves of "exactly one", as they exist in the code

- **The transaction** — `src/modules/appointments/service.ts`, inside the booking
  transaction, after the lines: `tx.insert(notifications).values({ … audience:
  'client', eventType: 'new', channel: 'sms', status: 'sent', sentAt: input.now })`.
  The write commits with the appointment or not at all (E2). A refused booking
  reaches no insert, which is what §2's post-refusal count reads.
- **The index** — `0004_notifications.sql` above, partial on the three
  predicates, so a second `client`/`new`/`sms` row for one appointment is
  impossible even if a future code path forgets the transaction.

The suite proves both: N1 by predicate, N2 per booking, N3 on refusal. The control
run proves the same three from outside the process, on the built artifact.

## 8. Not established by this run

- **No page is served at `confirmationUrl`.** `https://salon.example/appointments/
  {token}` is built from the contract's example origin and nothing answers there.
  P9 is the reachable resource. Whether an HTML page is served is SMS-36's work
  and register row 9 (E5).
- **No SMS reached a phone.** `status: sent` records that the message was handed
  to the simulated channel (E3). The real dispatch statuses are SMS-29/SMS-30.
- **Only the `new` message exists.** `reschedule`, `cancellation` and the two
  reminder events are later rows on the same table, written by later stages; §2's
  first booking records one row because it is a booking, not because the other
  events were suppressed.
- **The token was not read after a cancellation in this run.** C8 asserts it in
  the suite, arranging `cancelled` out of band because P10 is S2.3. The control
  run makes no claim about it.
- **A `startAt` in the past still books.** From S2.2 that yields a recorded
  message for a visit that cannot happen; the delivery is simulated, so the effect
  is a record. Register row 4, decision point G2, owner the human (gate §4.4).
- **The development database was not migrated.** `0004_notifications.sql` was
  applied to the test database and to the scratch database only.

## 9. Open items

1. **Nothing is committed.** The `feat:` commit for SMS-26 is the human's act,
   and this run describes the working tree as it stands for it. The files it
   covers are the five modified (`src/db/migrations/meta/_journal.json`,
   `src/db/schema.ts`, `src/modules/appointments/routes.ts`,
   `src/modules/appointments/service.ts`, `src/routes.ts`) and the four new
   (`src/db/migrations/0004_notifications.sql`,
   `src/db/migrations/meta/0004_snapshot.json`,
   `src/modules/appointments/view.ts`, `src/modules/notifications/`).
2. **Register row 8 — the plan has no stage for R24.** Closed here by putting R24
   in S2.2; the plan revision that records it is Revision 5 at G2, and the plan is
   not edited by this stage.
3. **`confirmationUrl`'s origin** is the contract's example. If a configured base
   URL is introduced, `view.ts`'s `CONFIRMATION_ORIGIN` is where it changes.
