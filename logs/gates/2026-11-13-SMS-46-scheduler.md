# STAGE-R-GATE — the reminder scheduler (SMS-46, register row 11)

| | |
|---|---|
| Gate | STAGE-R-GATE (scheduler half) |
| Stage | R |
| Ticket | SMS-46 |
| Requirement | REQ-F-010 (AC: "messaged 24 hours before"), REQ-F-011 |
| Register | G3 row 11 — closed by this gate |
| Preceded by | REFACTOR `logs/gates/2026-11-13-refactor-SMS-46.md`, TEST-GATE `logs/gates/2026-11-13-test-SMS-46-scheduler.md` |
| Date | 2026-11-13 |
| Signed by | setrios |
| Decision | **GO** |

---

## 1. What changed

| Artifact | Change |
|---|---|
| `src/modules/notifications/scheduler.ts` | **new** — `runDueReminders(now)` (one statement) and `startReminderScheduler(...)` (the timer) |
| `src/index.ts` | starts the scheduler with the process clock; stops it first on SIGINT/SIGTERM |
| `tests/api/reminder-scheduler.test.ts` | **new** — S1–S7 |
| `tests/manifest.json` | the 22nd entry |
| `tests/acceptance/nfr.test.ts` | N4 refined (see the SMS-20 gate §3.5) |

No operation, schema, status code or response field changed: the scheduler has no
HTTP surface, and `spec/api/openapi.yaml` is untouched by the stage.

## 2. Register row 11 — closed

The row said: *"The dispatch happens at the next read, not at the reminder's
moment (H3). REQ-F-010's AC says `sent` at the correct time; with no scheduler, a
reminder due at 14:00 becomes `sent` at whatever read comes next."*

| Before | After |
|---|---|
| a due row waited for the next read of P9, P11, R20 or R24 | a due row is sent by the process's tick, within one interval of its moment |
| the only trigger was a read | both triggers exist: the tick, and the read as the fallback for a process without a scheduler |
| `sentAt` was always a read's instant | `sentAt` is the tick's instant, or the read's when no scheduler runs |

**Not claimed:** that the message is delivered at the exact second. The tick is
the process's, its period is 60 s, so a reminder due at 14:00:00 is sent at the
first tick at or after it — at most one period late, and the row records the
instant it was actually sent (`sentAt`), not the instant it was due
(`scheduledAt`). That is the same statement the base made about reads, now with a
bounded delay instead of an unbounded one.

## 3. Evidence

| Evidence | Where |
|---|---|
| Seven cases, one per clause | `tests/api/reminder-scheduler.test.ts`; RED in the TEST-GATE §3 |
| Suite before/after | 388/388 → **395/395 in 24 files**; three shuffled runs 395/395 |
| Causality | `check:test-first` — 22/22 entries pass |
| Contract | `verify:contract` — 50 operations, unchanged |
| Control run | `logs/runs/runs-19.md` — 13/13 checks on `dist/` |
| Wiring | `runs-19` checks 12–13: the shipped `index.js` starts it and stops it |

## 4. Two behaviours the gate had to keep

| Rule | How it is kept |
|---|---|
| H5 — a cancelled or completed record is never dispatched | the tick's correlated `exists` over `appointments.status = 'confirmed'`; S4 and `runs-19` check 9 |
| "Exactly one" (REQ-F-005) | the tick is one `update` guarded by `status = 'scheduled'`; S5 and `runs-19` check 7 |
| Addendum 001 — a cancelled reminder is never sent | the settlement runs first and the tick only sends `scheduled`; S3 and `runs-19` check 8 |

## 5. Deviations recorded

- **The tick runs at `createApp`'s sibling, not inside it.** `src/index.ts` owns
  it, so a test app or a one-off script has no timer. That is a deliberate
  placement: a scheduler inside `app.ts` would make every test process tick.
- **The interval is a constant, not a setting.** 60 s is documented in
  `scheduler.ts`; a configuration knob would be a new requirement, and none asks
  for one.
- **`N4` was refined, not circumvented.** The acceptance check now forbids
  deletion and "repeats and deletes", rather than all repetition; the
  justification and the failing evidence are in the SMS-20 gate §3.5.

## 6. Decision

**GO.** Row 11 is closed with a test-first change, a signed refactor record for
the behaviour-preserving half, and a control run on the built artifact; the
base's read-triggered dispatch and H5 are unchanged.

Signed by: setrios  Date: 2026-11-13
