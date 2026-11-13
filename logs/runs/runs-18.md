# runs-18 — addendum 001 control run (SMS-45)

| | |
|---|---|
| Run | 18 |
| Ticket | SMS-45 (addendum) |
| Requirement | REQ-F-034 |
| Date | 2026-11-13 |
| Script | `logs/runtime/s45-addendum-run.mjs` |
| Artifact | `dist/` after `npm run build` (50 operations, 58 schemas) |
| Target | scratch database `salon_s45_addendum_test`, created and dropped by the script |
| Result | **18 / 18 checks passed** |

The suite proves the rule on the sources; this run proves it on the built
application over a socket, which is what `npm start` executes.

---

## 1. Checks

| # | Check | Result |
|---|---|---|
| 1 | The artifact books a far-ahead appointment | pass |
| 2 | Both reminders are `scheduled` before the cancellation | pass |
| 3 | P10 answers 200 | pass |
| 4 | P10's body already carries both reminders as `cancelled` | pass |
| 5 | A later read agrees: no reminder is scheduled any more | pass |
| 6 | The table holds two `cancelled` reminder rows and nothing else | pass |
| 7 | The artifact books the short-notice appointment | pass |
| 8 | Its 24 h reminder was `skipped` at booking, the 2 h one `scheduled` | pass |
| 9 | Cancellation leaves `skipped` as `skipped` and settles the other | pass |
| 10 | A second cancellation answers 200 and changes nothing | pass |
| 11 | R22 settles the reminders exactly as P10 does | pass |
| 12 | R24 returns the reminder rows with the new status | pass |
| 13 | M7 accepts `status=cancelled` | pass |
| 14 | M7 still refuses a value outside the enum (400) | pass |
| 15 | The shipped bundle carries the value in both schemas | pass |
| 16 | The shipped bundle keeps 50 operations and 58 schemas | pass |
| 17 | The settlement exists in the build and matches only `scheduled` rows | pass |
| 18 | No `scheduled` row is left for a cancelled appointment | pass |

## 2. What each group answers

| Group | Question |
|---|---|
| 1–6 | Does the cancellation settle the rows on the client's path, in the answer, on a later read and in the table? |
| 7–9 | Does it leave alone the rows that record something that already happened? |
| 10 | Is the repeat still idempotent (F1), including `updatedAt`? |
| 11 | Does the administrator's path behave identically? |
| 12–16 | Does the contract surface carry the value — R24's rows, M7's filter, the bundle's enums, and the unchanged counts? |
| 17–18 | Is the write scoped to `scheduled`, and does a cancelled record end with nothing pending? |

## 3. Requests as logged

Sixteen records; the log was trimmed to them by the script, so
`logs/runtime/app-2026-11-13.jsonl` holds this run only.

| # | Method | Path | Status |
|---|---|---|---|
| 1 | POST | `/api/v1/auth/login` | 200 |
| 2 | POST | `/api/v1/auth/login` | 200 |
| 3 | POST | `/api/v1/admin/services` | 201 |
| 4 | POST | `/api/v1/admin/master-services` | 201 |
| 5 | PUT | `/api/v1/me/availability` | 200 |
| 6 | POST | `/api/v1/admin/appointments` | 201 |
| 7 | POST | `/api/v1/appointments/{token}/cancel` | 200 |
| 8 | GET | `/api/v1/appointments/{token}` | 200 |
| 9 | POST | `/api/v1/admin/appointments` | 201 |
| 10 | POST | `/api/v1/appointments/{token}/cancel` | 200 |
| 11 | POST | `/api/v1/appointments/{token}/cancel` | 200 |
| 12 | POST | `/api/v1/admin/appointments` | 201 |
| 13 | POST | `/api/v1/admin/appointments/{appointmentId}/cancel` | 200 |
| 14 | GET | `/api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 15 | GET | `/api/v1/me/notifications` | 200 |
| 16 | GET | `/api/v1/me/notifications` | 400 |

## 4. What the run does not cover

- **A reminder that was already `sent`.** The run's clock is the real one, and a
  `sent` row needs a moment in the past on a record that is still live; the suite
  covers it with two clocks (C4 in `tests/api/cancelled-reminders.test.ts`). The
  run covers the `skipped` half of the same rule (checks 8–9), which the real clock
  can produce.
- **The migration from an un-widened database.** The scratch database is created
  empty and migrated by the runner, so 0008 applies to a fresh schema; the
  `drop constraint` / `add constraint` pair is the same statement on a populated
  one, and the schema's `check` is what both paths share.

## 5. Command

```
npm run build
node --env-file-if-exists=.env logs/runtime/s45-addendum-run.mjs
```

Recorded output: `logs/runtime/s45-run-output.txt`.
