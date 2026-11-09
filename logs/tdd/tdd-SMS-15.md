# TDD log — SMS-15 (S1.3 availability tests)

| Field | Value |
|---|---|
| Ticket | SMS-15 — Test master availability modes (`docs/ticket-list.md` row SMS-15; SCN-09) |
| Stage | S1.3 |
| Date | 2026-11-09 |
| Test file | `tests/api/availability.test.ts` — 43 assertions over 3 operations |
| Fixture | none new. `tests/helpers/accounts.ts` arranges the three staff accounts; services come from R6 and availability from M4, because the contract has an operation for each |
| Contract | `openapi.yaml#/paths/~1masters~1{masterId}~1availability` (P7), `~1me~1availability` (M3, M4); schemas `Availability`, `WeeklyRule`, `DateRule`, `AvailabilityResponse`, `AvailabilitySlot`; `error-model.md` §3–§4 |
| Gate | `logs/gates/2026-11-09-test-SMS-15.md` — **PENDING**, awaiting the human's signature |

## 1. What the test commit contains

| File | Change |
|---|---|
| `tests/api/availability.test.ts` | new — 43 assertions over P7, M3 and M4 |
| `tests/manifest.json` | entry added in this same commit: `SMS-15 (test) → SMS-24 (implementation)`, sources REQ-F-015, REQ-F-031, REQ-NF-008, SCN-09, SCN-13 |

No source file is touched, and no behaviour is implemented by this commit. The
working tree holds exactly these two files:

```
$ git status --short
 M tests/manifest.json
?? tests/api/availability.test.ts
```

## 2. Scope

Exactly three operations, as the human fixed it on 2026-11-09:

| Operation | Method and path | Auth | Declared responses |
|---|---|---|---|
| P7 `getMasterAvailability` | `GET /masters/{masterId}/availability` | public (`security: []`) | 200, 400, 404, 422, 500 |
| M3 `getMyAvailability` | `GET /me/availability` | JWT-M | 200, 401, 403, 500 |
| M4 `replaceMyAvailability` | `PUT /me/availability` | JWT-M | 200, 400, 401, 403, 415, 422, 500 |

P1–P6 are **not** in this stage. They are owned by S2.1, as recorded in
`logs/gates/2026-11-08-test-SMS-14.md` §1 and §4 G3. Extending S1.3 into the
public catalogue would move the client booking flow's Given into an
availability ticket.

## 3. Assertion inventory

| Group | # | What is asserted | RED |
|---|---|---|---|
| Role on M3/M4 | 6 | M3 and M4 each: 401 without a token, 403 `FORBIDDEN` for an **administrator** token; 200 for the owning master (M3 twice, M4 once) | 6 fail |
| Full replacement (REQ-F-015, POS-26) | 6 | weekly + date rule stored and read back unchanged; a second PUT leaves only what it sent (not a merge); an empty set clears both; a master who never set any gets two empty arrays, not 404; one master's set is invisible to another; PUT is idempotent | 6 fail |
| M4 refusals | 7 | 422 `VALIDATION_ERROR` for missing `weekly` (`REQUIRED`) and `dates`; 422 `UNKNOWN_FIELD` for an undeclared `timeZone`; 422 for `dayOfWeek` outside 1–7 and for a `startTime` that is not `HH:MM`; 415 for a non-JSON body; 422 `BUSINESS_RULE_VIOLATION` for an inverted window and for a zero-length window | 7 fail |
| Duration arithmetic (REQ-F-031, SCN-13) | 4 | 45 + 30 sums to 75 and occupies 90; every slot's `durationMinutes` is 90; an aligned 90 stays 90; a single 45 rounds to 60 | 4 fail |
| Slot starts and boundary (REQ-NF-008, POS-27) | 5 | every start is `:00` or `:30`; the exact 14 starts of a 90-minute block in a 10:00–18:00 window; each `endAt` is start + 90; an off-boundary window opening (10:15) yields starts from 10:30; a window shorter than the block yields no slots | 5 fail |
| Weekly vs date (REQ-F-015, SCN-09) | 4 | slots on the weekly weekday; the one-off Thursday bookable though no weekly rule names it; a date rule **replaces** the weekly window on that date and only that date; a weekday the pattern does not name yields no slots | 4 fail |
| Time zone | 2 | the same wall-clock window produces `+02:00` instants in winter and `+03:00` in summer | 2 fail |
| P7 access and refusals | 8 | 200 with no token at all (public); 404 for an unknown master id and for an unknown service id; 400 for absent `date`, absent `serviceIds`, a non-date `date` and a non-uuid `serviceIds` entry; 200 with an empty slot list for a master with no availability | 8 fail |
| Occupancy at this stage | 1 | every slot is `available: true`, because nothing can book one | 1 fail |
| **Total** | **43** | | **43 fail** |

Success bodies are validated with `getSchemaValidator` against `Availability`
and `AvailabilityResponse`; error bodies against `Problem` and pinned to
`application/problem+json` exactly. No shape is restated by hand.

## 4. RED run — verbatim output

