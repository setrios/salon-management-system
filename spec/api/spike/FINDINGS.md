# Phase 0 tooling spike — findings

Date: 2026-10-26
Toolchain: Redocly CLI 2.71.0, Prism CLI 5.16.0, Node.js v26.8.1
Raw evidence: `spike-report.txt` (regenerated per run), `prism.log`
Spec used: `smoke.yaml` (throwaway; not part of the deliverable contract)

Result: **5 checks passed, 0 failed.** All four questions answered.

---

## Q1 — Redocly lint with the configured ruleset

**PASS.** Exit code 0, "Your API description is valid."

Two findings from the first run, both now folded into the rules for authoring the
real contract:

1. The `recommended` ruleset enables `security-defined`, so **every operation must
   have `security` defined**, either globally or per operation. Public operations
   must declare `security: []` explicitly — an absent `security` key is an error,
   not an implicit "public".
2. `operation-4xx-response` warns when an operation documents no 4xx response.
   Every operation must therefore document at least one error status, which aligns
   with the requirement that each operation's error surface be explicit.

Configuration lives in `redocly.yaml`; the two switched-off rules are justified
inline there.

## Q2 — Prism starts from the specification and serves documented paths

**PASS.** The mock started and served `GET /services` with 200 and a non-empty
array.

**Critical finding — base path.** Prism mounts the specification's `paths` at the
**server root** and ignores the path component of `servers[].url`. With
`servers[].url = http://127.0.0.1:4010/api/v1`, Prism serves `/services`, not
`/api/v1/services`. Consequences:

- The contract keeps the canonical `/api/v1` base path — that is the published
  interface and is correct in the specification.
- Scenario runners must call the mock **without** the `/api/v1` prefix.
- This is a mock artefact, not a contract defect. It is recorded in
  `clarifications.md` as CL-01 so that nobody "fixes" the base path later.
- Path parameters are unaffected; only the server base path is dropped.

## Q3 — forced 4xx via `Prefer: code=…`

**PASS.** Two checks:

| Request | Result |
|---|---|
| `POST /appointments`, valid body, no preference | 201 with `status=confirmed` |
| `POST /appointments`, valid body, `Prefer: code=409` | 409 with `code=SLOT_UNAVAILABLE` and the full documented `Problem` body |

So business-rule error responses **can** be demonstrated through the mock, using
the documented example for the forced status. Gate criterion 10 is satisfiable for
business-rule negatives.

Requirement this imposes on the contract: **every error status that a negative
scenario needs to demonstrate must be documented on that operation, with a
`Problem` example carrying the specific `code`.** A status that exists only in the
error catalog but not on the operation cannot be forced or shown.

## Q4 — schema-invalid request body

**PASS**, and better than expected. An invalid body produced **422** with **our**
documented `Problem` example, not Prism's own error format:

```json
{"type":"https://api.salon.example/problems/validation-failed","title":"Validation failed",
 "status":422,"detail":"The request body contains invalid fields.","instance":"/api/v1/appointments",
 "code":"VALIDATION_FAILED","traceId":"6f1c2a8e-...","errors":[{"field":"client.phone",
 "code":"PATTERN_MISMATCH","message":"Phone must be in E.164-like format."}]}
```

Prism looks for a documented error response on the operation and returns that
example when the request violates the schema. So schema-validation negatives do
reproduce the unified error model — provided the operation documents a 422 (or
400) response with a `Problem` example.

**Caveat — static examples.** In the default static mode the returned body is the
literal documented example. Two identical invalid requests returned the *same*
`traceId` and the *same* `instance` string. Therefore:

- Scenarios must assert `status`, `code`, media type and schema conformance —
  **not** per-request correlation values.
- `traceId` and `instance` in mock responses are illustrative constants. Real
  per-request generation is next-phase behaviour.

## Q5 (unplanned) — the `--errors` flag

Discovered while setting up Q4: **without `--errors`, Prism does not turn request
validation violations into error responses**; it logs them and answers with a
documented 2xx example. A contract mock that silently answers 200 to an invalid
request is worse than useless for negative testing. `--errors` is therefore
mandatory and is set in both `mock` scripts and in the spike runner.

---

## Consequences for the design plan (§8.2)

| Class | Original assumption | Spike verdict | Action |
|---|---|---|---|
| A. Schema validation | Prism rejects with a `Problem` body | **Confirmed**, and the body is *our* documented example | Document a 422 with a `Problem` example on every operation that accepts a body |
| B. Auth presence | Prism rejects with 401 | Not exercised in the spike | Verify in Part 3; declare `Authorization` header on protected operations |
| C. Unknown resource | 404 documented | Not exercised in the spike | Verify in Part 3 |
| D. Forced status | `Prefer: code=…` may or may not work | **Works** | Use it for business-rule negatives; document each forced status on the operation |
| E. State transition | Not reproducible | **Confirmed not reproducible** | Contract review + next-phase tests; state plainly in the gate record |

Two corrections to the plan's fidelity table:

1. Class A no longer needs the pessimistic fallback — but it is conditional on
   documenting a `Problem` example for the error status on each operation. This
   becomes an authoring rule for Part 2.
2. Class D is resolved in the positive: forced statuses work. Rule 2 of §8.2
   (fallback to asserting documented examples) is not needed.

## Authoring rules derived from the spike

1. Every operation declares `security`, using `security: []` for public routes.
2. Every operation documents at least one 4xx response.
3. Every documented error status carries a `Problem` example with the exact
   `code` a scenario will assert.
4. Scenario runners call the mock at the root URL (no `/api/v1` prefix).
5. Mock scripts always run with `--errors`.
6. Scenarios assert status, `code`, media type and schema — never `traceId`,
   `instance`, or other per-request values.
