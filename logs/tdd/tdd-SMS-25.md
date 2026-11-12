# TDD log — SMS-25 (S2.1 booking tests: SMS-8, SMS-19, SMS-25)

| Field | Value |
|---|---|
| Tickets | SMS-8 (Test, SCN-01), SMS-19 (Test, SCN-13), SMS-25 (Feature, booking flow) |
| Stage | S2.1 |
| Date | 2026-11-12 |
| Test files | `tests/api/booking.test.ts` (25), `tests/api/rounding.test.ts` (7), `tests/api/occupancy.test.ts` (10), `tests/api/public-catalogue.test.ts` (25), `tests/api/availability.test.ts` (43, edited) — **67 new cases, 223 in the suite** |
| Fixture | `tests/helpers/booking.ts` — new. Arranges accounts, services (R6), links (R11) and availability (M4) through the API; asserts nothing |
| Contract | `openapi.yaml` P1–P8; schemas `ServicePage`, `Service`, `CategoryList`, `MasterPage`, `MasterPublic`, `MasterServicePage`, `AvailabilityResponse`, `AvailabilitySlot`, `AppointmentCreate`, `Appointment`, `AppointmentService`, `Reminder`, `Problem`; `error-model.md` §3–§4; `resource-model.md` §4, §5.1 |
| Gate | `logs/gates/2026-11-12-test-SMS-8-19.md` — **PENDING** |

## 1. What the test commit contains

| File | Change |
|---|---|
| `tests/api/booking.test.ts` | new — 25 cases over P8 |
| `tests/api/rounding.test.ts` | new — 7 cases over P7 and P8 (SCN-13) |
| `tests/api/occupancy.test.ts` | new — 10 cases over P7 and P8 (booked time, concurrency) |
| `tests/api/public-catalogue.test.ts` | new — 25 cases over P1–P6 |
| `tests/api/availability.test.ts` | edited — master↔service links in the fixture (D5), one case removed, one added; 43 stays 43 |
| `tests/helpers/booking.ts` | new — the arrangement helper the four new files share |
| `tests/manifest.json` | four entries added: `SMS-25 → SMS-25`, `SMS-8 → SMS-25`, `SMS-19 → SMS-25`, `SMS-8 → SMS-25` |

No source file is touched. `git status --short src/` is empty; `src/modules/public/`,
`src/modules/appointments/` and `src/lib/occupancy.ts` do not exist.

## 2. Inventory — 67 cases

### 2.1 `public-catalogue.test.ts` — 25 (P1–P6)

| # | Case | What it proves |
|---|---|---|
| C1 | lists an active service with its duration and category | P1 returns the fields a booking sums |
| C2 | omits a service deactivated through R8 | REQ-F-018: deactivation hides from new selection |
| C3 | filters by category | P1's `category` parameter |
| C4 | matches `q` case-insensitively on the name | P1's `q` parameter, as described |
| C5 | pages: page 2 returns the second item and total counts the filter | P1 pagination and `total` |
| C6 | answers 400 MALFORMED_REQUEST for a pageSize that is not an integer | P1's declared 400 |
| C7 | answers without any token: the operation is public | `security: []` |
| C8 | returns one service by id | P2 |
| C9 | answers 404 NOT_FOUND for an unknown id | P2's declared 404 — **after** C8 proves the route is mounted |
| C10 | lists the three seeds as seeded and a saved custom category as not | REQ-F-024, SCN-08, D-27 |
| C11 | answers without any token: the operation is public | P3 |
| C12 | lists a master with an id and a full name and nothing else | D19: `MasterPublic` is exactly `{id, fullName}` |
| C13 | exposes no username, role or credential on the public surface | REQ-NF-006 |
| C14 | omits the administrator, who is a row of the same table | D10 |
| C15 | filters by active=false and returns the retired master | REQ-F-018: deactivated masters stay on record and the filter reaches them. Its second assertion (the administrator is absent) is a **guard, not a proof** — while the administrator is active, the filter excludes it for its own reason; D10 rests on C14, C19 and C24 |
| C16 | answers 400 MALFORMED_REQUEST for an active value that is not a boolean | P4's declared 400 |
| C17 | returns the public representation of a master | P5 |
| C18 | answers 404 NOT_FOUND for an unknown id | P5's declared 404, after C17 |
| C19 | answers 404 NOT_FOUND for an administrator id | D10 |
| C20 | lists an active link with its price | P6, REQ-F-014 |
| C21 | filters links with active=false | the filter is observable: a link is retired through R12 and read back |
| C22 | pages: page 2 with pageSize 1 returns the second link and total counts them | P6 pagination |
| C23 | answers 404 NOT_FOUND for an unknown master id | P6's declared 404, after C20 |
| C24 | answers 404 NOT_FOUND for an administrator id | D10 |
| C25 | answers without any token: the operation is public | P6 |

