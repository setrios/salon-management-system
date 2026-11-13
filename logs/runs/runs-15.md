# Control run — S5.3 appointment payments (SMS-34)

| | |
|---|---|
| Stage | S5.3 — R27 `createPayment`; `AppointmentAdmin.payment` |
| Ticket | SMS-34 (Test: SMS-13) |
| Gate | G4 (SMS-7) |
| Date | 2026-11-13 |
| Artifact | `dist/` — the built output, not the sources |
| Script | `logs/runtime/s53-control-run.mjs` (git-ignored) |
| Result | **26/26 checks passed** |

---

## 1. What was run, and how

```
$ npm run build
  schemas:    58
  operations: 50
  copy-contract: src/contract/openapi.json -> dist/src/contract/openapi.json

$ node --env-file-if-exists=.env logs/runtime/s53-control-run.mjs
```

The script loads `dist/src/app.js`, calls **`createApp()` with no argument** (D9)
and drives the application over a real socket on an ephemeral port. The database
is a scratch one, `salon_s53_control_test`, created before the run, migrated from
`src/db/migrations` (including `0007_payments.sql`) and dropped afterwards.

The run uses the real clock. One check asserts it: the payment's `recordedAt` is
within two minutes of the instant the request was sent — the field is the
application's `now`, not the appointment's or the database's default.

## 2. The checks

```
scratch database created: salon_s53_control_test

--- R27 POST /admin/appointments/{id}/payments ---
PASS  R27 leaves a completed appointment without a payment
PASS  R27 answers 201 with the Payment shape
PASS  R27 sets no Location header (N3)
PASS  R27 records the money at the run’s clock
PASS  R27 makes the payment visible in the staff view (N2)
PASS  R27 does not move the appointment (N6)

--- D12: one payment, immutable ---
PASS  R27 answers 409 PAYMENT_ALREADY_RECORDED
PASS  R27 keeps the first payment unchanged
PASS  R27 has no method to change a payment: PATCH is 405

--- REQ-F-021: completed first ---
PASS  R27 refuses a confirmed appointment with 409 APPOINTMENT_NOT_COMPLETED
PASS  R27 names the rule in the refusal (error-model.md §5.5)
PASS  R27 wrote nothing for the refusal
PASS  R27 refuses a cancelled appointment with the same 409

--- N1, N4: amount and status ---
PASS  R27 defaults status to paid
PASS  R27 records an unpaid payment
PASS  R27 accepts the contract’s minimum amount (0)
PASS  R27 accepts an amount above the total (N1)

--- The contract’s body ---
PASS  R27 answers 422 for each body the contract closes
PASS  R27 answers 400 for no body at all
PASS  R27 answers 415 for a wrong media type
PASS  R27 wrote nothing for any refusal

--- Guards ---
PASS  R27 answers 404 for an unknown appointment
PASS  R27 answers 400 for a non-uuid id
PASS  R27 answers 401 without auth
PASS  R27 answers 403 for a master

--- One payment per appointment ---
PASS  R27 gives each appointment its own payment

ALL CHECKS PASSED

scratch database dropped: salon_s53_control_test
log trimmed to this run: 52 records in /home/novell/Documents/VScode-projects/pis/salon-management-system/logs/runtime/app-2026-11-13.jsonl
```

### 2.1 What the checks establish

- **REQ-F-021's recording.** A payment on a completed appointment answers 201
  with `Payment`'s shape, the money at the run's clock, and no `Location` (N3).
- **N2 and N6.** The staff view then carries the payment, while the appointment's
  `status` stays `completed` and its `updatedAt` does not move: money is a row of
  its own, not a change to the booking.
- **D12.** A second payment is 409 `PAYMENT_ALREADY_RECORDED` and the first row
  is untouched; `PATCH` on the payments path is 405, because the contract has no
  operation that changes a payment.
- **REQ-F-027's precondition.** A `confirmed` appointment is 409
  `APPOINTMENT_NOT_COMPLETED` with `error-model.md` §5.5's sentence and nothing
  written; a `cancelled` one answers the same.
- **N1 and N4.** `status` defaults to `paid`, `unpaid` is recorded, `0` and an
  amount above the total are both accepted.
- **The body and the guards.** Seven closed-body violations are 422, no body is
  400, a wrong media type is 415, and 404/400/401/403 are as declared.
- **Per-appointment cardinality.** Two completed appointments each get their own
  payment; the view of one never shows the other's.

## 3. The requests

The run made **52 requests** in total:

| # | Request | Status |
|---|---|---|
| 1 | `POST /api/v1/auth/login` | 200 |
| 2 | `POST /api/v1/auth/login` | 200 |
| 3 | `POST /api/v1/admin/services` | 201 |
| 4 | `POST /api/v1/admin/master-services` | 201 |
| 5 | `PUT /api/v1/me/availability` | 200 |
| 6 | `POST /api/v1/admin/appointments` | 201 |
| 7 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 8 | `GET /api/v1/admin/appointments/{appointmentId}` | 200 |
| 9 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 10 | `GET /api/v1/admin/appointments/{appointmentId}` | 200 |
| 11 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 409 |
| 12 | `GET /api/v1/admin/appointments/{appointmentId}` | 200 |
| 13 | `PATCH /api/v1/admin/appointments/{appointmentId}/payments` | 405 |
| 14 | `POST /api/v1/admin/appointments` | 201 |
| 15 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 409 |
| 16 | `GET /api/v1/admin/appointments/{appointmentId}` | 200 |
| 17 | `POST /api/v1/admin/appointments` | 201 |
| 18 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 200 |
| 19 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 409 |
| 20 | `POST /api/v1/admin/appointments` | 201 |
| 21 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 22 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 23 | `POST /api/v1/admin/appointments` | 201 |
| 24 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 25 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 26 | `POST /api/v1/admin/appointments` | 201 |
| 27 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 28 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 29 | `POST /api/v1/admin/appointments` | 201 |
| 30 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 31 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 32 | `POST /api/v1/admin/appointments` | 201 |
| 33 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 34 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 422 |
| 35 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 422 |
| 36 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 422 |
| 37 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 422 |
| 38 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 422 |
| 39 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 422 |
| 40 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 422 |
| 41 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 400 |
| 42 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 415 |
| 43 | `GET /api/v1/admin/appointments/{appointmentId}` | 200 |
| 44 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 404 |
| 45 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 400 |
| 46 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 401 |
| 47 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 403 |
| 48 | `POST /api/v1/admin/appointments` | 201 |
| 49 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 50 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 51 | `GET /api/v1/admin/appointments/{appointmentId}` | 200 |
| 52 | `GET /api/v1/admin/appointments/{appointmentId}` | 200 |

## 4. Defects

**None in the application.** All 26 checks passed on the compiled artifact. The
one implementation-side correction of the stage is in the code, not the tests:
`appointmentBody` first spread the payment without nesting `amount`, so the
response validator refused the body; `paymentBody` now maps it once for both R27
and the appointment view, and the suite turned red before the fix.

## 5. The log records

The run wrote **52 records** to `logs/runtime/app-2026-11-13.jsonl`; the file was
trimmed to this run's records afterwards.

## 6. What the run does not cover

- **Revenue aggregation.** Sums and per-method counts are S5.4's.
- **`notificationsSummary`** (N7).
- **Concurrency.** The unique constraint on `appointment_id` is the backstop; the
  run issues one request at a time.
- **Editing or deleting a payment.** No such operation exists (D12).
