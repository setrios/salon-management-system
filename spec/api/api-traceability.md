# API traceability matrix — Salon Management System

Status: **FINAL** — built in Part 2 (step 2.3), finalised in Part 4 (step 4.1)
after the mock scenarios ran on 2026-10-26. Extended on 2026-11-09 with §6, which
adds a **Test** and a **Code** location per operation delivered by stages S1.1–S1.3
(G1 exit criterion 4, `logs/2026-11-08-implementation-plan.md` §8.3). Extended
again on 2026-11-12 with §6.5–§6.7 for the operations delivered by S2.1–S2.3
(G2 exit criterion 4, same plan section), and on 2026-11-13 with §6.8–§6.10 for
S3.1, S3.2 and S4.1 (G3 exit criterion 4). Sections 1–5 and §6.1–§6.3 are
unchanged by all three extensions.

Links every SRS v1.3 requirement to the operations that expose it, the BDD
scenario that motivated it, and the API scenario that will verify it on the
mock. Columns:

- **Operations** — from `resource-model.md` §5 (`operationId`s).
- **BDD** — SCN id from the SRS traceability matrix; `—` means the SRS has no
  BDD scenario for that requirement.
- **API scenario** — id in `scenarios/positive.md` or `scenarios/negative.md`.
- **Mock** — how the contract is demonstrated: `documented` (served directly),
  `forced` (served with `Prefer: code=…` because the stateless mock has no
  data), `deferred` (needs real state; the next phase), `n/a` (no API surface).

---

## 1. Functional requirements (33)

| REQ | Requirement | Operations | BDD | API scenario | Mock |
|---|---|---|---|---|---|
| REQ-F-001 | Sum of durations and costs | P1, P2, P6, P8, P11, R19, R21 | SCN-01 | POS-01, POS-13 | documented |
| REQ-F-002 | Slot within availability and free | P4, P5, P7, P8, R19 | SCN-01 | POS-01, NEG-08 | documented, forced |
| REQ-F-003 | No approval state | P8 | SCN-01 | POS-01 | documented |
| REQ-F-004 | Confirmation page reachable via link | P8, P9 | SCN-01 | POS-01, POS-23 | documented |
| REQ-F-005 | Exactly one confirmation SMS | P8, R24 | SCN-01 | POS-01 | documented |
| REQ-F-006 | Cancel any time, no fee | P10, R22 | SCN-02 | POS-02 | documented |
| REQ-F-007 | Reschedule any time, no fee or limit | P11, R21 | SCN-03 | POS-03 | documented |
| REQ-F-008 | Reminder times = new time ∓ 24 h / 2 h | P11, R20 | SCN-03 | POS-03, POS-11 | documented |
| REQ-F-009 | Exactly one reschedule SMS | P11, R24 | SCN-03 | POS-03 | documented |
| REQ-F-010 | Skip 24 h reminder if under 24 h | P8, P11, R24 | SCN-04, SCN-05 | POS-04, POS-05 | documented |
| REQ-F-011 | Skip 2 h reminder if under 2 h | P8, P11, R24 | SCN-05 | POS-05 | documented |
| REQ-F-012 | No master self-registration | A1, A2, R2 | — | POS-16 | documented |
| REQ-F-013 | Calendar shows only own appointments | M1 | — | POS-17 | documented |
| REQ-F-014 | Master sees own MasterService records | M2, P6 | — | POS-18 | documented |
| REQ-F-015 | Weekly and date-specific availability | P7, M3, M4 | SCN-09 | POS-09 | documented |
| REQ-F-016 | Disabled channel suppresses notification | M5, M6 | SCN-06 | POS-06 | documented |
| REQ-F-017 | Exactly one administrator login | A1, R2 | — | POS-16 | documented |
| REQ-F-018 | CRUD and deactivate on reference data | R1–R17 | — | POS-19 | documented |
| REQ-F-019 | Administrator changes mirror booking rules | R18–R21 | — | POS-20 | documented |
| REQ-F-020 | Transaction updates stock level | R25, R26 | — | POS-21 | documented |
| REQ-F-021 | No payment before `completed` | R27 | SCN-07 | POS-07, NEG-11 | documented, forced |
| REQ-F-022 | Revenue for preset period or custom range | R28 | SCN-10 | POS-10, NEG-13 | documented |
| REQ-F-023 | Event notifies administrator unless disabled | R24 | SCN-06 | POS-06 | documented |
| REQ-F-024 | Custom category savable, seeds present | P1, P3, R5, R6, R8, R9 | SCN-08 | POS-08 | documented |
| REQ-F-025 | Custom unit savable | R14, R16, R17 | — | POS-22 | documented |
| REQ-F-026 | Toggle one combination only | M6 | SCN-06 | POS-06 | documented |
| REQ-F-027 | `completed` required before payment | R23, R27 | SCN-07 | POS-07 | documented |
| REQ-F-028 | Administrator edit recalculates and notifies | R20, R21 | — | POS-20 | documented |
| REQ-F-029 | Skipped reminder reactivates if future | P11, R24 | SCN-11 | POS-11 | documented |
| REQ-F-030 | Acting administrator not self-notified | R22, R24 | SCN-12 | POS-12 | documented |
| REQ-F-031 | Duration rounds up to 30-minute block | P7, P8, R19, R21 | SCN-13 | POS-13 | documented |
| REQ-F-032 | Popular services ranked by booking count | R29 | SCN-14 | POS-14 | documented |
| REQ-F-033 | Stock-level snapshot without period | R30 | SCN-15 | POS-15 | documented |