**25, not the 24 in the inventory — and the reason, stated rather than left to be
found.** The inventory's C1 was *"lists an active service with its duration and
category, and omits a deactivated one"*: one case asserting two things, with two
independent premises (a service that is active, a service that was deactivated
through R8). It was split into C1 and C2, each with one premise, because a case
that fails tells you which of its two claims broke only if it has one. The count
moved 24 → 25; no case was added beyond the inventory's scope.

### 2.2 `booking.test.ts` — 25 (P8)

| # | Case | What it proves |
|---|---|---|
| B1 | answers 201 with status confirmed: there is no approval state | REQ-F-003 |
| B2 | sums the durations: 30 + 30 is 60 | REQ-F-001 |
| B3 | sums the prices the master charges into totalPrice | REQ-F-001; the price is the link's |
| B4 | snapshots each service line with its name, duration and price | `AppointmentService` is a snapshot, not a join |
| B5 | sets endAt to startAt plus the occupied block | REQ-F-031 applied to the record |
| B6 | returns a Location header naming the created appointment | P8's declared `Location` |
| B7 | returns an accessToken uuid and a confirmationUrl carrying it | REQ-F-004, REQ-NF-001 |
| B8 | does not let the client choose a status: a status property is 422 | REQ-F-003 as a write constraint; D-22 |
| B9 | schedules the 24 h and 2 h reminders when the booking is days ahead | REQ-F-010, REQ-F-011 |
| B10 | skips the 24 h reminder for a booking under 24 hours ahead | REQ-F-010 |
| B11 | skips both reminders for a booking under two hours ahead | REQ-F-011 |
| B12 | answers 415 UNSUPPORTED_MEDIA_TYPE for a non-JSON body | P8's declared 415 |
| B13 | answers 422 VALIDATION_ERROR for a body with no client | `AppointmentCreate.required` |
| B14 | answers 422 VALIDATION_ERROR naming client.phone for a phone off the pattern | `Client.phone.pattern`; `errors[].field` |
| B15 | answers 422 VALIDATION_ERROR for an empty serviceIds array | `minItems: 1` |
| B16 | answers 409 SLOT_UNAVAILABLE when the start is outside the master's availability | REQ-F-002 |
| B17 | answers 409 SLOT_UNAVAILABLE when the block runs past the end of the window | the fit test uses the rounded block |
| B18 | answers 422 BUSINESS_RULE_VIOLATION for a start off the 30-minute boundary | REQ-NF-008; D3 |
| B19 | answers 422 BUSINESS_RULE_VIOLATION for an inactive master | D4 |
| B20 | answers 422 BUSINESS_RULE_VIOLATION for a masterId that names no master | D4 (P8 declares no 404) |
| B21 | answers 422 BUSINESS_RULE_VIOLATION for a serviceIds entry that names no service | D4 |
| B22 | answers 422 BUSINESS_RULE_VIOLATION for a service the master does not offer | D4, D5 |
| B23 | answers 422 BUSINESS_RULE_VIOLATION for a deactivated service | D4 |
| B24 | counts a repeated service id twice: two lines, doubled duration and price | D8 |
| B25 | answers 409 with a detail that says the slot is unavailable for this master | G1 carry-forward register row 6 — the one case that compares `detail` |

### 2.3 `rounding.test.ts` — 7 (SCN-13)

