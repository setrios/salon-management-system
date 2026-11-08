# Implementation plan — Salon Management System REST API (TDD phase)

Date: 2026-11-08
Status: **DRAFT — awaiting PLAN approval.** No code is written before the
related gate record in `logs/gates/` is signed.
Owner: human (approval, gate decisions, commits, dependency installation),
coding agent (tests, implementation, verification evidence).
Inputs: SRS v1.3 (approved 2026-09-27), OpenAPI contract approved at API-GATE
(GO, 2026-10-26), `spec/api/api-traceability.md`, SDD plan
`logs/2026-10-21-sdd-plan.md` (PLAN-GATE GO, 2026-10-22), risk register,
ticket list `docs/ticket-list.md` (SMS-1..SMS-43).

This plan supersedes the undated draft circulated on 2026-11-08. The differences
are listed in §12; each is traceable to a verified defect or to a decision
recorded in §3.

---

## 1. Repository state at plan time

| Artifact | State | Consequence |
|---|---|---|
| `spec/salon-management-system-srs-v1.3.tex` | Approved; 33 REQ-F + 9 REQ-NF; SCN-01..15; traceability matrix with Ticket column | Single source of truth for behaviour |
| `spec/api/openapi.yaml` | Approved contract; 50 operations; 58 schemas; 16-code `Problem` model; Redocly lint exit 0 | Test oracle for every request and response |
| `spec/api/api-traceability.md` | FINAL; REQ → operation → scenario, mock status | Basis for the test matrix in §9 |
| `spec/api/scenarios/*` | 27 positive, 17 negative scenarios against the Prism mock | Reused as contract-level expectations, not as behaviour proof |
| `docs/ticket-list.md`, GitHub issues #1..#43 | Consistent; SMS-1..3 and SMS-38..43 closed | Tickets for this phase already exist; only the addendum needs a new one |
| `src/`, `tests/` | Empty (`.gitkeep` only) | Everything is created from scratch |
| Tooling on the machine | Node v26.8.1, npm 11.19, Docker 29.9.3 + Compose 5.7.0, `gh` authenticated | Sufficient for the chosen stack |
| Installed libraries | `spec/api/node_modules` only (Redocly 2.71.0, Prism 5.16.0, AJV 8.20.0, `yaml`) | AJV is reused; the application stack still needs one `npm install` by the human |

Repository convention note: commits `79d2978` removed "Lab N" and "student"
wording from all documents. New artifacts therefore use neutral names
(`logs/tdd/`, `logs/gates/`, `logs/runs/`, `logs/validation/`), not `logs/lab/`.

---

## 2. Scope

**In scope:** the REST API behind the approved contract — all **50 operations**
(decision D-5, consistent with D21: 11 public/booking, 2 auth, 7 master,
30 administrator). Stages S1–S5 of the SDD plan, the NFR checks of SMS-20, the
refactoring pass, one addendum with a full repeated SDD cycle, and the final
verification and validation.

**Out of scope:** UI/frontend (React/Vite), real SMS gateway, real payment
gateway, client accounts, loyalty, payroll, no-show tracking — all excluded by
SRS v1.3 §2.3, §3.5 and REQ-NF-009. Tickets SMS-36 and SMS-37 carry no
operation in the contract and therefore require no implementation code; SMS-20
covers their acceptance criteria as NFR checks.

**Reserve scope (only if the schedule fails):** drop the five detail `GET`s
P2, P5, R3, R7, R15, giving **45 operations**, exactly as D21 permits. They are
optional trims, not duplicates; `R25` is not in that set. Any such cut is
recorded as a gate decision, not done silently.

---

## 3. Decisions in force

