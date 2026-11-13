# Control run — S4.2 master calendar and own services (SMS-31)

| | |
|---|---|
| Stage | S4.2 — M1 `GET /me/appointments`, M2 `GET /me/services` |
| Ticket | SMS-31 |
| Gate | G3 (SMS-6) |
| Date | 2026-11-13 |
| Artifact | `dist/` — the built output, not the sources |
| Script | `logs/runtime/s42-control-run.mjs` (git-ignored) |
| Result | **24/24 checks passed** |

---

## 1. What was run, and how

```
$ npm run build
  operations: 50
  copy-contract: src/contract/openapi.json -> dist/src/contract/openapi.json

$ node --env-file-if-exists=.env logs/runtime/s42-control-run.mjs
```

The script loads `dist/src/app.js` and calls **`createApp()` with no argument** —
the shape `index.ts` uses (D9) — then drives the application over a real socket
on an ephemeral port.

Two arrangements, both stated by the script's header:

- **A scratch database.** `salon_s42_control_test` is created before the run and
  dropped after it, so neither the development database nor the suite's
  `_test` database is touched. Migrations run against it, so the run also
  exercises the migration chain from empty.
- **The real clock.** `createApp()` takes no argument here, so the run's "now" is
  the wall clock (2026-11-13T08:52Z). A reminder's moment therefore cannot be
  made to pass by waiting, so one row's `scheduled_at` is moved into the past
  with a single `update` — the arrangement the suite makes for A10 and K8. Every
  other value is the application's own.

## 2. The checks

```
scratch database created: salon_s42_control_test

services created: 201 201
M4 PUT: 200 for both masters

real clock: 2026-11-13T08:52:19.151Z
startA1: 2026-11-17T11:00:00+02:00 | startA2: 2026-11-19T11:00:00+02:00 | startB: 2026-11-18T11:00:00+02:00

--- P8 x3 ---
statuses: 201 201 201

--- M1 GET /api/v1/me/appointments (master A) ---
status: 200 | total: 2
items: [{"id":"77950fc2","startAt":"2026-11-17T11:00:00+02:00","status":"confirmed"},{"id":"9523bec2","startAt":"2026-11-19T11:00:00+02:00","status":"confirmed"}]
PASS  M1 answers 200
PASS  M1 answers only the caller's appointments
PASS  M1 orders earliest first

--- the staff representation ---
keys: ["id","status","client","master","services","startAt","endAt","totalDurationMinutes","occupiedDurationMinutes","totalPrice","reminders","createdAt","updatedAt"]
PASS  the staff view has no accessToken
PASS  the staff view has no confirmationUrl
PASS  the client view still has both
PASS  the staff view carries the client and the master
PASS  from/to filter on startAt, inclusive
PASS  from alone keeps the later appointment
PASS  to before every appointment is empty

--- P10 cancel --- status: 200
PASS  status=confirmed excludes the cancelled record
PASS  status=cancelled answers the cancelled record
PASS  paging: one item per page, the unpaged total
PASS  M1 answers 400 for an unknown status
PASS  M1 answers 400 for a date that names no day
PASS  M1 answers 401 without a token
PASS  M1 answers 403 for the administrator
PASS  M2 answers 401 without a token
PASS  M2 answers 403 for the administrator

--- the dispatch on M1 ---
reminders: [{"type":"24h","scheduledAt":"2026-11-13T09:52:00+02:00","status":"sent"},{"type":"2h","scheduledAt":"2026-11-19T09:00:00+02:00","status":"scheduled"}]
PASS  M1 dispatches a due reminder

--- M2 GET /api/v1/me/services ---
master A: [{"id":"1dc2cd67-…","masterId":"9044cc5b-…","serviceId":"1eddbac0-…","price":{"amountMinor":45000,"currency":"UAH"},"active":true,"createdAt":"2026-11-13T08:52:19.122Z","updatedAt":"2026-11-13T08:52:19.122Z"},{"id":"6a9a02b9-…","masterId":"9044cc5b-…","serviceId":"b5048615-…","price":{"amountMinor":70000,"currency":"UAH"},"active":true,"createdAt":"2026-11-13T08:52:19.128Z","updatedAt":"2026-11-13T08:52:19.128Z"}]
PASS  M2 answers 200
PASS  M2 answers only the caller's links
PASS  M2 keeps one master's links out of another's list
PASS  M2 answers the MasterService shape

ALL CHECKS PASSED

scratch database dropped: salon_s42_control_test
```

### 2.1 The staff representation, field by field

The key list is the whole answer for J2, and it is worth reading against
`appointmentBody`'s:

```
id status client master services startAt endAt
totalDurationMinutes occupiedDurationMinutes totalPrice
reminders createdAt updatedAt
```

Thirteen keys, in the client view's order, and the two that are absent are
absent from the middle of the list rather than from the end — which is what
proves the function subtracted them from the shared literal instead of writing
a second one. `the client view still has both` is the control: the same run's
`POST /appointments` response carried `accessToken` and `confirmationUrl`.

### 2.2 The dispatch

