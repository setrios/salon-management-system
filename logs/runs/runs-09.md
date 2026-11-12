# Control run 09 — S3.2 reminder engine (SMS-29)

| Field | Value |
|---|---|
| Run | 09 |
| Date | 2026-11-12 |
| Stage | S3.2 |
| Ticket | SMS-29 (implementation for SMS-11, SMS-17) |
| Gate | TEST-GATE signed, `logs/gates/2026-11-12-test-SMS-29.md` (`SIGNED — GO`, `543b5a7`; §1.5 and §6.1 added after signature, `bbd86e3`) |
| Code | `src/modules/notifications/{reminders,service,routes}.ts`, `src/modules/appointments/{service,view,routes}.ts` |
| Log file | `logs/runtime/app-2026-11-12.jsonl` (git-ignored, append-only across the day) |

## 1. Commands

```
$ npx tsc -p tsconfig.json --noEmit                     exit 0
$ npm run build                                         exit 0
$ npm test                                              279 passed (279), exit 0
$ npm test                                              279 passed (279), exit 0
$ npm test -- --sequence.shuffle                        279 passed (279), exit 0
$ npm run check:test-first                              12/12 entries pass, exit 0
$ git diff --stat tests/                                (empty)
```

Two unshuffled runs and one shuffled run, as the gate's §9 requires. The
shuffled run printed `Tests 279 passed (279)`.

The suite is **269 before this stage and 279 after**: 10 cases were added by the
`test:` commit `2f77159` (all in the new `reminders.test.ts`), and none was
removed. `git diff --stat tests/` is empty, which is the gate's evidence item
read from the tree rather than from a claim.

**Two test files changed after `2f77159`, in their own `test:` commit
`3c3cf2d`.** `reminders.test.ts`'s `reminderRows` helper assumed R24 returns the
two reminder rows in the engine's order; it does not, because the two rows share
`created_at` and R24 breaks the tie by `id`. The helper now sorts by
`scheduledAt`. C7 in `confirmation.test.ts` asserted D6 — the 2 h reminder
becoming `skipped` under a later clock — which S3.2 replaces with H1 and H3; it
now asserts `sent` for the 2 h row and `skipped` for the 24 h one. Neither
change moves the case count, and the gate records both in §1.5 and the re-run
RED in §6.1.

The control run in §2 runs against a **scratch database** created for the run and
dropped afterwards (`salon_s32_control_test`), so neither the development
database nor the suite's `_test` database is touched. The script is
`logs/runtime/s32-control-run.mjs` (git-ignored, like every control-run script).

## 2. Requests and responses — built artifact

`createApp()` is called with **no argument**, the shape `index.ts` uses (D9), so
the clock is the real one. A reminder's moment therefore cannot be made to pass
by waiting; the run moves a row's `scheduled_at` into the past with one `update`
— the same arrangement the suite makes for K8 — and every other value is the
application's.

```
scratch database created: salon_s32_control_test
tables after migration: appointment_services, appointments, availability_dates,
  availability_weekly, categories, master_services, masters, materials,
  notifications, services

service created: 201
M4 PUT: 200 for both masters

real clock: 2026-11-12T21:53:14.782Z
farStart: 2026-11-17T00:00:00+02:00 | farStart2: 2026-11-18T00:00:00+02:00
nearStart: 2026-11-13T10:00:00+02:00 | veryNearStart: 2026-11-13T01:00:00+02:00
```

### 2.1 A booking far enough ahead writes two scheduled rows

```
--- P8 POST /api/v1/appointments, far ahead (expect 201, two scheduled) ---
status: 201 | content-type: application/json; charset=utf-8
reminders: [{"type":"24h","scheduledAt":"2026-11-16T00:00:00+02:00","status":"scheduled"},
            {"type":"2h","scheduledAt":"2026-11-16T22:00:00+02:00","status":"scheduled"}]

--- R24 GET /admin/appointments/{id}/notifications ---
status: 200 | total: 3
reminder rows: [{"eventType":"reminder_24h","audience":"client","channel":"sms",
                 "status":"scheduled","scheduledAt":"2026-11-16T00:00:00+02:00"},
                {"eventType":"reminder_2h","audience":"client","channel":"sms",
                 "status":"scheduled","scheduledAt":"2026-11-16T22:00:00+02:00"}]
```

