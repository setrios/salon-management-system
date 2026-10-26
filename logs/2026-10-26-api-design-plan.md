# API design plan — Salon Management System

Date: 2026-10-26
Status: **APPROVED** — decisions confirmed by the human on 2026-10-26 (§10);
execution may start.
Execution status: Parts 0–3 complete on 2026-10-26; API-GATE record drafted in
[`2026-10-26-api-gate-decision.md`](2026-10-26-api-gate-decision.md) and awaiting
the human's signature.
Owner: human (approval and gate decision), coding agent (draft and execution support).
Inputs: SRS v1.3 (approved 2026-09-27), BDD scenarios SCN-01..SCN-15, domain
glossary, traceability matrix, ticket decomposition SMS-1..SMS-37, SDD plan,
risk register.
Goal: design the REST API contract, produce the OpenAPI specification, run a
mock API, cover positive and negative scenarios, and pass the API-GATE — with
no server implementation (that is the next phase).

---

## 1. Repository analysis (as of 2026-10-26)

| Artifact | State | Consequence for this phase |
|---|---|---|
| `spec/salon-management-system-srs-v1.3.tex` | Approved; 42 requirements (33 REQ-F + 9 REQ-NF); glossary; BDD SCN-01..15; traceability matrix with Ticket column filled | Single source of truth for API scope; no requirement changes expected |
| `spec/DESCRIPTION.md` | Concept note, synchronized with the two SRS-superseded decisions; constraints | Confirms scope exclusions (no accounts, no gateway, no payroll, no no-show tracking) |
| `docs/ticket-list.md`, `docs/issue-import.csv` | 37 tickets SMS-1..SMS-37; issue #N = SMS-N; labels and workflow in place | API design work is not yet ticketed; decision needed in §10 |
| `logs/2026-10-21-sdd-plan.md` | Approved at PLAN-GATE (GO, 2026-10-22); stages S1-S6; test-first order | API design precedes implementation; contract must be stable before S1 features |
| `logs/2026-10-21-risk-register.md` | Approved; 10 risks (R-01..R-10), 6 AI-specific angles | API-specific risks to add: mock/error-model fidelity, tooling availability |
| `docs/commit-convention.md` | Prefixes `spec:`, `test:`, `feat:`, `docs:`, `gate:` | API spec artifacts → `spec:`; scenarios → `test:`; gate record → `gate:` |
| Git / tooling | Clean `main`; agent cannot commit; node 26.8.1, npm 11.19, python 3.14, docker 29.8; `gh` authenticated; network reachable; no redocly/prism installed; no `pdflatex` | Tooling must be installed in an isolated `spec/api/` package; SRS cannot be recompiled here |

**Gaps found:** no API artifacts exist (`spec/api/` absent), no OpenAPI file, no
mock tooling, no API traceability table. Everything is created from scratch.

---

## 2. Scope and non-goals

**In scope:** REST resource model; URI and HTTP method design; request/response
schemas; single error model; OpenAPI 3.0.3 specification; automated validation;
mock API; positive and negative scenarios; API-GATE; API traceability; commit
plan.

**Out of scope:** server implementation (the next phase), database schema, UI, real auth
provider, real SMS gateway, payment gateway.

---

## 3. Proposed artifact layout

```
spec/api/
  README.md                     # how to validate, mock, run scenarios
  resource-model.md             # resources, URI conventions, operation table, method semantics
  error-model.md                # Problem Details schema, error code catalog, HTTP mapping
  openapi.yaml                  # OpenAPI 3.0.3 specification (single file)
  api-traceability.md           # REQ-ID <-> operationId <-> scenario matrix
  validation-report.txt         # Redocly lint output (saved as evidence)
  package.json                  # pinned tooling + scripts
  .gitignore                    # node_modules, results
  scenarios/
    positive.md                 # positive scenario table
    negative.md                 # negative scenario table
    run-positive.sh             # executable curl + jq assertions
    run-negative.sh             # executable curl + jq assertions
    results/                    # captured outputs (selected results committed)
logs/
  2026-10-26-api-design-plan.md   # this plan
  2026-10-26-api-gate-decision.md # gate record (created in Part 4)
```

Rationale: `spec/` is the commit-convention home for specifications; tooling
stays isolated so the rest of the repository remains dependency-free.

---

## 4. API conventions (proposed, to be confirmed)

| Topic | Convention |
|---|---|
| Base path | `/api/v1` |
| Media type | `application/json`; errors `application/problem+json` |
| Resource IDs | UUID v4 strings; appointment access token is a separate UUID |
| Timestamps | RFC 3339 with offset, e.g. `2026-10-01T14:00:00+03:00`; salon time zone `Europe/Kyiv` |
| Money | Integer minor units (kopiykas) in a `Money` object `{amountMinor, currency}`; currency `UAH` |
| Pagination | `page` (1-based), `pageSize` (default 20, max 100); response `{items, page, pageSize, total}` |
| Auth | Bearer JWT for Master and Administrator; public endpoints `security: []`; client access via `{token}` path parameter |
| Reference-data deactivation | `PATCH` with `active: false`; no `DELETE` (retention REQ-NF-005) |
| State transitions | Action sub-resources (`/cancel`, `/complete`) rather than a status field in `PATCH` |
| Errors | RFC 9457 Problem Details + `code`, `errors[]`, `traceId` |
| Naming | camelCase JSON properties; plural nouns in URIs; `operationId` in camelCase |

---

## 5. Resource model (draft)

Auth legend: `—` public, `JWT-M` master, `JWT-A` administrator, `TOKEN` client
appointment token. Error column lists expected 4xx/5xx; 401/403/500 apply to all
JWT operations and are not repeated in every row.