## 2. Non-functional requirements (9)

| REQ | Requirement | Operations | BDD | API scenario | Mock |
|---|---|---|---|---|---|
| REQ-NF-001 | Unguessable UUID access token | P8, P9, P10, P11 | — | POS-23, NEG-07 | documented |
| REQ-NF-002 | Responsive UI with usable controls | — | — | — | n/a (UI) |
| REQ-NF-003 | English only | all operations | — | NEG-01…NEG-15 | documented |
| REQ-NF-004 | Amounts in UAH | all `Money` | — | POS-01, POS-07 | documented |
| REQ-NF-005 | No automatic deletion | all resources | — | POS-19 | documented |
| REQ-NF-006 | Data visible only to authorized parties | P9, P10, P11, M1, R20 | — | POS-24, NEG-05 | documented, forced |
| REQ-NF-007 | No location or time-zone selector | — | — | — | n/a (single salon) |
| REQ-NF-008 | No start off a 30-minute boundary | P7, P8, R19, R21 | — | POS-27, NEG-14 | documented |
| REQ-NF-009 | No payment-gateway integration | R27 | — | POS-07 | documented |

**Coverage:** 42/42 requirements mapped. 40 have API surface (33 direct, 7 as
cross-cutting conventions enforced by the contract); 2 are explicitly
not applicable and carry a reason (REQ-NF-002, REQ-NF-007).

---

## 3. Scenario index (executed 2026-10-26)

### 3.1 Positive scenarios

| ID | Purpose | Operation(s) | SCN |
|---|---|---|---|
| POS-01 | Multi-service booking, totals, confirmation link | `createAppointment` | SCN-01 |
| POS-02 | Free cancellation | `cancelAppointmentByToken` | SCN-02 |
| POS-03 | Reschedule recalculates reminders | `rescheduleAppointmentByToken` | SCN-03 |
| POS-04 | 24 h reminder skipped for a late booking | `createAppointment` | SCN-04 |
| POS-05 | Both reminders skipped | `createAppointment` | SCN-05 |
| POS-06 | Toggle one preference, others unchanged | `updateMyNotificationPreference` | SCN-06 |
| POS-07 | Complete then pay | `completeAppointment`, `createPayment` | SCN-07 |
| POS-08 | Service with a custom category | `createService`, `listCategories` | SCN-08 |
| POS-09 | Weekly plus date override | `replaceMyAvailability`, `getMasterAvailability` | SCN-09 |
| POS-10 | Revenue for preset and custom period | `getRevenueReport` | SCN-10 |
| POS-11 | Reschedule reactivates a skipped reminder | `rescheduleAppointmentByToken` | SCN-11 |
| POS-12 | Admin cancellation, master still notified | `cancelAppointmentAdmin` | SCN-12 |
| POS-13 | 75-minute total rounds to 90 | `getMasterAvailability`, `createAppointment` | SCN-13 |
| POS-14 | Popular services ranking | `getPopularServicesReport` | SCN-14 |
| POS-15 | Period-independent stock snapshot | `getStockLevelsReport` | SCN-15 |
| POS-16 | Administrator creates a master account | `createMaster`, `login` | — |
| POS-17 | Master sees only own appointments | `listMyAppointments` | — |
| POS-18 | Master sees only own service links | `listMyServices` | — |
| POS-19 | Reference data CRUD and deactivation | `createService`, `updateService` | — |
| POS-20 | Admin appointment edit recalculates | `updateAppointmentAdmin` | — |
| POS-21 | Stock receipt and issue | `createMaterialTransaction` | — |
| POS-22 | Custom unit on a material | `createMaterial`, `listUnits` | — |
| POS-23 | Token-based read of own appointment | `getAppointmentByToken` | — |
| POS-24 | Staff views never expose the client token | `listMyAppointments`, `getAppointmentAdmin` | — |
| POS-25 | Amounts are UAH minor units | `getRevenueReport` | — |
| POS-26 | Weekly and date rules round-trip | `replaceMyAvailability` | — |
| POS-27 | Slot starts on a 30-minute boundary | `getMasterAvailability` | — |