The start is 2026-11-17T00:00+02:00; the two moments are 24 h and 2 h before it.
`total: 3` is the confirmation plus the two reminders.

### 2.2 The skip rules

```
--- P8, under 24 h ahead (expect 201, 24 h skipped, 2 h scheduled) ---
status: 201
reminders: [{"type":"24h","scheduledAt":"2026-11-12T10:00:00+02:00","status":"skipped"},
            {"type":"2h","scheduledAt":"2026-11-13T08:00:00+02:00","status":"scheduled"}]

--- P8, under 2 h ahead (expect 201, both skipped) ---
status: 201
reminders: [{"type":"24h","scheduledAt":"2026-11-12T01:00:00+02:00","status":"skipped"},
            {"type":"2h","scheduledAt":"2026-11-12T23:00:00+02:00","status":"skipped"}]
```

The first is SCN-04 (a start 10 h ahead), the second SCN-05 (a start 1 h ahead).
Both are 201: a skipped reminder is not a refusal.

### 2.3 The dispatch on P9, and the second read

```
--- P9 GET /appointments/{token} after the 24 h moment passed ---
status: 200
reminders: [{"type":"24h","scheduledAt":"2026-11-12T23:52:00+02:00","status":"sent"},
            {"type":"2h","scheduledAt":"2026-11-16T22:00:00+02:00","status":"scheduled"}]

--- R24 after the dispatch ---
reminder rows: [{"eventType":"reminder_24h","status":"sent",
                 "scheduledAt":"2026-11-12T23:52:00+02:00",
                 "sentAt":"2026-11-12T23:53:00+02:00"},
                {"eventType":"reminder_2h","status":"scheduled"}]

--- a second read (expect sentAt unchanged) ---
sentAt before: 2026-11-12T23:53:00+02:00 | after: 2026-11-12T23:53:00+02:00
```

`sentAt` is the read's clock (23:53), not the moment the reminder was due (23:52):
the row records when the hand-off happened. The second read leaves it alone.

### 2.4 The reschedule recalculates in place

```
--- P11 reschedule a near booking to a far slot (expect 24 h scheduled again) ---
status: 200
reminders: [{"type":"24h","scheduledAt":"2026-11-16T00:00:00+02:00","status":"scheduled"},
            {"type":"2h","scheduledAt":"2026-11-16T22:00:00+02:00","status":"scheduled"}]
rows after the reactivation: two rows, both `scheduled` — no third was added

--- P11 reschedule a far booking to a near slot (expect 24 h skipped) ---
status: 200
reminders: [{"type":"24h","scheduledAt":"2026-11-12T10:00:00+02:00","status":"skipped"},
            {"type":"2h","scheduledAt":"2026-11-13T08:00:00+02:00","status":"scheduled"}]
rows after the skip: two rows, the 24 h one `skipped` with `sentAt` cleared
```

The first is SCN-11's reactivation: a row that was `skipped` at booking becomes
`scheduled` because the new time puts its moment in the future. The second is the
reverse, and it also clears the `sentAt` the dispatch had written — the new
moment has not been sent.

### 2.5 A cancelled record is not dispatched

```
--- P10 cancel (expect 200) ---
status: 200 | status: cancelled

--- P9 of a cancelled record after both moments passed ---
status: 200
reminders: [{"type":"24h","scheduledAt":"2026-11-12T23:52:00+02:00","status":"scheduled"},
            {"type":"2h","scheduledAt":"2026-11-12T23:52:00+02:00","status":"scheduled"}]
```

Both rows were moved into the past after the cancellation, and both are still
`scheduled`: the dispatch's `exists` clause refuses a record that is no longer
`confirmed` (H5). What `reminders[]` should *show* for such a record is G2
register row 10, owned by the addendum; this run only establishes that nothing
was claimed as sent.