### 5.1 Public catalog and client booking

| # | Method | URI | operationId | Auth | Request | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| P1 | GET | `/services` | listServices | — | query: `category`, `q`, `page`, `pageSize` | 200 `ServicePage` | 400 | F-001, F-018, F-024 |
| P2 | GET | `/services/{serviceId}` | getService | — | path | 200 `Service` | 404 | F-001 |
| P3 | GET | `/categories` | listCategories | — | — | 200 `CategoryList` | — | F-024 |
| P4 | GET | `/masters` | listMasters | — | query: `active`, `page`, `pageSize` | 200 `MasterPage` | 400 | F-002 |
| P5 | GET | `/masters/{masterId}` | getMaster | — | path | 200 `MasterPublic` | 404 | F-002 |
| P6 | GET | `/masters/{masterId}/services` | listMasterServices | — | query: `active`, `page`, `pageSize` | 200 `MasterServicePage` | 404 | F-001, F-014 |
| P7 | GET | `/masters/{masterId}/availability` | getMasterAvailability | — | query: `date` (required), `serviceIds` (required, CSV) | 200 `AvailabilityResponse` | 400, 404, 422 | F-002, F-015, F-031, NF-008 |
| P8 | POST | `/appointments` | createAppointment | — | `AppointmentCreate` | 201 `Appointment` + `Location` | 400, 409, 422 | F-001, F-002, F-003, F-004, F-005, F-031 |
| P9 | GET | `/appointments/{token}` | getAppointmentByToken | TOKEN | path | 200 `Appointment` | 404 | F-004, NF-001 |
| P10 | POST | `/appointments/{token}/cancel` | cancelAppointmentByToken | TOKEN | — | 200 `Appointment` | 404, 409 | F-006 |
| P11 | POST | `/appointments/{token}/reschedule` | rescheduleAppointmentByToken | TOKEN | `AppointmentReschedule` | 200 `Appointment` | 400, 404, 409, 422 | F-007, F-008, F-009, F-029 |

### 5.2 Authentication

| # | Method | URI | operationId | Auth | Request | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| A1 | POST | `/auth/login` | login | — | `LoginRequest` | 200 `LoginResponse` | 400, 401 | F-012, F-017 |
| A2 | GET | `/auth/me` | getCurrentPrincipal | JWT | — | 200 `Principal` | — | F-012 |

### 5.3 Master self-service

| # | Method | URI | operationId | Auth | Request | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| M1 | GET | `/me/appointments` | listMyAppointments | JWT-M | query: `from`, `to`, `status`, `page`, `pageSize` | 200 `AppointmentPage` | 400 | F-013 |
| M2 | GET | `/me/services` | listMyServices | JWT-M | — | 200 `MasterServiceList` | — | F-014 |
| M3 | GET | `/me/availability` | getMyAvailability | JWT-M | — | 200 `Availability` | — | F-015 |
| M4 | PUT | `/me/availability` | replaceMyAvailability | JWT-M | `Availability` | 200 `Availability` | 400, 422 | F-015 |
| M5 | GET | `/me/notification-preferences` | getMyNotificationPreferences | JWT | — | 200 `NotificationPreferenceList` | — | F-016, F-026 |
| M6 | PATCH | `/me/notification-preferences` | updateMyNotificationPreference | JWT | `NotificationPreferencePatch` | 200 `NotificationPreference` | 400, 422 | F-016, F-026 |
| M7 | GET | `/me/notifications` | listMyNotifications | JWT | query: `status`, `eventType`, `from`, `to`, `page`, `pageSize` | 200 `NotificationPage` | 400 | F-016 |

### 5.4 Administrator reference data

| # | Method | URI | operationId | Auth | Request | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| R1 | GET | `/admin/masters` | listMastersAdmin | JWT-A | query: `active`, `page`, `pageSize` | 200 `MasterPage` | 400 | F-018 |
| R2 | POST | `/admin/masters` | createMaster | JWT-A | `MasterCreate` | 201 `Master` | 400, 409, 422 | F-012, F-018 |
| R3 | GET | `/admin/masters/{masterId}` | getMasterAdmin | JWT-A | path | 200 `Master` | 404 | F-018 |
| R4 | PATCH | `/admin/masters/{masterId}` | updateMaster | JWT-A | `MasterPatch` | 200 `Master` | 400, 404, 409, 422 | F-018 |
| R5 | GET | `/admin/services` | listServicesAdmin | JWT-A | query: `active`, `category`, `page`, `pageSize` | 200 `ServicePage` | 400 | F-018, F-024 |
| R6 | POST | `/admin/services` | createService | JWT-A | `ServiceCreate` | 201 `Service` | 400, 409, 422 | F-018, F-024 |
| R7 | GET | `/admin/services/{serviceId}` | getServiceAdmin | JWT-A | path | 200 `Service` | 404 | F-018 |
| R8 | PATCH | `/admin/services/{serviceId}` | updateService | JWT-A | `ServicePatch` | 200 `Service` | 400, 404, 409, 422 | F-018, F-024 |
| R9 | GET | `/admin/categories` | listCategoriesAdmin | JWT-A | — | 200 `CategoryList` | — | F-024 |
| R10 | GET | `/admin/master-services` | listMasterServicesAdmin | JWT-A | query: `masterId`, `serviceId`, `active`, `page`, `pageSize` | 200 `MasterServicePage` | 400 | F-018 |
| R11 | POST | `/admin/master-services` | createMasterService | JWT-A | `MasterServiceCreate` | 201 `MasterService` | 400, 409, 422 | F-018 |
| R12 | PATCH | `/admin/master-services/{masterServiceId}` | updateMasterService | JWT-A | `MasterServicePatch` | 200 `MasterService` | 400, 404, 409, 422 | F-018 |
| R13 | GET | `/admin/materials` | listMaterialsAdmin | JWT-A | query: `active`, `q`, `page`, `pageSize` | 200 `MaterialPage` | 400 | F-018 |
| R14 | POST | `/admin/materials` | createMaterial | JWT-A | `MaterialCreate` | 201 `Material` | 400, 409, 422 | F-018, F-025 |
| R15 | GET | `/admin/materials/{materialId}` | getMaterialAdmin | JWT-A | path | 200 `Material` | 404 | F-018 |
| R16 | PATCH | `/admin/materials/{materialId}` | updateMaterial | JWT-A | `MaterialPatch` | 200 `Material` | 400, 404, 409, 422 | F-018, F-025 |
| R17 | GET | `/admin/units` | listUnits | JWT-A | — | 200 `UnitList` | — | F-025 |

