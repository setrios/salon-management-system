# REST resource model — Salon Management System

Status: **COMPLETE** — Part 1 of the approved plan
([`../../logs/2026-10-26-api-design-plan.md`](../../logs/2026-10-26-api-design-plan.md)).
Source of truth for behaviour: SRS v1.3 (approved 2026-09-27),
`spec/salon-management-system-srs-v1.3.tex`.

This document covers steps 1.1–1.6: requirement classification, resource
inventory, URI conventions, HTTP method semantics, the per-operation definition,
and the terminology review against the domain glossary.

Scope: **50 operations** — 11 public/booking, 2 authentication, 7 master,
30 administrator (decision D21 retains all 50; the five detail `GET`s P2, P5,
R3, R7, R15 are optional trims only if scope ever shrinks, giving 45).

---

## 1. Requirement classification (step 1.1)

Every SRS v1.3 requirement is classified by API applicability:

- **Direct** — exposed by one or more operations; listed in the *Exposed by* column.
- **Convention** — a cross-cutting rule enforced by the contract as a whole
  (naming, formats, media types), not by a single operation.
- **Not applicable** — a UI/UX or process constraint with no API surface; a reason
  is given so the omission is deliberate, not an oversight.

`401`, `403` and `500` apply to every authenticated operation and are not repeated
per row.

| REQ-ID | Requirement (short) | Applicability | Exposed by | Notes |
|---|---|---|---|---|
| REQ-F-001 | Sum of durations and costs | Direct | P1, P2, P6, P8, P11, R19, R21 | `totalDurationMinutes` / `totalPrice` computed server-side |
| REQ-F-002 | Slot within availability and free | Direct | P4, P5, P7, P8, R19 | Availability lookup plus `409 SLOT_UNAVAILABLE` |
| REQ-F-003 | No approval state | Direct | P8 | Created as `confirmed` immediately |
| REQ-F-004 | Confirmation page reachable via link | Direct | P8, P9 | `Location` header on 201; `confirmationUrl` in body |
| REQ-F-005 | Exactly one confirmation SMS | Direct | P8, R24 | Notification record with `eventType=new` |
| REQ-F-006 | Cancel any time, no fee | Direct | P10, R22 | Action sub-resource, no fee fields |
| REQ-F-007 | Reschedule any time, no fee or limit | Direct | P11, R21 | Same appointment record, no new booking |
| REQ-F-008 | Reminders at new time ∓ 24 h and 2 h | Direct | P11, R20 | `reminders[]` recalculated on reschedule |
| REQ-F-009 | Exactly one reschedule SMS | Direct | P11, R24 | `eventType=reschedule` |
| REQ-F-010 | Skip 24 h reminder if under 24 h | Direct | P8, P11, R24 | Reminder `status=skipped` |
| REQ-F-011 | Skip 2 h reminder if under 2 h | Direct | P8, P11, R24 | Reminder `status=skipped` |
| REQ-F-012 | No master self-registration | Direct | A1, A2, R2 | Only the administrator creates master accounts |
| REQ-F-013 | Calendar shows only own appointments | Direct | M1 | Scope derived from the JWT subject |
| REQ-F-014 | Master sees only own MasterService records | Direct | M2, P6 | Public read filtered to active links |
| REQ-F-015 | Weekly and date-specific availability | Direct | P7, M3, M4 | `weekly[]` plus `dates[]` in `Availability` |
| REQ-F-016 | Disabled channel suppresses notification | Direct | M5, M6 | Preference record per channel × event type |
| REQ-F-017 | Exactly one administrator login | Direct | A1, R2 | Single admin account; no admin list endpoint |
| REQ-F-018 | CRUD and deactivate on reference data | Direct | R1–R17 | `PATCH active:false`, never `DELETE` |
| REQ-F-019 | Administrator changes mirror booking rules | Direct | R18–R21 | Same validation and recalculation as public booking |
| REQ-F-020 | Transaction updates stock level | Direct | R25, R26 | Receipt increases, issue decreases |
| REQ-F-021 | No payment before `completed` | Direct | R27 | `409 APPOINTMENT_NOT_COMPLETED` |
| REQ-F-022 | Revenue for preset period or custom range | Direct | R28 | `period` XOR (`from` + `to`) |
| REQ-F-023 | Event notifies administrator unless disabled | Direct | R24 | Admin notification record |
| REQ-F-024 | Custom category savable, seeds present | Direct | P1, P3, R5, R6, R8, R9 | Seeds Hair, Coloring, Barbering |
| REQ-F-025 | Custom unit savable | Direct | R14, R16, R17 | Standard units plus free-form custom |
| REQ-F-026 | Toggle one combination only | Direct | M6 | Patch targets one channel × event type |
| REQ-F-027 | `completed` required before payment | Direct | R23, R27 | Complete action precedes payment |
| REQ-F-028 | Administrator edit recalculates and notifies | Direct | R20, R21 | Same recalculation as F-001; SMS per F-009 |
| REQ-F-029 | Skipped reminder reactivates if future | Direct | P11, R24 | Reschedule to a future time flips `skipped` → `scheduled` |
| REQ-F-030 | Acting administrator not self-notified | Direct | R22, R24 | Assigned master still notified |
| REQ-F-031 | Duration rounds up to 30-minute block | Direct | P7, P8, R19, R21 | 75 min → 90-min block |
| REQ-F-032 | Popular services ranked by booking count | Direct | R29 | For a period; tie-break count desc, name asc (D16) |
| REQ-F-033 | Stock-level snapshot without period | Direct | R30 | No period parameter by design |
| REQ-NF-001 | Unguessable UUID access token | Direct | P8, P9, P10, P11 | `accessToken` format `uuid` |
| REQ-NF-002 | Responsive UI with usable controls | Not applicable | — | Client-side presentation constraint; no API surface |
| REQ-NF-003 | English only | Convention | all operations | Error `title`/`detail`/`message` in English |
| REQ-NF-004 | Amounts in UAH | Convention | all `Money` | `currency` fixed to `UAH` |
| REQ-NF-005 | No automatic deletion | Convention | all resources | No `DELETE`; deactivation via `PATCH active:false` |
| REQ-NF-006 | Data visible only to authorized parties | Direct + Convention | P9, P10, P11, M1, R20 | Client name and phone visible only to the client's token holder, the assigned master, and the administrator |
| REQ-NF-007 | No location or time-zone selector | Not applicable | — | Single salon; fixed `Europe/Kyiv` |
| REQ-NF-008 | No start time off a 30-minute boundary | Direct | P7, P8, R19, R21 | Validated on every write |
| REQ-NF-009 | No payment-gateway integration | Convention | R27 | Payment is recorded manually, not processed |