### 2.6 The rows the run wrote

```
new           sent      scheduled=-                        sent=2026-11-12T21:53:14.837Z
reminder_24h  scheduled scheduled=2026-11-15T22:00:00.000Z sent=-
reminder_2h   scheduled scheduled=2026-11-16T20:00:00.000Z sent=-
reschedule    sent      scheduled=-                        sent=2026-11-12T21:53:14.891Z
new           sent      scheduled=-                        sent=2026-11-12T21:53:14.787Z
reminder_24h  skipped   scheduled=2026-11-12T08:00:00.000Z sent=-
reminder_2h   scheduled scheduled=2026-11-13T06:00:00.000Z sent=-
reschedule    sent      scheduled=-                        sent=2026-11-12T21:53:14.907Z
new           sent      scheduled=-                        sent=2026-11-12T21:53:14.857Z
reminder_24h  scheduled scheduled=2026-11-12T21:52:14.927Z sent=-
reminder_2h   scheduled scheduled=2026-11-12T21:52:14.927Z sent=-
new           sent      scheduled=-                        sent=2026-11-12T21:53:14.848Z
reminder_24h  skipped   scheduled=2026-11-11T23:00:00.000Z sent=-
reminder_2h   skipped   scheduled=2026-11-12T21:00:00.000Z sent=-
```

Four bookings, two reschedules, fourteen rows. Every booking wrote exactly one
`new` and two reminders; every reschedule wrote exactly one `reschedule` and no
new reminder row.

## 3. What each request establishes

| Request | Establishes |
|---|---|
| P8 far ahead | two rows, `client`/`sms`, the right `scheduled_at`, both `scheduled` (H1) |
| R24 after it | the rows are visible through the administrator's operation, `total: 3` |
| P8 under 24 h | the 24 h row is `skipped`, the 2 h one `scheduled` (SCN-04) |
| P8 under 2 h | both are `skipped` (SCN-05) |
| P9 after the moment | the due row is `sent`, `sentAt` is the read's clock (H3) |
| R24 after it | the same row reads `sent` with the same `sentAt` |
| P9 again | `sentAt` is not rewritten (R10) |
| P11 to a far slot | a `skipped` row becomes `scheduled` (SCN-11) |
| P11 to a near slot | a `scheduled` row becomes `skipped`, `sentAt` cleared (H2, H6) |
| P10 then P9 | a cancelled record's rows are not dispatched (H5) |

## 4. Defects

**Two defects were found during GREEN, both in the tests, and fixed before this
run.** They are `3c3cf2d`, and the gate records them in §1.5.

- `reminders.test.ts`'s `reminderRows` helper assumed R24 returns the two
  reminder rows in the engine's order. It does not: the two rows are written by
  one statement, so they share `created_at`, and R24 breaks the tie by `id`. The
  helper now sorts by `scheduledAt` and says why. The page's own order is
  unchanged, and the contract does not promise one.
- C7 in `confirmation.test.ts` asserted D6 — the 2 h reminder becoming `skipped`
  under a later clock. S3.2 replaces D6 with H1 and H3, so the case now asserts
  `sent` for the 2 h row and `skipped` for the 24 h one, which was already past
  at booking (H4). The `describe` block's name loses "D6".

**No defect was found in the new code.** The first full run against the
implementation was **278/279**: the one failure was C7, which pinned D6 and is
corrected in `3c3cf2d`. After the correction the suite was 279/279, and it stayed
279/279 across two unshuffled and one shuffled run. The R24-order defect was
found earlier, by running the two touched files alone (2 failed of 28).

**The control-run script had two defects of its own, fixed before the recorded
run.** Its `at()` formatted UTC components with a `+02:00` suffix, so every
computed start was two hours earlier than intended and the "under 2 h" booking
was refused as a past start; and the reactivation case rescheduled onto a slot
another booking already held, which answered 409. Neither reached the
application: the first was a 422 the API was right to give, the second a 409 it
was right to give. The recorded run is the fixed script's.