| ID | Decision | Status |
|---|---|---|
| D-5 | Contract untouched; all **50** operations. Reserve: 45 without P2/P5/R3/R7/R15, per D21 | Fixed |
| D-6 | Own structured JSONL logger; no `pino` | Fixed |
| D-7 | Separate `salon_test` database; tables truncated before each test file | Fixed |
| D-8 | `jose` for JWT signing and verification (Node ESM + TypeScript stack) | Fixed |
| D-9 | No erratum. `createAppointmentAdmin` returns `Appointment` — see CL-06 | Fixed |
| D-10 | OpenAPI 3.0 → JSON Schema conversion for AJV (`exclusiveMinimum: true` → numeric) — see CL-08 | Fixed |
| D-11 | Reminder behaviour on cancellation is not asserted in tests; recorded as a clarification candidate, not invented. The cancellation example shows a reminder with `status: skipped`, and SRS v1.3 does not define what happens to pending reminders on cancellation. If it must be decided, it goes through an addendum, not through code | Fixed |
| D-12 | Two commits per ticket: `test:` (RED evidence) then `feat:` (implementation) | Fixed |
| D-13 | Addendum deadline: after the base implementation is stable, before verification (§8) | Fixed |
| D-14 | Stack confirmed as TypeScript + Express 5 + PostgreSQL 16 + Drizzle + Vitest + Supertest + `jose`; no return to Node built-ins (§3.1) | Fixed 2026-11-08 |
| D-15 | CL-06, CL-07 and CL-08 dispositions confirmed as written; the register stays `CLOSED`, since a clarification row does not block a gate | Fixed 2026-11-08 |
| D-16 | S1.0 owns ticket **SMS-44** (type `Test`); the addendum ticket is **SMS-45** (§8.1) | Fixed 2026-11-08 |
| D-17 | The scaffold predates every test and is committed as `feat: infrastructure scaffold` before SMS-44; it is not encoded as a skip flag. Ordering for pre-existing files is proved by run order in `logs/tdd/`, not by git — see §6.2 | Fixed 2026-11-08 |

### 3.1 Stack

| Layer | Choice |
|---|---|
| Language / runtime | TypeScript, Node.js ESM (`NodeNext`), Node v26.8.1 |
| HTTP | Express 5 |
| Database | PostgreSQL 16 (Docker Compose) |
| Persistence | Drizzle ORM + drizzle-kit migrations |
| Contract validation | OpenAPI 3.0.3 → AJV 8 (validators generated from the contract) |
| Auth | Bearer JWT via `jose` (HS256). Password hashing is **not** chosen yet: `bcrypt` was removed from the scaffold because nothing imports it, and the algorithm is selected at TEST-GATE S1.1 together with the first login test. `express-session` and `connect-pg-simple` are **not** used: the contract fixes `bearerAuth` (D10) and `LoginResponse.tokenType = Bearer` |
| Tests | Vitest + Supertest |
| Logging | Own JSONL module |

Zod is not the contract source of truth. If Zod is used at all, it is limited to
internal input typing, never to define what the API accepts or returns.

---

## 4. Execution policy (who runs what)

CLAUDE.md forbids the agent from installing dependencies and from any
non-idempotent git operation. The split below is the compliant working mode, not
an exception to the policy.

| Action | Human | Agent |
|---|:---:|:---:|
| Create or edit files in the working directory | — | ✓ |
| `npm install`, adding a dependency | ✓ | — |
| `docker compose up -d postgres` (first run) | ✓ | — |
| `git add`, `git commit`, branch operations | ✓ | — |
| `git log`, `git diff`, `git status`, `git cat-file` (read-only) | ✓ | ✓ |
| `npx tsc --noEmit`, `npx vitest run`, `redocly lint`, contract verification | — | ✓ |
| Database migrations after the first successful run | — | ✓ |
| Gate decisions, validation sign-off | ✓ | — |

---

## 5. Target structure