### 5.5 Administrator appointments, materials, payments, reports

| # | Method | URI | operationId | Auth | Request | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| R18 | GET | `/admin/appointments` | listAppointmentsAdmin | JWT-A | query: `from`, `to`, `masterId`, `status`, `page`, `pageSize` | 200 `AppointmentPage` | 400 | F-019 |
| R19 | POST | `/admin/appointments` | createAppointmentAdmin | JWT-A | `AppointmentCreate` | 201 `Appointment` | 400, 409, 422 | F-019, F-002, F-003 |
| R20 | GET | `/admin/appointments/{appointmentId}` | getAppointmentAdmin | JWT-A | path | 200 `AppointmentAdmin` | 404 | F-019, F-008, F-028 |
| R21 | PATCH | `/admin/appointments/{appointmentId}` | updateAppointmentAdmin | JWT-A | `AppointmentPatch` | 200 `AppointmentAdmin` | 400, 404, 409, 422 | F-019, F-028 |
| R22 | POST | `/admin/appointments/{appointmentId}/cancel` | cancelAppointmentAdmin | JWT-A | — | 200 `AppointmentAdmin` | 404, 409 | F-019, F-030 |
| R23 | POST | `/admin/appointments/{appointmentId}/complete` | completeAppointment | JWT-A | — | 200 `AppointmentAdmin` | 404, 409 | F-027 |
| R24 | GET | `/admin/appointments/{appointmentId}/notifications` | listAppointmentNotifications | JWT-A | query: `page`, `pageSize` | 200 `NotificationPage` | 400, 404 | F-005, F-009, F-010, F-011, F-023, F-029 |
| R25 | GET | `/admin/materials/{materialId}/transactions` | listMaterialTransactions | JWT-A | query: `type`, `from`, `to`, `page`, `pageSize` | 200 `MaterialTransactionPage` | 400, 404 | F-020 |
| R26 | POST | `/admin/materials/{materialId}/transactions` | createMaterialTransaction | JWT-A | `MaterialTransactionCreate` | 201 `MaterialTransaction` | 400, 404, 409, 422 | F-020 |
| R27 | POST | `/admin/appointments/{appointmentId}/payments` | createPayment | JWT-A | `PaymentCreate` | 201 `Payment` | 400, 404, 409, 422 | F-021, F-027 |
| R28 | GET | `/admin/reports/revenue` | getRevenueReport | JWT-A | query: `period` XOR (`from` and `to`) | 200 `RevenueReport` | 400, 422 | F-022 |
| R29 | GET | `/admin/reports/popular-services` | getPopularServicesReport | JWT-A | query: `period` XOR (`from` and `to`) | 200 `PopularServicesReport` | 400, 422 | F-032 |
| R30 | GET | `/admin/reports/stock-levels` | getStockLevelsReport | JWT-A | — (no period) | 200 `StockLevelsReport` | 400 | F-033 |

**Operation count:** 50 operations across the five tables (11 public, 2 auth,
7 master, 30 admin). **All 50 are retained** (decision D21).

If the scope must ever shrink, exactly **five** detail `GET`s are true
duplicates of their list operations: **P2, P5, R3, R7, R15**. Dropping those five
gives **45** operations without losing requirement coverage.

`R25 GET /admin/materials/{materialId}/transactions` is **not** a duplicate and
must not be dropped. It is the only read path for material transactions — there
is no separate `/admin/material-transactions` collection endpoint — so removing
it would leave transactions write-only: creatable via R26 but unreadable.

**Traceability coverage:** every REQ-F-001..033 and REQ-NF-001..009 is mapped to
at least one operation or to an explicit cross-cutting convention; the full
matrix is `spec/api/api-traceability.md` (created in Part 2).

---

## 6. Component schema inventory