| # | Case | What it proves |
|---|---|---|
| R1 | reports 75 minutes summed and 90 occupied | REQ-F-031 on P7 |
| R2 | reports the same pair on the appointment P8 creates | the rounding is not a display rule |
| R3 | sets endAt 90 minutes after startAt, not 75 | the reserved block is the rounded one |
| R4 | leaves an already-aligned total alone: 30 + 30 stays 60 | "round up" is not "round to a fixed block" |
| R5 | rounds a single 45-minute service up to 60 | one service, same rule |
| R6 | rounds the sum once, not each service: 45 + 45 occupies 90, not 120 | REQ-F-031 says "the summed duration" |
| R7 | refuses a start the unrounded duration would fit but the block does not | the fit test uses the rounded block |

### 2.4 `occupancy.test.ts` — 10

| # | Case | What it proves |
|---|---|---|
| O1 | offers a slot at 10:00 before anything is booked | the baseline the rest subtract from |
| O2 | offers exactly the starts P8 accepts: the two operations share one rule | one source of truth for slot computation |
| O3 | removes the booked start from P7 and keeps the rest | D1 |
| O4 | removes every start the booked block overlaps, not only its own | overlap, not exact match |
| O5 | keeps a booking on one master out of another master's slots | the subtraction is per master |
| O6 | accepts one of two simultaneous requests for the same start | D2, exact-start race |
| O7 | accepts one of two simultaneous requests whose blocks overlap | D2, the race the index alone cannot close |
| O8 | answers the losing request with 409 SLOT_UNAVAILABLE, not 500 | the loser is a business refusal |
| O9 | leaves exactly one appointment behind after the race | the refusal is not a rollback of both |
| O10 | reports available: true on every slot P7 returns, because booked time is filtered out | D1, asserted after a booking |

### 2.5 `availability.test.ts` — 43 (edited, count unchanged)

| Change | Detail |
|---|---|
| Links added | `createService()` links each new service to both masters P7 is asked about; the mid-file `empty` master is linked to `service30` in its own case. Without this, D5 would turn those cases into 422 for the wrong reason |
| Case removed | "marks every slot available, because no appointment can exist yet" — its own comment said S2.1 must replace it. Moved to O10, where it is asserted after a booking |
| Case added | "answers 422 BUSINESS_RULE_VIOLATION for a service the master does not offer" — D5, and the trigger G13 deferred from S1.3 |

## 3. RED run

```
$ npx vitest run

 Test Files  5 failed | 3 passed (8)
      Tests  66 failed | 157 passed (223)
```

Per file, verbatim:

```
tests/api/auth.test.ts               Tests  16 passed (16)
tests/api/availability.test.ts       Tests  1 failed | 42 passed (43)
tests/api/booking.test.ts            Tests  25 failed (25)
tests/api/occupancy.test.ts          Tests  9 failed | 1 passed (10)
tests/api/public-catalogue.test.ts   Tests  25 failed (25)
tests/api/reference-data.test.ts     Tests  88 passed (88)
tests/api/rounding.test.ts           Tests  6 failed | 1 passed (7)
tests/api/structural.test.ts         Tests  9 passed (9)
```

**223, not the 222 the plan predicted.** 156 unchanged + 67 new. The difference is
the C1 split in §2.1. The run is the authority; the plan's number was derived
before the split.

Failure census:

```
 23 expected 404 to be 201
 23 expected 404 to be 200
 10 expected 404 to be 422
  4 expected 404 to be 409
  2 expected [ 404, 404 ] to deeply equal [ 201, 409 ]
  2 expected 404 to be 400
  1 expected 404 to be 415
  1 expected 200 to be 422
```

**65 of 66 are the unmounted route.** No router serves `/appointments`,
`/services`, `/categories`, `/masters` or `/masters/{id}/services`, so every
request reaches the terminal `notFound` and answers 404. `Cannot find module` does
not appear: the tests import only `src/app.js`, which exists — what is missing is
a route, not a module.