```
package.json  tsconfig.json  vitest.config.ts  drizzle.config.ts
docker-compose.yml  .env.example
src/
  index.ts                     bootstrap
  app.ts                       createApp(): express app, no listen
  config.ts                    typed environment configuration
  db/
    schema.ts                  Drizzle schema (11 tables)
    client.ts  migrate.ts  seed.ts
  contract/
    openapi.json               bundled contract, generated
    convert.mjs                OpenAPI 3.0 -> JSON Schema
    validators.ts              AJV validators built from the contract
  lib/                         pure logic: no Express, no database
    time.ts  money.ts  duration.ts  pagination.ts  problems.ts
    availability.ts  reminders.ts  notifications.ts  reports.ts
  middleware/
    trace.ts  logger.ts  auth.ts  validate.ts  not-found.ts  error-handler.ts
  modules/                     one directory per system component
    auth/ catalog/ masters/ master-services/ availability/
    appointments/ materials/ payments/ reports/ units/
  routes.ts
tests/
  unit/  integration/  contract/  scenarios/
  manifest.json                ticket -> test -> implementation -> REQ mapping
scripts/
  check-test-first.mjs         causal-independence proof (§6.2)
  verify-contract.mjs          every operation checked against the contract
logs/
  tdd/tdd-SMS-NN.md            RED output, expected reason, GREEN output
  gates/YYYY-MM-DD-<gate>.md   gate decisions with signature
  runs/runs-SN.md              log analysis after each control run
  validation/YYYY-MM-DD-human-validation.md
  runtime/*.jsonl              application logs (git-ignored)
spec/addenda/NNN-<slug>.md     addendum document (§8)
```

Component boundary: `modules/*` know HTTP and the database; `lib/*` know
neither. This satisfies the "separate the system into components" requirement
and gives the unit level of the test pyramid something real to test.

---

## 6. TDD protocol

### 6.1 Per-ticket cycle

1. **Test.** Written from SRS, the acceptance criteria, the BDD scenario and the
   contract — not from any implementation. The file header is mandatory (§6.2).
2. **RED.** `npx vitest run <file>` is executed and fails. `logs/tdd/tdd-SMS-NN.md`
   records the command, the output and the *expected* failure reason (for
   example "route not found, because the module does not exist yet").
3. **TEST-GATE.** An agent self-check produces `logs/gates/…-test-SMS-NN.md`:
   each assertion traced to a REQ or SCN, each request/response shape matched to
   the contract, `check-test-first.mjs` passed. The human signs before
   implementation starts.
4. **Implementation.**
5. **GREEN.** The same test passes; output appended to the same TDD file.
6. **Contract check.** `scripts/verify-contract.mjs` validates status, media
   type and body of every operation against `openapi.yaml`.
7. **Log analysis.** `logs/runs/runs-SN.md` records what the JSONL logs contain
   for that run: request ids, durations, error codes, anything unexpected.

No test may be written after the code it tests. A test that never failed for the
expected reason is not evidence.

### 6.2 Causal-independence proof

Three mechanisms, all mechanically checkable:

1. **Mandatory header in every test file:**
   ```ts
   // Source: REQ-F-001, REQ-F-031, SCN-01, SCN-13
   // Contract: openapi.yaml#/paths/~1appointments/post
   // Ticket: SMS-8 (Test)
   ```
2. **`tests/manifest.json`** maps every test file to its ticket, its REQ and
   SCN sources, and the implementation files that ticket is expected to
   *create* (files it only modifies are listed under `"touches"`, which the
   checker ignores — see D-17).
3. **`scripts/check-test-first.mjs`** reads git history (read-only) and fails the
   gate when any of these is false:
   - the test file appeared in an earlier commit than every implementation file
     listed for that ticket;
   - at the test commit, the implementation file did not exist
     (`git cat-file -e <commit>:<path>` fails);
   - the test file carries a `Source:` header referencing at least one REQ or
     SCN id.

The two-commit rule (D-12) exists so that this check has something to prove:
`test:` commit → `feat:` commit, per ticket.

