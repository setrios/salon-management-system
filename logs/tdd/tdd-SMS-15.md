# TDD log — SMS-15 (S1.3 availability tests)

| Field | Value |
|---|---|
| Ticket | SMS-15 — Test master availability modes (`docs/ticket-list.md` row SMS-15; SCN-09) |
| Stage | S1.3 |
| Date | 2026-11-09 |
| Test file | `tests/api/availability.test.ts` — 43 assertions over 3 operations |
| Fixture | none new. `tests/helpers/accounts.ts` arranges the three staff accounts; services come from R6 and availability from M4, because the contract has an operation for each |
| Contract | `openapi.yaml#/paths/~1masters~1{masterId}~1availability` (P7), `~1me~1availability` (M3, M4); schemas `Availability`, `WeeklyRule`, `DateRule`, `AvailabilityResponse`, `AvailabilitySlot`; `error-model.md` §3–§4 |
| Gate | `logs/gates/2026-11-09-test-SMS-15.md` — **SIGNED — GO**, setrios, 2026-11-09 (`gate:` `6f66bc6`, `test:` `46afca6`) |

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

## 9. Test-side change after the gate — the `test:` commit before `feat:`

The gate signs 43 assertions, and the count did not move: still 43. Two of them,
however, stated their Given by relying on *another test not having run yet*, and
both were repaired before the implementation was committed. The repairs are test
code, so they go in a `test:` commit of their own, ahead of the `feat:` one —
`check:test-first` reads the commit that *added* the file, so a later `test:`
commit changing it does not disturb the ordering proof.

1. **"returns both collections, empty, for a master who has never set any"**
   read Petro's record while the P7 block's `beforeEach` writes Petro's rule. It
   passed by running first. It now creates a master with `seedAccount` and reads
   that master — the claim is about a fresh master, which is what the sentence
   says.

2. **"keeps each rule set private to its own master"** asserted that Ihor's set
   was empty, while other cases in its own block write Ihor's rules. This one
   survived the file's natural order and failed under `--sequence.shuffle`
   (runs-04 §4b). It now writes both sides in the case and reads each back by its
   own owner.

Neither is a defect the RED could have shown: under RED every one of the 43 failed
on 404, so an order-dependent Given and an independent one are indistinguishable.
Both are the same class runs-03 §4 found at S1.2 — the case whose Given is
"nobody has touched this yet". Recorded here rather than silently fixed because a
signed assertion count is a promise about *what* is asserted, and a test that
passes only in one order is not asserting it.

## 10. GREEN run — SMS-24 implementation

### 10.1 What was implemented

| Operations | Module | Files |
|---|---|---|
| P7 `getMasterAvailability` (public) | `availability` | `routes.ts` |
| M3 `getMyAvailability` (JWT-M) | `availability` | `routes.ts` |
| M4 `replaceMyAvailability` (JWT-M) | `availability` | `routes.ts` |
| (shared) slot arithmetic, rounding, windows | `lib` | `availability.ts` |
| (shared) wall clock, calendar dates, Kyiv offsets | `lib` | `time.ts` |
| (shared) the window rule, decision (a) | `availability` | `rules.ts` |
| (shared) storage: read, replace-in-one-transaction | `availability` | `service.ts` |

Modified rather than created, so under `"touches"` in the manifest:
`src/db/schema.ts` (two tables, three checks), `src/routes.ts` (mounts the three
operations), `src/middleware/validate.ts` (`format: date`), and
`src/middleware/authorize.ts` (the role-derived 403 detail, §10.3(a)). The
migration `0002_availability.sql` and its snapshot arrive in the `feat:` commit,
as gate §7 records.

### 10.2 The three GREEN conditions

**(1) G4 — overlapping windows: no validation, no silent merge, the choice
visible.** `modules/availability/rules.ts` reports only a window whose end is not
after its start; it never compares two windows to each other, and the schema
carries no uniqueness or overlap constraint on `(master_id, day_of_week)` — only
the day range and the window-order checks. So a PUT with two overlapping Monday
windows is **accepted**, 200, and stored as sent.