### 3.2 Negative scenarios

| ID | Purpose | Operation(s) | Expected |
|---|---|---|---|
| NEG-01 | Missing required field | `createAppointment` | 422 `VALIDATION_ERROR` |
| NEG-02 | Unparsable JSON | `createAppointment` | 400 `MALFORMED_REQUEST` |
| NEG-03 | Wrong query type | `listServices` | 400 `MALFORMED_REQUEST` |
| NEG-04 | No bearer token | `listAppointmentsAdmin` | 401 `UNAUTHENTICATED` |
| NEG-05 | Master calls an admin endpoint | `listMastersAdmin` | 403 `FORBIDDEN` |
| NEG-06 | Unknown service id | `getService` | 404 `NOT_FOUND` |
| NEG-07 | Unknown appointment token | `getAppointmentByToken` | 404 `NOT_FOUND` |
| NEG-08 | Slot already booked | `createAppointment` | 409 `SLOT_UNAVAILABLE` |
| NEG-09 | Duplicate master username | `createMaster` | 409 `DUPLICATE_RESOURCE` |
| NEG-10 | Edit a cancelled appointment | `updateAppointmentAdmin` | 409 `INVALID_STATE_TRANSITION` |
| NEG-11 | Payment before completion | `createPayment` | 409 `APPOINTMENT_NOT_COMPLETED` |
| NEG-12 | Issue more than stock | `createMaterialTransaction` | 409 `MATERIAL_STOCK_INSUFFICIENT` |
| NEG-13 | Period and range together | `getRevenueReport` | 422 `INVALID_PERIOD` |
| NEG-14 | Start off the 30-minute boundary | `getMasterAvailability` | 422 `BUSINESS_RULE_VIOLATION` |
| NEG-15 | Non-JSON content type | `createAppointment` | 415 `UNSUPPORTED_MEDIA_TYPE` |
| NEG-16 | Unsupported method on a path | `updateService` | 405 `METHOD_NOT_ALLOWED` |
| NEG-17 | Unknown body property (D22) | `createAppointment` | 422 `VALIDATION_ERROR` (`UNKNOWN_FIELD`) |

---

## 4. Gaps and dispositions

| Gap | Disposition |
|---|---|
| SCN-01…SCN-15 are UI-shaped BDD scenarios; they describe behaviour, not HTTP | Each is re-expressed as an API scenario in Part 3 against the mock |
| REQ-F-012, F-017, F-018…F-020, F-028 have no BDD scenario | Covered by dedicated API scenarios POS-16, POS-19…POS-21 |
| Stateless mock cannot hold appointments, stock or payments | Such scenarios use `Prefer: code=…` (`forced`) and are marked as contract-shape evidence only; behaviour is verified in the next phase |
| Two codes share one status on `createPayment` (409) | Only `APPOINTMENT_NOT_COMPLETED` is documented as the 409 example; `PAYMENT_ALREADY_RECORDED` stays in the catalog and is demonstrated in the next phase |
| `BusinessRuleViolation` and `ValidationFailed` are both 422 | Each operation documents the one example most characteristic for it; scenarios target that operation accordingly |

---

## 5. Verification results (2026-10-26)

| Evidence | Result |
|---|---|
| `validation-report.txt` (Redocly, recommended ruleset) | 0 errors, 0 warnings |
| `npm run bundle` | `dist/openapi.yaml` produced, all `$ref`s resolved |
| `scenarios/results/positive-results.txt` | 104 assertions, 0 failed (27 scenarios) |
| `scenarios/results/negative-results.txt` | 39 assertions, 0 failed (17 scenarios) |