**The one exception, named rather than smoothed over.** The new D5 case in
`availability.test.ts` fails on an assertion (`expected 200 to be 422`), not on a
missing route, because P7 is already mounted. It is a behaviour change to an
existing operation, and it is the only case in the suite that can fail that way at
this stage. The other 42 cases in that file pass, and O1 and R1 pass, because they
assert behaviour P7 already has; their value is as the baseline for O2–O10 and
R2–R7.

**Zero skipped.** `skipped 0` in every file. The `beforeAll` hooks arrange only
through operations that exist (R2 accounts, R6 services, R11 links, M4
availability), so no hook fails and no block is skipped.

**Three defects found while producing RED, fixed before the gate.**

1. **Five `public-catalogue` cases were green for a fallback reason.** The
   terminal `notFound` answers 404 for any unmounted path, so "unknown id → 404"
   was true before P2/P5/P6 existed. Each now reads a known id and requires 200
   first. This is the same class as the four fallback-green assertions the S1.2
   gate found.
   **A sixth was found at the gate, and it is a different shape.** C15's second
   assertion — the administrator is absent under `active=false` — is a guard, not
   a proof: `arrangeAdmin` creates the administrator with `active = true`
   (`src/db/schema.ts`, `masters.active` defaults to true), so the filter excludes
   it because it is active, not because D10 excludes it. The assertion stays
   because it is cheap and catches a leak if an administrator is ever created
   inactive; D10 rests on C14, C19 and C24.
2. **Three cases crashed with `TypeError` on `undefined`** instead of failing on a
   status, because they parsed `response.body.items` before checking the status.
   Each now validates the response first, so the failure message names the missing
   operation.
3. **`createApp({ now })` does not type-check** — `tsc --noEmit` reports
   `TS2554: Expected 0 arguments, but got 1` in three files. That is the proof D9
   is not implemented, and it is expected at RED.

## 4. What GREEN will not prove

The gate signs a test set, not a system. These are the things a green run leaves
open, each with an owner. They are the G2 carry-forward register.

| # | Not proved by GREEN | Why | Owner |
|---|---|---|---|
| 1 | REQ-F-004/REQ-F-005: the confirmation page is served and **exactly one** confirmation SMS is recorded | S2.1 returns the token and the URL; serving the page and recording the message is the next stage | SMS-26 |
| 2 | REQ-F-010/REQ-F-011: reminders are actually **sent** (`sent` / `failed`) | S2.1 computes `scheduled` and `skipped` only; nothing dispatches | SMS-29 |
| 3 | State transitions — cancel, complete, and 409 `INVALID_STATE_TRANSITION` | P8 declares no such code and writes only `confirmed`; the transitions arrive with P10/P11 | SMS-27, SMS-34 |
| 4 | A `startAt` in the past | No document defines it. A client can book yesterday and, from S2.2, receive an SMS for it. Candidate answer: 422 `BUSINESS_RULE_VIOLATION` | Human at G2, or CL at validation |
| 5 | `AvailabilitySlot.available: false` | Under D1 a booked slot is removed, so the flag is never false. If a later stage needs it to mean something, that is a contract change | CL-10 candidate at G2 |
| 6 | `Problem.detail` beyond one case | B25 compares one sentence; the other problem responses assert status and `code` only. The S1.3 403 defect (runs-04 §4a) reached a signed stage through exactly this gap | SMS-25 implementation review; next test ticket |
| 7 | P3's declared 400 | P3 declares 400 with no declared trigger (CL-10, carried from S1.3). No case asks for it | CL at validation |

**And one thing GREEN cannot prove about itself:** Vitest does not type-check.
A green run says the assertions hold, not that the code compiles. The GREEN
evidence must include a separate clean `tsc --noEmit`, and the gate says so.

## 5. Decisions D1–D11

Each names the alternative that was not taken, so a later reader can see the
choice rather than infer it.

