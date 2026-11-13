# Control run — S5.4 reports (SMS-35)

| | |
|---|---|
| Stage | S5.4 — R28 revenue, R29 popular services, R30 stock levels |
| Ticket | SMS-35 (Test: SMS-16) |
| Gate | G4 (SMS-7) |
| Date | 2026-11-13 |
| Artifact | `dist/` — the built output, not the sources |
| Script | `logs/runtime/s54-control-run.mjs` (git-ignored) |
| Result | **21/21 checks passed** |

---

## 1. What was run, and how

```
$ npm run build
  schemas:    58
  operations: 50
  copy-contract: src/contract/openapi.json -> dist/src/contract/openapi.json

$ node --env-file-if-exists=.env logs/runtime/s54-control-run.mjs
```

The script loads `dist/src/app.js`, calls **`createApp()` with no argument** (D9)
and drives the application over a real socket on an ephemeral port. The database
is a scratch one, `salon_s54_control_test`, created before the run, migrated from
`src/db/migrations` and dropped afterwards.

Unlike the earlier runs, this one uses the **real clock and the real date**: the
windows are computed from the day the run happens on, and the appointments are
booked for tomorrow and eight days out. That is deliberate — the report's
presets are a function of "today", and a fixture clock would only prove the
fixture. `kyivInstant` resolves the offset at the target instant, so the run does
not depend on the DST season either.

## 2. The checks

```
scratch database created: salon_s54_control_test

--- R28 revenue ---
PASS  R28 resolves the day preset to today, inclusively
PASS  R28 sums only paid payments
PASS  R28 breaks the total down by method, cash before card
PASS  R28’s breakdown adds up to its total
PASS  R28 resolves the week preset to the ISO Monday–Sunday
PASS  R28 resolves the month preset to the calendar month
PASS  R28 answers a custom window as custom, and a window with no payment as zero

--- REQ-F-022: what a period may be ---
PASS  R28 refuses every invalid period with 422 INVALID_PERIOD
PASS  R28 uses §5.4’s sentence
PASS  R28 answers 400 for a date that does not exist

--- R29 popular services ---
PASS  R29 ranks by booking count with the cancelled appointment counted
PASS  R29 starts every ranking at 1
PASS  R29 counts a booking eight days out in a ten-day window
PASS  R29 answers an empty window with no items
PASS  R29 refuses an unknown preset with 422 INVALID_PERIOD

--- R30 stock levels ---
PASS  R30 snapshots at the request’s clock
PASS  R30 lists every material by name, inactive included, at its ledger balance
PASS  R30 ignores a period parameter instead of refusing it

--- Guards ---
PASS  All three operations answer 401 without auth
PASS  All three operations answer 403 for a master
PASS  The run recorded one unpaid payment that revenue does not count

ALL CHECKS PASSED

scratch database dropped: salon_s54_control_test
log trimmed to this run: 45 records in /home/novell/Documents/VScode-projects/pis/salon-management-system/logs/runtime/app-2026-11-13.jsonl
```

### 2.1 What the checks establish

- **REQ-F-022, both forms.** `day` echoes today as both endpoints, `week` echoes
  the ISO Monday–Sunday containing today, `month` the calendar month; a custom
  range is echoed as `custom`. The revenue is 60000 from two paid payments, and
  the breakdown (cash 20000, card 40000) adds up to the total.
- **Q2.** The 15000 payment recorded as `unpaid` is a row in `payments` — the
  run reads the table and finds one — and it is not in the revenue. A window
  with no payment is `0`, `0`, `[]`.
- **Q1 and the refusals.** Six conflicts (neither form, both forms, half a range,
  an unknown preset, a reversed range) are 422 `INVALID_PERIOD` with §5.4's
  sentence; `2026-02-30` is 400.
- **REQ-F-032, D16, Q3, Q4.** The ranking is A 2, B 1 — the cancelled B
  appointment counts, so the decision is visible — the ten-day window sees the
  third A booking, an empty window has no items, and an unknown preset is 422.
- **REQ-F-033, R3, R4.** `asOf` is the request's clock (within two minutes), the
  levels are in name order, the inactive material is listed at 0, the restocked
  one at its ledger balance of 100, and a `period` parameter is ignored rather
  than refused.