| Schema | Purpose | Key fields |
|---|---|---|
| `Problem` | Single error model | `type`, `title`, `status`, `detail`, `instance`, `code`, `errors[]`, `traceId` |
| `ValidationErrorItem` | Field-level validation detail | `field`, `code`, `message` |
| `Money` | Monetary value | `amountMinor` (integer), `currency` (`UAH`) |
| `Client` | Client identity | `name`, `phone` |
| `ClientInput` | Booking input | `name`, `phone` |
| `MasterPublic` | Public master view | `id`, `fullName` |
| `Master` | Admin/master view | `id`, `fullName`, `username`, `active`, `createdAt`, `updatedAt` |
| `MasterCreate` | Create master + credentials | `fullName`, `username`, `password`, `active` |
| `MasterPatch` | Update master | `fullName?`, `active?` |
| `Service` | Service definition | `id`, `name`, `category`, `baseDurationMinutes`, `active`, `createdAt`, `updatedAt` |
| `ServiceCreate` | Create service | `name`, `category`, `baseDurationMinutes`, `active` |
| `ServicePatch` | Update service | `name?`, `category?`, `baseDurationMinutes?`, `active?` |
| `Category` | Free-form category | `name`, `seeded` |
| `MasterService` | Master-service link + price | `id`, `masterId`, `serviceId`, `price` (`Money`), `active` |
| `MasterServiceCreate` | Create link | `masterId`, `serviceId`, `price` |
| `MasterServicePatch` | Update link | `price?`, `active?` |
| `Material` | Stock item | `id`, `name`, `unit`, `stockQuantity`, `active`, `createdAt`, `updatedAt` |
| `MaterialCreate` | Create material | `name`, `unit`, `initialStockQuantity?`, `active` |
| `MaterialPatch` | Update material | `name?`, `unit?`, `active?` |
| `UnitList` | Standard + custom units | `standard[]`, `custom[]` |
| `MaterialTransaction` | Receipt/issue record | `id`, `materialId`, `type`, `quantity`, `occurredAt`, `note?`, `createdAt` |
| `MaterialTransactionCreate` | Create transaction | `type`, `quantity`, `occurredAt`, `note?` |
| `Availability` | Weekly + date-specific rules | `weekly[]`, `dates[]` |
| `WeeklyRule` | Recurring pattern | `dayOfWeek`, `startTime`, `endTime` |
| `DateRule` | One-off date | `id?`, `date`, `startTime`, `endTime` |
| `AvailabilitySlot` | Bookable slot | `startAt`, `endAt`, `durationMinutes`, `available` |
| `AvailabilityResponse` | Slot lookup | `masterId`, `date`, `serviceIds[]`, `totalDurationMinutes`, `occupiedDurationMinutes`, `slots[]` |
| `Appointment` | Client-facing appointment | `id`, `status`, `client`, `master`, `services[]`, `startAt`, `endAt`, `totalDurationMinutes`, `occupiedDurationMinutes`, `totalPrice`, `reminders[]`, `payment?`, `confirmationUrl?`, `createdAt`, `updatedAt` |
| `AppointmentAdmin` | Admin view | `Appointment` + `reminders[]`, `notificationsSummary?`, `token?` excluded |
| `AppointmentCreate` | Booking input | `client`, `masterId`, `serviceIds[]`, `startAt` |
| `AppointmentReschedule` | Reschedule input | `startAt`, `masterId?` |
| `AppointmentPatch` | Admin edit input | `startAt?`, `masterId?`, `serviceIds?`, `client?` |
| `AppointmentService` | Service within appointment | `serviceId`, `name`, `baseDurationMinutes`, `price` (`Money`) |
| `Reminder` | Reminder record | `type` (`24h`/`2h`), `scheduledAt`, `status` (`scheduled`/`skipped`/`sent`/`failed`) |
| `Payment` | Payment record | `id`, `appointmentId`, `amount` (`Money`), `status` (`paid`/`unpaid`), `method`, `recordedAt` |
| `PaymentCreate` | Record payment | `amount`, `status`, `method` |
| `Notification` | Recorded message | `id`, `appointmentId?`, `audience`, `eventType`, `channel`, `status`, `scheduledAt?`, `sentAt?`, `createdAt` |
| `NotificationPreference` | Channel/event toggle | `channel` (`sms`/`in_app`), `eventType` (`new`/`reschedule`/`cancellation`), `enabled` |
| `NotificationPreferencePatch` | Toggle one combination | `channel`, `eventType`, `enabled` |
| `LoginRequest` / `LoginResponse` | Auth | `username`/`password`; `accessToken`, `tokenType`, `expiresIn`, `role` |
| `Principal` | Current user | `id`, `role`, `displayName` |
| `RevenueReport` | Revenue aggregate | `period`, `totalAmount`, `paymentsCount`, `byMethod[]` |
| `PopularServicesReport` | Ranked services | `period`, `items[]` (`serviceId`, `name`, `bookingsCount`, `rank`) |
| `StockLevelsReport` | Snapshot | `asOf`, `items[]` (`materialId`, `name`, `unit`, `quantity`) |
| Pagination envelopes | Lists | `items`, `page`, `pageSize`, `total` |

---

## 7. Single error model

All error responses use `application/problem+json` and reference the same
`Problem` schema (RFC 9457).

| HTTP | `code` | When |
|---|---|---|
| 400 | `MALFORMED_REQUEST` | Unparseable JSON, wrong types, missing required query parameter |
| 422 | `VALIDATION_ERROR` | Request body violates the schema: missing required field, pattern/format/enum mismatch, unknown property (D22). Moved from 400 to 422 in Part 2 to match demonstrated Prism behaviour (spike Q4) |
| 401 | `UNAUTHENTICATED` | Missing, expired, or invalid bearer token; invalid login credentials |
| 403 | `FORBIDDEN` | Authenticated but wrong role; master accessing another master's data |
| 404 | `NOT_FOUND` | Unknown resource ID or unknown appointment token (token errors never reveal existence) |
| 405 | `METHOD_NOT_ALLOWED` | Method not defined for the path |
| 409 | `SLOT_UNAVAILABLE` | Requested slot is outside availability or already booked |
| 409 | `DUPLICATE_RESOURCE` | Unique constraint conflict (e.g. duplicate master username, duplicate master-service link) |
| 409 | `INVALID_STATE_TRANSITION` | Edit/cancel/complete on a completed or cancelled appointment |
| 409 | `PAYMENT_ALREADY_RECORDED` | Second payment for an appointment |
| 409 | `APPOINTMENT_NOT_COMPLETED` | Payment attempted before completion |
| 409 | `MATERIAL_STOCK_INSUFFICIENT` | Issue quantity exceeds current stock (if confirmed in §10) |
| 422 | `INVALID_PERIOD` | Both `period` and `from`/`to` supplied, or neither; `from` after `to` |
| 422 | `BUSINESS_RULE_VIOLATION` | Semantic rule violation not covered by a specific code |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Non-JSON body |
| 500 | `INTERNAL_ERROR` | Unexpected server failure |

