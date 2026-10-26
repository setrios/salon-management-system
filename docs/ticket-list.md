# Ticket list — SMS (SDD Lab 3, GitHub Issues)

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
| SMS-1 | Baseline specification reference (SRS v1.3 §1–3: scope, actors, glossary, constraints) | Specification | SRS v1.3 §1–3 | — | Human (Student) | Done (SRS already approved) |
| SMS-2 | Populate traceability matrix Ticket column | Documentation | SRS v1.3 §8 (matrix) | SMS-1 | Joint | Done |
| SMS-3 | PLAN-GATE: approve decomposition, dependencies, plan, risks | Gate | This plan §9 | SMS-1, SMS-2 | Human (Student) | Done (GO, 2026-10-22) |
| SMS-4 | G1: approve stage S1 (foundations) exit | Gate | Plan §6 | SMS-3 | Human (Student) | Backlog |
| SMS-5 | G2: approve stage S2 (client booking core) exit | Gate | Plan §6 | SMS-4 | Human (Student) | Backlog |
| SMS-6 | G3: approve stages S3+S4 (reschedule/reminders, notifications) exit | Gate | Plan §6 | SMS-5 | Human (Student) | Backlog |
| SMS-7 | G4: approve stage S5 (admin & payment) exit | Gate | Plan §6 | SMS-6 | Human (Student) | Backlog |
| SMS-8 | Test multi-service booking flow (SCN-01) | Test | REQ-F-001…005, SCN-01 | SMS-3 | Coding Agent | Backlog |
| SMS-9 | Test free cancellation (SCN-02) | Test | REQ-F-006, SCN-02 | SMS-3 | Coding Agent | Backlog |
| SMS-10 | Test reschedule + reminder recalc + SMS (SCN-03) | Test | REQ-F-007…009, SCN-03 | SMS-3 | Coding Agent | Backlog |
| SMS-11 | Test reminder skip rules (SCN-04, SCN-05) | Test | REQ-F-010, 011, SCN-04, SCN-05 | SMS-3 | Coding Agent | Backlog |
| SMS-12 | Test per-channel notification preferences (SCN-06) | Test | REQ-F-016, 023, 026, SCN-06 | SMS-3 | Coding Agent | Backlog |
| SMS-13 | Test payment only after completion (SCN-07) | Test | REQ-F-021, 027, SCN-07 | SMS-3 | Coding Agent | Backlog |
| SMS-14 | Test custom service category + seeds (SCN-08) | Test | REQ-F-024, SCN-08 | SMS-3 | Coding Agent | Backlog |
| SMS-15 | Test master availability modes (SCN-09) | Test | REQ-F-015, SCN-09 | SMS-3 | Coding Agent | Backlog |
| SMS-16 | Test reports: revenue, popular services, stock (SCN-10/14/15) | Test | REQ-F-022, 032, 033, SCN-10, SCN-14, SCN-15 | SMS-3 | Coding Agent | Backlog |
| SMS-17 | Test skipped-reminder reactivation (SCN-11) | Test | REQ-F-029, SCN-11 | SMS-3 | Coding Agent | Backlog |
| SMS-18 | Test admin self-notification suppression (SCN-12) | Test | REQ-F-030, SCN-12 | SMS-3 | Coding Agent | Backlog |
| SMS-19 | Test 30-min slot rounding (SCN-13) | Test | REQ-F-031, SCN-13 | SMS-3 | Coding Agent | Backlog |
| SMS-20 | Test non-functional acceptance criteria | Test | REQ-NF-001…009 | SMS-3 | Coding Agent | Backlog |
| SMS-21 | Test auth and reference-data CRUD checks | Test | REQ-F-012, 013, 014, 017, 018, 019, 020, 025 | SMS-3 | Coding Agent | Backlog |
| SMS-22 | Feature: authentication (master + single admin) | Feature | REQ-F-012, 017 | SMS-21 | Coding Agent | Backlog |
| SMS-23 | Feature: reference data (masters, services/categories, MasterService, materials/units, deactivate) | Feature | REQ-F-018, 024, 025 | SMS-14, SMS-21 | Coding Agent | Backlog |
| SMS-24 | Feature: master availability (weekly pattern + specific dates) | Feature | REQ-F-015 | SMS-15 | Coding Agent | Backlog |
| SMS-25 | Feature: booking flow (multi-service sum, slot picking, auto-confirm, 30-min rounding) | Feature | REQ-F-001, 002, 003, 031; REQ-NF-008 | SMS-8, SMS-19, SMS-23, SMS-24 | Coding Agent | Backlog |
| SMS-26 | Feature: confirmation page + confirmation SMS + unguessable token | Feature | REQ-F-004, 005; REQ-NF-001 | SMS-25 | Coding Agent | Backlog |
| SMS-27 | Feature: client cancellation | Feature | REQ-F-006 | SMS-9, SMS-26 | Coding Agent | Backlog |
| SMS-28 | Feature: client reschedule (recalc + reschedule SMS) | Feature | REQ-F-007, 008, 009 | SMS-10, SMS-26 | Coding Agent | Backlog |
| SMS-29 | Feature: reminder engine (24h/2h, skip rule, reactivation) | Feature | REQ-F-010, 011, 029 | SMS-11, SMS-17, SMS-28 | Coding Agent | Backlog |
| SMS-30 | Feature: notification service (channels, per-event prefs, admin self-notify suppression) | Feature | REQ-F-016, 023, 026, 030 | SMS-12, SMS-18, SMS-26, SMS-27, SMS-28 | Coding Agent | Backlog |
| SMS-31 | Feature: master calendar + own services/prices | Feature | REQ-F-013, 014 | SMS-21, SMS-22 | Coding Agent | Backlog |
| SMS-32 | Feature: admin appointment management (create/edit/cancel follows reschedule rules) | Feature | REQ-F-019, 028 | SMS-21, SMS-28 | Coding Agent | Backlog |
| SMS-33 | Feature: material transactions | Feature | REQ-F-020 | SMS-21, SMS-23 | Coding Agent | Backlog |
| SMS-34 | Feature: mark completed → payment recording | Feature | REQ-F-027, 021 | SMS-13, SMS-32 | Coding Agent | Backlog |
| SMS-35 | Feature: reports (revenue periods/custom range, popular services, stock) | Feature | REQ-F-022, 032, 033 | SMS-16, SMS-34 | Coding Agent | Backlog |
| SMS-36 | Feature: UI constraints (responsive, English, UAH, privacy, no tz selector) | Feature | REQ-NF-002, 003, 004, 006, 007 | SMS-20, SMS-26 | Coding Agent | Backlog |
| SMS-37 | Feature: retention & no-gateway constraints | Feature | REQ-NF-005, 009 | SMS-20, SMS-34 | Coding Agent | Backlog |
| SMS-38 | Define REST resource model and URI/method conventions | Specification | Plan §5; SRS §4–5 | — | Joint | Backlog |
| SMS-39 | Define component schemas and unified error model | Specification | Plan §6–7; SRS §6–7 | SMS-38 | Joint | Backlog |
| SMS-40 | Author OpenAPI 3.0.3 specification | Specification | Plan §8 Part 2 | SMS-38, SMS-39 | Coding Agent | Backlog |
| SMS-41 | Build API traceability matrix (REQ ↔ operation ↔ scenario) | Documentation | Plan §8.1; SRS §8 | SMS-40 | Coding Agent | Backlog |
| SMS-42 | Write positive and negative mock scenarios and runners | Test | Plan §8.2; SCN-01..15 | SMS-40 | Coding Agent | Backlog |
| SMS-43 | API-GATE: validate contract and mock against the 10 criteria | Gate | Plan §9 | SMS-41, SMS-42 | Human (Student) | Backlog |

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
| REQ-F-023 | SMS-30 | SMS-12 |
| REQ-F-024 | SMS-23 | SMS-14 |
| REQ-F-025 | SMS-23 | SMS-21 |
| REQ-F-026 | SMS-30 | SMS-12 |
| REQ-F-027 | SMS-34 | SMS-13 |
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