**Files that predate the first test (D-17).** `check-test-first.mjs` reasons
about *first additions* only: `existsAt(testCommit, implPath)` must be false, and
the implementation's own adding commit, when present, must come after the test's.
The scaffold (`app.ts`, `error-handler.ts`, `trace.ts`, `logger.ts`, `validate.ts`,
`routes.ts`, `config.ts`, `db/`) is added before SMS-44 and is never "added"
again, so no entry may list those files under `implementation` — not for S1.0,
and not for any later ticket that edits them. Three rules follow, and none of
them is a switch that can be flipped off:

- **`implementation` means "first added by this ticket".** A file that already
  exists and is only modified belongs under `"touches"`, a key the checker
  ignores. Listing a pre-existing file under `implementation` is a hard failure,
  which is the intended behaviour: it is the manifest's statement that the
  ordering is provable, and it is checked.
- **S1.0 has no manifest entry.** Its work is structural tests over the scaffold
  plus modifications to pre-existing modules, so no file it touches is *created*
  by SMS-44, and `validateEntry` rejects an entry with an empty `implementation`
  list. The checker also does not enumerate test files — it only walks the
  manifest — so this absence is invisible to it. The TEST-GATE record for SMS-44
  therefore names the test file and states in one line that it has no manifest
  entry and why; the gap is recorded in the gate, not left to be discovered.
- **S1.0's ordering evidence is the RED run.** `logs/tdd/tdd-SMS-44.md` records
  the command, the output and the reason — every structural assertion must fail
  before the change that turns it green, which is what proves the behaviour was
  not written first. `logs/gates/…-test-SMS-44.md` quotes those failures. Git
  proves ordering from S1.1 onward; §8 marks S1.0 as the one stage it cannot.

This is a stated limit, not a passing check, and it is what the final validation
(§10) reads as a known gap.

---

## 7. Known contract issues carried into implementation

Recorded in `spec/api/clarifications.md` as CL-06..CL-08. None of them changes
the contract.

| ID | Issue | Handling |
|---|---|---|
| CL-06 | `createAppointmentAdmin` (R19) documents `201 Appointment`, which includes `accessToken` and `confirmationUrl`, while the `Appointment` schema description says administrator responses use `AppointmentAdmin` | Implement as the path table and example state (`Appointment`). D18 is read as applying to staff **read** operations (`listMyAppointments`, `listAppointmentsAdmin`, `getAppointmentAdmin`). Both readings are listed; the contract is not edited |
| CL-07 | Design plan §5 for M1 names `AppointmentPage`, which does not exist in the contract; `resource-model.md:224` and `openapi.yaml` use `AppointmentAdminPage` | Contract and resource model are authoritative; the committed design plan is not retroactively edited |
| CL-08 | OpenAPI 3.0 `exclusiveMinimum: true` plus `minimum: 0` is rejected by AJV 8 (draft-07 semantics) | `src/contract/convert.mjs` rewrites it to `exclusiveMinimum: 0`; the published contract stays OpenAPI 3.0.3 |

---

## 8. Stage plan

Every stage follows §6.1. Gate records are signed by the human; the agent cannot
move a gate to GO.

