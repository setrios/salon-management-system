# TDD log — SMS-26 (S2.2 confirmation page, token, confirmation SMS)

| Field | Value |
|---|---|
| Ticket | SMS-26 (Feature: confirmation page + confirmation SMS + unguessable token) |
| Stage | S2.2 |
| Date | 2026-11-12 |
| Test files | `tests/api/confirmation.test.ts` (9), `tests/api/notification.test.ts` (8) — **17 new cases, 240 in the suite** |
| Fixture | `tests/helpers/booking.ts` — reused unchanged (accounts, services, links, availability through the API) |
| Contract | `openapi.yaml` P9 `getAppointmentByToken`, R24 `listAppointmentNotifications`; schemas `Appointment`, `AppointmentService`, `Reminder`, `NotificationPage`, `Notification`, `Problem`; `error-model.md` §3–§4; `resource-model.md` §5.1 (P9, R24) |
| Gate | `logs/gates/2026-11-12-test-SMS-26.md` — **PENDING** |
| Inventory decisions | E1–E10, from the S2.2 inventory accepted 2026-11-12 (E1 amended: R24 is in scope; manifest entries are SMS-26 → SMS-26) |

## 1. What the test commit contains

| File | Change |
|---|---|
| `tests/api/confirmation.test.ts` | **new** — 9 cases over P9 |
| `tests/api/notification.test.ts` | **new** — 8 cases over R24 |
| `tests/manifest.json` | two entries added: `SMS-26 (test) → SMS-26 (implementation)` for each file |

No source file is touched, no migration exists, and `src/modules/notifications/`
does not exist. `git status --short src/` is empty.

`tests/helpers/booking.ts` is **not** modified: both files arrange through the
operations S1.2/S1.3 and S2.1 already provide. That is why the helper is not in
the commit list.

## 2. Inventory — 17 cases

### 2.1 `confirmation.test.ts` — 9 (P9)

| # | Case | What it proves |
|---|---|---|
| C1 | returns the appointment P8 created, with the same fields | SCN-01: the page a client is shown after booking is the same resource a later read returns |
| C2 | answers without any token: the access token is the credential | `security: []`; REQ-NF-001 |
| C3 | 404 `NOT_FOUND` for a uuid that names no appointment | P9's declared 404, asserted **after** a 200 in the same case |
| C4 | 404 `NOT_FOUND` for a token that is not a uuid | E6: P9 declares no 400, so an ill-typed path value names no resource |
| C5 | returns each token its own appointment, never another | REQ-NF-001's acceptance criterion, in its observable form |
| C6 | returns the same `confirmationUrl` the booking response carried | REQ-F-004's link, without claiming the URL resolves (E5) |
| C7 | recomputes reminder status on read: the same record under a later clock | D6/D9: the record did not change, the clock did |
| C8 | answers 200 for a cancelled appointment, with the same token and URL | SRS glossary "Confirmation Page" (v1.3 lines 378–384): valid, read-only, after cancellation (E7) |
| C9 | keeps the service snapshot after the service is deactivated through R8 | REQ-NF-005: deactivation does not rewrite history |

### 2.2 `notification.test.ts` — 8 (R24)

| # | Case | What it proves |
|---|---|---|
| N1 | records exactly one client SMS with `eventType: new` and `status: sent` | REQ-F-005, SCN-01 — counted by predicate, not by `total` |
| N2 | gives a second booking its own single message, leaving the first at one | "one per booking", not "one in the system" |
| N3 | records nothing when the booking is refused: the repeat is a 409 | a refusal writes no message — the "at most one" half |
| N4 | answers 401 `UNAUTHENTICATED` without a bearer token | R24's declared 401 |
| N5 | answers 403 `FORBIDDEN` for a master's token | R24's declared 403; `tags: [Admin]` |
| N6 | answers 404 `NOT_FOUND` for an appointment id that names no record | R24's declared 404, asserted **after** a 200 |
| N7 | answers 400 `MALFORMED_REQUEST` for an appointment id that is not a uuid | R24 declares 400 — and, unlike P9, that is the branch the shared parameter rule takes |
| N8 | returns the `NotificationPage` envelope with the default page and pageSize | `NotificationPage.required`; contract defaults 1 / 20 |

**9 + 8 = 17, the inventory's number.** No case was added or split beyond it.

## 3. RED run

```
$ npx vitest run tests/api/confirmation.test.ts tests/api/notification.test.ts

 ❯ tests/api/confirmation.test.ts (9 tests | 9 failed) 906ms
 ❯ tests/api/notification.test.ts (8 tests | 8 failed) 849ms

 Test Files  2 failed (2)
      Tests  17 failed (17)
```

Full suite, same run:

```
$ npm test

 Test Files  2 failed | 8 passed (10)
      Tests  17 failed | 223 passed (240)
```

**240 = 223 + 17.** The floor S2.1 left is intact: 223 before, 240 after, no
existing case changed.

Failure census:

```
 15 expected 404 to be 200
  1 expected 404 to be 401
  1 expected 404 to be 403
```

**All 17 are the unmounted route.** No router serves `GET /appointments/{token}`
or `GET /admin/appointments/{id}/notifications`, so every request reaches the
terminal `notFound` and answers 404. `Cannot find module` does not appear: the
files import `src/app.js`, which exists — what is missing is a route, not a
module. Because every case fails, there is **no fallback-green case** in this
set: a case that expected 404 is written to read 200 first, and C1–C2, C5–C9,
N1–N3 and N8 expect 200 while the route answers 404; C3, C4, N6 and N7 reach
their 200 assertion *before* the 404 assertion and fail on it.

