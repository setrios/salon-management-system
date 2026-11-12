# Control run 10 — S4.1 notification service (SMS-30)

| Field | Value |
|---|---|
| Run | 10 |
| Date | 2026-11-13 |
| Stage | S4.1 |
| Ticket | SMS-30 (implementation for SMS-12) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-13-test-SMS-30.md` (`SIGNED — GO`, `a5be7fd`; §1.5 and §1.6 added after signature, `3152eac`) |
| Code | `src/modules/notifications/{preferences,service,routes}.ts`, `src/modules/appointments/service.ts`, `src/db/schema.ts`, `src/db/migrations/0005_notification_preferences.sql`, `src/middleware/validate.ts`, `src/lib/time.ts` |
| Log file | `logs/runtime/app-2026-11-12.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc -p tsconfig.json --noEmit                     exit 0
$ npm run build                                         exit 0
$ npm test                                              300 passed (300), exit 0
$ npm test                                              300 passed (300), exit 0
$ npm test -- --sequence.shuffle                        300 passed (300), exit 0
$ npm run check:test-first                              14/14 entries pass, exit 0
$ git diff --stat tests/                                (empty)
```

Two unshuffled runs and one shuffled run, as the gate's §9 requires. The
shuffled run printed `Tests 300 passed (300)`.

The suite is **279 before this stage and 300 after**: 21 cases were added by the
`test:` commit `93b30cc` (13 in the new `notification-preferences.test.ts`, 8 in
the new `my-notifications.test.ts`), and none was removed. `git diff --stat
tests/` is empty, which is the gate's evidence item read from the tree rather
than from a claim.

**Three test files changed after `93b30cc`, in their own `test:` commit
`25de209`.** K6 in `cancellation.test.ts` asserted that a cancellation writes no
row for *any* audience — a stage-scoped reading its own comment explained
("neither has a preference or an actor to consult yet"); it now asserts the
client's absence only. The five `reschedule.test.ts` totals counted the whole
page, which now carries the master's and the administrator's rows; they count
the client's rows by predicate, and R17's `reschedule` filter gained the same
`audience` condition. N5 assumed `createdAt` is the injected clock; it is
`defaultNow()`, so the case reads the date back from the row. None of the four
moves the case count, and the gate records them in §1.5.

The control run in §2 runs against a **scratch database** created for the run and
dropped afterwards (`salon_s41_control_test`), so neither the development
database nor the suite's `_test` database is touched. The script is
`logs/runtime/s41-control-run.mjs` (git-ignored, like every control-run script).

## 2. Requests and responses — built artifact

`createApp()` is called with **no argument**, the shape `index.ts` uses (D9), so
the clock is the real one. Nothing in this stage depends on a moment passing, so
no row is moved by hand: every value the run reads is one the application wrote.

```
scratch database created: salon_s41_control_test
tables after migration: appointment_services, appointments, availability_dates,
  availability_weekly, categories, master_services, masters, materials,
  notification_preferences, notifications, services

service created: 201
M4 PUT: 200 for both masters

real clock: 2026-11-12T23:13:31.538Z
startA: 2026-11-17T01:30:00+02:00 | startB: 2026-11-18T01:30:00+02:00
startC: 2026-11-19T01:30:00+02:00
```

The migration list is the evidence for I1: `notification_preferences` is the
eleventh table, and it is the only one this stage adds.

### 2.1 M5 answers the six combinations, all enabled

```
GET /api/v1/me/notification-preferences
200  application/json; charset=utf-8
[{"channel":"sms","eventType":"new","enabled":true},
 {"channel":"sms","eventType":"reschedule","enabled":true},
 {"channel":"sms","eventType":"cancellation","enabled":true},
 {"channel":"in_app","eventType":"new","enabled":true},
 {"channel":"in_app","eventType":"reschedule","enabled":true},
 {"channel":"in_app","eventType":"cancellation","enabled":true}]