Every requirement marked `documented` is verified by a positive scenario that
read the served response and checked its fields. Every requirement marked
`forced` is additionally verified by a negative scenario that forced the
documented failure with `Prefer: code=…` and checked status, media type and
`code`. Requirements marked `n/a` have no API surface and state the reason.

Three contract defects were found and fixed during execution, not after:

1. `VALIDATION_ERROR` moved from 400 to 422, because Prism returns 422 for
   request-body violations (spike Q4).
2. `additionalProperties: false` added to 19 input schemas, without which D22
   would be unenforced and NEG-02 would have passed vacuously.
3. Two documented examples were aligned with the scenarios that exercise them
   (`updateService` deactivation, `getMyAvailability` round-trip); both had
   initially failed for exactly that reason.

Remaining non-reproducible cases (malformed JSON hang, role-based 403,
data/state-dependent 404 and 409, Prism-owned 405 body) are listed in
`scenarios/negative.md` and in the gate record. None of them is claimed as
verified; all are deferred to the next phase.

---

## 6. Test and Code locations for the operations delivered by S1.1–S1.3, S2.1–S2.3 and S3.1

G1 exit criterion 4 (`logs/2026-11-08-implementation-plan.md` §8.3) requires this
file to name a **Test** and a **Code** location for every operation the gate's
stages delivered. This section is that record. It adds two columns and does not
restate any row of §1–§5.

**Shape of a Test entry:** the test file and the `it` title that carries the
operation's primary behaviour — the one a reader should open first. Every one of
these operations has further assertions beside it (validation, refusals,
role matrix); the file is the unit that matters, and the title is the entry
point. A name without a line number is deliberate: `it` titles are stable, line
numbers are not.

**Shape of a Code entry:** the route module that declares the operation. The
storage half of each module is its sibling `service.ts`, and shared transport is
`src/modules/reference-data/http.ts`; those are cited once below rather than
repeated in 32 rows.

### 6.1 S1.1 — authentication (SMS-21 → SMS-22)

| Operation | Method and path | Test | Code |
|---|---|---|---|
| `login` | `POST /auth/login` | `tests/api/auth.test.ts` — "issues an administrator token with role admin" | `src/modules/auth/routes.ts` |
| `getCurrentPrincipal` | `GET /auth/me` | `tests/api/auth.test.ts` — "authorises GET /auth/me with the issued token" | `src/modules/auth/routes.ts` |

### 6.2 S1.2 — administrator reference data (SMS-14 → SMS-23)

