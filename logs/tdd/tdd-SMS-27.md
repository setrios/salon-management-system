# TDD log — SMS-27 (S2.3 client cancellation)

| Field | Value |
|---|---|
| Ticket | SMS-27 (Feature: client cancellation) |
| Stage | S2.3 |
| Date | 2026-11-12 |
| Test files | `tests/api/cancellation.test.ts` (8, **new**), `tests/api/confirmation.test.ts` (9, **C8 rewritten**) — **8 new cases, 248 in the suite** |
| Fixture | `tests/helpers/booking.ts` — reused unchanged (accounts, services, links, availability through the API) |
| Contract | `openapi.yaml` P10 `cancelAppointmentByToken`; schemas `Appointment`, `Reminder`, `Problem`; `error-model.md` §3.1 (the state-transition table), §4; `resource-model.md` §4, §5.1 |
| Gate | `logs/gates/2026-11-12-test-SMS-27.md` — **PENDING** |
| Inventory decisions | F1–F7, from the S2.3 inventory accepted 2026-11-12 (F1 corrected: a repeat cancellation is 200 unchanged; F2 = (b), reminders not asserted) |

## 1. What the test commit contains

| File | Change |
|---|---|
| `tests/api/cancellation.test.ts` | **new** — 8 cases over P10 |
| `tests/api/confirmation.test.ts` | **modified** — C8 now cancels through P10; the direct `update` is gone; the file header no longer describes `cancelled` as out-of-band |
| `tests/manifest.json` | one entry added: `SMS-27 (test) → SMS-27 (implementation)` |

No source file is touched and no migration exists: `git status --short src/` is
empty. `tests/helpers/booking.ts` is **not** modified — P10 is arranged through
operations that already exist (R2 accounts, R6 services, R11 links, M4
availability, P8 booking).

**The case count moves 240 → 248, not 249.** The inventory proposed nine cases
with K9 (`reminders[]` of a cancelled record are `skipped`). F2 was decided as
(b): plan decision D-11 (`logs/2026-11-08-implementation-plan.md:85`) sends that
question to an addendum, not to code, so K9 is not written and nothing in this
file asserts `reminders[]` after cancellation. The gap is register row 3 of the
gate.

## 2. Inventory — 8 cases

### 2.1 `cancellation.test.ts` — 8 (P10)

