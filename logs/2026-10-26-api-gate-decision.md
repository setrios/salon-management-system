# API-GATE decision — Salon Management System

Date: 2026-10-26
Status: **SIGNED — GO, 2026-10-26.** All ten criteria are evidenced; the human
signed the decision in §6, so implementation may start in the next phase.
Owner of the decision: human.
Inputs: SRS v1.3 (approved 2026-09-27), API design plan
([`2026-10-26-api-design-plan.md`](2026-10-26-api-design-plan.md)), contract
package in [`../spec/api/`](../spec/api/).

---

## 1. What is being gated

A REST API **contract** and a **mock**, not an implementation. The scope forbids
writing a server in this iteration; implementation is the next phase (TDD). The gate asks
whether the contract is complete, consistent, validated, and demonstrable
through a spec-driven mock.

Delivered:

| Artifact | Extent |
|---|---|
| `openapi.yaml` | OpenAPI 3.0.3; 50 operations; 58 schemas; 15 reusable error responses |
| `resource-model.md` | 42/42 requirements classified; 50 operations defined |
| `error-model.md` | RFC 9457 `Problem` + 16-code catalog |
| `api-traceability.md` | 42 requirements → operations → scenarios |
| `scenarios/positive.md`, `negative.md` | 27 positive, 17 negative scenarios |
| `scenarios/run-*.sh` | 104 + 39 executable assertions |
| `validation-report.txt` | Redocly lint |

---

## 2. The ten criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Every substantial operation has a justified REQ-ID | **PASS** | `resource-model.md` §1 classifies all 42 requirements; §5 maps every operation to REQ IDs; `api-traceability.md` §1–2 shows no orphan operation and no unmapped requirement (2 explicitly n/a with reasons) |
| 2 | Resources and terms match the domain and glossary | **PASS** | `resource-model.md` §2 (resource/relationship table) and §6 (terminology review: Appointment, Master, Service, Material, Category, MasterService all match the glossary; rejected synonyms listed) |
| 3 | URIs and HTTP methods are used consistently | **PASS** | `resource-model.md` §3–4: plural nouns, `/admin` and `/me` namespaces, action sub-resources only, no `DELETE` (0 `delete:` operations in the spec), consistent `GET/POST/PUT/PATCH` semantics; Redocly `path-params-defined` and `no-ambiguous-paths` clean |
| 4 | Request and response schemas are defined | **PASS** | 58 schemas in `openapi.yaml#/components/schemas`, every one referenced (Redocly `no-unused-components` clean); all operations declare a response schema |
| 5 | Required status codes and one error model | **PASS** | `error-model.md` §2–3; all 15 error responses use `application/problem+json` and `$ref: Problem`; 16 stable codes; no ad-hoc error shape anywhere |
| 6 | Positive and negative scenarios are foreseen | **PASS** | `scenarios/positive.md` (27, covering SCN-01…SCN-15) and `scenarios/negative.md` (17, one per catalogued failure class) |
| 7 | No internal implementation details exposed | **PASS** | `MasterPublic` exposes only `id` and `fullName` (D19); `AppointmentAdmin` excludes `accessToken` and `confirmationUrl` (D18); password appears only in `MasterCreate`/`LoginRequest` (write-only); no hash/secret/internal flag in any schema (grep: 0) |
| 8 | OpenAPI passes automated validation | **PASS** | `validation-report.txt`: Redocly recommended ruleset, exit 0, **0 errors, 0 warnings**; `npm run bundle` resolves all `$ref`s |
| 9 | Mock API starts from the approved specification | **PASS** | `npm run mock` serves all 50 routes from `openapi.yaml` on `127.0.0.1:4010`; Prism startup log lists every path |
| 10 | Main positive and negative scenarios reproduce through the mock | **PASS** | `scenarios/results/positive-results.txt`: **104 passed, 0 failed**; `negative-results.txt`: **39 passed, 0 failed** |

No criterion failed, so no REVISE cycle was required.

---

## 3. Fidelity statement — what the mock actually proves