Something must nevertheless be computed when P7 asks for that Monday, and this is
the decision, stated as a decision:

> **Decision (SMS-24).** Two windows on one weekday that overlap are enumerated
> **both, in the order the caller supplied them**, and a slot start that appears
> in both is emitted **once** (de-duplicated by minute-from-midnight). No union,
> no intersection, no rejection.
>
> This is a choice this implementation had to make in order to answer at all, not
> a reading of any document. Union, intersection and rejection are equally
> defensible and none of the SRS, the contract or `error-model.md` chooses
> (gate §5 G4). It is recorded here so that a later reader — S2.1, which will
> subtract bookings across these windows, or a CL row if one is ever opened — can
> see that the behaviour is *invented at the minimum*, not derived. A change to
> it is a change to a decision, and should be argued, not "fixed".
>
> The de-duplication exists because the alternative — the same start listed twice
> in one response — would contradict `AvailabilityResponse.slots` being a set of
> bookable starts. Emitting it twice is the only other reading, and it is worse
> under every interpretation of union and of intersection.

**(2) G13 — P7's 422 stays unreachable.** `routes.ts` throws three things: 404 for
an unknown master, 400 for a `serviceIds` entry that is not a uuid, and 404 for a
uuid naming no service. No path returns 422. In particular:

- a service the master does not offer is **not consulted at all** —
  `findServiceDurations` reads the `services` table, never `master_services` — so
  "service not offered by this master" cannot become 422 (or anything else) at
  this stage. This is deliberate: the gate says that trigger belongs to S2.1 and
  must not be invented now;
- overlapping windows cannot produce 422 either, because `windowViolations` does
  not look at overlap (§10.2(1)).

`schema.ts` has no check that could surface as 422 for P7, and P7 takes no body at
all. The declaration therefore stays declared-but-unreached, exactly as gate §5
G13 requires. S2.1 owns the decision to give it a trigger or to move it to CL-10.

**(3) PUT is full replacement.** `service.ts#replaceAvailability` deletes both
tables for the master and inserts what was sent, inside one `db.transaction`, so a
failure half-way rolls back to the previous set rather than leaving a mixture:

- a second PUT leaves **exactly** what it sent — verified in runs-04 §2 by
  comparing the read-back to the request (`equals what was sent: true`), after the
  first PUT had written a different Monday rule that is now gone;
- empty arrays clear both collections — `weekly: [], dates: []` answers 200 with
  two empty arrays, and the delete runs unconditionally (the `insert` calls are
  skipped only when a collection is empty, not the delete);
- a master who never set anything gets **two empty arrays, not 404** — M3 answers
  200 `{"weekly":[],"dates":[]}`, asserted with a freshly created master
  (§9.1) and again in runs-04 §2 with an account nothing else wrote.

Ordering in the read path is `dayOfWeek, startTime` and `date, startTime`, so the
response is deterministic but the file's assertions never depend on it (the one
that would have was changed to a sorted comparison at RED).

### 10.3 Defects found at GREEN

**(a) The 403 body named the administrator role on a master-only operation.**
`requireRole` had a single hard-coded detail written when `adminAccess` was its
only caller. S1.3 is the first `requireRole('master')`, so the body said "This
operation requires the administrator role" to an administrator who was being
refused *because they are one*. Status correct, sentence contradicting it. The
detail is now derived from `role` via a `Record<PrincipalRole, string>`, exhaustive
so a third role will not compile until it is named. Found only by reading the
built artifact's body (runs-04 §4a); no test pins `detail`, and runs-04 §7 records
that as an open item rather than a decision to start asserting prose.