```

Six rows from an empty table: the sparse override is filled by
`preferenceViews`, and the order is the constant's, not the table's (I2).

### 2.2 M6 toggles exactly one, and is an upsert

```
PATCH /api/v1/me/notification-preferences
{"channel":"sms","eventType":"new","enabled":false}
200  {"channel":"sms","eventType":"new","enabled":false}

GET /api/v1/me/notification-preferences
200  five enabled, sms/new disabled

PATCH (the same body again)
200
select count(*) from notification_preferences
  where principal_id = <master A> and channel = 'sms' and event_type = 'new'
→ 1
```

The second toggle leaves one row, which is what the unique index on
`(principal_id, channel, event_type)` is for (I4).

### 2.3 M6's refusals and the three operations' 401

```
PATCH {"channel":"email",...}          422  VALIDATION_ERROR
PATCH body "not json"                  400  MALFORMED_REQUEST
PATCH body "channel=sms", text/plain   415  UNSUPPORTED_MEDIA_TYPE
GET   /me/notification-preferences     401  UNAUTHENTICATED
PATCH /me/notification-preferences     401  UNAUTHENTICATED
GET   /me/notifications                401  UNAUTHENTICATED
```

Each status is one the operation declares, and the code is the catalogue's
(`error-model.md` §3). The 400 is CL-09's rule: the body is not JSON, and M6
declares 400.

### 2.4 A booking writes four rows

```
POST /api/v1/appointments  (master B, all six enabled)
201

admin   new  in_app  sent  sent=2026-11-12T23:13:31.573Z
admin   new  sms     sent  sent=2026-11-12T23:13:31.573Z
master  new  in_app  sent  sent=2026-11-12T23:13:31.573Z
master  new  sms     sent  sent=2026-11-12T23:13:31.573Z
```

Four rows, one per enabled channel for each of the two audiences, all `sent`
with `sentAt` = the booking's clock (I5, I8). The client's own rows — the
confirmation SMS and the two reminders — are on the same appointment and are not
in this list because the query filters `audience <> 'client'`; §2.7 shows them.

### 2.5 A disabled channel writes no row

```
POST /api/v1/appointments  (master A, sms/new off)
201
admin   new  in_app  sent
admin   new  sms     sent
master  new  in_app  sent          ← no master sms row

PATCH {"channel":"in_app","eventType":"new","enabled":false}
POST /api/v1/appointments  (master A, both new channels off)
201
admin   new  in_app  sent
admin   new  sms     sent          ← no master row at all
```

REQ-F-016's AC read literally: a combination that is off contributes no channel,
so no row is written for it. The administrator's two are unaffected, which is
what makes the empty master list a suppression rather than a booking that wrote
nothing (I5, REQ-F-023).

### 2.6 M7 answers the caller's own rows

```
GET /api/v1/me/notifications   (master A)
200  total: 1
[{"audience":"master","eventType":"new","channel":"in_app","status":"sent",
  "sentAt":"2026-11-13T01:14:00+02:00","createdAt":"2026-11-13T01:14:00+02:00"}]

GET /api/v1/me/notifications   (administrator)
200  total: 6, every row audience "admin"

GET /api/v1/me/notifications   (master B)
200  every row appointmentId = master B's booking
```

Master A's total is 1 because their first booking had `sms/new` off (one master
row) and their second had both `new` channels off (none). The administrator's
six are three bookings × two channels. No client row appears in any of the three
lists (I9).

`sentAt` and `createdAt` are the same instant, formatted to the minute by
`salonDateTime` — the row's `sent_at` is `23:13:31.616Z` and the body says
`01:14:00+02:00`, which is that instant rounded to the minute. The formatter is
S2.1's and is unchanged here.

### 2.7 M7's filters, paging and 400

```
GET /me/notifications?eventType=new     200  every row eventType "new"
GET /me/notifications?status=sent       200  every row status "sent"
GET /me/notifications?page=1&pageSize=1 200  one item, total = the unpaged total
GET /me/notifications?status=bogus      400  MALFORMED_REQUEST
```

The 400 is the `coerce` change of gate §1.6: `status` is an enum in the
contract, and a value outside it is a malformed parameter, not a filter that
matches nothing.

### 2.8 The rows the run wrote

```
appointment 158a8916   (master B, all enabled)
  admin   new           in_app  sent      sent=2026-11-12T23:13:31.573Z
  admin   new           sms     sent      sent=2026-11-12T23:13:31.573Z
  client  new           sms     sent      sent=2026-11-12T23:13:31.573Z
  client  reminder_24h  sms     scheduled sent=-
  client  reminder_2h   sms     scheduled sent=-
  master  new           in_app  sent      sent=2026-11-12T23:13:31.573Z
  master  new           sms     sent      sent=2026-11-12T23:13:31.573Z

