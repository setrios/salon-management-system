# Control run — S5.1a administrator appointments (SMS-32)

| | |
|---|---|
| Stage | S5.1a — R19 `POST /admin/appointments`, R20 `GET /admin/appointments`, `getAppointmentAdmin` |
| Ticket | SMS-32 |
| Gate | G4 (SMS-7) |
| Date | 2026-11-13 |
| Artifact | `dist/` — the built output, not the sources |
| Script | `logs/runtime/s51a-control-run.mjs` (git-ignored) |
| Result | **29/29 checks passed** |

---

## 1. What was run, and how

```
$ npm run build
  operations: 50
  copy-contract: src/contract/openapi.json -> dist/src/contract/openapi.json

$ node --env-file-if-exists=.env logs/runtime/s51a-control-run.mjs
```

The script loads `dist/src/app.js` and calls **`createApp()` with no argument** —
the shape `index.ts` uses (D9) — then drives the application over a real socket
on an ephemeral port.

Two arrangements:

- **A scratch database.** `salon_s51a_control_test` is created before the run and
  dropped after it, so neither the development database nor the suite's
  `_test` database is touched. Migrations run against it from scratch.
- **The real clock.** `createApp()` takes no argument here, so the run's "now" is
  the wall clock. A reminder's moment therefore cannot be made to pass by
  waiting, so one row's `scheduled_at` is moved into the past with a single
  `update` — the arrangement the suite makes for J5 / K8. Every other value is
  the application's own.

## 2. The checks

```
scratch database created: salon_s51a_control_test

--- R19 POST /admin/appointments ---
PASS  R19 answers 201
PASS  R19 returns Location header pointing to admin appointment URI
PASS  R19 returns client representation with accessToken and confirmationUrl
PASS  R19 sums durations (30+60=90) and prices (400+700=1100 UAH)
PASS  R19 writes notification rows
PASS  R19 notifies client and master, but suppresses admin notification (REQ-F-030)
PASS  Additional bookings created (201)

--- R20 GET /admin/appointments ---
PASS  R20 answers 200
PASS  R20 returns total count (at least 3)
PASS  R20 returns appointments across multiple masters
PASS  R20 returns staff view without accessToken and confirmationUrl
PASS  R20 orders by startAt ascending (K9)

--- R20 filters ---
PASS  R20 filters by masterId
PASS  R20 filters by date range (from/to)
PASS  R20 filters by status=confirmed

--- R20 paging ---
PASS  R20 pagination works with page and pageSize

--- getAppointmentAdmin ---
PASS  getAppointmentAdmin answers 200
PASS  getAppointmentAdmin returns staff representation (no accessToken/confirmationUrl)
PASS  getAppointmentAdmin dispatches due reminder to sent (J5)

--- Error responses ---
PASS  getAppointmentAdmin answers 404 for unknown uuid
PASS  getAppointmentAdmin answers 404 for non-uuid id (K8)
PASS  R20 answers 400 for bogus status enum
PASS  R20 answers 400 for invalid date
PASS  R19 answers 401 without auth
PASS  R19 answers 403 for master
PASS  R20 answers 401 without auth
PASS  R20 answers 403 for master
PASS  getAppointmentAdmin answers 401 without auth
PASS  getAppointmentAdmin answers 403 for master

ALL CHECKS PASSED

scratch database dropped: salon_s51a_control_test
```

### 2.1 The representations and notification suppression

- **R19 (`createAppointmentAdmin`)** returns 201 with `Appointment` (the client
  representation), carrying `accessToken` and `confirmationUrl`, and sets
  `Location: /api/v1/admin/appointments/{id}`.
- **REQ-F-030 (K5)**: Verification via `GET /admin/appointments/{id}/notifications`
  confirms that client confirmation SMS and master notification are created,
  while no notification row is recorded for the administrator.
- **R20 (`listAppointmentsAdmin`) and `getAppointmentAdmin`** return staff
  representation (`staffBody`, `AppointmentAdmin` schema) where `accessToken`
  and `confirmationUrl` are excluded (D18, REQ-NF-006, J2).
