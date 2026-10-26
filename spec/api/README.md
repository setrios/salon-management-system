# Salon Management System — REST API contract (Lab 4)

API-first design package for the Salon Management System. This directory contains
the **contract only** — no application implementation. Implementation is Lab 5
(TDD).

Source of truth for behaviour: `spec/salon-management-system-srs-v1.3.tex`
(approved 2026-09-27). The design rationale and step-by-step execution plan live
in [`../../logs/2026-10-26-api-design-plan.md`](../../logs/2026-10-26-api-design-plan.md).

Scope: **50 operations** — 11 public/booking, 2 authentication, 7 master,
30 administrator. Base path `/api/v1`; JSON; errors are
`application/problem+json`; timestamps are RFC 3339 with offset in
`Europe/Kyiv`; money is integer kopiykas (`UAH`); ids are UUID v4.

## Artifacts

| File | Purpose | Status |
|---|---|---|
| `openapi.yaml` | OpenAPI 3.0.3 specification (the contract) | done |
| `resource-model.md` | Requirement classification, resources, URI grammar, method semantics, 50-operation table | done |
| `error-model.md` | Single RFC 9457 `Problem` model and 16-code catalog | done |
| `api-traceability.md` | REQ-ID → operation → scenario matrix | done |
| `clarifications.md` | Clarification and addendum register (lab step 14) | done |
| `redocly.yaml` | Redocly lint configuration | done |
| `scenarios/positive.md` | 27 positive scenarios and expected results | done |
| `scenarios/negative.md` | 17 negative scenarios and expected results | done |
| `scenarios/run-positive.sh` | Prism-backed positive runner (104 assertions) | done |
| `scenarios/run-negative.sh` | Prism-backed negative runner (39 assertions) | done |
| `scenarios/results/` | Captured run evidence | done |
| `validation-report.txt` | Redocly lint result (API-GATE evidence) | done |
| `spike/smoke.yaml`, `spike/run-spike.sh` | Phase 0 tooling spike (throwaway) | done |
| `spike/FINDINGS.md` | Spike findings that shaped the contract | done |

## Prerequisites

- Node.js >= 24.18.0 (repository target; tested on v26.8.1)
- Network access for the one-time `npm install`
- `curl` and `jq` for the scenario runners

## Commands

```bash
cd spec/api
npm install            # one-time, creates node_modules/ (git-ignored)

npm run lint           # Redocly lint; must be clean for API-GATE
npm run bundle         # resolve $refs into dist/openapi.yaml

npm run mock           # Prism mock, static mode: documented examples on :4010
npm run mock:dynamic   # Prism mock, dynamic mode: generated examples on :4010
npm run test:positive  # positive scenarios against the running mock
npm run test:negative  # negative scenarios against the running mock
```

Run `npm run mock` in one terminal and the scenario runners in another.

## Phase 0 tooling spike

Before the contract was authored, a throwaway spec answered the questions that
decide how negatives can be verified through the mock:

```bash
npm run spike          # writes spike/spike-report.txt and spike/prism.log
```

Result: **5/5 passed**. `Prefer: code=409` does force a documented response, and
a schema-invalid body is answered with our documented `Problem` example rather
than Prism's own format. `spike/smoke.yaml` is not part of the deliverable.

## Mock conventions and fidelity

Prism is **spec-driven** and **stateless**. In static mode it returns the literal
examples written in the specification, so a response that differs from the
contract is a defect. The runners assert status, media type, `code` and
response-shape invariants; they never assert `traceId` or `instance`.

Verified behaviour (see `scenarios/negative.md` for the per-case disposition):

| Behaviour | Result |
|---|---|
| Documented 2xx examples | Served verbatim |
| Security scheme enforcement | Missing bearer token → 401 with our `Problem` |
| Schema violation (missing/unknown field) | 422 with our `Problem`; `additionalProperties: false` enforces D22 |
| Wrong query-parameter type | 400 with our `Problem` |
| Wrong `Content-Type` | 415 with our `Problem` |
| `Prefer: code=NNN` on a valid request | Forces the documented response for 403, 404, 405, 409, 422 |
| Role-based 403 | **Not enforceable** — Prism checks only that a token is present |
| Data-dependent 404 / state-dependent 409 | **Not reproducible** — no storage; forced with `Prefer` |
| Unparsable JSON body | **Hangs** the mock (observed curl exit 28); 400 is demonstrated via a query violation instead |
| Undefined method (`DELETE`) | 405, but with Prism's own error body, not `Problem` |

Prism limitations handled explicitly in the spec and scenarios:

- **Base path.** Prism mounts `paths` at the server root and drops the path
  component of `servers[].url`. The contract publishes `/api/v1/...`; the mock
  serves the same paths without the prefix. Runners call
  `http://127.0.0.1:4010/services`. Recorded as CL-01.
- **Static examples.** `traceId` and `instance` repeat across requests, and a
  response cannot echo request data. Recorded as CL-02.
- **`--errors` is mandatory.** Without it Prism logs violations and still
  answers a documented 2xx. Both mock scripts pass `--errors`.
- **Cross-field rules** (period XOR, 30-minute boundary, overstock) are not
  expressible in OpenAPI 3.0; they are documented in operation descriptions and
  forced with `Prefer` in negative scenarios.

## Results

- `validation-report.txt` — Redocly lint: 0 errors, 0 warnings.
- `scenarios/results/positive-results.txt` — 104 assertions, 0 failed.
- `scenarios/results/negative-results.txt` — 39 assertions, 0 failed.
- API-GATE decision: `logs/2026-10-26-api-gate-decision.md`.