```
$ npx vitest run tests/api/availability.test.ts --reporter=verbose

 RUN  v4.1.12 /home/novell/Documents/VScode-projects/pis/salon-management-system

 × tests/api/availability.test.ts > S1.3 availability — P7, M3, M4 > role on the caller-scoped operations (M3, M4) > M3 answers 401 without a token 9ms
   → expected 404 to be 401 // Object.is equality
 × tests/api/availability.test.ts > S1.3 availability — P7, M3, M4 > role on the caller-scoped operations (M3, M4) > M3 answers 403 FORBIDDEN for an administrator token 2ms
   → expected 404 to be 403 // Object.is equality
 …
 Test Files  1 failed (1)
      Tests  43 failed (43)
```

Failure census over the run, from the JSON reporter:

```
total assertions: 43 failed: 43 passed: 0 skipped: 0

 32 expected 404 to be 200
  6 expected 404 to be 422
  2 expected 404 to be 401
  2 expected 404 to be 403
  1 expected 404 to be 415
```

**Expected reason for every one of them.** No availability router is mounted, so
`src/routes.ts` has no handler for either path and the request reaches the
terminal `notFound` — 404 `NOT_FOUND`, measured everywhere. The 400, 415 and 422
rows fail inside `getSlots` / `putAvailability` themselves for the same reason:
validation never runs because no operation claims the request.

The count is exactly the assertion count: **43 tests, 43 failures, 0 skipped,
0 passed.** Nothing here is green by accident, and nothing is "passing for the
fallback reason" — the S1.2 gate had four such assertions, this file has none.

**A defect found and fixed while producing RED, not after.** The first version
arranged each P7 case's Given in a nested `beforeAll` that called M4. Under RED
that hook fails, and Vitest *skips* the rest of the block rather than failing
it: the run reported `20 failed | 23 skipped (43)`. A skipped assertion is not
RED evidence, and the gate would have been signed over 23 assertions that had
never executed. Arrangement moved to `beforeEach` (`arrangeMondayWindow()`),
which fails each case in place. This is the same class of defect as SMS-14's
order dependence: the harness made a mistake invisible.

## 5. The three decisions this file is written against

### 5.1 Time

Every date in the file is a literal — `2026-12-07`, `2026-12-14`,
`2026-12-31`, `2027-07-05`, `2027-07-06`, `2026-12-08`. Nothing reads the wall
clock; nothing is derived from "today". A weekly rule names an ISO weekday and
a date rule names a date, so the rules themselves never depend on when the file
runs, and P7 takes the date it should compute as a query parameter.

**Consequence for the gate:** S1.3 needs no injected clock. S3.2 does — reminders
are "appointment time minus 24 h and 2 h", which is relative to now — and that
decision should be taken there, against the reminders' own tests. Injecting a
clock here would be a mechanism with nothing to inject it into.

The test that would break first if this changed is any of the two offset cases:
they assert an absolute instant string, so a suite that computed "the coming
Monday" would produce a different date on some weeks and fail loudly rather than
silently.

### 5.2 Time zone

Rule times are salon wall clock; slot instants carry an offset. The zone is
**Europe/Kyiv** — `resource-model.md` §3 ("Timestamps: RFC 3339 with offset,
Europe/Kyiv") and REQ-NF-007 (one location, one zone, no selector anywhere in
the contract). Two Monday dates, one in each half of the year, make the zone
observable:

| Date | Weekday | Kyiv offset | Expected first start |
|---|---|---|---|
| `2026-12-07` | ISO 1 (Monday) | `+02:00` | `2026-12-07T10:00:00+02:00` |
| `2027-07-05` | ISO 1 (Monday) | `+03:00` | `2027-07-05T10:00:00+03:00` |

Both instants were checked against Node's ICU data before the assertions were
written (`Intl.DateTimeFormat` with `timeZone: 'Europe/Kyiv'`), not assumed. An
implementation that normalises to UTC passes the winter case and fails the
summer one.

### 5.3 Occupancy is not computed at this stage

P7 computes slots from availability windows and the requested services'
durations. It does **not** subtract booked appointments: there is no
`appointments` table until S2.1. `available` is therefore `true` for every slot,
and the file says so in one assertion with a comment saying exactly that. The
gate repeats it in a single line. S2.1 must revisit both.

The rounding that *is* this stage's work, by traceability, is REQ-F-031:
`totalDurationMinutes` is the unrounded sum and `occupiedDurationMinutes` is the
sum rounded up to the next 30-minute boundary (75 → 90).

### 5.4 REQ-NF-008 is an early check here, not coverage

The SRS traceability matrix assigns REQ-NF-008 to **SMS-25** (`P8, P11, R19,
R21`). Asserting that every start P7 offers is on a 30-minute boundary is an
*early* check of the same property, available one stage before the booking flow —
it is not the requirement's owner. On the final matrix SMS-25 stays the single
owner; S1.3 is recorded as an early check, so the requirement does not appear
covered twice.

### 5.5 P7's declared 422 has no trigger at this stage