- **Guards.** All three operations answer 401 without auth and 403 for a master.

## 3. The requests

The run made **45 requests**:

| # | Request | Status |
|---|---|---|
| 1 | `POST /api/v1/auth/login` | 200 |
| 2 | `POST /api/v1/auth/login` | 200 |
| 3 | `POST /api/v1/admin/services` | 201 |
| 4 | `POST /api/v1/admin/master-services` | 201 |
| 5 | `POST /api/v1/admin/services` | 201 |
| 6 | `POST /api/v1/admin/master-services` | 201 |
| 7 | `PUT /api/v1/me/availability` | 200 |
| 8 | `POST /api/v1/admin/appointments` | 201 |
| 9 | `POST /api/v1/admin/appointments` | 201 |
| 10 | `POST /api/v1/admin/appointments` | 201 |
| 11 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 12 | `POST /api/v1/admin/appointments/{appointmentId}/cancel` | 200 |
| 13 | `POST /api/v1/admin/appointments` | 201 |
| 14 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 15 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 16 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 17 | `POST /api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 18 | `POST /api/v1/admin/appointments/{appointmentId}/payments` | 201 |
| 19 | `POST /api/v1/admin/materials` | 201 |
| 20 | `POST /api/v1/admin/materials` | 201 |
| 21 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 22 | `GET /api/v1/admin/reports/revenue` | 200 |
| 23 | `GET /api/v1/admin/reports/revenue` | 200 |
| 24 | `GET /api/v1/admin/reports/revenue` | 200 |
| 25 | `GET /api/v1/admin/reports/revenue` | 200 |
| 26 | `GET /api/v1/admin/reports/revenue` | 422 |
| 27 | `GET /api/v1/admin/reports/revenue` | 422 |
| 28 | `GET /api/v1/admin/reports/revenue` | 422 |
| 29 | `GET /api/v1/admin/reports/revenue` | 422 |
| 30 | `GET /api/v1/admin/reports/revenue` | 422 |
| 31 | `GET /api/v1/admin/reports/revenue` | 422 |
| 32 | `GET /api/v1/admin/reports/revenue` | 422 |
| 33 | `GET /api/v1/admin/reports/revenue` | 400 |
| 34 | `GET /api/v1/admin/reports/popular-services` | 200 |
| 35 | `GET /api/v1/admin/reports/popular-services` | 200 |
| 36 | `GET /api/v1/admin/reports/popular-services` | 200 |
| 37 | `GET /api/v1/admin/reports/popular-services` | 422 |
| 38 | `GET /api/v1/admin/reports/stock-levels` | 200 |
| 39 | `GET /api/v1/admin/reports/stock-levels` | 200 |
| 40 | `GET /api/v1/admin/reports/revenue` | 401 |
| 41 | `GET /api/v1/admin/reports/revenue` | 403 |
| 42 | `GET /api/v1/admin/reports/popular-services` | 401 |
| 43 | `GET /api/v1/admin/reports/popular-services` | 403 |
| 44 | `GET /api/v1/admin/reports/stock-levels` | 401 |
| 45 | `GET /api/v1/admin/reports/stock-levels` | 403 |

## 4. Defects

**None in the application.** The first version of the script paid one
appointment twice and expected two paid rows; D12 refused the second with 409
`PAYMENT_ALREADY_RECORDED`, which is the application behaving correctly and the
script being wrong. The two defects the run found are both in the script's own
fixture, and the fix is in the script.

## 5. The log records

The run wrote **45 records** to `logs/runtime/app-2026-11-13.jsonl`; the file was
trimmed to this run's records afterwards.

## 6. What the run does not cover

- **A payment recorded in a different window.** `recordedAt` is always "now" in
  any run; the window boundary is covered by the suite's custom ranges and by
  the zero-result checks here, not by back-dated rows.
- **Concurrency.** Reports are reads.
- **Large catalogues.** No pagination exists (the gate's §1.2).
- **The UI.** REQ-NF-002…004 are S5.5's and SMS-36's.
