# API traceability matrix — Salon Management System

Status: **FINAL** — built in Part 2 (step 2.3), finalised in Part 4 (step 4.1)
after the mock scenarios ran on 2026-10-26.

Links every SRS v1.3 requirement to the operations that expose it, the BDD
scenario that motivated it, and the API scenario that will verify it on the
mock. Columns:

- **Operations** — from `resource-model.md` §5 (`operationId`s).
- **BDD** — SCN id from the SRS traceability matrix; `—` means the SRS has no
  BDD scenario for that requirement.
- **API scenario** — id in `scenarios/positive.md` or `scenarios/negative.md`.
- **Mock** — how the contract is demonstrated: `documented` (served directly),
  `forced` (served with `Prefer: code=…` because the stateless mock has no
  data), `deferred` (needs real state; Lab 5), `n/a` (no API surface).

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
| Stateless mock cannot hold appointments, stock or payments | Such scenarios use `Prefer: code=…` (`forced`) and are marked as contract-shape evidence only; behaviour is verified in Lab 5 |
| Two codes share one status on `createPayment` (409) | Only `APPOINTMENT_NOT_COMPLETED` is documented as the 409 example; `PAYMENT_ALREADY_RECORDED` stays in the catalog and is demonstrated in Lab 5 |
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
verified; all are deferred to Lab 5.
