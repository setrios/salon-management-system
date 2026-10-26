# Unified API error model — Salon Management System

Status: **COMPLETE** — Part 2, step 2.2 of the approved plan
([`../../logs/2026-10-26-api-design-plan.md`](../../logs/2026-10-26-api-design-plan.md)).
The schema below is normative and is copied verbatim into
`openapi.yaml#/components/schemas/Problem`.

Every error response in this API — without exception — uses
`application/problem+json` and `$ref`s the single `Problem` schema. No operation
defines its own error shape. This is API-GATE criterion 5.

---

## 1. Why one model

Three reasons the contract fixes one shape:

1. **Client simplicity.** A client needs one parser, one retry policy, one way to
   surface field errors. Per-endpoint error shapes multiply integration bugs.
2. **Traceability.** A stable `code` enum lets scenarios and tests assert an exact
   failure reason rather than a status number that several causes can share.
3. **Gate evidence.** "Every error response references `Problem`" is mechanically
   checkable in the OpenAPI file; ad-hoc shapes are not.

The model is RFC 9457 (Problem Details for HTTP APIs) plus three project fields:
`code`, `errors[]`, `traceId`. RFC 9457 supplies `type`, `title`, `status`,
`detail`, `instance`; the additions make failures machine-actionable and
correlatable.

---

## 2. The `Problem` schema

### 2.1 Fields

| Field | Type | Required | Constraints | Meaning |
|---|---|---|---|---|
| `type` | string, `format: uri` | yes | stable per `code` | Problem-type URI; identifies the error class |
| `title` | string | yes | short, English | Human-readable summary of the error class |
| `status` | integer | yes | same as the HTTP status | Status repeated in the body so logs are self-describing |
| `detail` | string | no | English | Explanation of this specific occurrence |
| `instance` | string | no | request path | Path that produced the error |
| `code` | string (enum) | yes | one of §3 | Stable machine-readable error code |
| `traceId` | string, `format: uuid` | no | — | Correlation id for server-log lookup |
| `errors[]` | array of `ValidationErrorItem` | no | present for validation failures | Field-level failures |

### 2.2 `ValidationErrorItem`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `field` | string | yes | Dot path to the offending field, e.g. `client.phone`, `serviceIds[2]`, `date` |
| `code` | string (enum) | yes | `REQUIRED`, `PATTERN_MISMATCH`, `FORMAT_INVALID`, `ENUM_MISMATCH`, `OUT_OF_RANGE`, `UNKNOWN_FIELD` |
| `message` | string | yes | English explanation for a human |

### 2.3 OpenAPI 3.0.3 fragment (normative)

```yaml
Problem:
  type: object
  description: >
    RFC 9457 Problem Details plus a stable machine-readable code and optional
    field-level errors. Every error response in this API uses this schema.
  required: [type, title, status, code]
  properties:
    type:
      type: string
      format: uri
      description: Stable problem-type URI, one per code.
      example: https://api.salon.example/problems/slot-unavailable
    title:
      type: string
      description: Short human-readable summary of the error class.
      example: Slot unavailable
    status:
      type: integer
      description: HTTP status code, repeated in the body.
      example: 409
    detail:
      type: string
      description: Human-readable explanation of this occurrence.
      example: The requested slot is already booked for this master.
    instance:
      type: string
      description: Request path that produced the error.
      example: /api/v1/appointments
    code:
      type: string
      description: Stable machine-readable error code (closed enum).
      enum:
        - MALFORMED_REQUEST
        - VALIDATION_ERROR
        - UNAUTHENTICATED
        - FORBIDDEN
        - NOT_FOUND
        - METHOD_NOT_ALLOWED
        - SLOT_UNAVAILABLE
        - DUPLICATE_RESOURCE
        - INVALID_STATE_TRANSITION
        - PAYMENT_ALREADY_RECORDED
        - APPOINTMENT_NOT_COMPLETED
        - MATERIAL_STOCK_INSUFFICIENT
        - INVALID_PERIOD
        - BUSINESS_RULE_VIOLATION
        - UNSUPPORTED_MEDIA_TYPE
        - INTERNAL_ERROR
      example: SLOT_UNAVAILABLE
    traceId:
      type: string
      format: uuid
      description: Correlation id for server-log lookup.
      example: 6f1c2a8e-5b7d-4c2a-9e0f-2d3b4a5c6d7e
    errors:
      type: array
      description: Field-level validation failures; present for validation errors only.
      items:
        $ref: '#/components/schemas/ValidationErrorItem'
```