| Operation | Method and path | Test | Code |
|---|---|---|---|
| `listMastersAdmin` (R1) | `GET /admin/masters` | `tests/api/reference-data.test.ts` — "R1 lists masters as a MasterAdminPage containing the created account" | `src/modules/masters/routes.ts` |
| `createMaster` (R2) | `POST /admin/masters` | `tests/api/reference-data.test.ts` — "R2 creates a master and returns the 201 Master shape with a Location" | `src/modules/masters/routes.ts` |
| `getMasterAdmin` (R3) | `GET /admin/masters/{masterId}` | `tests/api/reference-data.test.ts` — "R3 returns one master by id" | `src/modules/masters/routes.ts` |
| `updateMaster` (R4) | `PATCH /admin/masters/{masterId}` | `tests/api/reference-data.test.ts` — "R4 changes fullName and deactivates through active:false, never deletes" | `src/modules/masters/routes.ts` |
| `listServicesAdmin` (R5) | `GET /admin/services` | `tests/api/reference-data.test.ts` — "R5 lists services as a ServicePage and filters by category" | `src/modules/catalog/routes.ts` |
| `createService` (R6) | `POST /admin/services` | `tests/api/reference-data.test.ts` — "SCN-08 saves a service with a category outside the seeds" | `src/modules/catalog/routes.ts` |
| `getServiceAdmin` (R7) | `GET /admin/services/{serviceId}` | `tests/api/reference-data.test.ts` — "R7 returns one service and answers an unknown id with 404" | `src/modules/catalog/routes.ts` |
| `updateService` (R8) | `PATCH /admin/services/{serviceId}` | `tests/api/reference-data.test.ts` — "R8 deactivates a service through active:false (REQ-F-018, POS-19)" | `src/modules/catalog/routes.ts` |
| `listCategoriesAdmin` (R9) | `GET /admin/categories` | `tests/api/reference-data.test.ts` — "R9 lists the same categories for the administrator" | `src/modules/catalog/routes.ts` |
| `listMasterServicesAdmin` (R10) | `GET /admin/master-services` | `tests/api/reference-data.test.ts` — "R10 lists links and filters by masterId and serviceId" | `src/modules/master-services/routes.ts` |
| `createMasterService` (R11) | `POST /admin/master-services` | `tests/api/reference-data.test.ts` — "R11 links a service to a master with a price" | `src/modules/master-services/routes.ts` |
| `updateMasterService` (R12) | `PATCH /admin/master-services/{masterServiceId}` | `tests/api/reference-data.test.ts` — "R12 updates the price and deactivates the link" | `src/modules/master-services/routes.ts` |
| `listMaterialsAdmin` (R13) | `GET /admin/materials` | `tests/api/reference-data.test.ts` — "R13 lists materials and filters by q and active" | `src/modules/materials/routes.ts` |
| `createMaterial` (R14) | `POST /admin/materials` | `tests/api/reference-data.test.ts` — "R14 creates a material with the initial stock as stockQuantity" | `src/modules/materials/routes.ts` |
| `getMaterialAdmin` (R15) | `GET /admin/materials/{materialId}` | `tests/api/reference-data.test.ts` — "R15 returns one material and answers an unknown id with 404" | `src/modules/materials/routes.ts` |
| `updateMaterial` (R16) | `PATCH /admin/materials/{materialId}` | `tests/api/reference-data.test.ts` — "R16 renames, changes the unit and deactivates a material" | `src/modules/materials/routes.ts` |
| `listUnits` (R17) | `GET /admin/units` | `tests/api/reference-data.test.ts` — "R17 lists the five standard units and the custom units in use" | `src/modules/units/routes.ts` |

### 6.3 S1.3 — availability (SMS-15 → SMS-24)

| Operation | Method and path | Test | Code |
|---|---|---|---|
| `getMasterAvailability` (P7) | `GET /masters/{masterId}/availability` | `tests/api/availability.test.ts` — "offers a slot at every 30-minute start that a 90-minute block still fits in" | `src/modules/availability/routes.ts` |
| `getMyAvailability` (M3) | `GET /me/availability` | `tests/api/availability.test.ts` — "M3 answers 200 for the owning master" | `src/modules/availability/routes.ts` |
| `replaceMyAvailability` (M4) | `PUT /me/availability` | `tests/api/availability.test.ts` — "replaces the previous set: a second PUT leaves only what it sent" | `src/modules/availability/routes.ts` |

### 6.4 Count, and what the two columns do not say

**33 operations**, one per row: 2 from S1.1, 17 from S1.2, 3 from S1.3, 7 from
S2.1, 2 from S2.2, 1 from S2.3, 1 from S3.1. That is the set the gates S1.1–S1.3,
S2 and S3.1 delivered; the remaining 17 of the contract's 50 have no row here yet
and belong to later gates (S3.2 onwards), as the plan's stage table assigns them.

The **Test** column points at the assertion that states the operation's normal
behaviour. It does not enumerate negatives: each of the 33 also has refusals
asserted in the same file (400/401/403/404/409/415/422 as the contract declares
them), and §2 of each TEST-GATE record is the place those are counted. A row here
is "this operation is tested", not "this operation is tested exhaustively".

### 6.5 S2.1 — booking and the public catalogue (SMS-8, SMS-19, SMS-25 → SMS-25)

| Operation | Method and path | Test | Code |
|---|---|---|---|
| `listServices` (P1) | `GET /services` | `tests/api/public-catalogue.test.ts` — "lists an active service with its duration and category" | `src/modules/public/routes.ts` |
| `getService` (P2) | `GET /services/{serviceId}` | `tests/api/public-catalogue.test.ts` — "returns one service by id" | `src/modules/public/routes.ts` |
| `listCategories` (P3) | `GET /categories` | `tests/api/public-catalogue.test.ts` — "lists the three seeds as seeded and a saved custom category as not" | `src/modules/public/routes.ts` |
| `listMasters` (P4) | `GET /masters` | `tests/api/public-catalogue.test.ts` — "lists a master with an id and a full name and nothing else" | `src/modules/public/routes.ts` |
| `getMaster` (P5) | `GET /masters/{masterId}` | `tests/api/public-catalogue.test.ts` — "returns the public representation of a master" | `src/modules/public/routes.ts` |
| `listMasterServices` (P6) | `GET /masters/{masterId}/services` | `tests/api/public-catalogue.test.ts` — "lists an active link with its price" | `src/modules/public/routes.ts` |
| `createAppointment` (P8) | `POST /appointments` | `tests/api/booking.test.ts` — "answers 201 with status confirmed: there is no approval state" | `src/modules/appointments/routes.ts` |