**(b) A query `date` of the wrong type reached PostgreSQL — 500 where the
contract requires 400.** `coerce()` in `validate.ts` handled `integer`, `number`,
`boolean` and `format: uuid` but not `format: date`, so `date=not-a-date` passed
validation and failed the database cast. Now rejected with `parseCalendarDate`
from `lib/time.ts`, which also refuses `2026-02-30` — a string of the right shape
naming no day. Contract-safe: all eleven `date` query parameters in the contract
sit on operations that declare 400, so the resulting MALFORMED_REQUEST is inside
every declared set (the CL-09 principle, parameter side). The 400 in runs-04 §2
is this fix's evidence, and the absence of an `error`-level record in that run's
log window is its after-state.

**(c) Two order dependences in the test file** — §9 above.

None of the three changed an assertion: 43 before, 43 after, and 156 for the
whole suite throughout (113 + 43).

### 10.4 Required evidence

**(a) `npx tsc --noEmit` — exit 0.** Run immediately before the final double test
run and again after the dead-code removal in §10.5.

**(b) `npm test` twice consecutively — 156/156 both times.**

```
$ npm test
 Test Files  4 passed (4)
      Tests  156 passed (156)
   Start at  14:48:23
   Duration  4.85s (transform 130ms, setup 37ms, import 1.96s, tests 2.36s, environment 0ms)

$ npm test
 Test Files  4 passed (4)
      Tests  156 passed (156)
   Start at  14:48:28
   Duration  4.74s (transform 132ms, setup 37ms, import 1.93s, tests 2.28s, environment 0ms)
```

These are the final runs, after §10.5's removal. Earlier runs at 156/156 taken
before that edit are not quoted: same count, not the same tree.

**(c) `npm test -- --sequence.shuffle` — 156/156, eight times, after two fixes.**

The first shuffled run failed, so the unshuffled green that preceded it was luck
of ordering, not independence. One failure only — the privacy case in §9.2:

```
AssertionError: … expected [ …(1) ] to deeply equal []
  tests/api/availability.test.ts:393    expect(theirs.body.weekly).toEqual([]);
```

After the fix in §9.2, and after §10.5's removal:

```
$ for i in 1 2 3 4 5; do npm test -- --sequence.shuffle; done
      Tests  156 passed (156)
      Tests  156 passed (156)
      Tests  156 passed (156)
      Tests  156 passed (156)
      Tests  156 passed (156)

$ for i in 1 2 3; do npm test -- --sequence.shuffle; done    # final tree
      Tests  156 passed (156)
      Tests  156 passed (156)
      Tests  156 passed (156)
```

Eight seeds over two versions of the file. One pass would not be evidence; this is
the second stage in a row where shuffle found a case whose Given was "nobody has
touched this yet" (runs-03 §4, S1.2), and the repetition is why the count of seeds
is stated rather than a single green line.

**(d) `npm run check:test-first` — 3/3.**

```
PASS SMS-21 (test) → SMS-22 (implementation) tests/api/auth.test.ts
PASS SMS-14 (test) → SMS-23 (implementation) tests/api/reference-data.test.ts
PASS SMS-15 (test) → SMS-24 (implementation) tests/api/availability.test.ts

check-test-first: 3/3 entries pass.
```

The checker was not modified. `tests/manifest.json` was not modified either: its
SMS-15 entry was written in the `test:` commit and left alone, and
`validate.ts`/`authorize.ts` were already under `"touches"`.