### 2.4 Media type and headers

| Aspect | Value |
|---|---|
| Media type | `application/problem+json` |
| Declared for | every `4XX` and `5XX` response |
| `Content-Type` | `application/problem+json` |
| `Retry-After` | not used; no endpoint is rate-limited in this design |

`Problem.type` uses the pattern
`https://api.salon.example/problems/{kebab-case(code)}`. The host is a placeholder
and is not provisioned; the URI is an identifier, not a fetchable document.

| `code` | `type` |
|---|---|
| `MALFORMED_REQUEST` | `.../malformed-request` |
| `VALIDATION_ERROR` | `.../validation-error` |
| `UNAUTHENTICATED` | `.../unauthenticated` |
| `FORBIDDEN` | `.../forbidden` |
| `NOT_FOUND` | `.../not-found` |
| `METHOD_NOT_ALLOWED` | `.../method-not-allowed` |
| `SLOT_UNAVAILABLE` | `.../slot-unavailable` |
| `DUPLICATE_RESOURCE` | `.../duplicate-resource` |
| `INVALID_STATE_TRANSITION` | `.../invalid-state-transition` |
| `PAYMENT_ALREADY_RECORDED` | `.../payment-already-recorded` |
| `APPOINTMENT_NOT_COMPLETED` | `.../appointment-not-completed` |
| `MATERIAL_STOCK_INSUFFICIENT` | `.../material-stock-insufficient` |
| `INVALID_PERIOD` | `.../invalid-period` |
| `BUSINESS_RULE_VIOLATION` | `.../business-rule-violation` |
| `UNSUPPORTED_MEDIA_TYPE` | `.../unsupported-media-type` |
| `INTERNAL_ERROR` | `.../internal-error` |

---

## 3. Error code catalog

The catalog is **closed**: an operation may return only these codes. Adding a code
requires updating this file, `openapi.yaml`, and the traceability matrix in the
same change.

| HTTP | `code` | `title` | When it is returned | Operations |
|---|---|---|---|---|
| 400 | `MALFORMED_REQUEST` | Malformed request | Body is not parsable JSON, a value has the wrong JSON type, a required or ill-typed query parameter | all operations that accept a body or query parameters |
| 422 | `VALIDATION_ERROR` | Validation failed | Request body violates the schema: missing required field, pattern/format/enum mismatch, unknown property (D22) | every operation with a request body |
| 401 | `UNAUTHENTICATED` | Not authenticated | Missing, expired, or invalid bearer token; invalid login credentials | A1 and every `JWT`/`JWT-M`/`JWT-A` operation |
| 403 | `FORBIDDEN` | Forbidden | Authenticated but wrong role; master reaching another master's data; client token used against another appointment | all authenticated operations |
| 404 | `NOT_FOUND` | Not found | Unknown resource id; unknown appointment token. Token lookups never reveal whether the token ever existed | P2, P5, P6, P7, P9, P10, P11, R3, R4, R7, R8, R12, R15, R16, R20, R21, R22, R23, R24, R25, R26, R27 |
| 405 | `METHOD_NOT_ALLOWED` | Method not allowed | Method not defined for the path | cross-cutting (any defined path with an undefined method) |
| 409 | `SLOT_UNAVAILABLE` | Slot unavailable | Requested slot is outside availability, already booked, or overlaps an existing appointment | P8, P11, R19, R21 |
| 409 | `DUPLICATE_RESOURCE` | Duplicate resource | Unique constraint conflict: duplicate master username, duplicate master-service link, duplicate material name | R2, R4, R6, R8, R11, R12, R14, R16 |
| 409 | `INVALID_STATE_TRANSITION` | Invalid state transition | Edit of a completed or cancelled appointment; completion of a cancelled appointment; cancellation of a completed appointment | P10, P11, R21, R22, R23 |
| 409 | `PAYMENT_ALREADY_RECORDED` | Payment already recorded | A second payment for the same appointment (D12: at most one, immutable) | R27 |
| 409 | `APPOINTMENT_NOT_COMPLETED` | Appointment not completed | Payment attempted before the appointment reached `completed` | R27 |
| 409 | `MATERIAL_STOCK_INSUFFICIENT` | Insufficient stock | Issue quantity exceeds the current stock level (D13) | R26 |
| 422 | `INVALID_PERIOD` | Invalid period | Both `period` and `from`/`to` supplied, or neither; `from` later than `to`; unrecognised `period` value | R28, R29 |
| 422 | `BUSINESS_RULE_VIOLATION` | Business rule violated | Semantically valid request that breaks a rule without a more specific code (e.g. duration rounding conflict, availability overlap) | P7, P8, P11, M4, M6, R19, R21, R26, R27 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Unsupported media type | Body is not `application/json` | every operation with a request body |
| 500 | `INTERNAL_ERROR` | Internal error | Unexpected server failure | all operations |

