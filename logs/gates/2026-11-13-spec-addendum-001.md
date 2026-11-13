# SPEC-ADDENDUM-GATE — addendum 001 (cancelled reminders)

| | |
|---|---|
| Gate | SPEC-ADDENDUM-GATE |
| Addendum | `spec/addenda/001-cancelled-reminders.md` |
| Ticket | SMS-45 |
| Requirement | REQ-F-034 (new) |
| Change | a cancelled appointment's pending reminders become `cancelled` |
| Chosen by | the developer, 2026-11-13 — option D of the three presented (D, A, B); C contradicted REQ-F-010/REQ-F-029 and was excluded before the choice |
| Date | 2026-11-13 |
| Signed by | setrios |
| Decision | **GO** |

---

## 1. What this gate decides

Whether the change may enter the specification. Plan §8.1 asks four questions of
it and nothing else; this record answers them one at a time, and does not
re-decide the base specification.

## 2. The four criteria

| # | Criterion (plan §8.1) | Assessment | Evidence |
|---|---|---|---|
| 1 | Genuinely absent from SRS v1.3 | **pass** | no sentence in the SRS covers cancellation's effect on reminders; register row 10 (G3 §4) named it, and two test files deliberately assert nothing about it (`tests/api/cancellation.test.ts` F2, `tests/api/reminders.test.ts` — "the shape is row 10's, not this file's") |
| 2 | Does not contradict an existing REQ | **pass** | REQ-F-005/010/011 state when rows are written, not what a later cancellation does to them; REQ-F-029's reactivation-on-reschedule still applies to `skipped` rows on a live record, and a cancelled record cannot be rescheduled (P11 is 409 on it) |
| 3 | Requires an OpenAPI contract change | **pass** | two enums (`Reminder.status`, `Notification.status`), one query parameter enum (`listMyNotifications.status`) and one example (P10's `skipped` → `cancelled`); no operation or schema is added, so the counts stay 50 and 58 |
| 4 | Implementable without breaking the base regression | **pass** | one pure function, one `update` statement inside the existing cancellation write, one migration widening a check constraint; exactly one existing assertion changes (R9), and it changes because the requirement it was silent about now exists |

## 3. What the change states

REQ-F-034: *when an appointment is cancelled, every reminder of that appointment
that is still `scheduled` becomes `cancelled`; a reminder already `sent`,
`skipped` or `failed` keeps its status.*

The addendum's §2 argues why the value is a new one rather than the existing
`skipped`: `skipped` already means "the moment had passed when the record was
written", decided at booking; a cancelled reminder may still be in the future and
is decided by a later transition. Reusing the value would make two different
facts indistinguishable in the record.

**The contract's example is corrected, not followed.** P10's example showed
`skipped` because there was no third value; it now shows `cancelled`. An example
is not a requirement, but it was the only place the contract stated an opinion.

## 4. What this gate does not decide

- **Whether the behaviour is implemented.** That is the addendum's TEST-GATE,
  which follows the tests (plan §8.1 step 6).
- **`notificationsSummary`.** The object is declared in `AppointmentAdmin` and no
  operation produces it (S5.3's N7). It keeps its four counts; when an operation
  produces it, it will need a fifth. Named in the addendum §4 so the omission is
  a decision.
- **The order of this stage against stage R.** Plan §2 places refactoring before
  the addendum; the developer's instruction of 2026-11-13 reverses that for this
  run, and both the addendum (§8) and this gate record it. The effect is that the
  refactoring pass will cover the amended code, which is the reason given for the
  order.

## 5. Consequences

| Artifact | Next step |
|---|---|
| `spec/addenda/001-cancelled-reminders.md` | committed (`c57b0c8`) — it is now the requirement text for REQ-F-034 |
| `openapi.yaml` | gains the two enum values, the query enum value and the corrected example (§8.1 step 5) |
| `spec/api/api-traceability.md` | gains a row for REQ-F-034 |
| `docs/ticket-list.md`, `docs/issue-import.csv` | SMS-45 renamed and moved to In progress (`c57b0c8`) |
| tests | a new file for the eight acceptance criteria, plus R9 amended — first, then RED, then the addendum's TEST-GATE |

## 6. Decision

**GO.** The change is genuinely absent from SRS v1.3, contradicts nothing, needs
the contract, and its implementation is one statement and one constraint; the
requirement text and the acceptance criteria are written before any code.

Signed by: setrios  Date: 2026-11-13