**(e) Control run on `dist/` — `logs/runs/runs-04.md`.** Built with `npm run
build`, driven over a real socket on an ephemeral port against a scratch database
holding only what `0000`, `0001` and `0002` create. It establishes, in the four
places the gate assigns to it rather than to the suite: P7 answers 200 with **no
token at all**; M3 answers **403 FORBIDDEN to an administrator** and 401 without
a token, with the body naming the **master** role; a second PUT **replaces** (a
read-back equal to the request, with the first PUT's Monday rule gone) and an
empty PUT clears both collections; and one unchanged wall-clock window yields
`+02:00` on `2026-12-07` and `+03:00` on `2027-07-05`, six starts each from a
90-minute occupied block.

### 10.5 Removed at GREEN: two unused exports

`normaliseAvailability` in `lib/availability.ts` was never called — the route
persists the body the schema already validated, and the schema enforces `HH:MM`.

`isValidWindow` in `lib/time.ts` was imported by `lib/availability.ts` and unused
there: when `hasOnlyValidWindows` was removed from `lib` so that `rules.ts` became
the single source of the window check, the import stayed behind and `rules.ts`
re-spelled the comparison inline. `rules.ts` now calls `isValidWindow` and `lib`
no longer imports it, so the rule has one body and that body has one caller.
Neither removal touched an assertion: 156 before, 156 after, and both test runs
and all shuffled runs quoted in §10.4 are from after the removal.

### 10.6 What GREEN does not prove

**Overlap behaviour is asserted nowhere.** By design (gate §5 G4): the decision in
§10.2(1) is recorded, not tested, and the gate forbids inventing a rule to assert.
A future ticket that opens a CL row on overlap should start from that decision
line.

**Occupancy.** No slot is subtracted and none is `false` (gate §4.4, §5 G2/G12);
`appointments` arrives in S2.1, which must revisit this file.

**The declared 422.** Unreached and, at this stage, unreachable (§10.2(2)).

**Built-artifact coverage is a control run, not a test.** Fourth occurrence
(runs-01 §4, runs-02 §5, runs-03 §7, runs-04 §7). §10.3(a) is one more argument
for closing it: the suite's role assertions were green while the sentence next to
them was wrong.

**REQ-NF-008 stays owned by SMS-25.** The boundary assertions here are the early
check gate §4.2/tdd §5.4 describe, not coverage; the final matrix has one owner.

## 11. Decisions this implementation made — one line each, findable

Everything below is a choice this implementation had to make. Six are listed; of
them **D1 is the one the gate calls undefined** — the others are constrained by a
document and are recorded so the constraint is visible next to the code, not so
they can be argued with. They are kept together so a later stage finds them
without reading the diff, and so that changing one is visibly a change of
decision.

| # | Decision | Where the behaviour lives | Why it is a decision and not a finding |
|---|---|---|---|
| D1 | Two overlapping weekly windows on one day: **enumerated both, in supplied order, identical starts emitted once**. No validation, no merge, no rejection | `lib/availability.ts#slotsFor` (`seen` set) | G4. Union, intersection and rejection are all defensible; no SRS, contract or error-model text chooses. Stated as a decision, not as a conclusion |
| D2 | A date rule for a date **replaces** the weekly rules for that date entirely | `lib/availability.ts#windowsFor` | The `dates` description says "replaces", so this one is read from the contract, not invented — listed because the schedule behaviour depends on it |
| D3 | Slot start snapped **up** to the 30-minute boundary before the fit test; a window opening off-boundary starts later rather than being rejected | `lib/availability.ts#ceilToBlock` | REQ-NF-008 constrains *starts*, not windows. The alternative (rejecting an off-boundary window) is also defensible; not chosen |
| D4 | `occupiedDurationMinutes` derived from the summed durations with an **inclusive** round-up (90 stays 90) | `lib/availability.ts#roundUpToBlock` | REQ-F-031 + SCN-13's "spans 90 minutes". An exclusive round-up (90 → 120) would contradict SCN-13, so this one is constrained, listed for completeness |
| D5 | Kyiv offset read from ICU at local noon of the date, never stored | `lib/time.ts#salonOffsetMinutes` | The zone's rules are the IANA database's. A hard-coded pair would be a second, stale copy |
| D6 | A master with no rules answers **200 with two empty arrays**, never 404 | `modules/availability/routes.ts` (M3), `service.ts#readAvailability` | `Availability` makes both collections required, so "nothing configured" is an empty set; P7 is consistent and answers 200 with an empty slot list. Constrained by the schema, listed so the 200-not-404 reading is on record |