| Stage | Content | Test tickets (RED) | Feature ticket(s) | Gate |
|---|---|---|---|---|
| S1.0 | Infrastructure: config, Drizzle schema, migrations, seed, app factory, router, `Problem` handler, trace ids, JSONL logger, AJV conversion and validators, test harness, `/health` outside `/api/v1` | SMS-44 (structural tests: 404, 405, malformed JSON → 400 `MALFORMED_REQUEST`, `Problem` shape, trace propagation, log line shape) | minimal scaffolding only | TEST-GATE only; no exit gate; ordering evidence is the RED run, not git (D-17) |
| S1.1 | Authentication: single administrator, master accounts created by the administrator, login — **also** 415 `UNSUPPORTED_MEDIA_TYPE` (see §8.2) | SMS-21 | SMS-22 | G1 |
| S1.2 | Reference data: masters, services, categories with three seeds, MasterService prices, materials, units | SMS-14, SMS-21 | SMS-23 | G1 |
| S1.3 | Availability: weekly pattern and date-specific rules | SMS-15 | SMS-24 | G1 |
| S2.1 | Booking: multi-service sums, slot selection, immediate confirmation, 30-minute rounding | SMS-8, SMS-19 | SMS-25 | G2 |
| S2.2 | Confirmation page, access token, exactly one confirmation SMS | SMS-8 | SMS-26 | G2 |
| S2.3 | Client cancellation | SMS-9 | SMS-27 | G2 |
| S3.1 | Reschedule with reminder recalculation and reschedule SMS | SMS-10 | SMS-28 | — |
| S3.2 | Reminder engine: 24h/2h, skip-if-past, reactivation | SMS-11, SMS-17 | SMS-29 | G3 |
| S4.1 | Notification service: channel × event preferences, acting-administrator suppression | SMS-12, SMS-18 | SMS-30 | G3 |
| S4.2 | Master calendar and own services/prices | SMS-21 | SMS-31 | G3 |
| S5.1 | Administrator appointment management, including the REQ-F-028 recalculation rule | SMS-21 | SMS-32 | G4 |
| S5.2 | Material receipts and issues with stock control | SMS-21 | SMS-33 | G4 |
| S5.3 | Completion → payment, completion as a hard precondition | SMS-13 | SMS-34 | G4 |
| S5.4 | Reports: revenue, popular services, stock levels | SMS-16 | SMS-35 | G4 |
| S5.5 | NFR acceptance checks against the running system | SMS-20 | — | G4 |
| R | **Refactoring** of the base implementation (§9) | full regression suite | — | — |
| A | **Addendum** (§8.1) | new and changed tests | SMS-45 | SPEC-ADDENDUM-GATE, then TEST-GATE |
| V | **Verification and validation** (§10) | — | — | final GO / REVISE / STOP |

### 8.1 Addendum

**Deadline (D-13):** selected and gated immediately after the base implementation
is stable — all tests green and the refactoring pass recorded — and **before**
verification begins. This matches the mandated order of steps 3→4→5→6→7.

**Sequence:**

1. Choose the change. It must be genuinely absent from SRS v1.3, must own a
   ticket, and must require an update to the OpenAPI contract.
2. Write `spec/addenda/NNN-<slug>.md`: requirement text, acceptance criteria,
   impact on existing artifacts, contract changes, test impact, rollback.
3. Create ticket SMS-45 (and update ticket-list.md and issue-import.csv in the
   same commit).
4. **SPEC-ADDENDUM-GATE**, signed by the human.
5. Update `openapi.yaml`, run `redocly lint`, update `api-traceability.md`.
6. New or changed tests first, RED, **TEST-GATE**, implementation, GREEN,
   full regression.
7. Refactor the changed code, re-run everything, record that behaviour defined by
   the base specification is unchanged.

**Ticket numbering.** SMS-44 is assigned to stage S1.0 (type `Test`): the stage
is test-harness and structural-test work. It has no `check-test-first.mjs` entry
— see D-17 and §6.2; its ordering evidence is the RED run. The addendum ticket is
therefore SMS-45.

SMS-44 must be added to `docs/ticket-list.md` and `docs/issue-import.csv` before
S1.0 starts. `docs/github-issues-setup.sh` carries no counter constant: its guard
is `gh issue list`, so what changed there is the three prose counts (43 → 44).
Because 43 issues already exist, the script's own guard now makes it a no-op —
SMS-44 is created with a direct `gh issue create`, after confirming the highest
existing issue is #43.

**Candidate changes, assessed at the gate (not pre-selected):**

- **A. Material low-stock threshold** — a `threshold` field on `Material` plus an
  administrator notification when stock drops below it. Isolated; touches
  `REQ-F-033` (stock-levels report) and `REQ-F-016` (notifications). Lowest
  regression risk.