**Count:** 16 codes — 1 × 400, 1 × 401, 1 × 403, 1 × 404, 1 × 405, 6 × 409,
3 × 422, 1 × 415, 1 × 500.

`VALIDATION_ERROR` sits at 422, not 400, because Prism returns 422 for
request-body schema violations (Phase 0 spike, Q4). Keeping validation at 400
would make the mock's status differ from the catalog, so the catalog follows the
demonstrated behaviour. Syntax failures remain 400.

### 3.1 State-transition rules (REQ-F-006, F-027, D15)

Cancellation and completion are **idempotent in effect**, so the same request can
produce either 200 or 409 depending on the current status:

| Current status | `POST .../cancel` | `POST .../complete` | `PATCH ...` (edit) |
|---|---|---|---|
| `confirmed` | 200 → `cancelled` | 200 → `completed` | 200, recalculated |
| `completed` | 409 `INVALID_STATE_TRANSITION` | 200, unchanged | 409 `INVALID_STATE_TRANSITION` |
| `cancelled` | 200, unchanged | 409 `INVALID_STATE_TRANSITION` | 409 `INVALID_STATE_TRANSITION` |

This table is the authority for negative scenarios SCN-07 and the state rules in
D15. `PAYMENT_ALREADY_RECORDED` and `APPOINTMENT_NOT_COMPLETED` are evaluated
before this table when a payment is created.

---

## 4. Status-code policy

| Status | Used when | Never used for |
|---|---|---|
| 400 | Request cannot be parsed or typed | Semantic conflicts (use 409/422) |
| 401 | No valid credentials | Role problems (use 403) |
| 403 | Authenticated, insufficient role or ownership | Missing credentials (use 401) |
| 404 | Resource id or token unknown | Deactivated-but-existing resources (they are returned with `active:false`) |
| 405 | Path exists, method does not | Unknown path (use 404) |
| 409 | The request conflicts with current resource state | Field format problems (use 400/422) |
| 415 | Media type not supported | Missing body (use 400) |
| 422 | Request is well-formed but semantically invalid | Parsing or typing errors (use 400) |
| 500 | Unhandled server failure | Any client-caused condition |

---

## 5. Examples

### 5.1 404 — unknown appointment token (REQ-NF-001)

```json
{
  "type": "https://api.salon.example/problems/not-found",
  "title": "Not found",
  "status": 404,
  "detail": "No appointment exists for the supplied access token.",
  "instance": "/api/v1/appointments/9b2f7c1e-4a3d-4f6b-8e21-7c5a9d0b3f14",
  "code": "NOT_FOUND",
  "traceId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
}
```

### 5.2 409 — slot unavailable (REQ-F-002)