| # | Decision | Alternative not taken | Why |
|---|---|---|---|
| D1 | A booked slot **disappears** from P7's list; `available` stays `true` on every slot returned | Keep the slot with `available: false` | P7's description says the operation "filters out booked time"; filtering is removal. The flag is required by the schema, so O10 asserts it after a booking rather than leaving it unexamined |
| D2 | `pg_advisory_xact_lock(master_id)` around the booking transaction, plus a partial unique index on `(master_id, start_at) where status <> 'cancelled'` | (a) the index alone; (b) `SELECT … FOR UPDATE` on the master row; (c) `SERIALIZABLE` isolation | (a) closes the exact-start race but not the overlap — O7 would fail. (b) works, but a `FOR UPDATE` on the master row makes R13 (editing a master) wait for the booking to finish: two unrelated actions would block each other, and each transaction would leave a new row version in `masters`. (c) is correct but turns a business refusal into a serialisation failure the client would see as 500 unless retried |
| D3 | A `startAt` off the 30-minute boundary is 422 `BUSINESS_RULE_VIOLATION` | 409 `SLOT_UNAVAILABLE` | The contract puts the requirement on the body: `AppointmentCreate.startAt` — "Must fall on a 30-minute boundary (REQ-NF-008)." A start off the boundary never becomes valid; 409 invites a retry with another slot, which describes a situation other bookings could change |
| D4 | Unknown master id, unknown service id, inactive master, inactive service, unoffered service → 422 `BUSINESS_RULE_VIOLATION` | 404 `NOT_FOUND` | P8 declares 400/409/422/415/500 and **no 404**. Answering 404 would be outside the operation's declared set |
| D5 | P7 requires an **active** master↔service link before it answers 200 | 200 with an empty slot list; or 404 for a service the master does not offer | P7 declares 422 `BUSINESS_RULE_VIOLATION` and, at S1.3, had no input that reached it (G13). A service the master does not offer is that input. 404 is already used for an id that names no service at all, and this service exists |
| D6 | `reminders[]` is computed at read time from `startAt` and "now" | Store reminder rows at booking | Nothing dispatches at S2.1, so a stored row would be a row nothing reads. The consequence is stated: the same appointment read later can report a different status once the moment has passed |
| D7 | P1–P6 belong to SMS-25 through the requirements they implement | A separate ticket for the public catalogue | The SRS matrix assigns REQ-F-001 → SMS-25 (line 897) and REQ-F-002 → SMS-25 (line 898); `resource-model.md` §5 gives P1/P2/P6 → F-001 and P4/P5 → F-002. No ticket exists for a separate catalogue, and `check:test-first` only checks entries that exist, so an unlisted file would be invisible to it |
| D8 | A repeated service id is counted twice — two lines, doubled duration and price | De-duplicate the ids | `serviceIds` declares `minItems: 1`, `maxItems: 20` and **no `uniqueItems`**, so a repeat is a permitted body; REQ-F-001 says the total is the sum of the selected services, read literally |
| D9 | `createApp({ now })` takes an optional clock, defaulting to `() => new Date()` | Fake timers in the tests; or no injection | Reminder status depends on "now". Fake timers would have to intercept the driver's and the framework's timers too; injection is one parameter and makes the dependency visible in the signature |
| D10 | Public surfaces list only `role = 'master'`; an administrator id is 404 on P5/P6 and excluded from P4 | List every row of `masters`; or 403 for the administrator id | The administrator is a `masters` row (D-19), so without this P4 would offer the administrator as bookable. 404 is inside P5/P6's declared set; 403 is not declared on a public operation |
| D11 | P1 lists `active: true` only | List every service, with `active` as a field | P1's summary is "List active services". P4 and P6 default to the unfiltered set, so `active=false` is how a client asks for the deactivated ones — C2 and C21 assert both directions |

## 6. Commands run

| Command | Result |
|---|---|
| `npx vitest run` | exit 1 — 66 failed, 157 passed (223), 0 skipped |
| `npx vitest run <file>` × 8 | the per-file `Tests` lines in §3 |
| `npx tsc -p tsconfig.json --noEmit` | exit 1 — three `TS2554` on `createApp({ now })`, as expected at RED |
| `npm run check:test-first` | exit 1 — 3/7 pass; the four new entries report "no commit adds this file", which is the expected state before the `test:` commit |
| `git status --short src/` | empty |