The 24 h reminder was moved to `now() - 1 hour` and the calendar read answered
`sent`; the 2 h reminder, still in the future (2026-11-19T09:00), stayed
`scheduled`. One read of a page dispatched exactly the one row that had fallen
due — H3's rule, reached through M1 rather than through P9 or R24.

The record chosen for the dispatch is the **confirmed** one: `first` was
cancelled by the same run (§2's `status=cancelled` check), and H5 says a
cancelled appointment's reminders are not dispatched.

## 3. Each request and the claim it answers

| # | Request | Claim |
|---|---|---|
| 1–3 | `POST /auth/login` ×3 | the three accounts exist and authenticate |
| 4–5 | `POST /admin/services` ×2 | the catalogue has something to link |
| 6–8 | `POST /admin/master-services` ×3 | two links for master A, one for master B |
| 9–10 | `PUT /me/availability` ×2 | both masters are bookable every day |
| 11–13 | `POST /appointments` ×3 | two for A (11-17, 11-19), one for B (11-18) |
| 14 | `GET /me/appointments` | 200, `total: 2`, A's two records, earliest first (J1, J4) |
| 15–17 | `GET /me/appointments?from=&to=` | J3: one day, `from` alone, and `to` before everything |
| 18 | `POST /appointments/{token}/cancel` | the 11-17 record becomes `cancelled` |
| 19–20 | `GET /me/appointments?status=` | J4's sibling: the filter excludes and includes |
| 21–22 | `GET /me/appointments?page=1|2&pageSize=1` | one item per page, `total: 2` both times |
| 23 | `GET /me/appointments?status=bogus` | 400 `MALFORMED_REQUEST` (the `coerce` enum) |
| 24 | `GET /me/appointments?from=2026-02-30` | 400 `MALFORMED_REQUEST` |
| 25 | `GET /me/appointments` without a token | 401 `UNAUTHENTICATED` |
| 26 | `GET /me/services` without a token | 401 `UNAUTHENTICATED` |
| 27–28 | both as the administrator | 403 `FORBIDDEN` (J6, J8) |
| 29 | `GET /me/appointments?status=confirmed` | the dispatch of J5, on the live record |
| 30–31 | `GET /me/services` for A and for B | two links and one, each only its own (J7) |

## 4. Defects

**None in the application.** All 24 checks passed on the first run of the
script, and the suite was 315/315 before it.

Two arrangements in the *script* needed care, and both are visible in §1:

- **The scratch database had to be created, not reused.** The first attempt at
  a run on an existing scratch database would have met tables left by the
  previous run; the script drops and creates it every time.
- **The log file accumulated across runs.** `logs/runtime/app-2026-11-13.jsonl`
  is opened in append mode, so a second run leaves both runs' records in one
  file. The file was trimmed to the last run's 31 records so that §5 describes
  the run in §2. The file is git-ignored; nothing under version control changed.

## 5. The log records

The run wrote **31 records**, one per HTTP request, to
`logs/runtime/app-2026-11-13.jsonl`:

```
 1 POST /api/v1/auth/login                                   200
 2 POST /api/v1/auth/login                                   200
 3 POST /api/v1/auth/login                                   200
 4 POST /api/v1/admin/services                               201
 5 POST /api/v1/admin/services                               201
 6 POST /api/v1/admin/master-services                        201
 7 POST /api/v1/admin/master-services                        201
 8 POST /api/v1/admin/master-services                        201
 9 PUT  /api/v1/me/availability                              200
10 PUT  /api/v1/me/availability                              200
11 POST /api/v1/appointments                                 201
12 POST /api/v1/appointments                                 201
13 POST /api/v1/appointments                                 201
14 GET  /api/v1/me/appointments                              200
15 GET  /api/v1/me/appointments                              200
16 GET  /api/v1/me/appointments                              200
17 GET  /api/v1/me/appointments                              200
18 POST /api/v1/appointments/{token}/cancel                  200
19 GET  /api/v1/me/appointments                              200
20 GET  /api/v1/me/appointments                              200
21 GET  /api/v1/me/appointments                              200
22 GET  /api/v1/me/appointments                              200
23 GET  /api/v1/me/appointments                              400
24 GET  /api/v1/me/appointments                              400
25 GET  /api/v1/me/appointments                              401
26 GET  /api/v1/me/services                                  401
27 GET  /api/v1/me/appointments                              403
28 GET  /api/v1/me/services                                  403
29 GET  /api/v1/me/appointments                              200
30 GET  /api/v1/me/services                                  200
31 GET  /api/v1/me/services                                  200
```

Every request the run made is in the file, in the order it was made, with the
status it received. No request is missing and no record is unaccounted for.

## 6. What the run does not cover

- **The administrator's calendar (R20).** S5.1's operation, with its own gate.
- **`payment` and `notificationsSummary`.** Optional in `AppointmentAdmin` and
  not produced (J2); S5.3 and S5.1 are the stages that will.
- **A page larger than the fixtures.** The paging checks use `pageSize=1` and
  two records. The limit's own arithmetic is R10's and the suite's, and the
  contract's default of 20 is exercised by every unpaged call above.
- **Load.** The run is 31 requests. Response time is not a claim this record
  makes; REQ-NF-005 is the validation stage's.
