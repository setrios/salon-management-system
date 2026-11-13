# Control run — S5.1b administrator appointment actions (SMS-32)

| | |
|---|---|
| Stage | S5.1b — R21 `updateAppointmentAdmin`, R22 `cancelAppointmentAdmin`, R23 `completeAppointment` |
| Ticket | SMS-32 (and SMS-18 for REQ-F-030) |
| Gate | G4 (SMS-7) |
| Date | 2026-11-13 |
| Artifact | `dist/` — the built output, not the sources |
| Script | `logs/runtime/s51b-control-run.mjs` (git-ignored) |
| Result | **38/38 checks passed** |

---

## 1. What was run, and how

```
$ npm run build
  converted .../spec/api/openapi.yaml -> .../src/contract/openapi.json
  schemas:    58
  operations: 50
  copy-contract: src/contract/openapi.json -> dist/src/contract/openapi.json

$ node --env-file-if-exists=.env logs/runtime/s51b-control-run.mjs
```

The script loads `dist/src/app.js` and calls **`createApp()` with no argument** —
the shape `index.ts` uses (D9) — then drives the application over a real socket
on an ephemeral port.

Two arrangements:

- **A scratch database.** `salon_s51b_control_test` is created before the run and
  dropped after it, so neither the development database nor the suite's `_test`
  database is touched. Migrations run against it from scratch.
- **The real clock.** `createApp()` takes no argument here, so the run's "now" is
  the wall clock. All booking times are four and five days ahead, so no record is
  past and every reminder is `scheduled`; the past-start check uses a time one
  day behind the wall clock. Every other value is the application's own.

## 2. The checks

```
scratch database created: salon_s51b_control_test

--- R21 PATCH /admin/appointments/{id} — the time ---
PASS  R21 answers 200 with the staff representation
PASS  R21 moves startAt and endAt
PASS  R21 recalculates both reminder moments (REQ-F-028)
PASS  R21 writes exactly one client reschedule row (REQ-F-009)
PASS  R21 does not notify the acting administrator but does notify the master (REQ-F-030)

--- R21 — the master ---
PASS  R21 changes the master
PASS  R21 re-prices from the new master link (G8)
PASS  R21 master change writes the client reschedule row (L1)

--- R21 — the service set ---
PASS  R21 recalculates duration, block, endAt and price (L4)
PASS  R21 service-set change writes no event (L4)

--- R21 — the client ---
PASS  R21 corrects the client and keeps the time (K4)
PASS  R21 client-only patch writes no event (K4)

--- R21 — refusals ---
PASS  R21 answers 422 BUSINESS_RULE_VIOLATION off the boundary (L3)
PASS  R21 answers 422 for a start in the past (CL-11)
PASS  R21 answers 409 SLOT_UNAVAILABLE for a taken block
PASS  R21 answers 404 for an unknown id
PASS  R21 answers 400 for a non-uuid id
PASS  R21 answers 422 for an empty patch
PASS  R21 answers 401 without auth
PASS  R21 answers 403 for a master

--- R22 POST /admin/appointments/{id}/cancel ---
PASS  R22 answers 200 with status cancelled
PASS  R22 does not notify the administrator but does notify the master (REQ-F-030)
PASS  R22 writes no client cancellation row
PASS  R22 keeps the reminder rows (L2)
PASS  R22 answers 200 without a write on an already cancelled record

--- R23 POST /admin/appointments/{id}/complete ---
PASS  R23 answers 200 with status completed (REQ-F-027)
PASS  R23 writes no event (K6)
PASS  R23 keeps the reminder rows (L6)
PASS  R23 answers 200 without a write on an already completed record

--- The state table (error-model.md §3.1) ---
PASS  R21 answers 409 INVALID_STATE_TRANSITION on a completed record
PASS  R22 answers 409 INVALID_STATE_TRANSITION on a completed record
PASS  R23 answers 409 INVALID_STATE_TRANSITION on a cancelled record

--- R22 / R23 — refusals and guards ---
PASS  R22 answers 404 for an unknown id
PASS  R22 answers 404 for a non-uuid id
PASS  R23 answers 404 for an unknown id
PASS  R23 answers 404 for a non-uuid id
PASS  R22 answers 401 without auth and 403 for a master
PASS  R23 answers 401 without auth and 403 for a master

ALL CHECKS PASSED

scratch database dropped: salon_s51b_control_test
log trimmed to this run: 56 records in /home/novell/Documents/VScode-projects/pis/salon-management-system/logs/runtime/app-2026-11-13.jsonl
```

### 2.1 What the checks establish