**Zero skipped.** The `beforeAll` hooks arrange only through operations that
exist (R2 accounts, R6 services, R11 links, M4 availability), so no hook fails
and no block is skipped.

**One defect was found while producing RED, and it is in the tests, not the
code.** The first draft's `arrangeBookable()` set Monday and Thursday windows
with two sequential `PUT /me/availability` calls. M4 is a **full replacement**
(`resource-model.md` §4: "PUT = full replacement"), so the second call discarded
the Monday window and every Monday booking was answered 409. The fix is one `PUT`
carrying both windows. It was written before the gate and never appeared in a
run the gate quotes; the count did not move — 17 before the fix, 17 after, 17
failed each time.

## 4. What GREEN will not prove

| # | Not proved by GREEN | Why | Owner |
|---|---|---|---|
| 1 | REQ-NF-002/003/004 — responsive, English, UAH | UI properties; in this contract "the page" is the resource P9 returns | SMS-36 |
| 2 | That `confirmationUrl` resolves | The origin is the contract's example `https://salon.example`; nothing serves it (E5, runs-05 §8) | E5 / G2 revision |
| 3 | The **text** of the confirmation SMS | `Notification` has no text field; the link is `Appointment.confirmationUrl`, asserted by B7 and C6 | E10 / addendum candidate |
| 4 | Real delivery | SMS is simulated (SRS §3, Assumptions and Dependencies) | SMS-29 / SMS-37 |
| 5 | Atomicity across a process crash between insert and commit | Not reachable through HTTP; one transaction owns both writes (E2) | — (by construction) |
| 6 | 500 on P9/R24 | Standing non-test N2 of the S2.1 gate | — |
| 7 | A concurrent second `new` notification row | The partial unique index is a backstop for future code, not reachable while the booking writes once | — |
| 8 | Reminder **dispatch** (`sent`/`failed` for `reminder_24h`/`reminder_2h`) | SMS-29's engine; S2.2 writes only the `new` message | SMS-29 |
| 9 | Cancellation itself (P10) | S2.3; C8 arranges the `cancelled` state out of band and says so in its header | SMS-27 |

## 5. Decisions E1–E10

These are the inventory's decisions, carried into the tests. E2–E4 are the ones
GREEN implements; E5, E9 and E10 are things the tests deliberately do not claim.

| # | Decision | Alternative not taken | Why |
|---|---|---|---|
| E1 | R24 `listAppointmentNotifications` is part of S2.2 | (a) P9 only, "exactly one" read straight from the table in a test; (b) leave R24 to S4/S5 | `resource-model.md:37,264` and `api-traceability.md:31` put REQ-F-005 on P8 **and R24**; (a) is an assertion about storage, and this project reads observable state (O9). The plan's §5 stage table assigns R24 to no stage — a gap closed here, recorded in gate §1 and in the G2 register |
| E2 | The message is a **row written in the booking transaction** | Compute it on read, like `reminders` (D6) | REQ-F-005 says "is recorded"; a computed row cannot be "exactly one record", and a rolled-back booking would leave a trace |
| E3 | `status: 'sent'`, `sentAt` = the injected `now` | `scheduled`, with dispatch in S4.1 | Delivery is simulated, so sending happens during creation. **`sent` means "handed to the simulated channel", not "delivered to a phone"** |
| E4 | Partial unique index on `(appointment_id) where event_type='new' and audience='client' and channel='sms'` | (a) a full unique on the four columns — breaks REQ-F-009 (a second reschedule must send a second SMS); (b) no index | (a) forbids the second reschedule message; the index is a backstop in the shape of D2 |
| E5 | `confirmationUrl` stays the contract's `https://salon.example/...`; the reachable resource is `/api/v1/appointments/{token}` | (a) point `confirmationUrl` at the API path; (b) serve a page outside `/api/v1` | (a) makes a JSON body "the page" and changes the contract's example; (b) is UI, SMS-36. Consequence: REQ-F-004 is proved at the resource level, not the URL |
| E6 | A non-uuid token → **404**, not 400 | 400 | P9 declares no 400; the shared parameter rule already answers 404 for a path value that names no resource |
| E7 | A cancelled record → 200, same token and URL; the state is arranged out of band | (a) defer to S2.3; (b) implement P10 now | The SRS glossary fixes the token's validity; (b) is out of scope; (a) leaves a signed guarantee untested |
| E8 | `master.fullName` on P9 is a **live** join to `masters` | a snapshot column on `appointments` | The contract has no snapshot; the current name is the natural read. Consequence stated: a rename through R4 changes the page |
| E9 | G2 register row 4 (a `startAt` in the past) is **carried forward**, not solved here | Implement the restriction now | No document defines "past"; changing P8 would edit a signed stage (S2.1) outside its gate. Candidate: 422 `BUSINESS_RULE_VIOLATION` on P8. Decision point: **G2**, owner the human — closed there or carried again with a named reason |
| E10 | The SMS text is not representable; the record links by `appointmentId`, and the link is `confirmationUrl` | Add a field to `Notification` | A contract change is an addendum (SMS-45), not S2.2 |

## 6. Commands run

| Command | Result |
|---|---|
| `npx vitest run tests/api/confirmation.test.ts tests/api/notification.test.ts` | exit 1 — 17 failed (17), 0 skipped |
| `npm test` | exit 1 — 17 failed, 223 passed (240) |
| `npx tsc -p tsconfig.json --noEmit` | **exit 0** — the new files type-check; unlike S2.1, no signature change is under test here, so RED is a route failure only |
| `npm run check:test-first` | exit 1 — 7/9; the two new entries report "no commit adds this file", the expected state before the `test:` commit |
| `git status --short src/` | empty |
