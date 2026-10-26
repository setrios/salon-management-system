# Positive scenarios — mock API

Status: **COMPLETE** — Part 3, step 3.2. Executed by `run-positive.sh`.

Every scenario is a real HTTP call against the Prism mock started from
`openapi.yaml`. Assertions cover status, media type, schema fields and
cross-field arithmetic. They never assert `traceId` or `instance`, because the
static mock repeats one example per response (clarification CL-02).

Base URL: `http://127.0.0.1:4010` (Prism drops the `/api/v1` prefix — CL-01).

Demonstrability legend:

- **full** — the mock serves a documented example and the assertion is real.
- **shape** — the response is documented and well-formed, but the mock cannot
  exercise the underlying data or state rule; behaviour is verified in Lab 5.

| ID | Covers | Request | Assertions | Mock |
|---|---|---|---|---|
| POS-01 | SCN-01, F-001, F-003, F-004, F-005 | `POST /appointments` with two services, start `2026-11-03T10:00:00+02:00` | 201; `status=confirmed`; 2 service lines; `totalDurationMinutes=75`; `occupiedDurationMinutes=90`; `totalPrice.amountMinor=85000`, `currency=UAH`; `accessToken` matches a UUID; `confirmationUrl` present; 2 reminders | full |
| POS-02 | SCN-02, F-006 | `POST /appointments/{token}/cancel` | 200; `status=cancelled` | full |
| POS-03 | SCN-03, F-007, F-008, F-009 | `POST /appointments/{token}/reschedule` to `2026-11-04T14:00:00+02:00` | 200; `startAt` equals the requested time; `reminders[0].scheduledAt` = start − 24 h; `reminders[1].scheduledAt` = start − 2 h | full |
| POS-04 | SCN-04, F-010 | same as POS-01 | reminder times are derived from `startAt`, not from booking time | shape |
| POS-05 | SCN-05, F-010, F-011 | same as POS-01 | both reminder records exist with types `24h` and `2h` | shape |
| POS-06 | SCN-06, F-016, F-026 | `PATCH /me/notification-preferences` with token | 200; `channel=sms`, `eventType=cancellation`, `enabled=true`; `GET` returns three preferences | full |
| POS-07 | SCN-07, F-021, F-027, NF-009 | `POST .../complete`, then `POST .../payments` | completion 200 `status=completed`; payment 201 `status=paid`, `method=card`, `amountMinor=85000`, `currency=UAH` | full |
| POS-08 | SCN-08, F-024 | `POST /admin/services` with `category=Nails`; `GET /categories` | 201 with a `category` field; categories include the three seeds with `seeded=true` | shape |
| POS-09 | SCN-09, F-015 | `PUT /me/availability` then `GET /me/availability` | 200; `weekly[0].dayOfWeek=1`, `09:00`–`18:00`; `dates[0].date=2026-11-03` | full |
| POS-10 | SCN-10, F-022 | `GET /admin/reports/revenue?period=month` | 200; `period=month`; `totalAmount.currency=UAH`; `byMethod` has `cash` and `card` | full |
| POS-11 | SCN-11, F-029 | `POST /appointments/{token}/reschedule` | 200; both reminders are `scheduled` after the move | shape |
| POS-12 | SCN-12, F-030 | `POST /admin/appointments/{id}/cancel` | 200; `status=cancelled` | full |
| POS-13 | SCN-13, F-031, NF-008 | `GET /masters/{id}/availability?date=…&serviceIds=…` | 200; `totalDurationMinutes=75`; `occupiedDurationMinutes=90`; slot starts on `:00` or `:30` | full |
| POS-14 | SCN-14, F-032 | `GET /admin/reports/popular-services?period=month` | 200; `items[0].rank=1`; ranks strictly increasing; `bookingsCount` descending | full |
| POS-15 | SCN-15, F-033 | `GET /admin/reports/stock-levels`; repeat with an unknown query parameter | 200; `asOf` present; `items[0].quantity` numeric; unknown parameter ignored (D17) | full |
| POS-16 | F-012, F-017 | `POST /admin/masters`, then `POST /auth/login` | 201 `username=olena`, `active=true`; login 200 `tokenType=Bearer`, `role=master`, `expiresIn>0` | full |
| POS-17 | F-013, NF-006 | `GET /me/appointments` with token | 200; one item; item has **no** `accessToken` key | full |
| POS-18 | F-014 | `GET /me/services` with token | 200; array; `price.currency=UAH`; `masterId` present | full |
| POS-19 | F-018, NF-005 | `POST /admin/services`, `PATCH /admin/services/{id}` with `active=false` | 201; 200 with `active=false`; `DELETE` on the path returns 405 (no deletion) | full |
| POS-20 | F-019, F-028 | `PATCH /admin/appointments/{id}` | 200; `startAt` equals the new time; totals still numeric | full |
| POS-21 | F-020 | `POST /admin/materials/{id}/transactions` with `type=issue` | 201; `type=issue`; `quantity=20` | full |
| POS-22 | F-025 | `POST /admin/materials` with `unit=ml`; `GET /admin/units` | 201 with `unit`; standard units contain `ml`,`l`,`g`,`kg`,`pcs` | full |
| POS-23 | F-004, NF-001 | `GET /appointments/{token}` | 200; `accessToken` equals the path token; `confirmationUrl` present | full |
| POS-24 | NF-006 | `GET /admin/appointments/{id}` | 200; **no** `accessToken`, **no** `confirmationUrl` | full |
| POS-25 | NF-004 | `GET /admin/reports/revenue` | `totalAmount.currency=UAH` and every `byMethod[].amount.currency=UAH` | full |
| POS-26 | F-015 | `PUT /me/availability` then `GET /me/availability` | both 200; `weekly` length preserved; rules round-trip unchanged | full |
| POS-27 | NF-008 | `GET /masters/{id}/availability` | every slot start minute is `00` or `30` | full |
