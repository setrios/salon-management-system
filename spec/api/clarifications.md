# Clarification and addendum register — Salon Management System API

Status: CLOSED — eleven rows. CL-06..CL-08 added 2026-11-08; their dispositions were confirmed in logs/gates/2026-11-08-plan-gate.md before the first TEST-GATE. CL-09 added 2026-11-08 at the S1.1 TEST-GATE (SMS-21). CL-10 added 2026-11-08 at the S1.2 TEST-GATE (SMS-14). CL-11 added 2026-11-12 at G2 (SMS-5).

Purpose (step 14): behaviour discovered during API design or mock
verification that is **not** in SRS v1.3 must not enter the contract silently.
It is routed here, given a type and a disposition.

## Rules

1. **Clarification** — resolves an ambiguity already inside the SRS's intent.
   No SRS change is needed. Must cite the requirement or artefact it clarifies.
2. **Addendum** — introduces genuinely new behaviour. Requires an SRS revision
   and a new SPEC-GATE before it enters the contract. Until then the operation
   carries `x-pending-addendum` and is excluded from the API-GATE pass.
3. Every row ends with a disposition; no row may remain `open` at the gate.

## Register

| ID | Date | Source | Description | Type | Disposition | SRS impact |
|---|---|---|---|---|---|---|
| CL-01 | 2026-10-26 | Phase 0 spike Q2 | Prism mounts `paths` at the server root and ignores the path component of `servers[].url`, so the mock serves `/services` while the contract publishes `/api/v1/services`. | clarification — mock artefact, not contract behaviour | Accepted. Contract keeps the canonical `/api/v1` base path; scenario runners call the mock at the root URL. Documented in `spike/FINDINGS.md` and in the README. | none |
| CL-02 | 2026-10-26 | Phase 0 spike Q4 | In static mode Prism returns literal documented examples, so `traceId` and `instance` repeat identically across requests instead of being generated per request. | clarification — mock artefact | Accepted. Scenarios assert `status`, `code`, media type and schema conformance; they never assert `traceId`, `instance` or other per-request values. Per-request generation is next-phase behaviour. | none |
| CL-03 | 2026-10-26 | Part 3 scenario run | Prism hangs on a syntactically invalid JSON request body instead of answering 400 (observed: `curl --max-time` exit 28). | clarification — mock artefact | Accepted. `400 MALFORMED_REQUEST` stays in the catalog and is demonstrated through a wrong query-parameter type (NEG-03); body-parse rejection is verified in the next phase. Not claimed as mock-verified. | none |
| CL-04 | 2026-10-26 | Part 3 scenario run | An undefined method (`DELETE` on a documented path) returns 405, but the body is Prism's own error object, not our `Problem`. | clarification — mock artefact | Accepted. The contract still forbids deletion and documents `METHOD_NOT_ALLOWED`; NEG-17 demonstrates the documented shape with `Prefer: code=405`. NEG-16 records the status-only observation. Enforcement is next-phase work. | none |
| CL-05 | 2026-10-26 | Part 2/3 design review | Cross-field rules (period XOR, 30-minute boundary, issue-vs-stock) cannot be expressed as an OpenAPI 3.0 schema constraint. | clarification — expressiveness limit | Accepted. Rules are stated in operation descriptions and `error-model.md`; negative scenarios force the documented codes so the responses are proven well-formed. Behavioural enforcement is next-phase work. | none |
| CL-06 | 2026-11-08 | Implementation plan §7 | `createAppointmentAdmin` (R19) documents `201` with schema `Appointment`, which carries `accessToken` and `confirmationUrl`. The `Appointment` schema description states that "Master and administrator responses use `AppointmentAdmin` (D18)", and decision D18 reads "exclude appointment token from admin responses". The two statements in the contract are not fully consistent for this operation. | clarification — internal contract inconsistency, token exposure on creation | Accepted, no contract change. The operation table (`resource-model.md` R19), the response example and the rule that an administrator-created appointment must still yield a client link all fix the behaviour: R19 returns `Appointment`. D18 is read as applying to staff **read** operations (`listMyAppointments`, `listAppointmentsAdmin`, `getAppointmentAdmin`), which POS-24 already asserts. Implementation follows the path table; the wording inconsistency is recorded rather than silently resolved. | none |
| CL-07 | 2026-11-08 | Implementation plan §7 | The approved design plan (`logs/2026-10-26-api-design-plan.md` §5, row M1) names the response schema `AppointmentPage`, which does not exist in `openapi.yaml`. `resource-model.md` (M1) and the contract both specify `AppointmentAdminPage`. | clarification — stale text in a superseded draft section | Accepted, no change. `openapi.yaml` and `resource-model.md` are authoritative for M1; the committed design plan is not retroactively edited, consistent with the immutable-history rule used for the SRS gate sections. | none |
| CL-08 | 2026-11-08 | Implementation plan §7 | `MaterialTransaction` and `MaterialTransactionCreate` use `exclusiveMinimum: true` together with `minimum: 0`. This is valid OpenAPI 3.0.3 (a boolean modifier on `minimum`) but AJV 8 applies draft-07 semantics, where `exclusiveMinimum` must be numeric, so the contract cannot be compiled directly. | clarification — tooling expressiveness | Accepted, no contract change. `src/contract/convert.mjs` rewrites the pair to `exclusiveMinimum: 0` when generating JSON Schema for AJV. The published contract remains OpenAPI 3.0.3. | none |
| CL-09 | 2026-11-08 | S1.1 TEST-GATE (SMS-21) | `login` declares no 422 response (`openapi.yaml` `/auth/login` lists 200, 400, 401, 415, 500), while `error-model.md` §3 assigns `VALIDATION_ERROR` (422) to "every operation with a request body". Both statements are in the approved contract; `login` is the only one of the 17 body-taking operations for which they disagree. | clarification — internal contract inconsistency, response-code scope | Accepted, no contract change. A body that violates `LoginRequest` is answered with `400 MALFORMED_REQUEST`: the operation's response set is closed, and 422 would be an undocumented response. The implementation derives the choice from the contract — 422 when the operation declares it, 400 when it does not — never from the operation id, so the rule stays correct for any future operation. | none |
| CL-10 | 2026-11-08 | S1.2 TEST-GATE (SMS-14) | Three contract-declared responses cannot be produced by any allowed request. (a) R4, R6, R8 and R12 declare `409 DUPLICATE_RESOURCE`, but `MasterPatch` has no `username`, the R8/R12 patch bodies contain no field able to violate the three uniqueness constraints named in `error-model.md` §3, and `Service.name` is not unique there. (b) `GET /categories` declares `400 MALFORMED_REQUEST` but takes no parameter, and `resource-model.md` §5 (P3) lists no 400 for it. | clarification — declared but unreachable responses | Accepted, no contract change. These declarations are not implemented and not tested; the implementation must not invent a uniqueness or validation rule to satisfy them. Dropping the declarations would change the approved contract and therefore requires its own gate. | none |
| CL-11 | 2026-11-12 | G2 (SMS-5) | P8 accepts a `startAt` in the past; no document defines "past", and P11 declares 422 and faces the same question for a rescheduled time. | clarification — undefined boundary | Decided at G2: a requested `startAt` earlier than or equal to the injected clock is 422 `BUSINESS_RULE_VIOLATION` on P8 and P11. Fixed in S3.1 (SMS-28), once, with tests for both operations; deadline before step 7 (validation). The contract is not edited: both operations already declare 422. | none |

## Status summary

| Open | Clarified | Addendum required | Rejected |
|---:|---:|---:|---:|
| 0 | 11 | 0 | 0 |

## Open items to be added during Parts 1–4

Any new question raised by design or scenario runs is appended here with the next
free `CL-NN` id. The register is re-checked before the gate; an addendum row
blocks the gate until the SRS revision exists.
