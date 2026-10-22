# Risk register — Salon Management System (Lab 3)

Date: 2026-10-21
Companion artifact: `logs/2026-10-21-sdd-plan.md`
Input: `spec/salon-management-system-srs-v1.2.tex` (approved baseline)
Status: **DRAFT — pending student review and PLAN-GATE decision (SMS-3).**

Scope note: only risks with a substantive relation to this project are
included. Per the lab task, the AI-specific analysis covered misinterpretation
of requirements, non-determinism, code/test error correlation, context loss or
staleness, tool errors, and insufficient human oversight of critical decisions.

Columns: ID / category / risk / manifestation / consequences / detection /
prevention–mitigation / priority / owner.

## Traditional risks

| ID | Category | Risk | Manifestation | Consequences | Detection | Prevention / mitigation | Priority | Owner |
|---|---|---|---|---|---|---|---|---|
| R-01 | Requirements | Ambiguity or gap in the SRS surfaces during implementation | A ticket's scope cannot be resolved from the AC text alone (e.g., what counts as "own calendar" for REQ-F-013) | Rework; delayed stage; possible Addendum | Ticket cannot state its acceptance condition without inventing behavior | Stop and return to requirements (REVISE / Addendum), never invent behavior in a Feature ticket | High | Student |
| R-02 | Schedule | Stage slips past its gate | Tickets pile up in In Review; gate checklist incomplete | Compressed later stages; missed milestone | Stage duration exceeds plan (Section 6 of the plan) | Time-box stages; defer scope to a later stage rather than skipping the gate | Medium | Student |
| R-03 | Resources | Single human reviewer is a bottleneck | Validation and gate windows deferred; pipeline stalls in In Review | All dependent stages blocked despite agent capacity | Tickets idle in In Review > planned review window | Batch validations per stage; schedule fixed review windows; keep review effort small (checklists) | Medium | Student |
| R-04 | Technology | Test tooling or LaTeX build fails | Tests cannot run; PDF does not compile | No verification signal; broken traceability artifact | Build/test run fails per ticket | Smoke-test tooling in S0; pin versions; fix before starting a stage | Medium | Agent + Student |

## AI-specific risks

| ID | Category | Risk | Manifestation | Consequences | Detection | Prevention / mitigation | Priority | Owner |
|---|---|---|---|---|---|---|---|---|
| R-05 | AI | Misinterpretation of a requirement or AC | Agent implements round-to-nearest where REQ-F-031 requires round-up; or treats a skipped reminder as permanently dead ignoring REQ-F-029 | Feature passes its own test but fails validation; hidden defects | Human compares ticket scope against the AC text before implementation; BDD scenarios used as oracle | Ticket body restates the AC verbatim; ticket cites REQ IDs; validation against SCN-… scenarios | High | Student + Agent |
| R-06 | AI | Non-determinism of agent output | The same ticket implemented twice yields different code or test structure | Inconsistent style; flaky or drifting tests; harder review | Re-run or self-review produces different results; diffs between attempts | Fixed conventions in AGENTS.md; small, single-purpose tickets; deterministic tests with fixed data (as in SCN-01…13) | Medium | Agent |
| R-07 | AI | Correlated errors between code and tests | Agent writes the feature and its test from the same misconception → tests are green while behavior is wrong (e.g., both encode "no fee after appointment started" contrary to REQ-F-006) | False confidence; defects found late or never | Independent human review of TEST tickets against SRS ACs, separate from code review | Human approves test expectations from the ACs before the feature is implemented (test-first order in the workflow) | High | Student |
| R-08 | AI | Context loss or staleness | Agent forgets a v1.2 rule mid-project (e.g., confirmation-page token stays valid read-only after cancellation; admin edits trigger the same SMS as client reschedule, REQ-F-028) | Contradictory behavior across tickets; regression of earlier decisions | Contradictions found at stage validation or in traceability review | Re-read the relevant SRS section per ticket; each ticket body carries its requirement text, not a paraphrase; traceability matrix cross-check | High | Agent + Student |
| R-09 | AI | Tool errors by the agent | Broken build after an edit; misapplied file change; wrong LaTeX markup | Blocked stage; corrupted artifacts | Test/lint run and pdflatex compile per ticket | Verification step after each feature; compile check after spec edits | Medium | Agent |
| R-10 | AI | Insufficient human oversight of critical decisions | Agent gradually makes validation or gate calls ("looks done, marking Done"), or the human rubber-stamps without checking | Gate becomes a formality; invalid acceptance; process bypass | Gate checklist audit: who moved the ticket, was the evidence reviewed | Validation (VAL) and Gate tickets are human-only by workflow rule; the agent cannot move tickets into Done; audit trail kept in logs/ | Critical | Student |

## Review

The register is reviewed at each stage gate (SMS-4…07) and at final
validation; risks are updated (status Open / Mitigating / Closed) and new
risks added as they surface. Escalation trigger: any risk that materializes
on a critical-path ticket (Section 7 of the plan) is raised to the next gate
as a blocking item.
