# Refactor record — SMS-49, second pass (task step 6)

| | |
|---|---|
| Gate | REFACTOR (plan §9; task step 6 — the code an addendum changed) |
| Stage | step 6 |
| Ticket | SMS-49 |
| Commit | `3206b05` — `refactor: one due-reminder statement for both dispatchers (SMS-49)` |
| Date | 2026-11-14 |
| Signed by | setrios |
| Decision | **GO** — external behaviour unchanged |

This is the second refactoring in the project. The first (`95c5a70`, stage R,
record `2026-11-13-refactor-SMS-46.md`) took the duplication that the base
implementation had accumulated. This one takes the duplication that addendum 001
left behind: the code it added and the code it touched.

**Ordering, stated plainly.** The plan puts a refactoring at step 3 (after the base
implementation) and another at step 6 (after the addendum). Stage R ran after the
addendum, so the first record covers step 3's *scope* but not its position in the
sequence. This record is step 6 and its position is correct: it comes after the
addendum and before the validation.

## 1. What was duplicated, and where

The audit looked only at the code the addendum added or changed — that is the
scope this step is given.

| # | Duplication | Evidence before |
|---|---|---|
| 1 | The due-reminder `update … set status = 'sent'` was written out twice: once per appointment, once for every appointment | `src/modules/notifications/service.ts` `dispatchDueReminders` and `src/modules/notifications/scheduler.ts` `runDueReminders` — same four conditions, same `exists` guard, differing only in scope |
| 2 | The reminder event-type list existed in three shapes | `REMINDER_EVENT_TYPES` in `scheduler.ts`, the literal `['reminder_24h', 'reminder_2h']` in two places in `service.ts`, and the offsets table in `reminders.ts` |
| 3 | A pure helper with no caller | `settledByCancellation` in `src/modules/notifications/cancellation.ts` — 0 references in `src/` and `tests/` |

## 2. What was done

| # | Change | After |
|---|---|---|
| 1 | The statement moved to `src/modules/notifications/dispatch.ts` as `markDueRemindersSent(db, now, appointmentId?)`; both callers delegate | one statement, one rule; the scope is the third argument — omitted means the tick, a value means the read |
| 2 | `REMINDER_EVENT_TYPES` derives from `REMINDER_OFFSETS` in `reminders.ts`; `scheduler.ts` and both `service.ts` sites import it | one list, derived from the moments, so a new reminder cannot be added to one place only |
| 3 | `settledByCancellation` removed | no dead code in the addendum's module |

`git show --stat 3206b05`: **5 files changed, 97 insertions(+), 80 deletions(-)**, one
new file (`dispatch.ts`).

## 3. Why these three and not more

The rest of the addendum's surface was checked and left alone, because there was no
duplication to remove rather than because it was overlooked:

- the two cancellation paths (`cancelByToken`, `transitionAppointmentById`) share
  `settleCancelledReminders` already; the duplication this step removes is above it,
  in the dispatch, not in the settlement;
- the settlement's doc comment is long on purpose — it states the rule and its
  justification, and it is the same in both callers' heads, not copy-pasted code;
- the `event_type` CHECK constraint in `src/db/schema.ts` still carries the literal
  list. It is a database constraint rendered into the migration SQL, not application
  logic: deriving it from a TypeScript constant would make the schema depend on
  runtime code and desynchronise the migration history. Left as it is, deliberately.

## 4. Proof — the suite, before and after

| Run | Before (`HEAD` = `5d01628`) | After (`3206b05`) |
|---|---|---|
| `npx vitest run` | 24 files, **395/395** | 24 files, **395/395** |
| `npx vitest run --sequence.shuffle` | **395/395** | **395/395**, three separate runs |

No test file was edited in this commit — the suite is byte-identical before and
after (`git show --stat` lists no file under `tests/`).

```
$ npx vitest run            # after
 Test Files  24 passed (24)
      Tests  395 passed (395)
```

## 5. Proof — the contract

```
$ npm run verify:contract
contract: 3.0.3 — 50 operations
```

50 operations before and after; no schema name, status code or response field
appears in the diff.

## 6. Proof — the diff review

```
$ git diff -U0 3206b05^ 3206b05 | grep -E "^[-+].*router\.(get|post|patch|put|delete)\("
(empty — no route registration added, removed or changed)
```

The diff touches only `src/modules/notifications/`: the new module, the two
callers, the reminder helpers and the addendum's cancelled-reminders module.

## 7. Decision

**GO.** Three duplications removed — one statement instead of two, one event-type
list instead of three, no dead helper. 395/395 before and after, three shuffled
runs green, 50 operations before and after, no route or response field changed.

Signed by: setrios  Date: 2026-11-14