- **R21 moves the record** and recalculates both reminder moments from the new
  start (REQ-F-028 through REQ-F-008), with exactly one client `reschedule` row
  and none for the acting administrator (REQ-F-030).
- **R21 changes the master**, re-prices the line from the new master's link
  (G8, L1) and writes the reschedule row for the client.
- **R21 changes the service set** and recalculates duration, block, `endAt` and
  price (REQ-F-001, REQ-F-031, L4); the message records are identical before and
  after, so that alone is not an event.
- **R21 corrects the client** without touching the time and without an event (K4).
- **R21's refusals**: 422 for an off-boundary start (L3), 422 for a past start
  (CL-11), 409 `SLOT_UNAVAILABLE` for a taken block, 404 for an unknown id, 400
  for a non-uuid id, 422 for `{}`, 401 and 403.
- **R22 cancels**: 200 in staff representation, no administrator row, the
  master's cancellation rows, no client cancellation row, the reminder rows kept
  (L2), and a repeat answers 200 without a write (`updatedAt` unchanged).
- **R23 completes**: 200, no event rows at all (K6), the reminder rows kept (L6),
  and a repeat answers 200 without a write.
- **The state table** (`error-model.md` §3.1): R21 and R22 answer 409 on a
  completed record; R23 answers 409 on a cancelled one.
- **R22 and R23's guards**: 404 for unknown and non-uuid ids (they declare no
  400), 401 without credentials and 403 for a master.

## 3. The requests

The run made **56 requests** in total:

| # | Request | Status |
|---|---|---|
| 1 | `POST /api/v1/auth/login` | 200 |
| 2 | `POST /api/v1/auth/login` | 200 |
| 3 | `POST /api/v1/auth/login` | 200 |
| 4 | `POST /api/v1/admin/services` | 201 |
| 5 | `POST /api/v1/admin/services` | 201 |
| 6 | `POST /api/v1/admin/master-services` | 201 |
| 7 | `POST /api/v1/admin/master-services` | 201 |
| 8 | `POST /api/v1/admin/master-services` | 201 |
| 9 | `PUT /api/v1/me/availability` | 200 |
| 10 | `PUT /api/v1/me/availability` | 200 |
| 11 | `POST /api/v1/admin/appointments` | 201 |
| 12 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 13 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 200 |
| 14 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 15 | `POST /api/v1/admin/appointments` | 201 |
| 16 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 200 |
| 17 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 18 | `POST /api/v1/admin/appointments` | 201 |
| 19 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 20 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 200 |
| 21 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 22 | `POST /api/v1/admin/appointments` | 201 |
| 23 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 24 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 200 |
| 25 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 26 | `POST /api/v1/admin/appointments` | 201 |
| 27 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 422 |
| 28 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 422 |
| 29 | `POST /api/v1/admin/appointments` | 201 |
| 30 | `POST /api/v1/admin/appointments` | 201 |
| 31 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 409 |
| 32 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 404 |
| 33 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 400 |
| 34 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 422 |
| 35 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 401 |
| 36 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 403 |
| 37 | `POST /api/v1/admin/appointments` | 201 |
| 38 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 200 |
| 39 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 40 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 200 |
| 41 | `POST /api/v1/admin/appointments` | 201 |
| 42 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 43 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 44 | `GET /api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 45 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 46 | `PATCH /api/v1/admin/appointments/{appointmentId}` | 409 |
| 47 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 409 |
| 48 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 409 |
| 49 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 404 |
| 50 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 404 |
| 51 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 404 |
| 52 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 404 |
| 53 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 401 |
| 54 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 403 |
| 55 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 401 |
| 56 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 403 |

## 4. Defects

**None in the application.** All 38 checks passed on the compiled artifact.
The suite's own RED/GREEN history is in the stage's TEST-GATE
(`logs/gates/2026-11-13-test-SMS-32-b.md`).

## 5. The log records

The run wrote **56 records** to `logs/runtime/app-2026-11-13.jsonl`. The file is
opened in append mode by the application, so after the run it was trimmed to this
run's records, as the previous stages' runs were.

## 6. What the run does not cover

- **R19, R20 and `getAppointmentAdmin`.** Delivered and run by S5.1a
  (`logs/runs/runs-12.md`).
- **The payment gate on `completed`.** S5.3 (SMS-34).
- **The reminder rows of a cancelled record.** Register row 10, addendum SMS-45.
- **P11's status for an off-boundary start.** Register row 13, stage R.
- **Concurrency.** One request at a time; the guarded update and the advisory
  lock are exercised by the suite.