P7 declares 200, 400, 404, 422, 500. At S1.3 no input reaches its 422: typing
failures give 400, an unknown master or service id gives 404, and the business
rules P7 could break are about occupancy and the offerable service set, neither
of which exists before S2.1. The declaration is **deferred to S2.1** — where a
trigger appears (a start overlapping a booking, a service the master does not
offer) or it becomes a CL-10-style declared-but-unreachable row. No assertion is
added here: 43 stays 43. Gate §5 G13.

## 6. Contract observations raised for the gate

**6.1 `serviceIds` is a comma-separated string, not an array.** The contract
declares `type: string` with `description: "Comma-separated service ids"` and
the response echoes `serviceIds` as an array of uuids. So the request side is
CSV, the response side is a list. The file sends `"<uuid>,<uuid>"`.

Two questions follow, and both are answered by reading the contract rather than
by inventing a rule:

- **What is 400 here?** Every entry of `serviceIds` must be a uuid, so an entry
  that is not one is an ill-typed query parameter → 400 `MALFORMED_REQUEST`
  (`error-model.md` §3, and P7 declares 400).
- **What is 404 here?** A well-formed uuid that names no service is an unknown
  resource id / unknown service → 404 `NOT_FOUND`, and P7 is in the §3 list for
  404. The file asserts exactly that.

**6.2 M4's `BUSINESS_RULE_VIOLATION` has one reachable trigger — asserted.**
`M4` is listed in `error-model.md` §3 for `BUSINESS_RULE_VIOLATION` (422). The
schema accepts any `HH:MM` pair with `endTime` before `startTime`, and accepts a
zero-length window. Those are schema-valid bodies that break the rule a window
carries, and they are the only input of M4 that can reach the code M4 declares.

The human decided **(a)** on 2026-11-09: both are rejected with 422
`BUSINESS_RULE_VIOLATION`, both assertions stand, no CL row. The distinction that
decides it — and that keeps G4's overlapping windows unasserted — is
*self-contradictory* versus *undefined*: a window ending before it starts is not a
window under any reading, while a union, an intersection and a rejection of
overlapping windows are all defensible with no document choosing. CL records a
contradiction between approved documents; an unwritten rule is not one.

**6.3 A date rule for a date with no weekly rule stands alone.** SCN-09 requires
it ("slots between 12:00 and 16:00 on 2026-12-31 are bookable"), and the
`dates` description says a date rule *replaces* the weekly rule for that date.
The file asserts both directions: replacement on a Monday that also has a weekly
rule, and standalone availability on a Thursday that does not.

**6.4 A master with no availability is 200 with an empty list, not 404.** M3
returns `Availability` with `weekly` and `dates` both **required**, so the
schema itself says "nothing configured" is two empty arrays. P7 is consistent:
the master exists, the slot set is empty. Asserted in both places.

## 7. Causal independence

The `tests/manifest.json` entry is in this commit (plan §6.2). It lists the five
files SMS-24 is planned to create:

```
src/modules/availability/routes.ts
src/modules/availability/service.ts
src/modules/availability/rules.ts
src/lib/availability.ts
src/lib/time.ts
```

`src/lib/` is plan §5's pure-logic layer — "knows neither Express nor SQL" — and
the slot arithmetic, the rounding and the wall-clock/offset conversion belong
there rather than in a route handler, so S3.2 and S2.1 reuse them. Files SMS-24
only modifies are under `"touches"`: `src/db/schema.ts`, `src/routes.ts`,
`src/middleware/authorize.ts`, `src/middleware/validate.ts`. The migration files
are deliberately **not** listed there either: `drizzle-kit generate` names them
with a random slug (`0002_<word>.sql`), so a path written now would not match the
file it creates. The gate records that they arrive in the `feat:` commit.

Before the `test:` commit:

```
$ npm run check:test-first -- --verbose
…
FAIL SMS-15 (test) → SMS-24 (implementation) tests/api/availability.test.ts
     ✗ tests/api/availability.test.ts: no commit adds this file, so the ordering cannot be proven. Commit it with the ticket's `test:` commit first.

check-test-first: 2/3 entries pass.
```

Expected immediately after the `test:` commit, with no other change:

```
PASS SMS-15 (test) → SMS-24 (implementation) tests/api/availability.test.ts
     · test added in <sha> test: add S1.3 availability tests (SMS-15)
     · header cites REQ-F-015, REQ-F-031, REQ-NF-008, SCN-09, SCN-13
     · src/modules/availability/routes.ts: not committed yet (unambiguously after the test)
     · … four more of the same
check-test-first: 3/3 entries pass.
```

## 8. Commands run

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run tests/api/availability.test.ts` | exit 1 — 43 failed of 43 |
| `npx vitest run tests/api/availability.test.ts --sequence.shuffle` | exit 1 — 43 failed of 43, same census |
| `npm test` | exit 1 — 43 failed, 113 passed (156); the S1.0, S1.1 and S1.2 files stay green |
| `npm run check:test-first -- --verbose` | exit 1 — 2/3, the new entry uncommitted, as expected before the `test:` commit |