- **Ordering (K9)**: R20 orders appointments by `startAt` then `id` ascending.
- **Dispatch (J5)**: Reading an appointment whose reminder is in the past
  dispatches that reminder to `status: sent`.

## 3. The requests

The run made **32 requests** in total:

| # | Request | Outcome |
|---|---|---|
| 1–2 | `POST /auth/login` ×2 | admin and master A |
| 3–4 | `POST /admin/services` ×2 | 201 for services |
| 5–7 | `POST /admin/master-services` ×3 | 201 for links |
| 8 | `PUT /me/availability` | 200 for master A |
| 9–10 | `POST /auth/login`, `PUT /me/availability` | 200 for master B |
| 11 | `POST /admin/appointments` | 201, client view, sums, Location header |
| 12 | `GET /admin/appointments/{id}/notifications` | 200, REQ-F-030 suppression confirmed |
| 13–14 | `POST /admin/appointments` ×2 | 201 for additional bookings |
| 15 | `GET /admin/appointments` | 200, cross-master list, ordered, staff view |
| 16–18 | `GET /admin/appointments` with filters | 200, masterId, date range, status |
| 19–20 | `GET /admin/appointments?page=1|2&pageSize=1` | 200, paging verified |
| 21–22 | `GET /admin/appointments/{id}` | 200, staff view, J5 dispatch verified |
| 23–24 | `GET /admin/appointments/{unknown}` | 404 for unknown uuid and non-uuid (K8) |
| 25–26 | `GET /admin/appointments` bad query | 400 for bogus status and bad date |
| 27–28 | `POST /admin/appointments` auth | 401 without auth, 403 for master |
| 29–30 | `GET /admin/appointments` auth | 401 without auth, 403 for master |
| 31–32 | `GET /admin/appointments/{id}` auth | 401 without auth, 403 for master |

## 4. Defects

**None in the application.** All 29 checks passed on the first run of the
compiled artifact.

## 5. The log records

The run wrote **32 records** to `logs/runtime/app-2026-11-13.jsonl`:

```
 1 POST /api/v1/auth/login                                       200
 2 POST /api/v1/auth/login                                       200
 3 POST /api/v1/admin/services                                   201
 4 POST /api/v1/admin/services                                   201
 5 POST /api/v1/admin/master-services                            201
 6 POST /api/v1/admin/master-services                            201
 7 POST /api/v1/admin/master-services                            201
 8 PUT  /api/v1/me/availability                                  200
 9 POST /api/v1/auth/login                                       200
10 PUT  /api/v1/me/availability                                  200
11 POST /api/v1/admin/appointments                               201
12 GET  /api/v1/admin/appointments/{appointmentId}/notifications 200
13 POST /api/v1/admin/appointments                               201
14 POST /api/v1/admin/appointments                               201
15 GET  /api/v1/admin/appointments                               200
16 GET  /api/v1/admin/appointments                               200
17 GET  /api/v1/admin/appointments                               200
18 GET  /api/v1/admin/appointments                               200
19 GET  /api/v1/admin/appointments                               200
20 GET  /api/v1/admin/appointments                               200
21 GET  /api/v1/admin/appointments/{appointmentId}               200
22 GET  /api/v1/admin/appointments/{appointmentId}               200
23 GET  /api/v1/admin/appointments/{appointmentId}               404
24 GET  /api/v1/admin/appointments/{appointmentId}               404
25 GET  /api/v1/admin/appointments                               400
26 GET  /api/v1/admin/appointments                               400
27 POST /api/v1/admin/appointments                               401
28 POST /api/v1/admin/appointments                               403
29 GET  /api/v1/admin/appointments                               401
30 GET  /api/v1/admin/appointments                               403
31 GET  /api/v1/admin/appointments/{appointmentId}               401
32 GET  /api/v1/admin/appointments/{appointmentId}               403
```

## 6. What the run does not cover

- **R21, R22, R23.** Part of S5.1b.
- **`payment` and `notificationsSummary`.** Optional fields in `AppointmentAdmin`
  (J2); covered in later stages.
