# runs-19 — stage R scheduler control run (SMS-46, register row 11)

| | |
|---|---|
| Run | 19 |
| Ticket | SMS-46 (stage R, scheduler half) |
| Requirements | REQ-F-010 (the 24 h moment), REQ-F-011 |
| Date | 2026-11-13 |
| Script | `logs/runtime/s46-scheduler-run.mjs` |
| Artifact | `dist/` after `npm run build` (50 operations, 58 schemas) |
| Target | scratch database `salon_s46_scheduler_test`, created and dropped by the script |
| Result | **13 / 13 checks passed** |

The suite proves the tick with an explicit clock on the sources; this run proves
it on the built application and shows that the **process** — not the app — starts
it.

---

## 1. Checks

| # | Check | Result |
|---|---|---|
| 1 | The artifact books an appointment three hours ahead | pass |
| 2 | Its rows are `skipped` and `scheduled` before anything ticks | pass |
| 3 | A tick now sends nothing | pass |
| 4 | A tick at the moment sends exactly one row | pass |
| 5 | The 2 h row is `sent`, the `skipped` one is untouched | pass |
| 6 | `sentAt` is the tick's instant, not a read's | pass |
| 7 | A second tick at the same instant sends nothing | pass |
| 8 | A cancelled appointment's rows stay `skipped` / `cancelled` | pass |
| 9 | A completed appointment's due reminder is not sent (H5) | pass |
| 10 | The scheduler ticks more than once in 150 ms at a 40 ms period | pass |
| 11 | Stopping it stops the ticks | pass |
| 12 | `index.js` starts the scheduler (so `npm start` ticks) | pass |
| 13 | `index.js` stops it before the socket drains | pass |

## 2. What each group answers

| Group | Question |
|---|---|
| 1–3 | Does the tick stay silent until a moment arrives? |
| 4–6 | Does a due row become `sent` at the tick's instant, with no read involved? |
| 7 | Is "exactly one" (REQ-F-005) still true when two ticks coincide? |
| 8–9 | Does the tick refuse the rows H4/H5 and addendum 001 say it must? |
| 10–11 | Is the timer bounded — does it tick and does it stop? |
| 12–13 | Is the scheduler the process's, started by `index.js` and stopped on shutdown? |

## 3. The clock the run uses

The run's appointments start at `now + {180, 210, 240}`, rounded to the next half
hour (a start off the boundary is 422, D3), and the ticks are driven with an
explicit instant rather than by waiting: the run is evidence about the statement,
not about the wall clock. Check 10 is the only one that waits, and it waits
150 ms on a stub tick that touches no database.

## 4. Requests as logged

Fifteen records; the log was trimmed to them by the script.

| # | Method | Path | Status |
|---|---|---|---|
| 1 | POST | `/api/v1/auth/login` | 200 |
| 2 | POST | `/api/v1/auth/login` | 200 |
| 3 | POST | `/api/v1/admin/services` | 201 |
| 4 | POST | `/api/v1/admin/master-services` | 201 |
| 5 | PUT | `/api/v1/me/availability` | 200 |
| 6 | POST | `/api/v1/admin/appointments` | 201 |
| 7 | GET | `/api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 8 | POST | `/api/v1/admin/appointments` | 201 |
| 9 | POST | `/api/v1/admin/appointments/{appointmentId}/cancel` | 200 |
| 10 | GET | `/api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 11 | GET | `/api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 12 | POST | `/api/v1/admin/appointments` | 201 |
| 13 | POST | `/api/v1/admin/appointments/{appointmentId}/complete` | 200 |
| 14 | GET | `/api/v1/admin/appointments/{appointmentId}/notifications` | 200 |
| 15 | GET | `/api/v1/admin/appointments/{appointmentId}/notifications` | 200 |

## 5. What the run does not cover

- **A process left running for a real minute.** The interval is asserted on a
  stub tick (checks 10–11) and its wiring in the shipped entry (12–13); a real
  minute-long wait would be evidence about the machine, not the code.
- **Two processes ticking at once.** `runDueReminders` is one `update`, so the
  second tick finds the row no longer `scheduled`; check 7 is that property at one
  instant, and the suite's S5 is the same property at one instant in-process.

## 6. Command

```
npm run build
node --env-file-if-exists=.env logs/runtime/s46-scheduler-run.mjs
```

Recorded output: `logs/runtime/s46-run-output.txt`.
