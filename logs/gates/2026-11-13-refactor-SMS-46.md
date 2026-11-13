# Refactor record — stage R, behaviour-preserving pass (SMS-46)

| | |
|---|---|
| Gate | REFACTOR (plan §9) |
| Stage | R |
| Ticket | SMS-46 |
| Commit | `95c5a70` — `refactor: extract clock, loader and 404 helpers (SMS-46)` |
| Date | 2026-11-13 |
| Signed by | setrios |
| Decision | **GO** — external behaviour unchanged |

---

## 1. What §9 asks

> Extract remaining logic from controllers into `lib/*`; remove duplication across
> controllers; tighten DTO mapping; keep every route, status code and response
> field identical.
>
> **Proof of unchanged external behaviour:** the same test suite before and after;
> every operation covered by a test; `verify-contract.mjs` shows the operation set
> is unchanged; a diff review confirming no change to route definitions, status
> codes or schema mapping.

Each half of that is answered below with the command that produces it.

## 2. What was extracted

| # | Duplication | Before | After |
|---|---|---|---|
| 1 | The request clock — `(req.app.locals.now as (() => Date) \| undefined)?.() ?? new Date()` | written out at **15** call sites in 7 files | `nowOf(req)` in `src/lib/clock.ts`, 1 definition |
| 2 | The dispatch step of the two appointment loaders | the same 5-line body twice (`loadAppointment`, `loadAppointmentById`) | `withDispatchedReminders(record, now)`, one definition |
| 3 | The "no such appointment" 404 | 6 sites constructing the same two messages | `appointmentNotFoundForToken()` / `appointmentNotFoundForId()` in `src/modules/appointments/lookup.ts` |

**Why these three and not more.** The audit looked for repetition, not for
elegance: `pageRequest`/`pageBody` were already shared (`reference-data/http.ts`),
the reports' period resolution is one function (`reports/period.ts`), the DTO
mappers are one per schema (`appointments/view.ts`), and the handlers in
`notifications/routes.ts` had no duplicated statement left. The three above were
the only repeated *logic* — the rest of the controller text is the per-operation
decision that cannot be shared without inventing a framework, which §9 does not
ask for.

**What was deliberately not moved.** `dispatchDueReminders` and the payments
handlers stay where they are: moving them would rewrite the module graph and the
`tests/manifest.json` claims for no behavioural gain, and the gate's evidence is
strongest when the diff is small enough to read.

## 3. Proof — the suite, before and after

Captured to `logs/runtime/r-refactor-before.txt` (before) and re-run after the
commit:

| Run | Command | Result |
|---|---|---|
| before | `npx vitest run` | `Test Files 23 passed (23)` / `Tests 388 passed (388)` |
| after | `npx vitest run` | `Test Files 23 passed (23)` / `Tests 388 passed (388)` |
| after ×3 | `npx vitest run --sequence.shuffle` | `388 passed` three times |

The suite is the same file set; no test was edited in this commit
(`git show --stat 95c5a70` lists sources only).

## 4. Proof — the contract

```
$ npm run verify:contract
contract: 3.0.3 — 50 operations
```

before and after the commit. `spec/api/openapi.yaml` is untouched by it
(`git show --stat 95c5a70 | grep openapi` is empty), so the operation set, the
schema set and the declared responses are the same file the suite was derived
from.

## 5. Proof — the diff review

```
$ git show --unified=0 95c5a70 | grep -E "^[-+].*router\.(get|post|patch|put|delete)"
0 matches
$ git show 95c5a70 | grep -E "^[-+].*(res\.status|sendJson|HttpProblem\('[0-9])"
0 matches
```

| What the review checks | Result |
|---|---|
| Route registrations (`router.get/post/put/patch/delete`) | not in the diff |
| Status codes (`res.status(`, `HttpProblem` numeric status) | not in the diff; the helpers return the same codes |
| Schema names passed to `sendJson` | not in the diff |
| Response field names | not in the diff; the 404 messages are byte-identical (`lookup.ts` copies them, and C3/L3 assert the `detail` strings for other codes) |

**One place where "identical" needed care:** the 404 *message* is part of the
response body, so `lookup.ts` reproduces it character for character
(`'No appointment exists for the supplied access token.'`,
`'No appointment exists with the supplied id.'`). The two remain distinct on
purpose — P9/P10/P11 and R20–R23/R27 have always answered different details, and
unifying them would be a behaviour change.

## 6. Every operation covered by a test

| Source | Claim |
|---|---|
| `tests/api/structural.test.ts` | the contract's 50 operations are all mounted and validated |
| `logs/gates/2026-11-13-G4-S5.md` §3 | 380/380 at the exit gate, one or more cases per operation |
| `tests/api/api-traceability` §6 | each operation's cases named by stage |

Stage R added no operation, so the coverage above is the same set it was.

## 7. Decision

**GO.** Three duplications removed, 388/388 before and after, 50 operations before
and after, no route, status code, schema name or response field changed.

Signed by: setrios  Date: 2026-11-13