**Coverage summary:** 33 of 42 requirements have direct API surface; 4 are
enforced as cross-cutting conventions; 2 are explicitly not applicable (both UI
constraints). Every operation in §5 appears in at least one row.

---

## 2. Domain resources and relationships (step 1.2)

Terms follow the SRS domain glossary. "Appointment" is the booking record;
"slot" is a candidate time range offered by availability, never a stored entity.

| Resource | Role | Key relationships |
|---|---|---|
| `Client` | Person being served; no account, identified by name and phone | 1 → N `Appointment` |
| `Master` | Staff member providing services; has login credentials | 1 → N `MasterService`; 1 → N `Appointment`; 1 → 1 `Availability`; 1 → N `NotificationPreference` |
| `Service` | Catalogue definition: name, category, base duration | 1 → N `MasterService` |
| `Category` | Free-form service category, seeded with three values | 1 → N `Service` (by name) |
| `MasterService` | Link between a master and a service, carrying the price | N ↔ 1 `Master`; N ↔ 1 `Service` |
| `Availability` | Master's weekly rules plus date-specific overrides | 1 → 1 `Master` |
| `Appointment` | Booking record with status, time, services, total duration and price | N ↔ 1 `Master`; 1 → N `AppointmentService`; 1 → 0..1 `Payment`; 1 → N `Reminder`; 1 → N `Notification`; 1 ↔ 1 `Client` (embedded) |
| `AppointmentService` | Service line inside an appointment, with price snapshot | N ↔ 1 `Appointment`; N ↔ 1 `Service` |
| `Payment` | Money received for an appointment; at most one, immutable | 1 ↔ 1 `Appointment` |
| `Reminder` | Scheduled 24 h / 2 h message with status | N ↔ 1 `Appointment` |
| `Notification` | Recorded message with audience, event type, channel, status | N ↔ 1 `Appointment` (optional for system events) |
| `NotificationPreference` | Toggle per channel × event type | N ↔ 1 `Master` |
| `Material` | Stock item with unit and quantity | 1 → N `MaterialTransaction` |
| `MaterialTransaction` | Receipt or issue record; mutates stock | N ↔ 1 `Material` |
| `Unit` | Value object: standard units plus custom strings | referenced by `Material` |