- **B. Recurring appointment series** — the client books a series (for example
  every 2 weeks × 6). New operation and schemas; touches booking, availability,
  cancellation and reminders. Conflicts with the 30-minute rounding rule
  (`REQ-F-031`) and the cancellation rules — the highest regression risk.
- **C. Per-master reminder offsets** — the master configures the 24h/2h shifts.
  Directly contradicts `REQ-F-010` and `REQ-F-029`, both already covered by
  SMS-11 and SMS-17. Expected to fail the criteria below.

**Selection criteria at SPEC-ADDENDUM-GATE:** the change must be genuinely absent
from SRS v1.3, must not contradict an existing REQ, must require a change to the
OpenAPI contract, and must be implementable without breaking the base regression
suite.

---

### 8.2 S1.0 test scope — what the scaffold can and cannot prove

Measured 2026-11-08 against the running scaffold, before any test was written:

| Case | Current behaviour | Why |
|---|---|---|
| Unknown path → 404 `NOT_FOUND` | correct | `notFound` is mounted last and renders through `errorHandler` |
| Defined path, undefined method → 405 | returns **404** | Express falls through to `notFound`; recognising 405 needs the router's registered paths |
| Malformed JSON body → 400 `MALFORMED_REQUEST` | returns **500** | `express.json()` is mounted **globally in `app.ts`, before the router**, so `body-parser` throws a `SyntaxError` before routing happens and `errorHandler` maps it to 500. Reachable with no route registered — a genuine RED in S1.0 |
| Non-JSON media type → 415 `UNSUPPORTED_MEDIA_TYPE` | returns **404** | **no request-body route is registered**, so nothing inspects the media type. 415 is produced by `validateBody`, which no route mounts yet |
| `Problem` shape, `traceId` ↔ log correlation | correct | `errorHandler` and `requestLogger` share `getTraceId` |
| Matched route template in the log `path` | correct | `req.route.path` |
| Unmatched path in the log `path` | **empty string** | `req.baseUrl` resets to `''` after the router exits |

Of the four error-path defects in §8, only one cannot exist in S1.0 as a matter of
structure: **415**.
It is produced by `validateBody` after a route declares what media types it
accepts, and the scaffold registers no request-body route — deliberately, because
every operation arrives with its own ticket. Writing that test in S1.0 would mean
asserting behaviour of a route that does not exist yet, which is the
correlated-test failure the lab forbids. Malformed JSON is **not** in this group:
the parser is global, so it needs no route at all.

**Consequence:** S1.0 owns 404, 405, malformed JSON → 400, `Problem` shape, trace
propagation, log line shape (including the unmatched-path fix). Only **415** is
tested in **S1.1**, on the first operation that declares a request body
(`login`). This is a relocation, not a relaxation: 415 stays mandatory and keeps
its TEST-GATE.

**Parser precedence — a decision, not an accident.** Because `express.json()` runs
before routing, a request to a defined path with a body-parser-rejected body
returns **400 before 405 is ever considered**: `POST /health` with
`Content-Type: application/json` and a truncated body is 400, not 405. The 405
test therefore uses a path from the contract and sends **no request body at all**,
so the parser cannot pre-empt it; `tests/api/structural.test.ts` carries a comment
stating this precedence and citing this section, so the ordering is a recorded
decision rather than an accident of middleware order. The two assertions cover
different layers: body validity first, method routing second.

**SMS-44 checklist — each item is done or the TEST-GATE stays PENDING:**

1. `tests/api/structural.test.ts` written with the mandatory `Source:` header.
2. RED run recorded in `logs/tdd/tdd-SMS-44.md`: command, output, expected
   failure reason per assertion.
3. `passWithNoTests: true` **removed from `vitest.config.ts` in the same commit
   that adds the test file**, so a missing test path fails the run again.
4. `logs/gates/2026-11-08-test-SMS-44.md` lists each assertion → REQ/SCN, and
   states in one line that SMS-44 has no `tests/manifest.json` entry (D-17).
