# Ticket list — SMS (SDD, GitHub Issues)

Companion artifacts: `logs/2026-10-21-sdd-plan.md` (workflow, phases, critical
path), `logs/2026-10-21-risk-register.md`.

Tracker: **GitHub Issues** in this repository (`setrios/salon-management-system`).
Labels carry the workflow: `status: backlog / in progress / in review / blocked`
(closing an issue = Done), `type: <8 SDD types>`, `role: coding agent / human / joint`.
Dependencies are written in each issue body as `Blocked by #N` (GitHub
cross-references both timelines automatically).

Issue numbers are sequential: **issues are created in exactly the order below,
so issue #N = SMS-N.** The import source is `docs/issue-import.csv`; the
one-time setup script is `docs/github-issues-setup.sh`.

| Plan ID | Title | Type | Source | Depends on (blocking) | Assignee role | Initial state |
|---|---|---|---|---|---|---|
| SMS-1 | Baseline specification reference (SRS v1.3 §1–3: scope, actors, glossary, constraints) | Specification | SRS v1.3 §1–3 | — | Human | Done (SRS already approved) |
| SMS-2 | Populate traceability matrix Ticket column | Documentation | SRS v1.3 §8 (matrix) | SMS-1 | Joint | Done |
| SMS-3 | PLAN-GATE: approve decomposition, dependencies, plan, risks | Gate | This plan §9 | SMS-1, SMS-2 | Human | Done (GO, 2026-10-22) |
| SMS-4 | G1: approve stage S1 (foundations) exit | Gate | Plan §6 | SMS-3 | Human | Done |
| SMS-5 | G2: approve stage S2 (client booking core) exit | Gate | Plan §6 | SMS-4 | Human | Done (GO, 2026-11-12) |
| SMS-6 | G3: approve stages S3+S4 (reschedule/reminders, notifications) exit | Gate | Plan §6 | SMS-5 | Human | Done (GO, 2026-11-13) |
| SMS-7 | G4: approve stage S5 (admin & payment) exit | Gate | Plan §6 | SMS-6 | Human | Backlog |
| SMS-8 | Test multi-service booking flow (SCN-01) | Test | REQ-F-001…005, SCN-01 | SMS-3 | Coding Agent | Done |
| SMS-9 | Test free cancellation (SCN-02) | Test | REQ-F-006, SCN-02 | SMS-3 | Coding Agent | Done |
| SMS-10 | Test reschedule + reminder recalc + SMS (SCN-03) | Test | REQ-F-007…009, SCN-03 | SMS-3 | Coding Agent | Done |
| SMS-11 | Test reminder skip rules (SCN-04, SCN-05) | Test | REQ-F-010, 011, SCN-04, SCN-05 | SMS-3 | Coding Agent | Done |
| SMS-12 | Test per-channel notification preferences (SCN-06) | Test | REQ-F-016, 023, 026, SCN-06 | SMS-3 | Coding Agent | Done |
| SMS-13 | Test payment only after completion (SCN-07) | Test | REQ-F-021, 027, SCN-07 | SMS-3 | Coding Agent | Done |
| SMS-14 | Test custom service category + seeds (SCN-08) | Test | REQ-F-024, SCN-08 | SMS-3 | Coding Agent | Done |
| SMS-15 | Test master availability modes (SCN-09) | Test | REQ-F-015, SCN-09 | SMS-3 | Coding Agent | Done |
| SMS-16 | Test reports: revenue, popular services, stock (SCN-10/14/15) | Test | REQ-F-022, 032, 033, SCN-10, SCN-14, SCN-15 | SMS-3 | Coding Agent | Done |
| SMS-17 | Test skipped-reminder reactivation (SCN-11) | Test | REQ-F-029, SCN-11 | SMS-3 | Coding Agent | Done |
| SMS-18 | Test admin self-notification suppression (SCN-12) | Test | REQ-F-030, SCN-12 | SMS-30 | Coding Agent | Done |
| SMS-19 | Test 30-min slot rounding (SCN-13) | Test | REQ-F-031, SCN-13 | SMS-3 | Coding Agent | Done |
| SMS-20 | Test non-functional acceptance criteria | Verification | REQ-NF-001…009 | SMS-3 | Coding Agent | Done |
| SMS-21 | Test auth and reference-data CRUD checks | Test | REQ-F-012, 013, 014, 017, 018, 019, 020, 025 | SMS-3 | Coding Agent | Done |
| SMS-22 | Feature: authentication (master + single admin) | Feature | REQ-F-012, 017 | SMS-21 | Coding Agent | Done |
| SMS-23 | Feature: reference data (masters, services/categories, MasterService, materials/units, deactivate) | Feature | REQ-F-018, 024, 025 | SMS-14, SMS-21 | Coding Agent | Done |
| SMS-24 | Feature: master availability (weekly pattern + specific dates) | Feature | REQ-F-015 | SMS-15 | Coding Agent | Done |
| SMS-25 | Feature: booking flow (multi-service sum, slot picking, auto-confirm, 30-min rounding) | Feature | REQ-F-001, 002, 003, 031; REQ-NF-008 | SMS-8, SMS-19, SMS-23, SMS-24 | Coding Agent | Done |
| SMS-26 | Feature: confirmation page + confirmation SMS + unguessable token | Feature | REQ-F-004, 005; REQ-NF-001 | SMS-25 | Coding Agent | Done |
| SMS-27 | Feature: client cancellation | Feature | REQ-F-006 | SMS-9, SMS-26 | Coding Agent | Done |
| SMS-28 | Feature: client reschedule (recalc + reschedule SMS) | Feature | REQ-F-007, 008, 009 | SMS-10, SMS-26 | Coding Agent | Done |
| SMS-29 | Feature: reminder engine (24h/2h, skip rule, reactivation) | Feature | REQ-F-010, 011, 029 | SMS-11, SMS-17, SMS-28 | Coding Agent | Done |
| SMS-30 | Feature: notification service (channels, per-event prefs, admin self-notify suppression) | Feature | REQ-F-016, 023, 026, 030 | SMS-12, SMS-26, SMS-27, SMS-28 | Coding Agent | Done |
| SMS-31 | Feature: master calendar + own services/prices | Feature | REQ-F-013, 014 | SMS-21, SMS-22 | Coding Agent | Done |
| SMS-32 | Feature: admin appointment management (create/edit/cancel follows reschedule rules) | Feature | REQ-F-019, 028 | SMS-21, SMS-28 | Coding Agent | Done |
| SMS-33 | Feature: material transactions | Feature | REQ-F-020 | SMS-21, SMS-23 | Coding Agent | Done |
| SMS-34 | Feature: mark completed → payment recording | Feature | REQ-F-027, 021 | SMS-13, SMS-32 | Coding Agent | Done |
| SMS-35 | Feature: reports (revenue periods/custom range, popular services, stock) | Feature | REQ-F-022, 032, 033 | SMS-16, SMS-34 | Coding Agent | Done |
| SMS-36 | Feature: UI constraints (responsive, English, UAH, privacy, no tz selector) | Feature | REQ-NF-002, 003, 004, 006, 007 | SMS-20, SMS-26, SMS-57 | Coding Agent | Done (lab 6 stage S6, G5 GO) |
| SMS-37 | Feature: retention & no-gateway constraints | Feature | REQ-NF-005, 009 | SMS-20, SMS-34 | Coding Agent | Done (absence constraints, evidence SMS-20) |
| SMS-38 | Define REST resource model and URI/method conventions | Specification | Plan §5; SRS §4–5 | — | Joint | Done |
| SMS-39 | Define component schemas and unified error model | Specification | Plan §6–7; SRS §6–7 | SMS-38 | Joint | Done |
| SMS-40 | Author OpenAPI 3.0.3 specification | Specification | Plan §8 Part 2 | SMS-38, SMS-39 | Coding Agent | Done |
| SMS-41 | Build API traceability matrix (REQ ↔ operation ↔ scenario) | Documentation | Plan §8.1; SRS §8 | SMS-40 | Coding Agent | Done |
| SMS-42 | Write positive and negative mock scenarios and runners | Test | Plan §8.2; SCN-01..15 | SMS-40 | Coding Agent | Done |
| SMS-43 | API-GATE: validate contract and mock against the 10 criteria | Gate | Plan §9 | SMS-41, SMS-42 | Human | Done |
| SMS-44 | Test S1.0 infrastructure: 404, 405, malformed JSON → 400, Problem shape, trace propagation, log line shape (415 moves to SMS-21, plan §8.2) | Test | Plan §8, §8.2; error-model.md §3 | SMS-43 | Coding Agent | Done |
| SMS-45 | Addendum 001: cancelled reminders (REQ-F-034) | Addendum | REQ-F-034, Plan §8.1 | SMS-7, SMS-46 | Coding Agent | Done |
| SMS-46 | Stage R: refactoring and the reminder scheduler | Refactoring | Plan §9, register row 11 | SMS-7 | Coding Agent | Done |
| SMS-47 | Component split, README and log samples | Documentation | Task step 1 (logging); component split | SMS-24, SMS-25 | Joint | Done |
| SMS-48 | Human validation record (step 7) | Validation | Plan §10 | SMS-45, SMS-46, SMS-47 | Human | Done |
| SMS-49 | Second refactoring: one due-reminder statement (step 6) | Refactoring | Plan §9; task step 6 | SMS-45, SMS-46 | Coding Agent | Done |
| SMS-50 | Local setup instructions in the README | Documentation | Plan §9; the setup gap in the README | — | Joint | Done |
| SMS-51 | curl examples for the operation families | Documentation | Plan §9; the README | SMS-50 | Joint | Done |
| SMS-52 | Lab 6 preparation: plan, commit prefixes, lockfile, SRS v1.3 PDF, tracker alignment | Documentation | Lab 6; `logs/2026-11-26-lab6-plan.md` | — | Joint | Done |
| SMS-53 | Coding convention document and linter/formatter configuration | Documentation | Lab 6 step 1; D-L6-5 | SMS-52 | Joint | Done |
| SMS-54 | Convention analysis of the existing code: lint report, formatting, fixes | Verification | Lab 6 step 2 | SMS-53 | Coding Agent | Done |
| SMS-55 | UI screen specification (screens ↔ REQ-IDs ↔ API operations) | Specification | SRS v1.3 §User Interface; REQ-NF-002…007; D-L6-3 | SMS-52 | Joint | Done |
| SMS-56 | UI-GATE: approve the screen specification | Gate | D-L6-3 | SMS-55 | Human | Done |
| SMS-57 | Test the UI end to end (SCN-01…16 flows, REQ-NF-002/003/004/006/007) | Test | `spec/ui/screens.md`; D-L6-4 | SMS-54, SMS-56 | Coding Agent | Done |
| SMS-58 | G5: approve stage S6 (user interface) exit | Gate | Lab 6 plan §4 | SMS-36 | Human | Done |
| SMS-59 | Terminology audit: glossary ↔ code ↔ API ↔ UI | Verification | Lab 6 step 3; SRS v1.3 glossary | SMS-58 | Joint | Done |
| SMS-60 | Docstrings: audit and complete TSDoc for public exports | Documentation | Lab 6 step 4 | SMS-59 | Coding Agent | Done |
| SMS-61 | API reference (Redocly), code reference (TypeDoc), architecture | Documentation | Lab 6 step 5; D-L6-6 | SMS-60 | Coding Agent | Done |
| SMS-62 | README and deployment guide | Documentation | Lab 6 step 6 | SMS-58 | Joint | Done |
| SMS-63 | User guide per role | Documentation | Lab 6 step 7 | SMS-58 | Joint | Done |
| SMS-64 | Documentation check: README run, API docs vs code, user guide vs UI | Verification | Lab 6 steps 8–10 | SMS-61, SMS-62, SMS-63 | Joint | Done |
| SMS-65 | Complete the traceability matrix and audit it automatically | Documentation | Lab 6 steps 11–12 | SMS-64 | Joint | Done |
| SMS-66 | Final verification of the repository | Verification | Lab 6 step 13 | SMS-65 | Coding Agent | Done |
| SMS-67 | Final human validation against the initial concept | Validation | Lab 6 steps 14–15; `spec/DESCRIPTION.md` | SMS-66 | Human | Done |
| SMS-68 | FINAL-GATE (lab 6), final SDD log, tag v1.0.0 | Gate | Lab 6 steps 16–17; D-L6-7, D-L6-8 | SMS-67 | Human | Done |
| SMS-69 | Fix: period=repeated answers 400 instead of 422 INVALID_PERIOD | Feature | REQ-F-022; Q1; found by SMS-54 | SMS-54 | Coding Agent | Done |
| SMS-70 | Fix: confirmationUrl points to a placeholder host instead of this deployment | Feature | REQ-F-004, 005; UI-GATE U-1 | SMS-56 | Coding Agent | Done |
| SMS-71 | Fix: the administrator is listed, read and changed as a master (R1, R3, R4, R11) | Feature | REQ-F-017, 018; D10, D-19; found by SMS-57 (S3) | SMS-57 | Coding Agent | Done |
| SMS-72 | Fix: R11 answers 500 for a serviceId naming no service | Feature | REQ-F-018; error-model §3; found verifying SMS-71 | SMS-71 | Coding Agent | Done |
| SMS-73 | Fix: My availability shows times in the browser's 12-hour format | Feature | UI-GATE U-4; REQ-F-015; found at the developer's hands-on check | SMS-36 | Coding Agent | Done |
| SMS-74 | Fix: the README's first run fails in a clean environment (F11, F13) | Documentation | Lab 6 step 8; the developer's run | SMS-62 | Joint | Done |
| SMS-75 | Fix: the unhandled-error log omits the cause the database gave (F12) | Feature | Lab 5 step 1 (logging); the developer's run | SMS-36 | Coding Agent | Done |
| SMS-76 | Fix: three usability findings of the developer's review before G5 | Feature | the developer's review; REQ-F-022; REQ-NF-002; K2, K10 | SMS-36 | Coding Agent | Done |
| SMS-77 | Fix: create-admin shows the password while it is typed | Feature | README (typing is not shown); the developer's README re-run | SMS-74 | Coding Agent | Done |
| SMS-78 | Fix: a successful db:migrate can look silent | Feature | README First run; the developer's README re-run | SMS-74 | Coding Agent | Done |
| SMS-79 | Change: times in the browser's own hour cycle, entered with its time control | Feature | the developer's decision at the final validation (U-4 amended); REQ-NF-003; REQ-F-015 | SMS-73 | Coding Agent | Done |
| SMS-80 | Next cycle: find a client's appointments by name or phone | Specification | final validation SMS-67, P2; DESCRIPTION.md §2 | SMS-67 | Human | Backlog (next SDD cycle, not v1.0.0) |