Cardinality rules that matter for the contract:

- An appointment embeds its client (name, phone); there is no separate client
  resource and no client login.
- An appointment always has at least one service line (REQ-F-001).
- A payment exists at most once per appointment and is never updated (D12).
- Deactivation never deletes: records keep their history (REQ-NF-005).

---

## 3. URI grammar and conventions (step 1.3)

| Rule | Convention |
|---|---|
| Base path | `/api/v1`; version in the path, not in a header |
| Collection | plural noun: `/services`, `/masters`, `/appointments`, `/admin/materials` |
| Item | collection + UUID: `/services/{serviceId}` |
| Sub-collection | parent item + plural child: `/masters/{masterId}/services`, `/admin/materials/{materialId}/transactions` |
| Action | parent item + verb sub-resource: `/appointments/{token}/cancel`, `/admin/appointments/{appointmentId}/complete` |
| Nesting depth | at most two levels below the base path; no deeper nesting |
| Administrator namespace | `/admin/...` for administrator-only operations on the same resources |
| Self-service namespace | `/me/...` for the authenticated master or administrator acting on their own data |
| Client access | `/appointments/{token}` — the access token is the credential, not a query parameter |
| Deletion | no `DELETE`; deactivation via `PATCH` with `active:false` |
| Pagination | `page` (1-based, default 1) and `pageSize` (default 20, max 100); envelope `{items, page, pageSize, total}` |
| Filters | plain query parameters in camelCase: `active`, `category`, `q`, `status`, `masterId`, `serviceId`, `from`, `to`, `type` |
| Period selection | `period` (`day`/`week`/`month`) XOR (`from` and `to`) on report endpoints |
| Unknown query parameters | ignored (D17) for forward compatibility |
| Identifiers in JSON | camelCase; UUID v4 strings |
| Timestamps | RFC 3339 with offset, `Europe/Kyiv` (D9) |
| Money | `{amountMinor, currency}` with integer kopiykas, `UAH` (D8) |

Naming rules that prevent ambiguity:

- `/me/...` always means "the caller's own record"; there is no `/me/{id}`.
- `/admin/...` never changes the resource identity — the same appointment is
  reachable as `/appointments/{token}` (client) and
  `/admin/appointments/{appointmentId}` (administrator).
- Action sub-resources are nouns plus a verb and never accept a body except
  `reschedule` (which needs a new time).

---

## 4. HTTP method semantics (step 1.4)

| Method | Semantics | Used for | Success | Typical errors |
|---|---|---|---|---|
| `GET` | Safe, idempotent read | Catalog, detail, lists, reports | 200 | 400, 401, 403, 404 |
| `POST` on a collection | Create a resource | `POST /appointments`, `POST /admin/services` | 201 + `Location` | 400, 401, 403, 409, 422 |
| `POST` on an action | State transition or side-effecting action | `/cancel`, `/complete`, `/reschedule`, `/payments`, `/transactions` | 200 or 201 | 400, 401, 403, 404, 409, 422 |
| `PUT` | Full replacement of a sub-resource | `PUT /me/availability` | 200 | 400, 401, 403, 422 |
| `PATCH` | Partial update | Reference data, preferences, admin appointment edit | 200 | 400, 401, 403, 404, 409, 422 |
| `DELETE` | Not used | — | — | — |

Method rules:

- **No `PUT` on collections or items.** Full replacement is used only for the
  master's availability, where the whole weekly-plus-date rule set is the unit.
- **No status changes through `PATCH`.** `status` is never writable; cancellation
  and completion go through action sub-resources so the transition is explicit.
- **`POST` actions are idempotent in effect** (D15): cancelling a cancelled
  appointment and completing a completed appointment return the current state
  rather than an error.
- **`PATCH active:false`** is the only deactivation mechanism, preserving records
  for REQ-NF-005.

Status code policy (details and codes in `error-model.md`, Part 2):