`Problem` example:

```json
{
  "type": "https://api.salon.example/problems/slot-unavailable",
  "title": "Slot unavailable",
  "status": 409,
  "detail": "The requested slot is already booked for this master.",
  "instance": "/api/v1/appointments",
  "code": "SLOT_UNAVAILABLE",
  "traceId": "6f1c2a8e-5b7d-4c2a-9e0f-2d3b4a5c6d7e"
}
```

---

## 8. Execution plan

### Phase 0 — setup (0.5 day)

| Step | Action | Output | Done when |
|---|---|---|---|
| 0.1 | Confirm the decisions in §10 | signed-off decision list | no pending items |
| 0.2 | Create `spec/api/` skeleton and `package.json` with pinned Redocly/Prism versions; add `.gitignore` | skeleton files | files exist |
| 0.3 | Human runs `cd spec/api && npm install` | `node_modules/` (ignored) | install succeeds |
| 0.4 | Tooling spike: lint a minimal spec; start Prism; test whether a defined 4xx response can be forced and whether its body matches `Problem` | `spec/api/README.md` note | capability documented |
| 0.5 | Create empty artifact files from §3 | skeletons | all files exist |

### Part 1 — requirements, resources, URIs/methods (1 day)

| Step | Action | Output | Done when |
|---|---|---|---|
| 1.1 | Extract API-relevant requirements from SRS v1.3 (REQ-F/REQ-NF table with API applicability and candidate operations) | section in `resource-model.md` | all 42 REQs classified |
| 1.2 | Identify resources and relationships from the glossary (Client, Master, Service, MasterService, Appointment, AppointmentService, Payment, Material, MaterialTransaction, Notification, Reminder, NotificationPreference) | resource diagram/table | every glossary entity placed |
| 1.3 | Define URI conventions: base path, plural nouns, nesting depth, query parameters, versioning, action sub-resources | conventions section | consistent with §4 |
| 1.4 | Define method semantics: GET read-only, POST create/action, PUT full replace of availability, PATCH partial update, no DELETE | method table | no ambiguous method |
| 1.5 | For each operation define parameters, request body, response structure, and status codes | operation tables (§5) | all 50 operations complete |
| 1.6 | Self-review terminology against the glossary and SRS; fix naming | review note | no term drift |

### Part 2 — schemas, error model, traceability, OpenAPI (2 days)

| Step | Action | Output | Done when |
|---|---|---|---|
| 2.1 | Define component schemas from §6, including required fields, formats, enums, examples | `openapi.yaml` components | every schema referenced |
| 2.2 | Finalize `Problem` schema and error catalog (§7) | `error-model.md` | every error response references `Problem` |
| 2.3 | Build the REQ-ID ↔ operationId ↔ scenario matrix | `api-traceability.md` (draft) | all 42 REQs mapped or explicitly N/A |
| 2.4 | Author `openapi.yaml`: info, servers, tags, security, paths, components | spec file | parses without errors |
| 2.5 | Add request/response examples for every operation and error code | examples in spec | positive and negative examples present |
| 2.6 | Run `npm run lint` (Redocly, recommended ruleset); fix errors and warnings | `validation-report.txt` | exit code 0, zero errors |
| 2.7 | Run `npm run bundle` to prove `$ref` resolution | bundled spec | bundle succeeds |
| 2.8 | Self-review: no orphan schemas, no inline duplication, consistent casing | review note | clean |

### Part 3 — mock API and scenarios (1 day)

| Step | Action | Output | Done when |
|---|---|---|---|
| 3.1 | Start the mock from the approved spec (`npm run mock`, Prism on port 4010) | running process | mock serves the documented paths at the root URL (Prism drops the `/api/v1` server prefix — CL-01) |
| 3.2 | Write positive scenarios: SCN-01..SCN-15 mapped to operations; request, expected status, expected fields | `scenarios/positive.md` | every SCN covered |
| 3.3 | Write negative scenarios: invalid body, missing auth, wrong role, unknown ID/token, slot conflict, payment before completion, invalid period | `scenarios/negative.md` | each error code exercised |
| 3.4 | Implement `run-positive.sh` and `run-negative.sh` with `curl` + `jq` assertions; capture outputs | scripts + `results/` | scripts run end-to-end |
| 3.5 | Execute scenarios; record pass/fail and any contract mismatch | results | all planned scenarios executed |
| 3.6 | Verify contract fidelity: status codes, media types, `Problem` shape, examples | fidelity note | mismatches listed |
| 3.7 | If a mismatch requires behavior absent from the SRS, record a clarification or addendum; do not silently change the contract | decision log | no undocumented behavior |

### Part 4 — API-GATE, traceability, commits (0.5 day)

| Step | Action | Output | Done when |
|---|---|---|---|
| 4.1 | Update `api-traceability.md` with scenario IDs, validation status, and mock status | final matrix | all rows filled |
| 4.2 | Draft `logs/2026-10-26-api-gate-decision.md` with the 10 criteria and evidence links | gate draft | every criterion has evidence |
| 4.3 | Human reviews and signs GO or REVISE | signed decision | decision recorded |
| 4.4 | If REVISE: fix, re-run validation and scenarios, re-gate | revised artifacts | gate repeated |
| 4.5 | Human commits in the sequence in §12 | 6 commits | history clean and meaningful |
| 4.6 | Create GitHub issues SMS-38..SMS-43 for API design (decision D5) | issues | six issues open with labels |

