# Negative scenarios — mock API

Status: **COMPLETE** — Part 3, step 3.3. Executed by `run-negative.sh`.

Each scenario provokes one documented failure and asserts three things: the HTTP
status, the `application/problem+json` media type, and the `code` in the body.
This is what makes the error model testable rather than decorative.

How the mock is made to produce a failure:

- **direct** — Prism validates the request itself (schema, query type, media
  type, security presence).
- **forced** — the request is valid, so the documented status is selected with
  `Prefer: code=NNN`. This proves the response is defined and well-formed; it
  does not prove server logic, which is Lab 5.
- **gap** — the mock cannot reproduce the case faithfully; the row records why.

| ID | Covers | Request | Expected | How | Note |
|---|---|---|---|---|---|
| NEG-01 | F-001, D22 | `POST /appointments` missing `masterId`, `serviceIds`, `startAt` | 422 `VALIDATION_ERROR`, `errors[]` non-empty | direct | Prism returns our documented `Problem` |
| NEG-02 | D22 | `POST /appointments` with an unknown property `surprise` | 422 `VALIDATION_ERROR` | direct | `additionalProperties: false` enforces D22 |
| NEG-03 | — | `GET /services?page=abc` | 400 `MALFORMED_REQUEST` | direct | Query type violation |
| NEG-04 | NF-006 | `GET /admin/masters` with no `Authorization` header | 401 `UNAUTHENTICATED` | direct | Prism enforces the security scheme |
| NEG-05 | F-017, NF-006 | `GET /admin/masters` with a master token and `Prefer: code=403` | 403 `FORBIDDEN` | forced | Prism cannot verify roles |
| NEG-06 | F-018 | `GET /services/{id}` with `Prefer: code=404` | 404 `NOT_FOUND` | forced | The mock holds no catalogue |
| NEG-07 | NF-001 | `GET /appointments/{token}` with `Prefer: code=404` | 404 `NOT_FOUND` | forced | Unknown token never reveals existence |
| NEG-08 | F-002 | valid `POST /appointments` + `Prefer: code=409` | 409 `SLOT_UNAVAILABLE` | forced | No calendar in the mock |
| NEG-09 | F-018 | `POST /admin/masters` + `Prefer: code=409` | 409 `DUPLICATE_RESOURCE` | forced | No uniqueness constraint in the mock |
| NEG-10 | F-027, D15 | `PATCH /admin/appointments/{id}` + `Prefer: code=409` | 409 `INVALID_STATE_TRANSITION` | forced | Status is not stored |
| NEG-11 | F-021 | `POST /admin/appointments/{id}/payments` + `Prefer: code=409` | 409 `APPOINTMENT_NOT_COMPLETED` | forced | Completion state is not stored |
| NEG-12 | F-020, D13 | `POST /admin/materials/{id}/transactions` + `Prefer: code=409` | 409 `MATERIAL_STOCK_INSUFFICIENT` | forced | Stock is not stored |
| NEG-13 | F-022 | `GET /admin/reports/revenue?period=month&from=2026-10-01&to=2026-10-31` + `Prefer: code=422` | 422 `INVALID_PERIOD` | forced | Cross-field XOR is not expressible in OpenAPI 3.0 |
| NEG-14 | NF-008 | `GET /masters/{id}/availability?…` + `Prefer: code=422` | 422 `BUSINESS_RULE_VIOLATION` | forced | Boundary rule is server logic |
| NEG-15 | — | `POST /appointments` with `Content-Type: text/plain` | 415 `UNSUPPORTED_MEDIA_TYPE` | direct | |
| NEG-16 | NF-005 | `DELETE /admin/services/{id}` | 405 `METHOD_NOT_ALLOWED` | gap | Status is 405 but the body is Prism's own error object, not `Problem` |
| NEG-17 | NF-005 | `PATCH /admin/services/{id}` + `Prefer: code=405` | 405 `METHOD_NOT_ALLOWED` with `Problem` body | forced | Demonstates the documented shape the mock cannot produce for `DELETE` |

## Cases the mock cannot demonstrate

| Case | Why | Disposition |
|---|---|---|
| Unparsable JSON body | Prism hangs on a syntactically invalid JSON body (observed: curl exit 28) | 400 `MALFORMED_REQUEST` is still demonstrated through NEG-03; body-parse 400 is verified in Lab 5 |
| Data-dependent 404 | No storage | NEG-06, NEG-07 use `Prefer`; real lookup in Lab 5 |
| State-dependent 409 | No status machine | NEG-08…NEG-12 use `Prefer`; real transitions in Lab 5 |
| Role-based 403 | Prism checks presence of a token, not its claims | NEG-05 uses `Prefer`; real authorisation in Lab 5 |
| 500 | Not intentionally triggerable | Documented only; tested in Lab 5 |

`PAYMENT_ALREADY_RECORDED` (D12) shares status 409 with
`APPOINTMENT_NOT_COMPLETED` on `createPayment`. OpenAPI allows one example per
status, so the operation documents `APPOINTMENT_NOT_COMPLETED`; the duplicate
payment code stays in the catalog and is verified in Lab 5.