| Status | Meaning in this API |
|---|---|
| 200 | Successful read, update, or action |
| 201 | Resource created; `Location` header points at it |
| 400 | Malformed request: unparsable JSON, wrong type, missing required query parameter |
| 401 | Missing, expired, or invalid credentials; invalid login |
| 403 | Authenticated but wrong role or not the owner |
| 404 | Unknown ID or unknown appointment token |
| 405 | Method not defined for the path |
| 409 | State conflict: slot taken, duplicate, invalid transition, payment already recorded, stock insufficient |
| 415 | Non-JSON body |
| 422 | Semantically invalid: period conflict, business rule violation |
| 500 | Unexpected failure |

---

## 5. Operation catalog (step 1.5)

Legend — **Auth:** `—` public, `TOKEN` client access token, `JWT` any
authenticated principal, `JWT-M` master, `JWT-A` administrator. **Errors** lists
status codes only; the specific `code` for each status is fixed in
`error-model.md` and per operation in `openapi.yaml`. `401`, `403` and `500` are
implied for every authenticated operation and omitted from the rows.

### 5.1 Public catalogue and client booking (11)

| # | Method | URI | operationId | Auth | Parameters and body | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| P1 | GET | `/services` | listServices | — | query: `category`, `q`, `page`, `pageSize` | 200 `ServicePage` | 400 | F-001, F-024 |
| P2 | GET | `/services/{serviceId}` | getService | — | path: `serviceId` | 200 `Service` | 404 | F-001 |
| P3 | GET | `/categories` | listCategories | — | — | 200 `CategoryList` | — | F-024 |
| P4 | GET | `/masters` | listMasters | — | query: `active`, `page`, `pageSize` | 200 `MasterPage` | 400 | F-002 |
| P5 | GET | `/masters/{masterId}` | getMaster | — | path: `masterId` | 200 `MasterPublic` | 404 | F-002 |
| P6 | GET | `/masters/{masterId}/services` | listMasterServices | — | path: `masterId`; query: `active`, `page`, `pageSize` | 200 `MasterServicePage` | 404 | F-001, F-014 |
| P7 | GET | `/masters/{masterId}/availability` | getMasterAvailability | — | path: `masterId`; query: `date` (required), `serviceIds` (required, CSV) | 200 `AvailabilityResponse` | 400, 404, 422 | F-002, F-015, F-031, NF-008 |
| P8 | POST | `/appointments` | createAppointment | — | body: `AppointmentCreate` | 201 `Appointment` + `Location` | 400, 409, 422 | F-001, F-002, F-003, F-004, F-005, F-031 |
| P9 | GET | `/appointments/{token}` | getAppointmentByToken | TOKEN | path: `token` | 200 `Appointment` | 404 | F-004, NF-001 |
| P10 | POST | `/appointments/{token}/cancel` | cancelAppointmentByToken | TOKEN | path: `token`; no body | 200 `Appointment` | 404, 409 | F-006 |
| P11 | POST | `/appointments/{token}/reschedule` | rescheduleAppointmentByToken | TOKEN | path: `token`; body: `AppointmentReschedule` | 200 `Appointment` | 400, 404, 409, 422 | F-007, F-008, F-009, F-029 |

### 5.2 Authentication (2)

| # | Method | URI | operationId | Auth | Parameters and body | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| A1 | POST | `/auth/login` | login | — | body: `LoginRequest` | 200 `LoginResponse` | 400, 401 | F-012, F-017 |
| A2 | GET | `/auth/me` | getCurrentPrincipal | JWT | — | 200 `Principal` | 401 | F-012 |

### 5.3 Master self-service (7)

| # | Method | URI | operationId | Auth | Parameters and body | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| M1 | GET | `/me/appointments` | listMyAppointments | JWT-M | query: `from`, `to`, `status`, `page`, `pageSize` | 200 `AppointmentAdminPage` (staff view, no client token) | 400 | F-013 |
| M2 | GET | `/me/services` | listMyServices | JWT-M | — | 200 `MasterServiceList` | — | F-014 |
| M3 | GET | `/me/availability` | getMyAvailability | JWT-M | — | 200 `Availability` | — | F-015 |
| M4 | PUT | `/me/availability` | replaceMyAvailability | JWT-M | body: `Availability` | 200 `Availability` | 400, 422 | F-015 |
| M5 | GET | `/me/notification-preferences` | getMyNotificationPreferences | JWT | — | 200 `NotificationPreferenceList` | — | F-016, F-026 |
| M6 | PATCH | `/me/notification-preferences` | updateMyNotificationPreference | JWT | body: `NotificationPreferencePatch` | 200 `NotificationPreference` | 400, 422 | F-016, F-026 |
| M7 | GET | `/me/notifications` | listMyNotifications | JWT | query: `status`, `eventType`, `from`, `to`, `page`, `pageSize` | 200 `NotificationPage` | 400 | F-016 |