The mock is Prism in static mode: stateless, spec-driven. The gate distinguishes
three levels and does not blur them.

| Class | Meaning | Status |
|---|---|---|
| A. Schema validation | Prism rejects an invalid body/query with our documented `Problem` | **Confirmed** (401/400/415/422 observed) |
| B. Auth presence | A protected operation without a bearer token returns 401 | **Confirmed** — Prism enforces the security scheme |
| C. Unknown resource | 404 for an unknown id or token | **Forced** — no storage; demonstrated with `Prefer: code=404` |
| D. Business/state conflict | 409/422 for slot, duplicate, transition, stock, period | **Partly forced** — valid responses proven; server logic deferred |
| E. State transition | cancel → `cancelled`, payment only after `completed` | **Not reproducible** — deferred to the next phase, stated plainly |

**Verified through the mock:** every documented 2xx example, security rejection,
schema validation, media-type rejection, and the shape of every catalogued error
response (status, `application/problem+json`, `code`, `Problem` schema).

**Not verified through the mock, deferred to the next phase:** that the server computes
availability, enforces ownership, stores state, mutates stock, prevents duplicate
payments, and honours the 30-minute boundary. Forced responses prove the
*contract* is well-formed, not that the *server* behaves.

Known mock limitations, each recorded rather than hidden:

1. Unparsable JSON **hangs** Prism (curl exit 28) — CL-03.
2. `DELETE` returns 405 with **Prism's own** error body — CL-04.
3. Cross-field rules (period XOR, boundary, overstock) are not expressible in
   OpenAPI 3.0 — CL-05.
4. Static examples repeat `traceId`/`instance` and cannot echo request data —
   CL-02.
5. Prism drops the `/api/v1` server prefix — CL-01.

---

## 4. Defects found and fixed during execution

The gate was not a rubber stamp; three real defects surfaced and were corrected
before this record was written.

| # | Defect | Fix |
|---|---|---|
| 1 | `VALIDATION_ERROR` was catalogued at 400, but Prism answers 422 for body-schema violations, so the mock could never return the documented code | Moved to 422 in `error-model.md` and plan §7, with the evidence recorded |
| 2 | D22 (unknown body properties rejected) was unenforced — no schema said `additionalProperties: false` | Added to 19 input schemas; NEG-02 now genuinely exercises it |
| 3 | Two documented examples contradicted the scenarios that used them (`updateService` returned `active:true`; `getMyAvailability` returned 2 weekly rules while the PUT example had 1) | Examples aligned; both assertions then passed |

Additionally, plan §5/§8 said the mock would serve `/api/v1`; the spike proved
otherwise. The criterion text was corrected rather than left aspirational.

---

## 5. Residual risks

| Risk | Disposition |
|---|---|
| Contract may drift from SRS during next-phase implementation | `api-traceability.md` is the check; any change needs a clarification row |
| Two codes share status 409 on `createPayment` | Only `APPOINTMENT_NOT_COMPLETED` is demonstrated; `PAYMENT_ALREADY_RECORDED` is next-phase evidence |
| Mock cannot prove server logic | Explicitly out of scope for this gate; the fidelity table above is the honest boundary |
| Prism dependency warnings (R-API-07) | Transitive only; no `audit fix --force` |

---

## 6. Decision

Agent recommendation: **GO** — all ten criteria are evidenced, validation is
clean, and both scenario suites pass.

The human decides and signs:

| Field | Value |
|---|---|
| Decision | GO |
| Name | setrios |
| Date | 2026-10-26 |
| Notes | Contract and mock reviewed; all ten criteria evidenced. |

If **REVISE**: list the failing criterion, fix it, re-run `npm run lint` and both
runners, and repeat this gate (plan step 4.4). Do not delete failing evidence.

---

## 7. After a GO

1. Commit in the sequence of plan §12 (human executes; the agent cannot commit).
2. Create issues SMS-38…SMS-43 (decision D5) — only after the gate is signed.
3. Implementation starts from `openapi.yaml`; the contract is the test oracle.