### 8.1 17-step mapping (normative order)

The process mandates 17 steps in four parts. This table is the authoritative
crosswalk; do not reorder steps.

| Process step | Plan step(s) | Artifact | Done when |
|---|---|---|---|
| **Part 1** | | | |
| 1. Identify SRS requirements exposed via REST | 1.1 | `resource-model.md` §requirements | all 42 REQs classified (exposed / cross-cutting / UI-only) |
| 2. Identify main domain resources | 1.2 | `resource-model.md` §resources | every glossary entity placed or explicitly excluded |
| 3. Define resource URIs and HTTP methods | 1.3, 1.4 | `resource-model.md` §URI conventions, §method semantics | no ambiguous method; conventions match §4 |
| 4. Define query params, request body, response structure, status codes per operation | 1.5 | `resource-model.md` §operation tables | all 50 operations complete |
| **Part 2** | | | |
| 5. Define data schemas for main resources | 2.1 | `openapi.yaml` `components.schemas` | every schema referenced, no orphans |
| 6. Form a unified API error model | 2.2 | `error-model.md`, `Problem` schema | every error response `$ref`s `Problem` |
| 7. Link each substantial operation to a REQ-ID | 2.3 | `api-traceability.md` | all 42 REQs mapped or explicit N/A |
| 8. Create the OpenAPI specification (YAML) | 2.4, 2.5 | `spec/api/openapi.yaml` | parses; examples present |
| **Part 3** | | | |
| 9. Validate the OpenAPI specification automatically | 2.6, 2.7 | `validation-report.txt`, bundled spec | Redocly exit 0, zero errors |
| 10. Start the mock API without writing a server | 3.1 | running Prism process | documented paths served from `openapi.yaml` (root URL, no `/api/v1` prefix — CL-01) |
| 11. Form positive scenarios | 3.2 | `scenarios/positive.md` | SCN-01..SCN-15 covered |
| 12. Form negative scenarios | 3.3 | `scenarios/negative.md` | each error code exercised |
| **Part 4** | | | |
| 13. Verify the mock reproduces the contract | 3.5, 3.6 | `scenarios/results/`, fidelity note | mismatches listed and dispositioned |
| 14. Route new behaviour through clarification or addendum | 3.7 | `spec/api/clarifications.md` | no undocumented behaviour |
| 15. Conduct API-GATE | 4.2, 4.3, 4.4 | `logs/2026-10-26-api-gate-decision.md` | 10/10 criteria evidenced; decision signed |
| 16. Update the traceability matrix | 4.1 | `api-traceability.md` final | scenario + validation + mock status filled |
| 17. Record artifacts in separate meaningful commits | 4.5 | git history | commits per §12 |

### 8.2 Mock state and fidelity strategy

Prism is **stateless**: it validates a request against the specification and
returns a documented response example. It does not persist an appointment, so a
`POST /appointments` followed by `GET /appointments/{token}` will not return the
created record. This affects steps 11–13 and must be handled deliberately — the
the scope forbids writing a server, so a custom stateful mock is out of scope.

Fidelity classes and how each is verified:

| Class | Example | How the mock can demonstrate it | Assertion |
|---|---|---|---|
| A. Schema validation | missing `client.name`; wrong `status` enum; malformed JSON | Prism rejects with 422/400 and a `Problem` body | status + `code` + `Problem` shape |
| B. Auth presence | no `Authorization` header on `/me/*` | Prism rejects with 401 | status + `code` |
| C. Unknown resource | `GET /services/{unknown}` | 404 documented; Prism may return the example | status + `Problem` shape |
| D. Forced status | `POST /appointments` → 409 `SLOT_UNAVAILABLE` | `Prefer: code=409` (spike 0.4 decides); else the example body is asserted directly | status + `code` |
| E. State transition | cancel → status `cancelled`; payment before completion | **Not reproducible** in a stateless mock | contract-level review; deferred to next-phase tests; recorded in `clarifications.md` |

Rules:
1. Spike 0.4 must answer: does Prism honour `Prefer: code=…` and return the
   documented example for that status? If yes, class D is verified through the
   mock and gate criterion 10 is satisfied for business-rule negatives.
2. If no, class D is verified by asserting the documented example in
   `openapi.yaml` (static contract check) and the limitation is recorded as a
   clarification — **not** silently accepted. A thin custom mock is only an
   option if the human explicitly re-scopes the "no server" rule.
3. Class E is never claimed as mock-verified. The gate record states it plainly.
4. Positive scenarios use the examples shipped in the spec; each request must be
   valid per the contract, and the response must match the documented status,
   media type, and schema.

**Spike 0.4 outcome (2026-10-26, 5/5 checks passed).** Full record:
`spec/api/spike/FINDINGS.md`. Resolutions to the rules above:

- Class A — **confirmed**, and the 422 body is *our* documented `Problem`
  example, not Prism's own format. Conditional on documenting a `Problem`
  example for the error status on each operation.
- Class B — not exercised by the spike; verified in Part 3.
- Class C — not exercised by the spike; verified in Part 3.
- Class D — **`Prefer: code=…` works**: `Prefer: code=409` returned 409 with
  `code=SLOT_UNAVAILABLE`. Rule 2's fallback is not needed.
- Class E — **confirmed not reproducible**; contract review plus next-phase tests.
- Unplanned finding: `--errors` is mandatory, otherwise Prism answers 2xx to an
  invalid request. Set in both mock scripts.
