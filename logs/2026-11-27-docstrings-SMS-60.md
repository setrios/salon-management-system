# Doc comments — audit and completion (SMS-60)

| | |
|---|---|
| Ticket | SMS-60 (lab 6, step 4) |
| Rule | `docs/coding-convention.md` §6 (TSDoc) |
| Date | 2026-11-27 |

Lab 6 step 4: public functions, classes and modules have doc comments that
state purpose, parameters, result, constraints and the contract of use — not
a restatement of the code.

## 1. Coverage

| Measure | Before | After |
|---|---|---|
| Source files under `src/` with a module header (`/** … */` naming purpose and sources) | 78 / 78 | 78 / 78 |
| Exported declarations under `src/` | 398 | 398 |
| Exports without a doc comment (`jsdoc/require-jsdoc`) | **43** (39 `src/`, 4 test helpers) | **0** |
| `jsdoc/require-jsdoc` | warning | **error** — a new undocumented export fails `npm run lint` |
| `jsdoc/no-types`, `check-param-names`, `check-tag-names` | 0 findings | 0 findings |

The 43 new comments say what the element is *for* and what a caller may rely
on — which operation a filter serves, that a password is hashed and never
stored as given, that a 404 for a token does not reveal whether it ever
existed, that `createApp` does no I/O — rather than repeating the type that
follows them. Each claim was checked against the code before it was written;
one draft (that every route validates its input) was found untrue — operations
without input and the reports' own period rule do not — and was rewritten.

## 2. Quality defects found in the existing comments

| # | Where | Defect | Correction |
|---|---|---|---|
| Q1 | `materials/service.ts` | the doc of `recordMaterialTransaction` stood above the type `MaterialTransactionOutcome`, so the function had none and the type had the wrong one | moved to the function; the type got its own line |
| Q2 | `appointments/admin.ts` header | quoted **REQ-F-019** and **REQ-F-030** with words that are not in the SRS, and **REQ-F-020** with a requirement that is not REQ-F-020 (which is about material transactions) | replaced by the SRS v1.3 text; the list operation traced as `resource-model.md` does |
| Q3 | `admin.ts`, `admin-actions.ts`, `appointments/service.ts`, `materials/service.ts` | called the appointment list "R20"; `resource-model.md`, the traceability matrix and the interface call it **R18** (R20 is the read of one appointment) | renumbered to R18 / R20 as the resource model has them |
| Q4 | `admin-actions.ts` | REQ-F-030 quoted with "(REQ-F-016)" left out | quoted in full |
| Q5 | `tests/api/admin-appointment-actions.test.ts` header | REQ-F-006 "quoted" as a paraphrase | the SRS words (comment only; no assertion touched) |

A check over every comment that puts a requirement in quotation marks —
`REQ-…("…")` in `src/` and `tests/` — compared each quotation with SRS v1.3 and
addendum 001: **28 before, 5 not found; 27 after, 0 not found**. The
convention now says that a quotation is the SRS's exact words (§6).

## 3. Evidence that only comments changed

| Check | Result |
|---|---|
| `tsc --removeComments` of the server and the browser code, before and after | **111 files, 0 lines of difference** |
| Tests | 412 / 412 |
| `check:test-first` | 29 / 29 |
| ESLint, Prettier | clean |
