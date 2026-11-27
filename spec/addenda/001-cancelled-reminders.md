# Addendum 001 — reminders of a cancelled appointment

| | |
|---|---|
| Addendum | 001 |
| Ticket | SMS-45 |
| Requirement | REQ-F-034 (new) |
| Change | A cancelled appointment's pending reminders become `cancelled` |
| Adds to | SRS v1.3, REQ-F-005, REQ-F-010, REQ-F-011 |
| Contract | `openapi.yaml` — `Reminder.status`, `Notification.status`, one query enum, one example |
| Status | gated: SPEC-ADDENDUM-GATE `logs/gates/2026-11-13-spec-addendum-001.md` |

---

## 1. The gap this closes

SRS v1.3 says when reminders are written (REQ-F-005 for the confirmation
message, REQ-F-010 for the 24-hour and REQ-F-011 for the 2-hour reminder) and
when one is skipped at booking (a moment that was already past, REQ-F-029's
precondition). It says nothing about what happens to a reminder that has been
*scheduled* and whose appointment is then **cancelled**.

Three artifacts disagree:

| Artifact | What it says |
|---|---|
| SRS v1.3 | nothing — no sentence covers cancellation's effect on reminders |
| `openapi.yaml`, P10's 200 example | a cancelled record shows `status: skipped` |
| the implementation (S3.2, H5) | the rows stay `scheduled`; they are simply never dispatched |

`skipped` and `scheduled` are both defensible readings, and neither is stated.
The carry-forward register (row 10, G3 §4) sent the decision to this addendum
rather than to code, and `tests/api/reminders.test.ts` R9 and
`tests/api/cancellation.test.ts` F2 deliberately assert nothing about the shape.

## 2. Requirement text

> **REQ-F-034 — cancellation settles the reminders that have not been sent.**
> When an appointment is cancelled, every reminder of that appointment that is
> still `scheduled` becomes `cancelled`. A reminder that was already `sent`,
> `skipped` or `failed` keeps its status: it records what happened before the
> cancellation, and cancelling an appointment does not rewrite the past.
>
> *AC:* after a cancellation, `Appointment.reminders[]` contains no `scheduled`
> row, a `cancelled` row is never dispatched, and a second cancellation changes
> nothing.

**Why a new status rather than `skipped`.** `skipped` already means a specific
thing in this system — "the moment had passed when the record was written (H2,
H4)" — and it is decided at booking or reschedule. A cancelled reminder is
different in both directions: its moment may still be in the future (so it is not
the same event), and it is decided by a later state transition (so it is not the
same cause). Reusing `skipped` would make the value mean two things and would make
"was this reminder skipped at booking or cancelled afterwards?" unanswerable from
the record — which is exactly the question a support conversation asks.

**Why the contract's example is changed rather than followed.** The example shows
`skipped` because there was no third value at the time; the addendum adds one and
updates the example to it. An example is not a requirement, but it is the only
place the contract stated an opinion, so it is corrected rather than left to
contradict the new text.

## 3. Acceptance criteria, as they will be tested

| # | Criterion |
|---|---|
| 1 | P10 cancellation turns each `scheduled` reminder into `cancelled` |
| 2 | R22 cancellation (the administrator's path) does the same |
| 3 | a `skipped` reminder stays `skipped` after cancellation |
| 4 | a `sent` reminder stays `sent` after cancellation |
| 5 | a `cancelled` reminder is never dispatched, however late it is read |
| 6 | a second cancellation answers 200 and changes nothing (`updatedAt` included) |
| 7 | the notification list (R24) shows the rows with `status: cancelled`, and `listMyNotifications` can filter on it |
| 8 | the amended `Reminder`/`Notification` schemas accept and require the new value where it appears |

## 4. Contract changes

| Where | Change |
|---|---|
| `Reminder.status` | enum gains `cancelled` |
| `Notification.status` | enum gains `cancelled` — the reminder rows *are* notification rows (H1), and R24/M7 return them |
| `listMyNotifications` `status` query parameter | enum gains `cancelled`, so the new rows can be asked for |
| P10's 200 example | `status: skipped` → `status: cancelled` |
| `AppointmentAdmin.notificationsSummary` | **unchanged.** The object is declared but no operation produces it (S5.3's N7); when one does, it will need a `cancelled` count. Named here so the omission is a decision, not an oversight. |

No operation is added, removed or renamed: the operation count stays 50 and the
schema count stays 58.

## 5. Impact on the existing artifacts

| Artifact | Impact |
|---|---|
| `src/modules/notifications/reminders.ts` | `ReminderStatus` gains the value; a pure function settles the rows |
| `src/modules/appointments/service.ts` | both cancellation paths write the settlement with the state transition |
| `src/db/schema.ts`, migration | `notifications_status_check` gains `'cancelled'` (migration `0008_cancelled_reminders.sql`; this row first said 0009 — erratum recorded at SMS-64, 2026-11-27) |
| `src/contract/openapi.json` | regenerated from the amended `openapi.yaml` |
| `tests/api/reminders.test.ts` | **R9 changes**: it asserts the rows after cancellation, and after this addendum their status is `cancelled`. The comment explaining why it asserted nothing is replaced by the assertion. |
| `tests/api/cancellation.test.ts` | F2's "not asserted" note is replaced by a pointer to the addendum; no behaviour changes there |
| `spec/api/api-traceability.md` | a row for REQ-F-034 |

**What is unchanged:** every other rule of the base specification. The dispatch
predicate already excludes anything that is not `scheduled`, so "a `cancelled`
row is never dispatched" needs no new code path — it needs the row not to be
`scheduled`, which is the whole change.

## 6. Rollback

The change is reversible in one commit and one migration:

1. revert the settlement statement and the pure function (the status simply stays
   `scheduled`, as S3.2 left it);
2. revert the two enums and the example in `openapi.yaml`;
3. `drop` the widened check constraint back to its four values — any row already
   written as `cancelled` must be mapped to `skipped` first, which is the
   semantic the base specification's example used.

No data is lost by rolling forward either: the settlement only ever rewrites
`scheduled` rows, and those carry no `sent_at`.

## 7. Selection criteria (plan §8.1)

| Criterion | Assessment |
|---|---|
| Genuinely absent from SRS v1.3 | **yes** — no sentence covers it (register row 10) |
| Does not contradict an existing REQ | **yes** — REQ-F-005/010/011 say when rows are written, not what cancellation does; REQ-F-029's reactivation is unchanged (a reschedule still reactivates `skipped`, and a cancelled record cannot be rescheduled) |
| Requires an OpenAPI contract change | **yes** — two enums, one query enum, one example |
| Implementable without breaking the base regression | **yes** — one pure function, one `update` statement, one migration; R9 is the only existing assertion that changes, and it changes because the requirement it was silent about now exists |

## 8. Order

Plan §8.1 fixes the sequence addendum → tests → implementation → refactor, and
places the addendum after the refactoring pass (step 3). The developer's
instruction of 2026-11-13 orders this addendum **before** stage R: the change is
small and self-contained, and landing it first means the refactoring pass covers
the amended code as well. That order is recorded here and in the gate rather than
left implicit; the addendum's own refactoring step (plan §8.1 step 7) is the
tail of this stage.