- Unplanned finding: Prism drops the path component of `servers[].url`, so the
  mock serves `/services`, not `/api/v1/services`. The contract keeps `/api/v1`;
  runners call the root URL. Recorded as CL-01 in `clarifications.md`.
- Unplanned finding: static mode returns literal examples, so `traceId` and
  `instance` repeat across requests. Scenarios must never assert them. Recorded
  as CL-02.

Authoring rules derived (apply in Part 2): every operation declares `security`
(`security: []` when public), documents at least one 4xx, and gives each
documented error status a `Problem` example whose `code` a scenario asserts.

### 8.3 Clarification and addendum register (step 14)

Any behaviour discovered during design or mock verification that is absent from
SRS v1.3 is **not** added to the contract silently. It is recorded in
`spec/api/clarifications.md` with this row shape:

| ID | Date | Source | Description | Type | Disposition | SRS impact |
|---|---|---|---|---|---|---|
| CL-01 | 2026-10-26 | design review | e.g. "payment method enum needs `bank_transfer`" | clarification / addendum | accepted as design decision D11 / deferred / rejected | none / SRS v1.4 candidate |

Rules:
1. A **clarification** resolves an ambiguity already inside the SRS's intent and
   needs no SRS change; it must cite the requirement it clarifies.
2. An **addendum** introduces genuinely new behaviour; it requires a SRS revision
   and a new SPEC-GATE before it enters the contract. Until then the operation is
   marked `x-pending-addendum` and excluded from the API-GATE pass.
3. Every CL row must end with a disposition — no open rows at the gate.
4. The register is the evidence for API-GATE criterion 6 and for step 14.

---

## 9. API-GATE checklist mapping

| # | Criterion | Evidence |
|---|---|---|
| 1 | Every substantial operation has a justified REQ-ID | `api-traceability.md`; no orphan operations |
| 2 | Resources and terms match the domain and glossary | `resource-model.md` terminology table; glossary cross-check |
| 3 | URIs and HTTP methods are used consistently | conventions §4; Redocly lint rules; no verbs except action sub-resources |
| 4 | Request and response schemas are defined for operations | `openapi.yaml` components; lint "no missing schema" |
| 5 | Required HTTP status codes and a single error model | `error-model.md`; every error response `$ref` to `Problem` |
| 6 | Positive and negative scenarios are foreseen | `scenarios/positive.md`, `scenarios/negative.md` |
| 7 | API does not expose internal implementation details | public schemas exclude username, password hash, internal flags; admin-only fields separated |
| 8 | OpenAPI specification passes automated validation | `validation-report.txt` exit 0 |
| 9 | Mock API starts from the approved specification | mock start log; Prism command in `README.md` |
| 10 | Main positive and negative scenarios reproduce through the mock | `scenarios/results/` pass summary |

Any failed criterion → **REVISE**, fix, repeat the gate. The human signs the
final decision; the agent cannot move the gate to GO.

---

## 10. Decisions — resolved 2026-10-26

**Resolution:** D1 = local `spec/api/package.json` + one-time `npm install`;
D2 = OpenAPI 3.0.3; D3 = separate `spec/api/api-traceability.md` (SRS v1.3 left
untouched); D4 = Prism spec-driven mock with a capability spike first; D5 =
create GitHub issues SMS-38..SMS-43; D6 = English artifacts; D7–D20 = accepted
as recommended. The table below is retained as the decision record.

| ID | Decision | Recommended default | Alternatives |
|---|---|---|---|
| D1 | Tooling installation | isolated `spec/api/package.json`; human runs `npm install` once | `npx` per command; Docker images |
| D2 | OpenAPI version | 3.0.3 (broadest tool support, simpler `nullable`) | 3.1.0 (JSON Schema 2020-12) |
| D3 | Traceability update | separate `spec/api/api-traceability.md` (SRS untouched; no LaTeX available) | new SRS v1.4 + SPEC-GATE; both |
| D4 | Mock strategy | Prism spec-driven mock | Prism + thin custom mock for business-rule errors; custom mock only |
| D5 | GitHub issues for API work | create SMS-38..SMS-43 | no new issues; document only |
| D6 | Artifact language | English (repo convention) | Ukrainian; bilingual |
| D7 | Resource IDs | UUID v4 for all resources | integer IDs; mixed |
| D8 | Money format | integer minor units in `Money` | decimal string; float |
| D9 | Time zone | `Europe/Kyiv` | UTC `Z`; configurable |
| D10 | Auth scheme | Bearer JWT | opaque bearer token |
| D11 | Payment methods | `cash`, `card` enum | free-form string; add `bank_transfer` |
| D12 | Payment cardinality | one payment per appointment, immutable | multiple payments; mutable status |
| D13 | Material issue over stock | reject with 409 `MATERIAL_STOCK_INSUFFICIENT` | allow negative stock |
| D14 | Phone validation | E.164-like pattern | free string |
| D15 | State rules | completed/cancelled not editable; completed not cancellable; cancel/complete idempotent | other |
| D16 | Popular-services tie-break | booking count desc, then name asc | count only |
| D17 | Unknown query parameters | ignored (forward compatibility) | rejected with 400 |
| D18 | Admin token exposure | exclude appointment token from admin responses | include |
| D19 | Public master fields | `id`, `fullName` only | include services summary |
| D20 | Error catalog | as in §7 | revisions |
| D21 | Operation count | keep all **50** operations; five detail `GET`s (P2, P5, R3, R7, R15) are optional trims only if scope shrinks (→ 45). `R25` is not a duplicate and stays | trim six → 44 (rejected: miscounted `R25`) |
| D22 | Unknown request-body properties | rejected with `422 VALIDATION_ERROR`, field code `UNKNOWN_FIELD`; unknown query parameters stay ignored per D17 | ignore them too (consistent with D17); accept silently |

