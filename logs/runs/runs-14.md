# Control run — S5.2 material transactions (SMS-33)

| | |
|---|---|
| Stage | S5.2 — R25 `listMaterialTransactions`, R26 `createMaterialTransaction` |
| Ticket | SMS-33 |
| Gate | G4 (SMS-7) |
| Date | 2026-11-13 |
| Artifact | `dist/` — the built output, not the sources |
| Script | `logs/runtime/s52-control-run.mjs` (git-ignored) |
| Result | **30/30 checks passed** |

---

## 1. What was run, and how

```
$ npm run build
  schemas:    58
  operations: 50
  copy-contract: src/contract/openapi.json -> dist/src/contract/openapi.json

$ node --env-file-if-exists=.env logs/runtime/s52-control-run.mjs
```

The script loads `dist/src/app.js` and calls **`createApp()` with no argument** —
the shape `index.ts` uses (D9) — then drives the application over a real socket
on an ephemeral port. The database is a scratch one,
`salon_s52_control_test`, created before the run, migrated from
`src/db/migrations` (including `0006_material_transactions.sql`) and dropped
after it. Neither the development database nor the suite's `_test` database is
touched.

The run uses the real clock but does not depend on it: every `occurredAt` is a
fixed instant in November and December 2026, and the ledger's order is asserted
against those instants, not against "now".

## 2. The checks

```
scratch database created: salon_s52_control_test

--- R26 POST /admin/materials/{id}/transactions ---
PASS  R26 answers 201 with a MaterialTransaction
PASS  R26 echoes occurredAt in the salon offset
PASS  R26 sets no Location header (M5)
PASS  R26 receipt raises the balance to 350 (REQ-F-020)
PASS  R26 issue lowers the balance to 160 (REQ-F-020)
PASS  R26 moves the material’s updatedAt (M9)

--- The stock rule (D13) ---
PASS  R26 allows an issue equal to the balance, leaving zero
PASS  R26 answers 409 MATERIAL_STOCK_INSUFFICIENT above the balance
PASS  R26 names both numbers and the unit in the refusal (error-model.md §5.6)
PASS  R26 writes nothing on refusal: balance unchanged, ledger empty
PASS  R26 checks the running balance, not the opening stock

--- The contract’s body ---
PASS  R26 answers 422 for each body the contract closes
PASS  R26 answers 400 for no body at all
PASS  R26 wrote nothing for any refusal

--- Guards ---
PASS  R26 answers 404 for an unknown material
PASS  R26 answers 400 for a non-uuid id
PASS  R26 answers 401 without auth
PASS  R26 answers 403 for a master
PASS  R26 answers 415 for a wrong media type
PASS  R26 accepts a transaction on an inactive material (M6)

--- R25 GET /admin/materials/{id}/transactions ---
PASS  R25 answers 200 with the MaterialTransactionPage shape
PASS  R25 returns the ledger newest first (M3)
PASS  R25 filters by type without reordering
PASS  R25 filters by an inclusive from day (M4)
PASS  R25 filters by an inclusive to day (M4)
PASS  R25 pages with page and pageSize and keeps the total
PASS  R25 answers an empty page for a material without a ledger
PASS  R25 answers 404 for an unknown material
PASS  R25 answers 400 for a non-uuid id and for bad query values
PASS  R25 answers 401 without auth and 403 for a master

ALL CHECKS PASSED

scratch database dropped: salon_s52_control_test
log trimmed to this run: 60 records in /home/novell/Documents/VScode-projects/pis/salon-management-system/logs/runtime/app-2026-11-13.jsonl
```

### 2.1 What the checks establish

- **REQ-F-020's arithmetic.** A receipt of 250 on a balance of 100 answers 201 and
  leaves 350; an issue of 20 on 180 leaves 160; an issue equal to the balance
  leaves zero. The balance is read back through R15 after every write, so the
  assertion is on stored state, not on the response alone.
- **D13's refusal.** An issue of 250 on 180 is 409 `MATERIAL_STOCK_INSUFFICIENT`,
  the detail is `error-model.md` §5.6's sentence with both numbers and the
  material's unit, and *neither* the balance nor the ledger moved.
- **The running balance.** 150 − 100 succeeds and a second 100 is refused; the
  balance stays 50 and the ledger has one row. The check reads the balance under
  the row lock, not the opening stock.
- **The contract's body.** Six closed-field violations are 422; a missing body is
  400; nothing is written by any of them.
- **The guards** — 404, 400 for a non-uuid id, 401, 403 and 415 — and M6: an
  inactive material still takes a transaction.