5. 404, `Problem` shape and trace correlation are marked **already green** in
   the gate record — they are characterisation, not RED evidence, and saying so
   is required. The genuine RED is three items: **405**, the **unmatched-path
   log field**, and **malformed JSON → 400**.

## 9. Refactoring of the base implementation (step 3)

- Extract remaining logic from controllers into `lib/*`; remove duplication
  across controllers; tighten DTO mapping; keep every route, status code and
  response field identical.
- **Proof of unchanged external behaviour:** the same test suite before and after;
  `verify-contract.mjs` green; a diff review confirming no change to route
  definitions, status codes or schema mapping.
- Recorded in `logs/gates/…-refactor.md` with the before/after run outputs.
- Committed separately from the feature work.

---

## 10. Verification and validation (step 7)

**Verification (agent):** every REQ-F and REQ-NF mapped to at least one passing
test plus a contract check; the matrix in `spec/api/api-traceability.md` updated
with Test, Code and Doc columns; `logs/runs/` evidence for each stage.

**Validation (human):** a single signed record
`logs/validation/YYYY-MM-DD-human-validation.md` containing:

1. the list of SCN-01..SCN-15 scenarios executed by hand and their outcome;
2. an assessment of whether the system matches the original intent, referring to
   `spec/DESCRIPTION.md` §2 (problem and goal) — not only to the requirement list;
3. an assessment of whether the addendum was justified by a real need;
4. the signature and date.

A validation record that only repeats the test results is not a validation.

---

## 11. Final checkpoint (step 8)

`logs/gates/YYYY-MM-DD-final-gate.md` records **GO**, **REVISE** or **STOP** with
the reasoning and the evidence consulted: test results, contract verification,
log analysis, human validation, traceability completeness. Traceability matrix
updated. GO requires that every requirement has a passing test, the contract
verification is clean and the human validation record is signed.

---

## 12. Differences from the previous draft

| # | Previous draft | Now | Reason |
|---|---|---|---|
| 1 | Proposed changing `createAppointmentAdmin` to `AppointmentAdmin` (E-1) | No change; implement as documented (CL-06) | `resource-model.md:259` and the contract example fix `Appointment`; the inconsistency is recorded, not resolved by editing an approved contract |
| 2 | Claimed a plan/contract mismatch for M1 (E-2) | Recorded as CL-07 and left alone | The stale text is in design plan §5; contract and resource model agree with each other |
| 3 | Reopened the operation count as "5 duplicates" | D-5: all 50 per D21; 45 only as a reserve cut, described without the word "duplicates" | D21 was already decided; the word "duplicates" came from the design plan and is misleading |
| 4 | Presented the stack as an unresolved policy conflict | §4 separates agent actions from human actions | CLAUDE.md forbids the *agent* from installing; it assumes the human does |
| 5 | Asserted causal independence without proof | §6.2 gives three mechanical checks and D-12 fixes commit granularity | The claim was unverifiable as written |
| 6 | Addendum placed after G4 without a deadline | §8.1 deadline before verification | Matches step 4 of the task; "decide later" without a bound is not a plan |
| 7 | Human validation described as a checklist | §10 requires a signed intent assessment | Step 7 asks for an assessment of fit to the original purpose |
| 8 | `logs/lab/`, `/health` under `/api/v1`, no TEST-GATE for infrastructure | `logs/tdd/` etc.; `/health` outside `/api/v1`; S1.0 has its own TEST-GATE | Repository naming convention after `79d2978`; `/health` is not in the contract; infrastructure tests are tests too |

---

## 13. Risks specific to this phase

