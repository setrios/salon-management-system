# SPEC-GATE decision record

This file records one SPEC-GATE decision per specification version. Each
version is reviewed and approved independently; approval of one version
does not carry over to the next.

---

## v1.0 — Baseline

Date: 2026-09-26
Artifact under review: `spec/salon-management-system-srs-v1.0.tex`
Inputs: `DESCRIPTION.md`, `2026-09-16-sms-reminder-conflict.md`,
`2026-09-26-sked-dialogue-summary.md`

### Scope of this gate
Approves (or rejects) the baseline SRS as the reference artifact for the
next SDD phase (specification analysis / iteration planning by the coding
agent). Does not itself authorize any implementation.

### Checklist
- [x] All functional requirements have a stable ID and an acceptance
      criterion.
- [x] All non-functional requirements have a stable ID and an acceptance
      criterion.
- [x] Domain glossary defines every entity used in the requirements.
- [x] BDD scenarios cover the primary client flow and the significant edge
      cases identified during SKED (late-booking reminder suppression,
      reschedule, notification toggles, payment-after-completion order).
- [x] Traceability matrix links every requirement to at least an
      acceptance-criteria reference; behavioral requirements also link to a
      BDD scenario.
- [x] Contradictions with prior confirmed decisions were flagged during the
      dialogue and resolved explicitly, not silently merged (see summary
      log, "Decisions that reverse a prior confirmed decision").
- [x] Document compiles cleanly with `pdflatex` (2-pass, no undefined
      references, no errors).
- [x] `DESCRIPTION.md` updated to reflect the two superseded decisions.
      Closed by the `docs:` commit that synced `DESCRIPTION.md` after this
      gate's initial approval.

### Decision

**STATUS: APPROVED — 2026-09-26.**

Approved by the human reviewer.

### Commit message used

```
gate: approve baseline SRS for salon management system

- accepts spec/salon-management-system-srs-v1.0.tex as the SPEC-GATE
  baseline after SKED dialogue
- records two decisions superseding DESCRIPTION.md §8 (booking/reschedule
  SMS confirmation; master/admin notifications)
- logs/2026-09-26-sked-dialogue-summary.md and
  logs/2026-09-26-spec-gate-decision.md capture the dialogue and the gate
  checklist
```

---

## v1.1 — Adds REQ-F-027/028, clarifies glossary terms

Date: 2026-09-26
Artifact under review: `spec/salon-management-system-srs-v1.1.tex`
(supersedes the approved v1.0; v1.0 is kept unchanged as historical
baseline, not deleted)
Inputs: independent critical review of v1.0 (findings grouped as review
categories in the review conversation; not reproduced here since those
labels are not meaningful outside that conversation)

### Scope of this gate
Approves (or rejects) v1.1 as the current baseline, replacing v1.0 for all
purposes going forward except historical reference.

### Checklist
- [x] REQ-F-027 added (administrator marks an appointment completed),
      closing a gap where REQ-F-021 depended on an undefined status.
- [x] REQ-F-028 added (administrator-initiated date/time/master changes
      follow the same reminder-recalculation and client-SMS rules as a
      client-initiated reschedule), closing an inconsistency between
      REQ-F-019 and REQ-F-007–009.
- [x] Appointment status values (`confirmed` / `completed` / `cancelled`)
      and same-record-on-reschedule behavior defined in the glossary.
- [x] "Deactivate" (REQ-F-018) given a precise meaning: hides from future
      selection, does not delete history.
- [x] Confirmation-page token lifecycle after cancellation defined: stays
      valid, read-only.
- [x] REQ-NF-002's acceptance criterion narrowed to name the controls it
      actually covers.
- [x] Master and Administrator glossary entries note their login
      credentials; an explicit account-recovery exclusion added.
- [x] Document compiles cleanly with `pdflatex` (multi-pass, no undefined
      references, no errors).
- [x] New assumptions introduced by this revision (below) reviewed and
      explicitly confirmed by the human reviewer — confirmed 2026-09-27.

### New assumptions introduced (confirmed by human reviewer, 2026-09-27)
- REQ-F-027 assigns the "mark appointment completed" action to the
  Administrator, not the Master. **Confirmed.**
- REQ-F-028 makes administrator-initiated changes follow the same rules as
  client reschedule, rather than being a silent edit. **Confirmed.**
- The confirmation page and its access token remain valid (read-only)
  after cancellation, rather than being invalidated. **Confirmed.**

### Decision

**STATUS: APPROVED — 2026-09-27.**

Approved by the human reviewer, including the three new assumptions
listed above.

### Suggested commit message (per `commit-convention.md`)

```
spec: add REQ-F-027/028 and clarify glossary terms in SRS v1.1

- add spec/salon-management-system-srs-v1.1.tex and compiled PDF
  (v1.0 unchanged, kept as the approved baseline)
- add REQ-F-027 (mark appointment completed) and REQ-F-028 (admin
  edits follow the same rules as client reschedule) — REQ-F-021 and
  REQ-F-019 previously depended on behavior no requirement defined
- define Appointment status values, "deactivate" semantics, and
  confirmation-page token behavior after cancellation
- add master/admin login fields to the glossary; add an explicit
  account-recovery exclusion
- narrow REQ-NF-002's acceptance criterion to name the controls it
  actually covers
```

---

## v1.2 — Fixes acceptance criteria, adds edge-case requirements

Date: 2026-09-26
Artifact under review: `spec/salon-management-system-srs-v1.2.tex`
(supersedes v1.1; v1.0 and v1.1 kept unchanged as historical versions)
Inputs: continuation of the independent critical review of v1.0

### Scope of this gate
Approves (or rejects) v1.2 as the current baseline.

### Checklist
- [x] REQ-F-024's acceptance criterion rewritten to also test the seed-
      category clause, not only the free-form clause.
