# TEST-GATE — stage R, the reminder scheduler (SMS-46, register row 11)

| | |
|---|---|
| Gate | TEST-GATE (stage R, scheduler half) |
| Stage | R |
| Ticket | SMS-46 |
| Requirement | REQ-F-010's AC ("messaged 24 hours before"), REQ-F-011 |
| Register | G3 row 11 — "the dispatch happens at the next read, not at the reminder's moment" |
| Date | 2026-11-13 |
| Signed by | setrios |
| Decision | **GO** |

---

## 1. Scope

The base system has no scheduler (H3): a reminder due at 14:00 becomes `sent` at
whatever read comes next. G3 recorded that gap and sent the fix to stage R, with
its own test and its own control run. This gate is that test half.

One addition, no change to an existing one:

> A recurring tick, given the clock, sends every reminder that is due at that
> instant for a **confirmed** appointment, once, and never sends a `skipped`,
> `cancelled` or `failed` row.

### 1.1 What the stage does not change

| Thing | Why it stays |
|---|---|
| The read-triggered dispatch (H3) | It is still the fallback when no scheduler runs (a CLI import, a test app). The tick is an addition, not a replacement: `dispatchDueReminders` is untouched, and the suite's reminder cases keep passing |
| `sent_at` semantics | The tick writes its own instant, exactly as the read does — the row records when the hand-off happened |
| Any route, status code or response field | The scheduler has no HTTP surface |
| The `cancelled` value of addendum 001 | S3 asserts the tick refuses those rows, which is the reason the addendum's settlement was worth a gate of its own |

### 1.2 Where the boundary is

`runDueReminders(now)` is the whole behaviour and is tested with an explicit
clock; `startReminderScheduler` is the timer around it and is tested with fake
timers. That split is what keeps the suite deterministic: no case waits for real
time, and the two that use a timer never touch the database.

## 2. Case → source

| Case | Asserts | Source |
|---|---|---|
| S1 | a due reminder becomes `sent` at the tick's instant with no read in front of it; `sentAt` is that instant | REQ-F-010's AC; row 11 |
| S2 | a reminder still ahead is untouched; the tick sends only what has come due | REQ-F-010 (the 24 h moment is a moment, not a switch) |
| S3 | a `skipped` row is never sent; a `cancelled` one is never sent | H4; addendum 001 |
| S4 | a completed appointment's due reminder is not sent | H5 |
| S5 | two ticks at one instant send once; `sentAt` stays the first | REQ-F-005 "exactly one"; R10 |
| S6 | the scheduler calls the tick on its interval and stops when stopped | row 11 (a schedule that cannot be stopped is a leak) |
| S7 | a failing tick is reported and does not unschedule the rest | row 11 (one bad minute must not stop reminders for good) |

## 3. RED

```
$ npx tsc -p tsconfig.json --noEmit
tests/api/reminder-scheduler.test.ts(35,8): error TS2307: Cannot find module
  '../../src/modules/notifications/scheduler.js'
```

```
$ npx vitest run tests/api/reminder-scheduler.test.ts
      Tests  no tests
```

The module does not exist, so the file cannot even load: the RED is total, and
`check:test-first` proves the ordering (`22/22 entries pass` — the manifest entry
is present and `scheduler.ts` is absent at this commit).

### 3.4 Correction found while turning S5 green

S5 booked a 14:00 start but ticked at `AT_THE_24H_MOMENT` (12-06 10:00), which is
*before* that record's 24 h moment (12-06 14:00), so the first tick sent nothing:

```
AssertionError: expected 0 to be greater than or equal to 1
```

The case now ticks at its own record's moment. The correction is a `test:` commit;
the property it asserts — one send, then silence — is unchanged.

## 3.5 Correction caused by this stage, in an earlier gate

N4 (REQ-NF-005) forbade every `setInterval`, and the new scheduler tripped it.
The rule was refined to "no deletion anywhere; repetition is evidence only when it
deletes" in a `test:` commit, recorded in `logs/gates/2026-11-13-test-SMS-20.md`
§3.5. The gate is amended here because the change was caused here.

## 4. What GREEN implements

- `src/modules/notifications/scheduler.ts` — `runDueReminders(now)` (one
  statement over every due row of every confirmed appointment) and
  `startReminderScheduler({ now, intervalMs, run?, onError? })` (the timer).
- `src/index.ts` — starts the scheduler with the process clock and the documented
  interval, and stops it on SIGINT/SIGTERM before the socket closes.

## 5. Commands GREEN must run

```
npx tsc -p tsconfig.json --noEmit
npx vitest run
npx vitest run --sequence.shuffle
npm run check:test-first
npm run verify:contract
npm run build
node --env-file-if-exists=.env logs/runtime/s46-scheduler-run.mjs
```

plus `logs/runs/runs-19.md`.

## 6. Decision

**GO.** Seven cases, each about one clause of the requirement or one property of
the timer; the tick is separate from the timer so the suite stays deterministic.

Signed by: setrios  Date: 2026-11-13