## 5. Log records written for those requests

24 `http.request` records, 21:53:14.679–21:53:14.937, one per request:

```
21:53:14.679 info http.request POST /api/v1/auth/login                                       200  60.876
21:53:14.714 info http.request POST /api/v1/auth/login                                       200  26.812
21:53:14.745 info http.request POST /api/v1/auth/login                                       200  28.110
21:53:14.753 info http.request POST /api/v1/admin/services                                   201   7.648
21:53:14.762 info http.request POST /api/v1/admin/master-services                            201   6.129
21:53:14.766 info http.request POST /api/v1/admin/master-services                            201   1.936
21:53:14.776 info http.request PUT  /api/v1/me/availability                                  200   8.086
21:53:14.782 info http.request PUT  /api/v1/me/availability                                  200   3.910
21:53:14.821 info http.request POST /api/v1/appointments                                     201  36.402
21:53:14.830 info http.request GET  /api/v1/admin/appointments/{appointmentId}/notifications 200   7.233
21:53:14.846 info http.request POST /api/v1/appointments                                     201   8.875
21:53:14.854 info http.request POST /api/v1/appointments                                     201   6.777
21:53:14.863 info http.request POST /api/v1/appointments                                     201   6.766
21:53:14.872 info http.request GET  /api/v1/appointments/{token}                             200   6.047
21:53:14.878 info http.request GET  /api/v1/admin/appointments/{appointmentId}/notifications 200   3.729
21:53:14.883 info http.request GET  /api/v1/appointments/{token}                             200   3.315
21:53:14.888 info http.request GET  /api/v1/admin/appointments/{appointmentId}/notifications 200   3.705
21:53:14.900 info http.request POST /api/v1/appointments/{token}/reschedule                  200   9.989
21:53:14.905 info http.request GET  /api/v1/admin/appointments/{appointmentId}/notifications 200   3.497
21:53:14.915 info http.request POST /api/v1/appointments/{token}/reschedule                  200   8.040
21:53:14.920 info http.request GET  /api/v1/admin/appointments/{appointmentId}/notifications 200   3.519
21:53:14.927 info http.request POST /api/v1/appointments/{token}/cancel                      200   4.487
21:53:14.932 info http.request GET  /api/v1/appointments/{token}                             200   2.846
21:53:14.937 info http.request GET  /api/v1/admin/appointments/{appointmentId}/notifications 200   3.786
```

Every request the run made is logged, and no request is logged that the run did
not make. The paths are the route patterns, not the concrete URLs, so no access
token appears in the log.

## 6. The decision module

`src/modules/notifications/reminders.ts` is the whole of the engine's decision
and nothing else: the two rows a `startAt` implies (`reminderRowsFor`), the
contract's view of them (`reminderViews`), the due predicate (`isDue`), and the
two `event_type` mappings. It imports no database, reads no clock, and performs
no I/O — the gate's §8 condition, and the reason `check:test-first` can prove its
ordering: the file did not exist at `2f77159`.

The skip decision is one comparison, made when the `startAt` is set:

```
moment <= now  →  skipped     (H2, H4: never becomes sent)
moment >  now  →  scheduled   (H3: becomes sent on the next read)
```

`service.ts` carries it out. `insertReminders` writes the two rows inside the
booking transaction; `recalculateReminders` rewrites them inside the reschedule
transaction, clearing `sentAt`; `dispatchDueReminders` is the one `update` that
turns a due `scheduled` row into `sent`, and its `exists` clause is what keeps a
cancelled or completed record from being dispatched by any caller (H5).

The dispatch is a write on a read, and that is the stage's one uncomfortable
consequence: the lab has no scheduler, so the next read of the appointment or of
R24 is the moment the message is handed to the channel. It is stated in the gate
(§1.2) and here rather than hidden, so the validation step can look at it
deliberately.

`view.ts`'s `appointmentBody` no longer takes a clock: the reminders are stored
rows, so the body is a function of the record alone. The dispatch that may change
them runs before the record is read (`loadAppointment`), not in the mapper.
