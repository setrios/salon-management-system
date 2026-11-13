# FINAL-GATE — step 8, close of the implementation

| | |
|---|---|
| Gate | FINAL-GATE (plan §11, task step 8) |
| Scope | the whole repository at the state described below: contract, implementation, tests, evidence |
| Date | 2026-11-13 |
| Signed by | setrios |
| Decision | **GO** |

---

## 1. What this gate decides

Plan §11 asks for one of **GO**, **REVISE** or **STOP**, with the reasoning and the
evidence consulted: test results, contract verification, log analysis, human
validation, traceability completeness. GO requires that every requirement is
mapped to a passing test except the UI exceptions of §2 and §10, that the contract
verification is clean, and that the human validation record is signed.

This gate does **not** claim: performance under load, a security audit, or
production readiness of a deployment. Those were never in the plan's scope, and a
gate that quietly widens its own scope is worth less than one that states its
edges.

## 2. Evidence consulted

| Evidence | Result | Where |
|---|---|---|
| Test suite | **395 / 395 passed, 24 files** | `npx vitest run` |
| Order independence | **395 / 395 passed** shuffled | `npx vitest run --sequence.shuffle` |
| Contract verification | **50 operations, 58 schemas, 16 error codes**; redocly lint clean | `npm run verify:contract`, `npm run lint:contract` |
| Test-first causality | **22 / 22 entries pass** (no implementation file predates its test commit) | `npm run check:test-first` |
| Control runs | **19 runs**, each quoting the built artifact's own output | `logs/runs/runs-01 … runs-19` |
| Gate records | **29 signed records** before this one | `logs/gates/` |
| Requirement traceability | **43 / 43 mapped** (41 with API surface: 34 direct, 7 cross-cutting; 2 not applicable with a reason) | `spec/api/api-traceability.md` §2 |
| Human validation | **signed, 16 / 16 scenarios PASS, result PASS** | `logs/validation/2026-11-13-human-validation.md` |
| Commits ahead of `origin/main` | **89**, none pushed | `git log` |

## 3. Requirement coverage, including what is not covered

| Class | Count | Statement |
|---|---|---|
| Requirements with an operation and a passing test | 34 | each mapped in `spec/api/api-traceability.md` §2 and exercised by a file in `tests/api/` |
| Requirements held as cross-cutting conventions | 7 | enforced by the contract and the shared layers (error model, `Money`, time zone, no deletion, seams), evidenced by the NEG/POS scenarios |
| Not applicable, with a stated reason | 2 | **REQ-NF-002** (responsive UI — an interface property, closed outside this repository by SMS-36); **REQ-NF-007** (no location or time-zone selector — the product is single-salon, so there is nothing to select) |

**A deviation from plan §10's wording, stated rather than glossed.** §10 names
REQ-NF-002, REQ-NF-003 and REQ-NF-004 as "UI properties … closed by SMS-36". The
matrix maps only REQ-NF-002 that way; REQ-NF-003 (English only) and REQ-NF-004
(UAH amounts) are properties the API itself carries — the messages' language and
the `Money` shape — and they are verified by the NEG and POS cases. Treating them
as UI-only would have left two real, testable properties unverified; the matrix
verifies them instead.

## 4. The four decisions that shaped the work

| Decision | Where recorded | Consequence |
|---|---|---|
| Contract first, validators generated, tests compare status, media type and schema | `logs/2026-11-08-implementation-plan.md` §3 | the suite cannot pass while the implementation drifts from `openapi.yaml` |
| Addendum 001 — `cancelled` for a cancelled appointment's reminders | `spec/addenda/001-cancelled-reminders.md`, SPEC-ADDENDUM-GATE | REQ-F-034 closed; the notification list no longer claims a reminder will be sent for a cancelled visit |
| Stage R — refactor before the scheduler, then the scheduler | `logs/gates/2026-11-13-refactor-SMS-46.md`, STAGE-R-GATE | register row 11 closed; the reminder delay is bounded by the 60 s tick instead of being unbounded |
| Every stage gated, every gate signed, every run quoted from the artifact | `logs/gates/`, `logs/runs/` | the audit trail is the repository, not a memory of a conversation |

## 5. Accepted deviations and residual risks

| # | Item | Assessment |
|---|---|---|
| 1 | **Reminder delivery is simulated.** A `sent` row means "handed to the channel"; there is no gateway (REQ-NF-009 forbids one). | Accepted, declared in the README and in the validation record §5. A real deployment needs a channel an integrator fills; the seam is the dispatcher. |
| 2 | **The scheduler is a process tick (60 s).** A reminder due at 14:00:00 is sent at the first tick at or after it; `sentAt` records that instant. | Accepted. The delay is bounded where it used to be unbounded (H3 alone). A multi-instance deployment would need one leader; the schema makes a double send unlikely (the tick updates only rows still `scheduled`) but nothing elects a single ticker, and that is stated rather than assumed. |
| 3 | **Register row 13 — `P11` answers 409, `R21` answers 422 for the same collision.** | Accepted by the validator (`record §4`). Both codes are declared by the contract; no client exists besides the tests. A future `fix:` would change declared behaviour for symmetry only. |
| 4 | **Plan §8.1 orders the contract update before the tests**, so one addendum case (C8) is a characterisation test that passes at RED. | Accepted and explained in `logs/gates/2026-11-13-test-SMS-45.md` §1.1: the ordering is the plan's, and the case asserts behaviour that already held rather than new behaviour. |
| 5 | **No interface.** The task's step 1 deliverables are the API; SMS-36 and SMS-37 carry the interface tickets and are outside this repository. | Accepted; the validation record names the missing interface as the first thing the owner would need. |
| 6 | **Performance, load and security audit were never in scope.** | Stated so that GO is not read as a wider claim than it is. |

## 6. What the human validation added that the tests could not

The record's §1 is a hand run of sixteen scenarios against the built artifact;
§2 is a fit-to-intent judgement against `DESCRIPTION.md` §2, which no test can
make. Its findings, carried here:

- The owner's first complaint — two clients in one chair — is answered, and was
  demonstrated by a **direct** attempt (SCN-16), not inferred: the exact start and
  an overlapping start were refused, the neighbouring free boundary accepted.
- The money and stock figures are consistent between the two ways of asking
  (preset period vs explicit range), and the payment rules hold in sequence.
- What remains absent is the interface; everything else the concept asked for is
  reachable over HTTP.

## 7. Decision

**GO.**

Every requirement is mapped to a passing test or carries a stated not-applicable
reason; the contract verifies clean at 50 operations and lints without a finding;
the test-first ordering is machine-checked; nineteen control runs quote the built
artifact rather than the sources; and the human validation record is signed, with
its one coverage gap closed by a visible amendment rather than a silent edit.

The repository is ready for the next phase to build on: the interface tickets
(SMS-36, SMS-37) and any real integration are additive, and none of them requires
revising a requirement, the contract or the evidence.

## 8. Recommendations, in order

1. **SMS-36/SMS-37** — the interface; the only §2 goal without an answer.
2. **A real notification channel** — replace the simulated dispatch behind the
   existing seam; the tests already model the row states it must produce.
3. **Register row 13**, if a client ever must handle both codes — then it is a
   `fix:` with its own test, not a refactor.

Signed by: setrios  Date: 2026-11-13