Verification and Validation tickets are created per stage at stage start
(agent drafts Verification evidence; Validation is executed and closed by the
human only). They inherit the stage's ticket sources as their `Source` field.

## Requirement → ticket coverage (all 42 REQ IDs: 33 REQ-F + 9 REQ-NF)

| Requirement | Feature ticket(s) | Test ticket(s) |
|---|---|---|
| REQ-F-001 | SMS-25 | SMS-8 |
| REQ-F-002 | SMS-25 | SMS-8 |
| REQ-F-003 | SMS-25 | SMS-8 |
| REQ-F-004 | SMS-26 | SMS-8 |
| REQ-F-005 | SMS-26 | SMS-8 |
| REQ-F-006 | SMS-27 | SMS-9 |
| REQ-F-007 | SMS-28 | SMS-10 |
| REQ-F-008 | SMS-28 | SMS-10 |
| REQ-F-009 | SMS-28 | SMS-10 |
| REQ-F-010 | SMS-29 | SMS-11 |
| REQ-F-011 | SMS-29 | SMS-11 |
| REQ-F-012 | SMS-22 | SMS-21 |
| REQ-F-013 | SMS-31 | SMS-21 |
| REQ-F-014 | SMS-31 | SMS-21 |
| REQ-F-015 | SMS-24 | SMS-15 |
| REQ-F-016 | SMS-30 | SMS-12 |
| REQ-F-017 | SMS-22 | SMS-21 |
| REQ-F-018 | SMS-23 | SMS-21 |
| REQ-F-019 | SMS-32 | SMS-21 |
| REQ-F-020 | SMS-33 | SMS-21 |
| REQ-F-021 | SMS-34 | SMS-13 |
| REQ-F-022 | SMS-35 | SMS-16 |
| REQ-F-032 | SMS-35 | SMS-16 |
| REQ-F-033 | SMS-35 | SMS-16 |
| REQ-F-034 (addendum 001) | SMS-45 | SMS-45 |
| REQ-F-023 | SMS-30 | SMS-12 |
| REQ-F-024 | SMS-23 | SMS-14 |
| REQ-F-025 | SMS-23 | SMS-21 |
| REQ-F-026 | SMS-30 | SMS-12 |
| REQ-F-027 | SMS-34 (payment), SMS-32 (completed status) | SMS-13 |
| REQ-F-028 | SMS-32 | SMS-21 (AC check) + SMS-10 (behavior) |
| REQ-F-029 | SMS-29 | SMS-17 |
| REQ-F-030 | SMS-30 | SMS-18 |
| REQ-F-031 | SMS-25 | SMS-19 |
| REQ-NF-001 | SMS-26 | SMS-20 |
| REQ-NF-002 | SMS-36 | SMS-20 |
| REQ-NF-003 | SMS-36 | SMS-20 |
| REQ-NF-004 | SMS-36 | SMS-20 |
| REQ-NF-005 | SMS-37 | SMS-20 |
| REQ-NF-006 | SMS-36 | SMS-20 |
| REQ-NF-007 | SMS-36 | SMS-20 |
| REQ-NF-008 | SMS-25 | SMS-19, SMS-20 |
| REQ-NF-009 | SMS-37 | SMS-20 |