| # | Case | What it proves |
|---|---|---|
| K1 | cancels a confirmed appointment: 200, `status: cancelled`, everything else kept | REQ-F-006, SCN-02; REQ-NF-005 (the booking's own fields are the control); F5 (`updatedAt` = the injected clock) |
| K2 | answers 200 with the record unchanged when it is already cancelled | F1, first cell of `error-model.md` §3.1; D15 "idempotent in effect". Read under a **later** clock, so a second write of `updated_at` would be visible |
| K3 | answers 409 `INVALID_STATE_TRANSITION` for a completed appointment | F1, second cell; the only reachable trigger of P10's 409. `completed` arranged out of band (F3) |
| K4 | answers 404 `NOT_FOUND` for a uuid that names no appointment | P10's declared 404, asserted **after a P10 200** in the same case |
| K5 | answers 404 `NOT_FOUND` for a token that is not a uuid | P10 declares no 400, so the shared parameter rule takes the 404 branch (E6's mirror) |
| K6 | records no notification row for any audience | SRS v1.3 lines 253–256 (no cancellation SMS to the client) and 397–400 (cancellation alerts are to master and administrator — SMS-30). Absence asserted for `client`, `master` **and** `admin` |
| K7 | frees the slot: P7 offers it, and P8 books it a second time | `resource-model.md` §4; the partial unique index `appointments_master_start_unique` end to end (F4) |
| K8 | cancels an appointment whose start is already in the past | REQ-F-006's AC "at any time"; F7. P8's acceptance of a past start is the open G2 register row 4 and is not asserted here |

### 2.2 `confirmation.test.ts` — 9, unchanged in count

C8 keeps its subject — P9 answers 200 for a cancelled record, with the same token
and URL (SRS v1.3 glossary "Confirmation Page") — and changes its **arrangement**:
the direct `update appointments set status = 'cancelled'` is replaced by
`POST /appointments/{token}/cancel`. The gate S2.2 §4.3 promised exactly this
("The arrangement is replaced by P10's own call when S2.3 lands"), and the file
header's arrangement note is rewritten so it no longer says the state is put in
place out of band.

The count in this file does not move (9 → 9), so its manifest entry is untouched
and `check:test-first` still proves its ordering against `SMS-26`.

## 3. RED run

```
$ npx vitest run tests/api/cancellation.test.ts tests/api/confirmation.test.ts

 Test Files  2 failed (2)
      Tests  9 failed | 8 passed (17)
```

Full suite, same run:

```
$ npm test

 Test Files  2 failed | 9 passed (11)
      Tests  9 failed | 239 passed (248)
```

**248 = 240 + 8.** The floor S2.2 left is intact: 240 before, 248 after, and the
only existing case that changed is C8, whose count did not move.

Failure census:

```
 8 expected 404 to be 200
 1 expected 404 to be 409
```

**All nine are the unmounted route.** No router serves
`POST /appointments/{token}/cancel`, so every request reaches the terminal
`notFound` and answers 404. `Cannot find module` does not appear: the files
import `src/app.js`, which exists — what is missing is a route, not a module.

**No fallback-green case.** K4 and K5 expect 404, and the unmounted route also
answers 404 — so their first draft was green at RED for the wrong reason. They
were rewritten to cancel a **real** record first and assert that 200 before the
404; the 200 is now the assertion that fails while P10 is missing. This is the
same class runs-05 §4(a) named, and it is the reason the gate's checklist asks
for it explicitly. The file's case count did not move (8 before and after), but the failure
count did: 6 failed and 2 passed before the fix, 8 failed after it. The fix
made the RED stronger, not weaker — the two cases that were green for the
wrong reason now fail for the right one.

**Zero skipped.** The `beforeAll` hooks arrange only through operations that
exist, so no hook fails and no block is skipped.

## 4. What GREEN will not prove

| # | Not proved by GREEN | Why | Owner |
|---|---|---|---|
| 1 | `reminders[]` of a cancelled record | SRS v1.3 does not define it; the contract's P10 example shows `skipped`, the code computes `scheduled`; D-11 sends the decision to an addendum | **addendum SMS-45**; register row 3 |
| 2 | A cancellation message to master or administrator | SRS line 400 assigns it to the notification service | SMS-30 |
| 3 | `completeAppointment` (R23) and the `completed` state it produces | SMS-34 / S5.3; K3 arranges the state out of band and says so | SMS-34 |
| 4 | A cancellation fee | No field carries one; REQ-F-006's "free of charge" is asserted as "the price is unchanged" | — (by construction) |
| 5 | 500 on P10 | Standing non-test N2 of the S2.1 gate | — |
| 6 | Two simultaneous cancellations of one record | Both would answer 200 (the `update` is guarded by `status = 'confirmed'`); not reachable as a distinct outcome through HTTP | — (by construction) |
| 7 | P8's acceptance of a past `startAt` | Open G2 register row 4; K8 uses it, does not assert it | **Human, at G2** |
| 8 | The HTML page and its disabled controls | UI work | SMS-36 |

## 5. Decisions F1–F7

| # | Decision | Alternative not taken | Why |
|---|---|---|---|
| F1 | A repeat cancellation is **200 with the record unchanged**; 409 is for `completed` | 409 on a repeat | `openapi.yaml:428–430`, `error-model.md:186–196` (the document calls the table "the authority … for the state rules in D15") and `resource-model.md:165` all say so. The inventory's first draft said 409; it was corrected before any test was written |
| F2 | `reminders[]` after cancellation is **not asserted and not changed** | (a) `skipped` for a cancelled record; (c) `reminders: []` | (a) matches the contract's P10 example but contradicts the glossary's definition of `skipped` (line 405) and would close plan decision D-11 in a TEST-GATE; D-11 says "If it must be decided, it goes through an addendum, not through code". (c) erases information the contract's example keeps. The gap is the best addendum candidate the project has: SRS silent, contract suggestive, code different |
| F3 | `completed` is arranged out of band, by one `update` | (a) defer K3 to SMS-34; (b) implement R23 now | (a) leaves P10's declared 409 unproven until S5.3; (b) is out of scope. The `update` is the direct write R23 replaces when S5.3 lands — named in the gate |
| F4 | P10 takes **no advisory lock** | Take `pg_advisory_xact_lock(master_id)` as P8 does | Cancellation only frees a block; it never takes one, so it cannot create a double booking. The guarantee that a freed slot is bookable again is the partial unique index, and K7 reads it end to end |
| F5 | A first cancellation writes `updated_at`; a repeat writes nothing | Do not touch `updated_at` | Without a write, "unchanged" and "rewrote the same value" are indistinguishable. K2 reads under a later clock so the difference is observable |
| F6 | The transition table lives in a new pure module `src/modules/appointments/state.ts`; `routes.ts`/`service.ts` are only modified | (a) everything in the existing files; (b) a new module that also does I/O | (a) leaves the manifest entry with no provable `implementation` path — `check:test-first` requires a file that did not exist at the test commit. (b) would make the module a second place where the database is touched. The module holds the table of `error-model.md` §3.1 and a pure function, nothing else |
| F7 | Cancelling a record whose `startAt` is in the past is allowed | Refuse it | REQ-F-006's AC says "at any time"; P10 has no notice period to check, and inventing one would contradict the requirement |

## 6. Commands run

| Command | Result |
|---|---|
| `npx vitest run tests/api/cancellation.test.ts tests/api/confirmation.test.ts` | exit 1 — 9 failed, 8 passed (17), 0 skipped |
| `npm test` | exit 1 — 9 failed, 239 passed (248) |
| `npx tsc -p tsconfig.json --noEmit` | **exit 0** — the new file type-checks; RED is a route failure only |
| `npm run check:test-first` | exit 1 — 9/10; the new entry reports "no commit adds this file", the expected state before the `test:` commit |
| `git status --short src/` | empty |