---

## 11. Risks specific to this phase

| ID | Risk | Detection | Mitigation |
|---|---|---|---|
| R-API-01 | Prism cannot force a defined 4xx response or does not match the `Problem` schema | spike in step 0.4; scenario mismatch | **Resolved 2026-10-26**: spike passed 5/5 — forced 4xx works and schema violations return our documented `Problem` example. See `spec/api/spike/FINDINGS.md`. |
| R-API-02 | OpenAPI file becomes too large to maintain | lint time; review difficulty | tags + components; split only if needed |
| R-API-03 | Tooling install blocked or offline | `npm install` fails | npx or Docker fallback; human installs |
| R-API-04 | New behavior invented during design | traceability review; gate | clarification/addendum log; no silent invention |
| R-API-05 | SRS ambiguity (payment methods, timezone, phone format) | design review | decisions register (§10) |
| R-API-06 | Mock state cannot demonstrate business-rule negatives | scenario failures | choose reproducible negatives; document the rest |
| R-API-07 | Dev-tool dependency tree carries 8 advisories (5 moderate, 3 high) in Prism 5.16.0 transitives (`@faker-js/faker`, `postman-collection`, `lodash`, `uuid`) | `npm audit` after install | **Accepted 2026-10-26**: dev-only tooling, runs locally against a local spec, no untrusted input. `npm audit fix --force` would downgrade Prism to 5.6.0 and risk breaking the mock — not applied. Revisit only if the tooling is exposed to untrusted input. |

---

## 12. Commit sequence (human executes; agent cannot commit)

| # | Prefix | Subject | Files |
|---|---|---|---|
| 0 | `gate:` | record approved API design plan | `logs/2026-10-26-api-design-plan.md`, `logs/2026-10-26-api-phase0-setup.md` |
| 1 | `test:` | add API contract validation and mock tooling | `spec/api/package.json`, `spec/api/package-lock.json`, `spec/api/redocly.yaml`, `spec/api/.gitignore`, `spec/api/spike/**`, `spec/api/clarifications.md` |
| 2 | `spec:` | add REST API resource model and error model | `spec/api/resource-model.md`, `spec/api/error-model.md` |
| 3 | `spec:` | add OpenAPI specification for salon management system | `spec/api/openapi.yaml` |
| 4 | `spec:` | add API traceability matrix | `spec/api/api-traceability.md` |
| 5 | `test:` | add positive and negative mock API scenarios | `spec/api/scenarios/**` |
| 6 | `docs:` | document API validation and mock workflow | `spec/api/README.md`, `spec/api/validation-report.txt` |
| 7 | `gate:` | record API-GATE GO decision | `logs/2026-10-26-api-gate-decision.md` |

If a commit spans several areas, use the prefix of the dominant artifact and
mention the rest in the body (per `docs/commit-convention.md`).

Note: this plan file (`logs/2026-10-26-api-design-plan.md`) is itself a `gate:`
artifact — commit it first as commit 0, so the approved plan is in history
before the artifacts it governs:

```
gate: record approved API design plan
```

### 12.1 GitHub issues for the API design work (decision D5)

Created **after** the API-GATE decision, so the tracker reflects approved work
(issues are opened in this order; numbering continues from SMS-37).

| Plan ID | Title | Type | Source | Depends on | Role |
|---|---|---|---|---|---|
| SMS-38 | Define REST resource model and URI/method conventions | Specification | Plan §5; SRS §4–5 | — | Joint |
| SMS-39 | Define component schemas and unified error model | Specification | Plan §6–7; SRS §6–7 | SMS-38 | Joint |
| SMS-40 | Author OpenAPI 3.0.3 specification | Specification | Plan §8 Part 2 | SMS-38, SMS-39 | Coding Agent |
| SMS-41 | Build API traceability matrix (REQ ↔ operation ↔ scenario) | Documentation | Plan §8.1; SRS §8 | SMS-40 | Coding Agent |
| SMS-42 | Write positive and negative mock scenarios and runners | Test | Plan §8.2; SCN-01..15 | SMS-40 | Coding Agent |
| SMS-43 | API-GATE: validate contract and mock against the 10 criteria | Gate | Plan §9 | SMS-41, SMS-42 | Human |

Add these rows to `docs/ticket-list.md` and `docs/issue-import.csv` in the same
commit that records the gate decision, so the tracker and the plan stay in step.

---

## 13. Definition of done 

Required deliverables:

- [x] REST resource model documented and consistent with the glossary.
- [x] Traceability table of REQ-ID to API operations.
- [x] OpenAPI 3.0.3 specification authored.
- [x] Request and response schemas defined for all operations.
- [x] Single unified error model referenced by every error response.
- [x] Positive scenarios formulated (27).
- [x] Negative scenarios formulated (17).
- [x] Automated validation result captured (zero errors, zero warnings).
- [x] Working mock API started from the approved spec.
- [x] API traceability matrix updated with scenario and mock status.
- [x] API-GATE decision record signed by the human.

Required process completeness:

- [x] All 17 mandated steps evidenced in §8.1.
- [x] All 10 API-GATE criteria evidenced in §9.
- [x] Clarification register `spec/api/clarifications.md` has no open rows.
- [ ] Artifacts committed in meaningful commits (§12).
- [ ] GitHub issues SMS-38..SMS-43 created (§12.1), or the decision to skip is recorded.

Evidence for the ticked rows: `spec/api/validation-report.txt`,
`spec/api/scenarios/results/*.txt`, `spec/api/api-traceability.md` §5, and
`logs/2026-10-26-api-gate-decision.md`.
