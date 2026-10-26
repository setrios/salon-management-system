# API design — Phase 0 setup record

Date: 2026-10-26
Status: **COMPLETE — spike passed 5/5.**
Parent plan: [`2026-10-26-api-design-plan.md`](2026-10-26-api-design-plan.md),
Phase 0 (steps 0.1–0.5).

---

## What was created

| Path | Purpose | Status |
|---|---|---|
| `spec/api/package.json` | Pinned tooling: Redocly 2.71.0, Prism 5.16.0; scripts for lint, bundle, mock, spike, scenarios | done |
| `spec/api/redocly.yaml` | Lint configuration (`recommended` ruleset, two justified exceptions) | done |
| `spec/api/.gitignore` | Excludes `node_modules/`, `dist/`, editor noise | done |
| `spec/api/README.md` | How to install, validate, mock, run scenarios | done |
| `spec/api/openapi.yaml` | Contract skeleton (auth scheme, tags, servers); operations arrive in Part 2 | skeleton |
| `spec/api/resource-model.md` | Skeleton for Part 1 output | skeleton |
| `spec/api/error-model.md` | Skeleton for the `Problem` model and code catalog | skeleton |
| `spec/api/api-traceability.md` | Skeleton for the REQ ↔ operation ↔ scenario matrix | skeleton |
| `spec/api/clarifications.md` | Register for step 14; two rows, closed | done |
| `spec/api/spike/smoke.yaml` | Throwaway spec used only by the spike | done |
| `spec/api/spike/run-spike.sh` | Spike runner (lint, mock startup, forced 409, invalid body) | done |
| `spec/api/spike/FINDINGS.md` | Stable record of what the spike proved and the rules derived from it | done |
| `spec/api/spike/spike-report.txt` | Raw evidence from the last run (regenerated per run) | done |
| `spec/api/scenarios/results/` | Directory for captured mock evidence | done |

## Dependency installation outcome

`npm install` completed in 10 s: 211 packages added, 212 audited.

| Message | Assessment | Action |
|---|---|---|
| `deprecated json-schema-ref-parser@6.1.0` | Transitive via `json-schema-faker` (Prism dependency) | none — not ours to pin |
| `deprecated uuid@8.3.2` | Transitive via `postman-collection` | none |
| `deprecated @faker-js/faker@5.5.3` | Transitive via `postman-collection` | none |
| `8 vulnerabilities (5 moderate, 3 high)` | All transitive under `@stoplight/prism-cli@5.16.0`; dev-only tooling, local execution against a local spec | accepted; **do not** run `npm audit fix --force` — it downgrades Prism to 5.6.0 and risks breaking the mock. Recorded as R-API-07 |
| `@scarf/scarf@1.4.0 postinstall not covered by allowScripts` | Optional analytics package from Prism's tree | leave unapproved; nothing breaks without it |

Installed and verified: `redocly --version` → 2.71.0, `prism --version` → 5.16.0.

## Spike results — 5/5 PASS

Raw evidence: `spec/api/spike/spike-report.txt`. Analysis:
`spec/api/spike/FINDINGS.md`.

| Check | Result |
|---|---|
| Q1 Redocly lint | PASS — exit 0 |
| Q2 Prism startup and documented path | PASS — 200 with a non-empty array |
| Q3a default POST | PASS — 201 with `status=confirmed` |
| Q3b forced 409 via `Prefer: code=409` | PASS — 409 with `code=SLOT_UNAVAILABLE` |
| Q4 schema-invalid body | PASS — 422 with **our** `Problem` example |

## Findings that change how the contract is authored

1. **Base path.** Prism drops the path component of `servers[].url`; the mock
   serves `/services`, not `/api/v1/services`. The contract keeps `/api/v1`;
   runners call the root URL. Recorded as CL-01.
2. **Static examples.** `traceId` and `instance` are literal documented values
   that repeat across requests. Scenarios assert `status`, `code`, media type and
   schema — never per-request values. Recorded as CL-02.
3. **`--errors` is mandatory.** Without it Prism answers a documented 2xx to an
   invalid request. Set in both mock scripts and the spike runner.
4. **Every operation needs explicit `security`** (`security: []` when public) and
   **at least one documented 4xx** — both are lint rules in the `recommended`
   ruleset.
5. **Forced error statuses must be documented per operation** with a `Problem`
   example whose `code` the scenario asserts; otherwise the status cannot be
   demonstrated.

## Corrections applied to the plan

- §8.2 — spike outcome added; classes A and D confirmed, E confirmed impossible,
  B and C deferred to Part 3 verification; authoring rules listed.
- §11 — R-API-01 marked resolved by the spike; R-API-07 added for the dev-tool
  advisories.

## Next step

Part 1 — requirements classification, resource model, URI conventions, method
semantics, and the operation table in `resource-model.md`.