### 6.6 S2.2 — confirmation page and SMS (SMS-26 → SMS-26)

| Operation | Method and path | Test | Code |
|---|---|---|---|
| `getAppointmentByToken` (P9) | `GET /appointments/{token}` | `tests/api/confirmation.test.ts` — "C1 returns the appointment P8 created, with the same fields" | `src/modules/appointments/routes.ts` |
| `listAppointmentNotifications` (R24) | `GET /admin/appointments/{appointmentId}/notifications` | `tests/api/notification.test.ts` — "N1 records exactly one client SMS with eventType new and status sent" | `src/modules/notifications/routes.ts` |

### 6.7 S2.3 — client cancellation (SMS-27 → SMS-27)

| Operation | Method and path | Test | Code |
|---|---|---|---|
| `cancelAppointmentByToken` (P10) | `POST /appointments/{token}/cancel` | `tests/api/cancellation.test.ts` — "K1 cancels a confirmed appointment: 200, status cancelled, everything else kept" | `src/modules/appointments/routes.ts` |

The **Code** column points at the module that declares the operation. Behaviour
is split between that file and its `service.ts`, and a few shared pieces sit
elsewhere: `src/modules/reference-data/http.ts` (response validation, pagination,
`Location`, 409 mapping), `src/lib/availability.ts` and `src/lib/time.ts` (P7's
arithmetic and Kyiv offsets), `src/middleware/{validate,auth,authorize}.ts`
(contract validation, bearer token, role gate), `src/modules/availability/rules.ts`
(the window rule). Naming one file per row keeps the table readable; naming all
of them would turn each row into a dependency list.

### 6.8 S3.1 — client reschedule (SMS-10 → SMS-28)

| Operation | Method and path | Test | Code |
|---|---|---|---|
| `rescheduleAppointmentByToken` (P11) | `POST /appointments/{token}/reschedule` | `tests/api/reschedule.test.ts` — "R1 moves a confirmed appointment to a free slot and records one reschedule SMS" | `src/modules/appointments/routes.ts` |

### 6.9 S3.2 — reminder engine (SMS-11, SMS-17 → SMS-29)

S3.2 adds **no operation**. It changes what four existing ones write and read:
P8 and P11 write the two reminder rows, P9 and R24 dispatch a due one. The rows
are asserted in `tests/api/reminders.test.ts`, and the operations themselves keep
the rows §6.5–§6.8 already give them.

| Behaviour | Operation | Test |
|---|---|---|
| the two rows a booking writes | `createAppointment` (P8) | `tests/api/reminders.test.ts` — "R1 records two scheduled rows when the booking is far enough ahead" |
| the skip rules | `createAppointment` (P8) | "R2 … under 24 hours ahead (SCN-04)", "R3 … under two hours ahead (SCN-05)" |
| the dispatch on read | `getAppointmentByToken` (P9) | "R4 turns a due reminder into sent on the next read" |
| the dispatch on the page | `listAppointmentNotifications` (R24) | "R6 dispatches on R24 and shows sentAt" |
| the reactivation | `rescheduleAppointmentByToken` (P11) | "R7 reactivates a skipped 24 h reminder when the new time is far enough ahead (SCN-11)" |

### 6.10 S4.1 — notification service (SMS-12 → SMS-30)

S4.1 adds three operations and the service behind them.