### 5.4 Administrator reference data (17)

| # | Method | URI | operationId | Auth | Parameters and body | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| R1 | GET | `/admin/masters` | listMastersAdmin | JWT-A | query: `active`, `page`, `pageSize` | 200 `MasterPage` | 400 | F-018 |
| R2 | POST | `/admin/masters` | createMaster | JWT-A | body: `MasterCreate` | 201 `Master` | 400, 409, 422 | F-012, F-018 |
| R3 | GET | `/admin/masters/{masterId}` | getMasterAdmin | JWT-A | path: `masterId` | 200 `Master` | 404 | F-018 |
| R4 | PATCH | `/admin/masters/{masterId}` | updateMaster | JWT-A | path: `masterId`; body: `MasterPatch` | 200 `Master` | 400, 404, 409, 422 | F-018 |
| R5 | GET | `/admin/services` | listServicesAdmin | JWT-A | query: `active`, `category`, `page`, `pageSize` | 200 `ServicePage` | 400 | F-018, F-024 |
| R6 | POST | `/admin/services` | createService | JWT-A | body: `ServiceCreate` | 201 `Service` | 400, 409, 422 | F-018, F-024 |
| R7 | GET | `/admin/services/{serviceId}` | getServiceAdmin | JWT-A | path: `serviceId` | 200 `Service` | 404 | F-018 |
| R8 | PATCH | `/admin/services/{serviceId}` | updateService | JWT-A | path: `serviceId`; body: `ServicePatch` | 200 `Service` | 400, 404, 409, 422 | F-018, F-024 |
| R9 | GET | `/admin/categories` | listCategoriesAdmin | JWT-A | — | 200 `CategoryList` | — | F-024 |
| R10 | GET | `/admin/master-services` | listMasterServicesAdmin | JWT-A | query: `masterId`, `serviceId`, `active`, `page`, `pageSize` | 200 `MasterServicePage` | 400 | F-018 |
| R11 | POST | `/admin/master-services` | createMasterService | JWT-A | body: `MasterServiceCreate` | 201 `MasterService` | 400, 409, 422 | F-018 |
| R12 | PATCH | `/admin/master-services/{masterServiceId}` | updateMasterService | JWT-A | path: `masterServiceId`; body: `MasterServicePatch` | 200 `MasterService` | 400, 404, 409, 422 | F-018 |
| R13 | GET | `/admin/materials` | listMaterialsAdmin | JWT-A | query: `active`, `q`, `page`, `pageSize` | 200 `MaterialPage` | 400 | F-018 |
| R14 | POST | `/admin/materials` | createMaterial | JWT-A | body: `MaterialCreate` | 201 `Material` | 400, 409, 422 | F-018, F-025 |
| R15 | GET | `/admin/materials/{materialId}` | getMaterialAdmin | JWT-A | path: `materialId` | 200 `Material` | 404 | F-018 |
| R16 | PATCH | `/admin/materials/{materialId}` | updateMaterial | JWT-A | path: `materialId`; body: `MaterialPatch` | 200 `Material` | 400, 404, 409, 422 | F-018, F-025 |
| R17 | GET | `/admin/units` | listUnits | JWT-A | — | 200 `UnitList` | — | F-025 |

### 5.5 Administrator appointments, materials, payments, reports (13)

