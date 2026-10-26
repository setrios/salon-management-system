# Clarification and addendum register — Salon Management System API

Status: **CLOSED** — five rows, all clarified with no SRS impact. The register
has no open rows, so it does not block the API-GATE decision.

Purpose (lab step 14): behaviour discovered during API design or mock
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
| CL-02 | 2026-10-26 | Phase 0 spike Q4 | In static mode Prism returns literal documented examples, so `traceId` and `instance` repeat identically across requests instead of being generated per request. | clarification — mock artefact | Accepted. Scenarios assert `status`, `code`, media type and schema conformance; they never assert `traceId`, `instance` or other per-request values. Per-request generation is Lab 5 behaviour. | none |
| CL-03 | 2026-10-26 | Part 3 scenario run | Prism hangs on a syntactically invalid JSON request body instead of answering 400 (observed: `curl --max-time` exit 28). | clarification — mock artefact | Accepted. `400 MALFORMED_REQUEST` stays in the catalog and is demonstrated through a wrong query-parameter type (NEG-03); body-parse rejection is verified in Lab 5. Not claimed as mock-verified. | none |
| CL-04 | 2026-10-26 | Part 3 scenario run | An undefined method (`DELETE` on a documented path) returns 405, but the body is Prism's own error object, not our `Problem`. | clarification — mock artefact | Accepted. The contract still forbids deletion and documents `METHOD_NOT_ALLOWED`; NEG-17 demonstrates the documented shape with `Prefer: code=405`. NEG-16 records the status-only observation. Enforcement is Lab 5. | none |
| CL-05 | 2026-10-26 | Part 2/3 design review | Cross-field rules (period XOR, 30-minute boundary, issue-vs-stock) cannot be expressed as an OpenAPI 3.0 schema constraint. | clarification — expressiveness limit | Accepted. Rules are stated in operation descriptions and `error-model.md`; negative scenarios force the documented codes so the responses are proven well-formed. Behavioural enforcement is Lab 5. | none |

## Status summary

| Open | Clarified | Addendum required | Rejected |
|---:|---:|---:|---:|
| 0 | 5 | 0 | 0 |

## Open items to be added during Parts 1–4

Any new question raised by design or scenario runs is appended here with the next
free `CL-NN` id. The register is re-checked before the gate; an addendum row
blocks the gate until the SRS revision exists.