- [x] REQ-NF-006's acceptance criterion rewritten from a circular
      restatement into an independently observable condition.
- [x] REQ-F-029 added: a reminder previously recorded as skipped
      reactivates if a reschedule moves it back into the future.
- [x] REQ-F-030 added: the acting administrator is not notified of their
      own action; the assigned master still is.
- [x] REQ-F-031 added: multi-service booking duration rounds up to the
      next 30-minute boundary for slot occupancy.
- [x] BDD scenarios SCN-09..SCN-13 added, covering REQ-F-015, REQ-F-022,
      and the three new requirements above.
- [x] Traceability matrix's "Acceptance Crit." column replaced with a
      short per-requirement paraphrase instead of a whole-section
      reference.
- [x] Pre-existing wrong traceability link corrected: REQ-F-018 was
      linked to SCN-08; the link belongs to REQ-F-024.
- [x] Section 2.1 (Superseded Decisions) notes that `DESCRIPTION.md` has
      since been synchronized, so it no longer reads as an open conflict.
- [x] Document compiles cleanly with `pdflatex` (multi-pass, no undefined
      references, no errors).
- [x] New assumptions introduced by this revision (below) reviewed and
      explicitly confirmed by the human reviewer — confirmed 2026-09-27.

### New assumptions introduced (confirmed by human reviewer, 2026-09-27)
- REQ-F-029: a previously-skipped reminder is allowed to reactivate,
  rather than staying permanently skipped once missed. **Confirmed.**
- REQ-F-030: only the administrator is exempted from self-notification;
  masters have no equivalent exemption because no requirement currently
  lets a master trigger a new/reschedule/cancel event themselves.
  **Confirmed.**
- REQ-F-031: rounding rule is round-up to the next 30-minute boundary
  (not round-to-nearest or exact-fit rejection). **Confirmed.**

### Decision

**STATUS: APPROVED — 2026-09-27.**

Approved by the human reviewer, including the three new assumptions
listed above.

### Suggested commit message (per `commit-convention.md`)

```
spec: fix acceptance criteria and add edge-case requirements in SRS v1.2

- add spec/salon-management-system-srs-v1.2.tex and compiled PDF
- rewrite REQ-F-024 and REQ-NF-006 acceptance criteria so each is
  independently testable
- add REQ-F-029 (skipped reminder reactivates on reschedule),
  REQ-F-030 (acting admin isn't self-notified), REQ-F-031 (multi-
  service duration rounds up to a 30-min slot)
- add BDD scenarios SCN-09..SCN-13; fix a wrong traceability link
  (REQ-F-018 -> SCN-08, corrected to REQ-F-024 -> SCN-08); replace
  generic section references in the traceability matrix with a short
  paraphrase per requirement
- note that DESCRIPTION.md has since been synchronized
```

---

## v1.3 — Fixes REQ-F-022 AC coverage gap; reconciles gate-status recordkeeping

Date: 2026-09-27
Artifact under review: `spec/salon-management-system-srs-v1.3.tex`
(supersedes v1.2; v1.0, v1.1, and v1.2 kept unchanged as historical versions)
Inputs: follow-up cross-artifact consistency check performed after v1.2 was approved

### Scope of this gate
Approves (or rejects) v1.3 as the current baseline.

### Checklist
- [x] REQ-F-022 split into REQ-F-022 (revenue only), REQ-F-032 (popular
      services), and REQ-F-033 (stock levels), each independently testable.
- [x] BDD scenarios SCN-14 and SCN-15 added covering popular services and
      material stock levels.
- [x] Traceability matrix updated to reflect REQ-F-022, REQ-F-032, and
      REQ-F-033.
- [x] Policy on gate-status recordkeeping clarified in Revision History note
      (Section 8 embedded status reflects state at commit time; Revision History
      and `logs/2026-09-26-spec-gate-decision.md` are authoritative).
- [x] Document compiles cleanly with `pdflatex` (multi-pass, no undefined
      references, no errors).
- [x] New assumptions introduced by this revision (below) reviewed and
      explicitly confirmed by the human reviewer — confirmed 2026-09-27.

### New assumptions introduced (confirmed by human reviewer, 2026-09-27)
- REQ-F-032: the popular-services report ranks services by number of
  bookings, not by revenue generated. **Confirmed.**
- REQ-F-032: the popular-services report accepts the same period options as
  REQ-F-022 (preset or custom range), while REQ-F-033 (stock levels)
  accepts none, being a point-in-time snapshot. **Confirmed.**

### Decision

**STATUS: APPROVED — 2026-09-27.**

Approved by the human reviewer, including the two new assumptions listed above.

### Suggested commit message (per `commit-convention.md`)

```
spec: fix REQ-F-022 AC coverage gap and reconcile gate status in SRS v1.3

- add spec/salon-management-system-srs-v1.3.tex and compiled PDF
- split REQ-F-022 into REQ-F-022 (revenue), REQ-F-032 (popular
  services), and REQ-F-033 (stock levels) so each is independently
  testable
- add BDD scenarios SCN-14, SCN-15
- document gate-status recordkeeping policy in Revision History note
```

---

## Commit message for this gate record itself

```
gate: approve SRS v1.1, v1.2, and v1.3 revisions

- record SPEC-GATE decisions for v1.1 (completion/edit requirements,
  glossary clarifications), v1.2 (acceptance-criteria fixes,
  edge-case requirements, BDD/traceability corrections), and v1.3
  (REQ-F-022 split, SCN-14/15, gate-status recordkeeping policy)
- v1.1, v1.2, and v1.3 are APPROVED as of 2026-09-27, including all
  new assumptions listed in each version's section, confirmed by the
  human reviewer
- v1.3 is the current baseline