```json
{
  "type": "https://api.salon.example/problems/slot-unavailable",
  "title": "Slot unavailable",
  "status": 409,
  "detail": "The requested slot is already booked for this master.",
  "instance": "/api/v1/appointments",
  "code": "SLOT_UNAVAILABLE",
  "traceId": "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e"
}
```

### 5.3 422 — validation failure with field errors

```json
{
  "type": "https://api.salon.example/problems/validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "The request body contains invalid fields.",
  "instance": "/api/v1/appointments",
  "code": "VALIDATION_ERROR",
  "traceId": "3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e7f",
  "errors": [
    { "field": "client.phone", "code": "PATTERN_MISMATCH", "message": "Phone must be in E.164-like format." },
    { "field": "startAt", "code": "FORMAT_INVALID", "message": "Start time must be an RFC 3339 timestamp with offset." }
  ]
}
```

### 5.4 422 — invalid report period (REQ-F-022)

```json
{
  "type": "https://api.salon.example/problems/invalid-period",
  "title": "Invalid period",
  "status": 422,
  "detail": "Supply either period or both from and to, not both forms.",
  "instance": "/api/v1/admin/reports/revenue",
  "code": "INVALID_PERIOD",
  "traceId": "4d5e6f7a-8b9c-4d0e-1f2a-3b4c5d6e7f80"
}
```

### 5.5 409 — payment before completion (REQ-F-021)

```json
{
  "type": "https://api.salon.example/problems/appointment-not-completed",
  "title": "Appointment not completed",
  "status": 409,
  "detail": "A payment can be recorded only for a completed appointment.",
  "instance": "/api/v1/admin/appointments/7c1e4a3d-4f6b-4e21-8c5a-9d0b3f141a2b/payments",
  "code": "APPOINTMENT_NOT_COMPLETED",
  "traceId": "5e6f7a8b-9c0d-4e1f-2a3b-4c5d6e7f8091"
}
```

### 5.6 409 — material stock insufficient (REQ-F-020, D13)

```json
{
  "type": "https://api.salon.example/problems/material-stock-insufficient",
  "title": "Insufficient stock",
  "status": 409,
  "detail": "Requested issue quantity 250 ml exceeds the current stock of 180 ml.",
  "instance": "/api/v1/admin/materials/2f7c1e4a-3d4f-4b6b-8e21-7c5a9d0b3f14/transactions",
  "code": "MATERIAL_STOCK_INSUFFICIENT",
  "traceId": "6f7a8b9c-0d1e-4f2a-3b4c-5d6e7f8091a2"
}
```

---

## 6. Authoring rules (apply when writing `openapi.yaml`)

1. Every operation declares at least one `4XX` response.
2. Every `4XX`/`5XX` response uses `application/problem+json` and `$ref`s
   `Problem`; no inline error schemas.
3. Every documented error status carries an `example` whose `code` matches the
   status in §3 — the mock returns that literal example (spike finding), so the
   example *is* the test fixture.
4. `code` values are the closed enum in §2.3; no free-form strings.
5. `title` and `detail` are English (REQ-NF-003).
6. `errors[]` appears only on validation failures, never on 404/409 business
   conflicts.
7. `traceId` is documented but never asserted by scenarios: in the static mock it
   is a constant (CL-02).

---

## 7. Mock fidelity note (evidence for API-GATE criterion 10)

Verified in the Phase 0 spike (`spike/FINDINGS.md`):

| Behaviour | Result |
|---|---|
| `Prefer: code=409` forces a documented 409 | Works — returned `code=SLOT_UNAVAILABLE` |
| Schema-invalid body | Returns **422 with this document's example**, not Prism's own format |
| Static `traceId` | Repeated across identical requests; not per-request |

Consequence: business-rule and validation negatives are demonstrable through the
mock, provided each error status is documented on the operation with a `Problem`
example. State-transition negatives (class E) remain non-reproducible in a
stateless mock and are deferred to the next phase — stated plainly, never claimed as
verified.