| ID | Risk | Detection | Mitigation |
|---|---|---|---|
| R-TDD-01 | Test written to match the implementation (correlated error, R-07) | `check-test-first.mjs`; human review of the TEST-GATE record | Test tickets reviewed against the AC text before implementation starts |
| R-TDD-02 | Contract drift while implementing | `verify-contract.mjs` on every operation | Contract is the oracle; changes go through clarifications or the addendum |
| R-TDD-03 | TypeScript types diverge from the contract | Contract check failures in CI-style runs | Types are not the source of truth; AJV validates against the contract |
| R-TDD-04 | Environment blocked: no `npm install`, Docker unavailable | `npm install` fails; `docker compose up` fails | Human runs both; agent reports rather than works around |
| R-TDD-05 | Flaky time-dependent tests (reminders, DST) | Repeated runs of S3/S5 suites | Injected clock; fixed instants taken from SCN scenarios; `Europe/Kyiv` offset tested explicitly |
| R-TDD-06 | Refactoring changes behaviour silently | Full suite plus contract check plus diff review | §9 procedure; refactor committed separately |
| R-TDD-07 | Addendum scope creep | Gate record comparing proposed change with SRS scope | Only one change; SPEC-ADDENDUM-GATE before any code |
| R-TDD-08 | Human gate review becomes a formality (R-10) | Gate checklist audit | Each gate record cites evidence; agent cannot set GO |
| R-TDD-09 | Dev-toolchain advisories stay open: `npm audit` reports 4 moderate, all in `drizzle-kit → @esbuild-kit/esm-loader → esbuild@0.18`. None reaches the runtime image; `drizzle-kit` is migration-only and `@esbuild-kit/*` is deprecated upstream | `npm audit` on every install | Recorded as accepted at 2026-11-08, not silently carried. **Never run `npm audit fix --force`**: the only remedy npm offers is a semver-major downgrade of `drizzle-kit` to 0.18.1, and a forced audit fix in this project already reverted Prism to 5.6.0 once. Re-check when `drizzle-kit` drops `@esbuild-kit/esm-loader` |

---

## 14. Deliverables mapped to the task steps

| Task step | Deliverable |
|---|---|
| 1. Prepare artifacts; agent access; TDD instruction; logging | This plan; existing approved artifacts unchanged; §6 protocol; §5 logging design |
| 2. Implement the base functionality, TEST-GATE per stage, log analysis | Stages S1.0–S5.5; `logs/gates/`; `logs/runs/` |
| 3. Refactor without behaviour change; commit | §9; refactor gate record; separate commit |
| 4. Choose one change; addendum in `/spec`; ticket; SPEC-ADDENDUM-GATE | §8.1; `spec/addenda/`; SMS-45 |
| 5. Implement the addendum with TDD; regression | §8.1 steps 6–7 |
| 6. Refactor the changed code; re-run everything | §8.1 step 7 |
| 7. Verification and human validation | §10; signed validation record |
| 8. Traceability update; final GO/REVISE/STOP in `/logs` | §11; final gate record |
| Continuous: meaningful commits per stage | D-12 commit scheme; `docs/commit-convention.md` |

---

## 15. Open items before the plan is approved

| # | Item | Owner | State |
|---|---|---|---|
| 1 | Approve this plan and record the decision in `logs/gates/` | Human | **Closed** — see `logs/gates/2026-11-08-plan-gate.md` |
| 2 | Confirm the stack remains TypeScript + Express + PostgreSQL + Drizzle + Vitest (no return to Node built-ins) | Human | **Closed** — confirmed 2026-11-08; see D-14 |
| 3 | Install dependencies and start PostgreSQL when the scaffold exists | Human | **Closed** — 2026-11-08: `npm install` (186 packages), `docker compose up -d postgres`, `createdb salon_test`; `tsc --noEmit` 0 errors, `vitest run` exit 0, `salon_test` reachable |
| 4 | Confirm CL-06..CL-08 as written | Human | **Closed** — confirmed 2026-11-08; see D-15 |
| 5 | Register SMS-44 (S1.0) in `ticket-list.md`, `issue-import.csv` and the setup-script counter before S1.0 starts | Human | Files updated 2026-11-08 (43 → 44 rows, counter 43 → 44); the commit and the GitHub issue #44 are the human's |