appointment 30bea615   (master A, sms/new off)
  admin   new           in_app  sent      sent=2026-11-12T23:13:31.630Z
  admin   new           sms     sent      sent=2026-11-12T23:13:31.630Z
  client  new           sms     sent      sent=2026-11-12T23:13:31.630Z
  client  reminder_24h  sms     scheduled sent=-
  client  reminder_2h   sms     scheduled sent=-

appointment 3b0c5efa   (master A, both new channels off)
  admin   new           in_app  sent      sent=2026-11-12T23:13:31.616Z
  admin   new           sms     sent      sent=2026-11-12T23:13:31.616Z
  client  new           sms     sent      sent=2026-11-12T23:13:31.616Z
  client  reminder_24h  sms     scheduled sent=-
  client  reminder_2h   sms     scheduled sent=-
  master  new           in_app  sent      sent=2026-11-12T23:13:31.616Z
```

The client's rows are identical in all three: the confirmation SMS and the two
reminders are written whatever the master's settings say (I7). Only the master's
rows vary, and the administrator's never do.

## 3. What each request establishes

| Request | Establishes |
|---|---|
| `GET /me/notification-preferences` | M5 answers six combinations from an empty table, in the fixed order, all enabled (I2) |
| `PATCH` one combination | M6 changes one and leaves five (REQ-F-026) |
| `PATCH` the same body twice | the unique index makes it an upsert (I4) |
| `PATCH` an unknown channel | 422, the schema's enum (I4) |
| `PATCH` a non-JSON body | 400, CL-09's rule (I4) |
| `PATCH` a non-JSON content type | 415 (I4) |
| the three operations without a token | 401 `UNAUTHENTICATED` (I3) |
| `POST /appointments`, all enabled | four master/admin rows, `sent`, `sentAt` set (I5, I8) |
| `POST /appointments`, one channel off | three rows; the disabled channel wrote none (REQ-F-016) |
| `POST /appointments`, both off | the administrator's two only (REQ-F-016, REQ-F-023) |
| `GET /me/notifications` as a master | their own rows, never a client row (I9) |
| `GET /me/notifications` as the administrator | the administrator rows (I9) |
| `GET /me/notifications` as another master | no row of the first master (I9) |
| `?eventType=`, `?status=` | the filters narrow the list (M7) |
| `?page=1&pageSize=1` | one item, the unpaged total (I11) |
| `?status=bogus` | 400, the enum is part of the type (gate §1.6) |

## 4. Defects

**None in the application.** The run's first two attempts failed on the script,
not on the code, and both are recorded here because a control run that only ever
passes is not evidence:

- the 401 assertions expected `UNAUTHORIZED`; the catalogue's code is
  `UNAUTHENTICATED` (`error-model.md` §3). The script was wrong, the application
  was right.
- the booking's start was rounded to a quarter hour, and P8 refuses a start that
  is not on a 30-minute boundary (REQ-F-002). The script now rounds to the
  service's duration.

**One consequence the stage carries, unchanged from S3.2.** REQ-F-010 and
REQ-F-029 say a reminder is "sent at the correct time", and the lab has no
scheduler: the dispatch happens on the next read (H3). S4.1 does not touch that
mechanism, and the question of whether to add a scheduler is still open for the
validation step (SMS-48).

## 5. Log records written for those requests

29 `http.request` records, 23:13:31.432–23:13:31.668, one per request:

```
23:13:31.432 info http.request POST /api/v1/auth/login                                   200  61.305
23:13:31.467 info http.request POST /api/v1/auth/login                                   200  28.423
23:13:31.499 info http.request POST /api/v1/auth/login                                   200  29.665
23:13:31.510 info http.request POST /api/v1/admin/services                               201   8.448
23:13:31.517 info http.request POST /api/v1/admin/master-services                        201   6.177
23:13:31.521 info http.request POST /api/v1/admin/master-services                        201   2.113
23:13:31.532 info http.request PUT  /api/v1/me/availability                              200   8.575
23:13:31.538 info http.request PUT  /api/v1/me/availability                              200   3.668
23:13:31.543 info http.request GET  /api/v1/me/notification-preferences                  200   2.625
23:13:31.549 info http.request PATCH /api/v1/me/notification-preferences                 200   3.993
23:13:31.552 info http.request GET  /api/v1/me/notification-preferences                  200   1.060
23:13:31.556 info http.request PATCH /api/v1/me/notification-preferences                 200   1.560
23:13:31.559 info http.request PATCH /api/v1/me/notification-preferences                 422   1.040
23:13:31.562 info http.request PATCH /api/v1/me/notification-preferences                 400   0.708
23:13:31.564 info http.request PATCH /api/v1/me/notification-preferences                 415   0.510
23:13:31.566 info http.request GET  /api/v1/me/notification-preferences                  401   0.167
23:13:31.568 info http.request PATCH /api/v1/me/notification-preferences                 401   0.243
23:13:31.570 info http.request GET  /api/v1/me/notifications                             401   0.218
23:13:31.609 info http.request POST /api/v1/appointments                                 201  37.563
23:13:31.625 info http.request POST /api/v1/appointments                                 201   9.138
23:13:31.628 info http.request PATCH /api/v1/me/notification-preferences                 200   1.484
23:13:31.639 info http.request POST /api/v1/appointments                                 201   8.839
23:13:31.646 info http.request GET  /api/v1/me/notifications                             200   4.881
23:13:31.652 info http.request GET  /api/v1/me/notifications                             200   3.988
23:13:31.656 info http.request GET  /api/v1/me/notifications                             200   2.422
23:13:31.660 info http.request GET  /api/v1/me/notifications                             200   2.053
23:13:31.663 info http.request GET  /api/v1/me/notifications                             200   1.776
23:13:31.666 info http.request GET  /api/v1/me/notifications                             200   1.843
23:13:31.668 info http.request GET  /api/v1/me/notifications                             400   0.382
```

Every request the run made is logged, and no request is logged that the run did
not make. The paths are the route patterns, not the concrete URLs, so no access
token appears in the log.

## 6. The preference module

`preferences.ts` is pure: two enumerations, the six combinations in the fixed
order, and `preferenceViews`, which fills the gaps with `enabled: true`. It has
no I/O, which is the gate's §8 condition and the reason `check:test-first` can
prove its ordering: the file did not exist at `93b30cc`.

The rule the stage adds is one line of `recordAppointmentEvent`:

```
for each enabled channel of the master   → one row, audience 'master'
for each enabled channel of the admin    → one row, audience 'admin'
                                           (skipped when actor = 'admin')
```

`service.ts` carries it out inside the caller's transaction, so a booking that
fails writes no notification. `readPreferences` and `setPreference` are M5 and
M6; `listMyNotifications` is M7, and its predicate is derived from the audience
and the appointment rather than from a stored principal column (I9).

The `actor` parameter is S4.1's one piece of forward-looking structure: the
three call sites all pass `client`, and S5.1's administrator paths will pass
`admin`, which is where REQ-F-030's suppression becomes observable. The guard is
written now because the rule belongs in the service, not in each route — and
because writing it later would mean changing a function whose callers already
exist.
