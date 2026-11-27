# Salon Management System — final record of the SDD cycle

| | |
|---|---|
| Ticket | SMS-68 (lab 6, step 16) |
| Version | **1.0.0** — commit `ad31041`, tagged `v1.0.0` after FINAL-GATE |
| Period | 2026-09-15 … 2026-11-27 (labs 1–6) |
| Developer | setrios (decisions, gates, validation) |
| Coding agent | Claude Code (drafts, tests, code, records — `logs/agent-choice.md`) |
| Repository | 281 commits; 80 tickets (GitHub issue #N = SMS-N); 45 gate records |

## 1. The cycle, lab by lab

| Lab | What it produced | Its gate |
|---|---|---|
| 1 — repository | the SDD layout, the commit convention, the agent's record, a human–agent merge conflict resolved by the concept (`logs/2026-09-16-sms-reminder-conflict.md`) | the lab task's GIT-GATE: commit `4d90102` (`gate: record SMS reminder conflict resolution`) |
| 2 — specification | the SKED dialogue (`logs/2026-09-26-sked-dialogue-summary.md`), SRS v1.0 → v1.3: 33 functional and 9 non-functional requirements, glossary, BDD scenarios SCN-01…15, the first matrix | SPEC-GATE |
| 3 — plan | the decomposition SMS-1…37 in GitHub Issues, dependencies, the stage plan, critical path, the risk register | PLAN-GATE |
| 4 — API | the resource model, `openapi.yaml` (50 operations, 58 schemas, 16 error codes), mock scenarios | API-GATE |
| 5 — TDD | the REST API by stages S1–S5: test → TEST-GATE → code → stage gate; refactoring; addendum 001 (REQ-F-034); logging; human validation | TEST-GATEs, G1–G4, SPEC-ADDENDUM-GATE, FINAL-GATE (lab 5) |
| 6 — documentation, convention, final validation | below | CONVENTION-GATE, UI-GATE, TEST-GATEs, G5, FINAL-GATE |

## 2. Lab 6, step by step

| Step | Result | Record |
|---|---|---|
| 1 Coding convention | Google TypeScript Style Guide, adapted; enforced by ESLint and Prettier | `docs/coding-convention.md` |
| 2 Convention analysis | 141 lint findings → 0; formatting proven behaviour-neutral (0 / 90 files differ); the linter found a real defect (SMS-69) | `logs/gates/2026-11-26-lint-SMS-54.md` |
| — The interface (stage S6) | SRS v1.3 required it and the lab 5 gate had wrongly called it closed; built by SDD: screens → UI-GATE → 45 browser tests → implementation → G5, with four defects found and fixed on the way (SMS-70…73, 76) | `spec/ui/screens.md`, `logs/gates/2026-11-27-G5-S6.md` |
| 3 Terminology | glossary ↔ contract ↔ code ↔ interface ↔ tests: no foreign synonym; two clarifications (CL-13, CL-14) | `logs/2026-11-27-terminology-audit.md` |
| 4 Doc comments | 43 added; 5 quality defects corrected (requirements quoted with words the SRS does not have, an operation numbered wrong); a missing comment is now a lint error | `logs/2026-11-27-docstrings-SMS-60.md` |
| 5 References | API reference from the contract (Redocly), code reference from the comments (TypeDoc, strict) | `docs/api/`, `docs/reference/`, `docs/components.md` |
| 6 README | rewritten around a first run that works | `README.md` |
| 7 User guide | per role, in the screens' own words | `docs/user-guide.md` |
| 8–10 Documentation check | README run from a clean clone by the agent and by the developer (curl 22 / 22); API docs against the code (50 / 50); user guide against the interface (134 / 134 and the developer's walk-through) — nine findings fixed (F9, F11–F15, SMS-74/77/78, D1–D5) | `logs/docs-check/2026-11-27-documentation-check.md` |
| 11–12 Traceability | a matrix generated from the artifacts for 43 requirements, audited automatically, the audit shown to catch injected defects | `spec/traceability-matrix.md`, `logs/2026-11-27-traceability-audit-SMS-65.md` |
| 13 Final verification | every check green on one tree; 12 known deviations, each documented | `logs/2026-11-27-final-verification-SMS-66.md`, §4 below |
| 14–15 Final validation | the developer against the concept: PASS; the client lookup carried to a next cycle | `logs/validation/2026-11-27-final-validation.md` |
| 16–17 This record, FINAL-GATE, the tag | — | `logs/gates/2026-11-27-final-gate-lab6.md` |

## 3. Addenda and changes after the baseline

| Item | Kind | Status |
|---|---|---|
| Addendum 001 — cancelled reminders (REQ-F-034) | addendum, SPEC-ADDENDUM-GATE (lab 5) | implemented |
| CL-01 … CL-14 | clarifications (no new behaviour) | decided; CL-13 (the status set, `failed` reserved) and CL-14 (R11's 422) in lab 6 |
| U-4 amended (SMS-79) | interface decision changed at the final validation | implemented |
| SMS-80 — find a client's appointments | **next SDD cycle**, decided at the final validation | backlog; not in 1.0.0 |
| SMS-81 — documentation details found by the final re-check (F16–F19) | documentation fix after FINAL-GATE, no behaviour change | done; tagged `v1.0.1` (FINAL-GATE §7) |

No addendum 002: lab 6 changed no requirement. Its fixes either made the
system meet an approved requirement it did not (REQ-F-005's link, REQ-NF-002's
interface, D10 for the administrator) or changed tooling and documents.

## 4. The developer's decisions that shaped lab 6

| Decision | Where |
|---|---|
| Build the interface now, before the documentation (A, not B or C) | lab 6 plan D-L6-1 |
| Client steps: services → time → master → details | UI-GATE U-2 |
| Commit the generated references | SMS-61 |
| 422 `BUSINESS_RULE_VIOLATION` for an R11 reference that names nothing | CL-14 |
| `failed` kept as a reserved status (option a) | CL-13 |
| Interface labels kept where they differ from glossary terms | terminology audit T3 |
| Keep the browser's date picker (option a); later, times in the browser's hour cycle too | G5 §5; SMS-79 |
| The client lookup goes to a next cycle | final validation §E |
| Every TEST-GATE, UI-GATE, G5 and the corrections signed | `logs/gates/` |

## 5. What the agent got wrong, and how it was caught

Recorded so that the trail shows the controls working, not only the result:

| Where | The agent's mistake | Caught by |
|---|---|---|
| SMS-74's prompt (`create-admin`) | echoed the typed password | the developer's README run → SMS-77 |
| SMS-74's tests | C1/C2 depended on their order | a shuffled run |
| `formatTime`, H2 | expected an end the contract does not give | the browser test itself |
| the traceability generator | read "addendum 001" as REQ-F-001 | reviewing a generated row before trusting it |
| the screen specification | named `tsconfig.web.json`; quoted an error code that does not exist | the documentation check; the contract |
| a doc comment draft | claimed every route validates its input | checking the claim against the routes |

## 6. Result of the final validation

The developer returned to `spec/DESCRIPTION.md` and judged the system against
the owner's four problems: scheduling conflicts, stock control and the
financial overview are solved; the loss of visit history no longer occurs, but
one client's visits cannot be looked up — a need recorded for the next cycle
(SMS-80). Result: **PASS, with SMS-80 recorded**.