- **The ledger (R25).** Newest first, `type` filters without reordering, `from`
  and `to` are inclusive days, paging keeps the total, an empty ledger is the
  contract's empty page, and 404/400/401/403 match the declaration.

## 3. The requests

The run made **60 requests** in total:

| # | Request | Status |
|---|---|---|
| 1 | `POST /api/v1/auth/login` | 200 |
| 2 | `POST /api/v1/auth/login` | 200 |
| 3 | `POST /api/v1/admin/materials` | 201 |
| 4 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 5 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 6 | `POST /api/v1/admin/materials` | 201 |
| 7 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 8 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 9 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 10 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 11 | `POST /api/v1/admin/materials` | 201 |
| 12 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 13 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 14 | `POST /api/v1/admin/materials` | 201 |
| 15 | `POST /api/v1/admin/materials/{materialId}/transactions` | 409 |
| 16 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 17 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 18 | `POST /api/v1/admin/materials` | 201 |
| 19 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 20 | `POST /api/v1/admin/materials/{materialId}/transactions` | 409 |
| 21 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 22 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 23 | `POST /api/v1/admin/materials` | 201 |
| 24 | `POST /api/v1/admin/materials/{materialId}/transactions` | 422 |
| 25 | `POST /api/v1/admin/materials/{materialId}/transactions` | 422 |
| 26 | `POST /api/v1/admin/materials/{materialId}/transactions` | 422 |
| 27 | `POST /api/v1/admin/materials/{materialId}/transactions` | 422 |
| 28 | `POST /api/v1/admin/materials/{materialId}/transactions` | 422 |
| 29 | `POST /api/v1/admin/materials/{materialId}/transactions` | 422 |
| 30 | `POST /api/v1/admin/materials/{materialId}/transactions` | 400 |
| 31 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 32 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 33 | `POST /api/v1/admin/materials/{materialId}/transactions` | 404 |
| 34 | `POST /api/v1/admin/materials/{materialId}/transactions` | 400 |
| 35 | `POST /api/v1/admin/materials/{materialId}/transactions` | 401 |
| 36 | `POST /api/v1/admin/materials/{materialId}/transactions` | 403 |
| 37 | `POST /api/v1/admin/materials/{materialId}/transactions` | 415 |
| 38 | `POST /api/v1/admin/materials` | 201 |
| 39 | `PATCH /api/v1/admin/materials/{materialId}` | 200 |
| 40 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 41 | `GET /api/v1/admin/materials/{materialId}` | 200 |
| 42 | `POST /api/v1/admin/materials` | 201 |
| 43 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 44 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 45 | `POST /api/v1/admin/materials/{materialId}/transactions` | 201 |
| 46 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 47 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 48 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 49 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 50 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 51 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 52 | `POST /api/v1/admin/materials` | 201 |
| 53 | `GET /api/v1/admin/materials/{materialId}/transactions` | 200 |
| 54 | `GET /api/v1/admin/materials/{materialId}/transactions` | 404 |
| 55 | `GET /api/v1/admin/materials/{materialId}/transactions` | 400 |
| 56 | `GET /api/v1/admin/materials/{materialId}/transactions` | 400 |
| 57 | `GET /api/v1/admin/materials/{materialId}/transactions` | 400 |
| 58 | `GET /api/v1/admin/materials/{materialId}/transactions` | 400 |
| 59 | `GET /api/v1/admin/materials/{materialId}/transactions` | 401 |
| 60 | `GET /api/v1/admin/materials/{materialId}/transactions` | 403 |

## 4. Defects

**None in the application.** All 30 checks passed on the compiled artifact. The
one implementation-side change that the tests forced is recorded in the gate's
§1.5: query coercion now enforces numeric bounds (`pageSize=0` used to reach the
response validator and turn into a 500).

## 5. The log records

The run wrote **60 records** to `logs/runtime/app-2026-11-13.jsonl`; the file is
append-only, so it was trimmed to this run's records afterwards, as the earlier
stages' runs were.

## 6. What the run does not cover

- **Concurrency.** The run issues one request at a time. Two simultaneous issues
  are serialised by the row lock (M8); the suite asserts the sequential rule and
  the lock is stated as the mechanism, not measured under load.
- **The stock-levels report** (`GET /admin/reports/stock-levels`, S5.5/SMS-35).
- **Unit conversion.** Nothing converts `l` to `ml`; the quantity is in the
  material's own unit.
- **Editing or deleting a transaction.** The contract has no such operation.
