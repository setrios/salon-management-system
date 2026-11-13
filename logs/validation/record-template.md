# Template — human validation record (SMS-48)

Copy this file to `logs/validation/YYYY-MM-DD-human-validation.md`, fill every
`<…>`, and sign the last line. The checklist it refers to is
`logs/validation/checklist.md`.

---

# Validation record — YYYY-MM-DD (SMS-48)

| | |
|---|---|
| Stage | Validation (plan §10, task step 7) |
| Ticket | SMS-48 |
| Artifact | `<git describe --tags --always>` on `main`, built with `npm run build` |
| Executed by | `<name>` |
| Started / finished | `<YYYY-MM-DD HH:MM>` – `<YYYY-MM-DD HH:MM>` |
| Environment | `<OS, Node version, PostgreSQL 16, database name>` |
| Checklist used | `logs/validation/checklist.md` |
| Result | `<PASS / PASS WITH FINDINGS / FAIL>` |

## 1. Scenarios executed by hand

One row per scenario, with what was actually observed — not what the checklist
predicted. "Observed" is the command's own output, shortened.

| SCN | Intent (one line) | Executed | Observed | Verdict |
|---|---|---|---|---|
| SCN-01 | multi-service booking, summed duration and price | `<command, timestamp>` | `<e.g. 201, total 80, occupied 90>` | `<PASS/FAIL>` |
| SCN-02 | free cancellation, no deadline | | | |
| SCN-03 | free reschedule, reminders follow | | | |
| SCN-04 | 24 h reminder skipped when late | | | |
| SCN-05 | both reminders skipped | | | |
| SCN-06 | master turns SMS off, keeps in-app | | | |
| SCN-07 | payment only after completion, once | | | |
| SCN-08 | custom category service | | | |
| SCN-09 | weekly pattern + one-off date | | | |
| SCN-10 | revenue: preset vs custom range | | | |
| SCN-11 | reschedule reactivates a skipped reminder | | | |
| SCN-12 | administrator not self-notified | | | |
| SCN-13 | duration rounds to 30 minutes | | | |
| SCN-14 | popular services ranked by bookings | | | |
| SCN-15 | stock levels as a snapshot | | | |

If a scenario could not be executed, say why in "Observed" and mark it
`NOT EXECUTED` — an unexecuted scenario is not a pass.

## 2. Fit to intent (`spec/DESCRIPTION.md` §2)

The question is not "do the requirements pass" but "does this system solve the
problem the salon owner described". Answer each, in prose, in the validator's own
words:

| # | Goal from §2 | Assessment |
|---|---|---|
| 1 | **No scheduling conflicts among masters** — a slot cannot be double-booked | `<does the system prevent it? did you try to create a conflict?>` |
| 2 | **Client visit history is not lost** — an administrator can find a past visit and its client | `<did you find yesterday's and last month's visits?>` |
| 3 | **Control over consumable stock** — the owner knows what is left and what was used | `<did the stock report and the ledger answer the question?>` |
| 4 | **A consolidated financial overview** — revenue and popular services in one place | `<were the numbers believable against the appointments you made?>` |
| 5 | **Booking without registration, confirmed immediately** — the client's own journey | `<with the confirmation link: could a client cancel, reschedule and see the record?>` |

Also state explicitly:

- **What the system does not do that the original concept assumed** (if anything).
- **What you would change first** if the salon were to run this tomorrow.

## 3. Was the addendum justified?

The addendum is `spec/addenda/001-cancelled-reminders.md` (REQ-F-034: a cancelled
appointment's unsent reminders become `cancelled`).

| Question | Answer |
|---|---|
| Did the base system leave a real gap here, or was it a documentation nicety? | `<…>` |
| Is `cancelled` the right third value, or should the base's `skipped` have been reused? | `<…>` |
| Did the change make the system easier or harder to explain to the salon owner? | `<…>` |
| Verdict | `<justified / not justified / justified but unnecessary>` |

## 4. Verification evidence consulted

Not a substitute for §1, but the record should say what was read:

| Evidence | What it showed |
|---|---|
| `logs/gates/` — the signed gates, G1–G4 and the stage records | `<which were read>` |
| `logs/runs/runs-01 … runs-19` | `<which control run was re-executed, if any>` |
| `npm test` output at the validated commit | `<n/n passed>` |
| `npm run check:test-first` | `<n/n entries>` |
| `npm run verify:contract` | `<50 operations>` |

## 5. Known deviations and open items

| # | Item | Disposition |
|---|---|---|
| 1 | **Register row 13** — `P11` answers `409` and `R21` answers `422` for an edit that collides with an existing booking; both codes are declared by the contract for both operations. Stage R kept the behaviour (§9 forbids changing it under a refactor label). | `<acceptable / needs a fix ticket / unacceptable>` |
| 2 | **Reminder delivery is simulated** — a `sent` row means "handed to the channel"; there is no SMS gateway (REQ-NF-009). | `<acceptable for this version?>` |
| 3 | **The reminder tick runs every 60 s** — a reminder due at 14:00:00 is sent at the first tick at or after it, and `sentAt` records that instant. | `<acceptable?>` |
| 4 | `<any finding of your own>` | |

## 6. Findings

Numbered, each with the scenario it came from and the severity you assign. If
there are none, say so explicitly — "no findings" is a statement, not an omission.

1. `<…>`

## 7. Decision

`<PASS — the system meets the intent of §2 and the documented deviations are acceptable.>`
or
`<PASS WITH FINDINGS — …>` or
`<FAIL — …>`

Signed by: `<name>`  Date: `<YYYY-MM-DD>`