| Operation | Test | Code |
|---|---|---|
| `getMyNotificationPreferences` (M5) | `tests/api/notification-preferences.test.ts` — P1, P2, P9 | `src/modules/notifications/routes.ts` (`getMyNotificationPreferencesHandler`), `src/modules/notifications/service.ts` (`readPreferences`), `src/modules/notifications/preferences.ts` (`preferenceViews`) |
| `updateMyNotificationPreference` (M6) | `tests/api/notification-preferences.test.ts` — P3–P8 | `src/modules/notifications/routes.ts` (`updateMyNotificationPreferenceHandler`), `src/modules/notifications/service.ts` (`setPreference`), `src/db/schema.ts` (`notificationPreferences`) |
| `listMyNotifications` (M7) | `tests/api/my-notifications.test.ts` — N1–N8 | `src/modules/notifications/routes.ts` (`listMyNotificationsHandler`), `src/modules/notifications/service.ts` (`listMyNotifications`) |

The rows the three operations read and write are written by
`recordAppointmentEvent` (`src/modules/notifications/service.ts`), called from
P8, P10 and P11; that behaviour is asserted in
`tests/api/notification-preferences.test.ts` P10–P13.

**REQ-F-030 is not asserted here.** The suppression is implemented — the
`actor !== 'admin'` guard in `recordAppointmentEvent` — but it has no operation
to drive it until R21 arrives in S5.1. SMS-18 carries the test there, and the
gate's §5 records the carry-forward.

### 6.11 S4.2 — the master's own calendar and own services (SMS-31)

S4.2 adds the two operations that give a master their own data.

| Operation | Test | Code |
|---|---|---|
| `listMyAppointments` (M1) | `tests/api/master-calendar.test.ts` — A1–A10 | `src/modules/appointments/routes.ts` (`listMyAppointmentsHandler`), `src/modules/appointments/service.ts` (`listMyAppointments`), `src/modules/appointments/staff-view.ts` (`staffBody`) |
| `listMyServices` (M2) | `tests/api/master-calendar.test.ts` — B1–B5 | `src/modules/master-services/routes.ts` (`listMyServicesHandler`), `src/modules/master-services/service.ts` (`listLinks`) |

**REQ-F-013 and REQ-F-014 are asserted by this stage.** A1 is the AC verbatim —
a master's calendar contains only that master's appointments — and B1 is
REQ-F-014's: the list matches exactly the caller's `MasterService` records.

**The staff view is a subtraction, not a copy.** `staffBody` removes
`accessToken` and `confirmationUrl` from `appointmentBody` (D18, REQ-NF-006); A2
asserts the absence *and* that the client's own response still has both, so the
test fails if the fields are simply renamed or if the shared literal stops
carrying them.

**What this section is for.** Criterion 4 is a file-path criterion, not a
judgement: a reader who doubts that `updateMasterService` is delivered can open
the named test and the named module and see both. Nothing here replaces the
suite: `npm test` is criterion 1, and this table is not evidence that the tests
pass — it is evidence that each operation has somewhere to look.

### 6.12 S5.1a — administrator reads and creates (SMS-21 → SMS-32)

S5.1a adds three operations that give the administrator control and visibility
over appointments.

| Operation | Test | Code |
|---|---|---|
| `createAppointmentAdmin` (R19) | `tests/api/admin-appointments.test.ts` — C1–C4 | `src/modules/appointments/admin.ts` (`createAppointmentAdminHandler`), `src/modules/appointments/routes.ts` (`bookAppointment`), `src/modules/appointments/service.ts` (`createAppointment`) |
| `listAppointmentsAdmin` (R20) | `tests/api/admin-appointments.test.ts` — L1–L4 | `src/modules/appointments/admin.ts` (`listAppointmentsAdminHandler`), `src/modules/appointments/service.ts` (`listAppointmentsAdmin`), `src/modules/appointments/staff-view.ts` (`staffBody`) |
| `getAppointmentAdmin` | `tests/api/admin-appointments.test.ts` — G1–G2 | `src/modules/appointments/admin.ts` (`getAppointmentAdminHandler`, `loadAppointmentAdmin`), `src/modules/appointments/service.ts` (`loadAppointmentById`, `findById`), `src/modules/appointments/staff-view.ts` (`staffBody`) |

**REQ-F-019 and REQ-F-020 are delivered by this stage.** R19 reuses P8's booking
machinery with no own rules (K2); R20 provides the cross-master schedule with
date, master, and status filters in staff representation (K9, J2).

**REQ-F-030 on creation is asserted.** C1 asserts that the administrator creating
an appointment receives no notification row, while the client and the master
receive theirs (K5). The remaining SMS-18 suite across R21 and R22 belongs to S5.1b.