| # | Method | URI | operationId | Auth | Parameters and body | Success | Errors | REQ |
|---|---|---|---|---|---|---|---|---|
| R18 | GET | `/admin/appointments` | listAppointmentsAdmin | JWT-A | query: `from`, `to`, `masterId`, `status`, `page`, `pageSize` | 200 `AppointmentAdminPage` (staff view, no client token) | 400 | F-019 |
| R19 | POST | `/admin/appointments` | createAppointmentAdmin | JWT-A | body: `AppointmentCreate` | 201 `Appointment` | 400, 409, 422 | F-019, F-002, F-003 |
| R20 | GET | `/admin/appointments/{appointmentId}` | getAppointmentAdmin | JWT-A | path: `appointmentId` | 200 `AppointmentAdmin` | 404 | F-019, F-008, F-028 |
| R21 | PATCH | `/admin/appointments/{appointmentId}` | updateAppointmentAdmin | JWT-A | path: `appointmentId`; body: `AppointmentPatch` | 200 `AppointmentAdmin` | 400, 404, 409, 422 | F-019, F-028 |
| R22 | POST | `/admin/appointments/{appointmentId}/cancel` | cancelAppointmentAdmin | JWT-A | path: `appointmentId`; no body | 200 `AppointmentAdmin` | 404, 409 | F-019, F-030 |
| R23 | POST | `/admin/appointments/{appointmentId}/complete` | completeAppointment | JWT-A | path: `appointmentId`; no body | 200 `AppointmentAdmin` | 404, 409 | F-027 |
| R24 | GET | `/admin/appointments/{appointmentId}/notifications` | listAppointmentNotifications | JWT-A | path: `appointmentId`; query: `page`, `pageSize` | 200 `NotificationPage` | 400, 404 | F-005, F-009, F-010, F-011, F-023, F-029 |
| R25 | GET | `/admin/materials/{materialId}/transactions` | listMaterialTransactions | JWT-A | path: `materialId`; query: `type`, `from`, `to`, `page`, `pageSize` | 200 `MaterialTransactionPage` | 400, 404 | F-020 |
| R26 | POST | `/admin/materials/{materialId}/transactions` | createMaterialTransaction | JWT-A | path: `materialId`; body: `MaterialTransactionCreate` | 201 `MaterialTransaction` | 400, 404, 409, 422 | F-020 |
| R27 | POST | `/admin/appointments/{appointmentId}/payments` | createPayment | JWT-A | path: `appointmentId`; body: `PaymentCreate` | 201 `Payment` | 400, 404, 409, 422 | F-021, F-027 |
| R28 | GET | `/admin/reports/revenue` | getRevenueReport | JWT-A | query: `period` XOR (`from` and `to`) | 200 `RevenueReport` | 400, 422 | F-022 |
| R29 | GET | `/admin/reports/popular-services` | getPopularServicesReport | JWT-A | query: `period` XOR (`from` and `to`) | 200 `PopularServicesReport` | 400, 422 | F-032 |
| R30 | GET | `/admin/reports/stock-levels` | getStockLevelsReport | JWT-A | — (no period by design) | 200 `StockLevelsReport` | 400 | F-033 |

**Count check:** 11 + 2 + 7 + 17 + 13 = **50**.

---

## 6. Terminology review against the glossary (step 1.6)

| Term used | Glossary term | Why |
|---|---|---|
| `Appointment` | Appointment | Exact match; "booking" is rejected as a synonym |
| `Master` | Master | Exact match; "employee" and "stylist" are rejected |
| `Service` | Service | Exact match; "procedure" is rejected |
| `Material` | Material | Exact match; "supply" and "consumable" are rejected |
| `Category` | Category | Exact match; free-form name with three seeds |
| `MasterService` | MasterService | Exact match for the link entity carrying price |
| `Slot` | (availability concept) | Not a stored resource — only `AvailabilitySlot` inside a response |
| `startAt` / `endAt` | — | Chosen over `startsAt`/`endsAt` for consistency with `occurredAt`, `scheduledAt`, `recordedAt` |
| `totalDurationMinutes` | — | Sum of service durations after 30-minute rounding (REQ-F-031) |
| `occupiedDurationMinutes` | — | Rounded block reserved in the calendar; may exceed total duration |
| `totalPrice` | — | Sum of `MasterService.price` snapshots for the booked services |

Review outcome: no term drift from the glossary. Two deliberate additions are
recorded as conventions rather than requirements — `occupiedDurationMinutes`
(needed to express REQ-F-031 in responses) and the `Location` header on 201
(the API-level expression of REQ-F-004's reachable confirmation page).

---

## 7. Open points carried into Part 2

None blocking. The error codes per operation and the JSON schema details are
defined in Part 2 (`error-model.md`, `openapi.yaml`). Any ambiguity discovered
while writing schemas goes to `clarifications.md` (step 14), not into the
contract silently.
