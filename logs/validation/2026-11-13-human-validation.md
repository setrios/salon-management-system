# Validation record — 2026-11-13 (SMS-48)

| | |
|---|---|
| Stage | Validation (plan §10, task step 7) |
| Ticket | SMS-48 |
| Artifact | `11f12fe` on `main`, built with `npm run build` (`dist/` served by `npm start`) |
| Executed by | setrios |
| Executed | 2026-11-13, from 22:38 to 23:03 (Europe/Kiev) |
| Environment | Linux; Node.js 26.8.1; PostgreSQL 16 (`docker compose` service `postgres`); development database per `.env` |
| Checklist used | `logs/validation/checklist.md` |
| Result | PASS |

**Status: complete and signed.** The scenarios in §1 were executed by hand on the
built artifact; §2–§5 were **drafted by the coding agent** from that run and
reviewed and adopted by the validator named above, who signs at §6. The
distinction is recorded because plan §10 requires the judgement to be the
validator's, not the agent's: the agent supplied the analysis, the validator
accepted responsibility for it.

---

## 1. Scenarios executed by hand

Sixteen scenarios, run through the HTTP API against the built artifact with the
commands from `logs/validation/checklist.md`. The observed column quotes the
run's own output; the verdict follows from the comparison with the expected
value stated for that scenario.

| SCN | Intent (one line) | Observed | Verdict |
|---|---|---|---|
| SCN-01 | multi-service booking, summed duration and price | `confirmed`, `total 80`, `occupied 90`, `end 2026-11-16T11:30+02:00`, `80000 UAH`, reminders `[scheduled, scheduled]`, `confirmationUrl` present | PASS |
| SCN-02 | free cancellation, no deadline | `cancel 200`, `cancel again 200` — the second call returned the same record, no 409 | PASS |
| SCN-03 | free reschedule, reminders follow | `200`, `id 5d8b8e62-…` unchanged, `15:00–15:30`, reminders moved to `2026-11-15T15:00` and `2026-11-16T13:00` | PASS |
| SCN-04 | 24 h reminder skipped when late | `24h → skipped` (`scheduledAt 2026-11-13T10:00`, in the past), `2h → scheduled` (`2026-11-14T08:00`) | PASS |
| SCN-05 | both reminders skipped | after the corrected window: `window 200`, `24h → skipped` (`2026-11-12T23:00`), `2h → skipped` (`2026-11-13T21:00`) | PASS |
| SCN-06 | master turns SMS off, keeps in-app | `toggle 200`; rows: `master / in_app / new / sent`, `client / sms / new / sent`; `admin` rows present because the client booked | PASS |
| SCN-07 | payment only after completion, once | `409` → `complete 200` → `201` → `409` | PASS |
| SCN-08 | custom category service | `{"category":"Nails","duration":60}`; `/categories` lists `Barbering, Coloring, Hair, Nails, Validation` | PASS |
| SCN-09 | weekly pattern + one-off date | slots `12:00, 12:30, 13:00` all `available`; `10:00 → 409`, `13:00 → 201` | PASS |
| SCN-10 | revenue: preset vs custom range | `week` and `custom` both `from 2026-11-09, to 2026-11-15, totalAmount 40000, cash 1`; only the echoed `period` field differs | PASS |
| SCN-11 | reschedule reactivates a skipped reminder | `[skipped, scheduled]` → `[scheduled, scheduled]` | PASS |
| SCN-12 | administrator not self-notified | `client / reminder_24h / scheduled`, `client / reminder_2h / scheduled`, `master / new / sent`, `client / new / sent` — **no `admin` row** | PASS |
| SCN-13 | duration rounds to 30 minutes | `total 80`, `occupied 90`, `2026-11-23T12:00 → 13:30`; `12:15 → 422` | PASS |
| SCN-14 | popular services ranked by bookings | `rank 1 Validation Haircut 7`, `rank 2 Validation Colouring 2` | PASS |
| SCN-15 | stock levels as a snapshot | `receipt 201`, `issue 201`, `quantity 7`; `?period=week → 200` (parameter ignored, not refused) | PASS |
| SCN-16 | a master cannot be double-booked | A `201` (16:00–17:00, `occupied 60`); B same start `409 SLOT_UNAVAILABLE`; C 16:30 inside A `409 SLOT_UNAVAILABLE`; D 17:00 (first free boundary) `201` | PASS |

Two observations worth keeping next to the table:

- **SCN-06 and SCN-12 are the same rule from two sides.** The administrator
  receives a row when a *client* books (SCN-06) and none when the administrator
  books themselves (SCN-12) — REQ-F-030 holds in both directions.
- **SCN-14's count of 7 exceeds the bookings made in this run.** Cancelled
  appointments count in the ranking (S5.4), so earlier records of the same
  services are included; the ranking itself is monotonically decreasing.

### 1.1 Defects found in the validation package, not in the system

Recorded because they explain two `undefined` values in the run and because a
reader of this record should know which command produced which observation.

| # | Defect | System's behaviour | Resolution |
|---|---|---|---|
| 1 | SCN-05's first command opened a window `23:00 → 00:00` | `422 BUSINESS_RULE_VIOLATION` — an end that is not after the start is refused; windows do not wrap midnight (`src/modules/availability/rules.ts`) | command rewritten (half-hour window via epoch arithmetic), commit `11f12fe`; re-run passed |
| 2 | SCN-08 read `GET /categories` as `{ items: [...] }` | `200` with a bare array (`CategoryList` is an array in the contract) | command rewritten, commit `11f12fe`; re-run passed |
| 3 | The commands printed a body but not the HTTP status for SCN-01 and SCN-08 | `201` (a created resource is what the body is) | noted; the status is visible in the shared fixture (`link 201`) and in SCN-15's `receipt 201` |

No scenario required a change to the implementation.

---

## 2. Fit to intent (`spec/DESCRIPTION.md` §2)

The question is not whether the requirements pass — that is §1 — but whether the
system solves the problem the salon owner described: manual notebooks, conflicts,
lost history, uncontrolled stock, no consolidated financial picture.

| # | Goal from §2 | Assessment |
|---|---|---|
| 1 | No scheduling conflicts among masters — a slot cannot be double-booked | **Yes, demonstrated directly.** SCN-16 booked a 50-minute service at 16:00, then attempted the same start (`409 SLOT_UNAVAILABLE`), then a start inside the occupied block at 16:30 (`409 SLOT_UNAVAILABLE`), and finally the first free boundary at 17:00 (`201`). The control is what makes the two refusals mean something: they came from the clash, not from a blanket refusal. Together with the automated case K2 this is the strongest evidence the run produced for the owner's first complaint. |
| 2 | Client visit history is not lost — a past visit and its client can be found | **Not exercised.** The run created, cancelled and moved visits but never read an administrator's list of past ones. That the record survives is shown by P9 returning it and by the automated pagination/filter cases; the read itself is two commands and belongs in the next checklist. |
| 3 | Control over consumable stock — what is left and what was used | **Yes.** SCN-15: receipt 10, issue 3, report `quantity 7`; the report is a snapshot with `asOf` and ignores a `period` parameter instead of pretending to be a period figure. That answers the owner's question — "how much shampoo is left" — directly. |
| 4 | A consolidated financial overview — revenue and popular services in one place | **Yes, with the deviation of §4.** SCN-10 gave identical totals for the preset week and the explicit range, and the payment rules held (409 before completion, 201 once, 409 again). The caveat is that the same collision is answered `409` on the client's path and `422` on the administrator's — accepted below, but it is an inconsistency a future client would notice. |
| 5 | Booking without registration, confirmed immediately | **Yes.** SCN-01 created a confirmed appointment with no account and no approval step; SCN-02 cancelled it idempotently; SCN-03 moved it; the confirmation link is the only credential the client needs (P9). This is the journey `DESCRIPTION.md` §5 describes, and it holds. |

Also, in the validator's words:

- **What the system does not do that the original concept assumed:** there is no
  SMS gateway — a `sent` row means "handed to the channel", not "reached a
  phone" — and no interface of any kind: the master and the administrator work
  through HTTP calls. The concept also assumes one location and one time zone,
  which the product honours by not offering a selector. A client has no account,
  only a name and a phone; that is the design, not an omission, but it means the
  salon cannot recognise a returning client.
- **What you would change first if the salon ran this tomorrow:** the interface.
  The double-booking guarantee held under a deliberate attempt (SCN-16), the
  money and stock figures are consistent, and the remaining absence is the one a
  salon cannot work around — a master and an owner have no screen, only HTTP
  calls (SMS-36/SMS-37).

## 3. Was the addendum justified?

The addendum is `spec/addenda/001-cancelled-reminders.md` (REQ-F-034: a cancelled
appointment's unsent reminders become `cancelled`).

| Question | Answer |
|---|---|
| Did the base system leave a real gap here, or was it a documentation nicety? | **A real gap, narrow.** The base left a cancelled appointment's future reminders `scheduled`, so anyone reading the notification list could not tell that those reminders would never be sent. That is a consistency defect in what the system reports, not in what it delivers. |
| Is `cancelled` the right third value, or should the base's `skipped` have been reused? | **Yes, a third value.** `skipped` means "its moment had already passed"; `cancelled` means "the visit will not happen". Reusing `skipped` would make the list lie in one of the two cases — and the two need different reactions: one is a scheduling artefact, the other is a decision by a person. |
| Did the change make the system easier or harder to explain to the salon owner? | **Easier.** "Скасовано" is the owner's own word; a cancelled appointment showing `skipped` reminders would need a paragraph of explanation. |
| Verdict | **justified** |

## 4. Known deviation — register row 13

`P11` (`POST /appointments/{token}/reschedule`) answers `409` and `R21`
(`PATCH /admin/appointments/{appointmentId}`) answers `422` when an edit collides
with an existing booking. Both codes are declared by the contract for both
operations; stage R kept the behaviour because plan §9 forbids changing it under a
refactor label.

| Question | Answer |
|---|---|
| Disposition | **acceptable** |
| Reasoning | Both codes are declared by the contract for both operations, both carry the same `Problem` body, and neither can corrupt the calendar — the difference is only which code a caller must handle, and no caller exists yet besides the tests. A fix ticket would change declared behaviour for cosmetic symmetry; recording it here, so the next client author knows, costs nothing. |

## 5. Other findings

None of these is a defect in the implementation; they are the limits a reader of
this record should know about.

1. **Reminder delivery is simulated** (from SCN-01, SCN-06, SCN-12). A `sent` row
   means the message was handed to the channel; there is no gateway
   (REQ-NF-009). Severity: accepted limitation, declared in the README.
2. **No 5xx was produced** (whole run). Every refusal observed was a 4xx; the
   500 shape is covered by `tests/api/structural.test.ts`, not by this run.
   Severity: none — stated so that the record does not imply otherwise.
3. **SCN-14 counts cancelled appointments** (from SCN-14, 7 bookings against the
   4 made in this run). By design (S5.4), but an operator reading "popular
   services" should know that a cancelled visit still counts towards demand.

## 6. Decision

**PASS** — all sixteen scenarios behaved as the contract states, the three items
of §5 are declared limits rather than defects, and the double-booking guarantee,
which the first pass could only call "partly demonstrated", was demonstrated
directly by SCN-16 rather than left as an assumption.

Signed by: setrios  Date: 2026-11-13

---

## 7. Post-signature amendment — 2026-11-13, 23:03

The record above was signed at 22:50 with §2.1 reading "partly demonstrated" and
§5 carrying a coverage gap: no direct attempt had been made to book a taken slot.
Closing that gap was the next step rather than a later one, so SCN-16 was added to
`logs/validation/checklist.md` (commit `481b694`) and executed at 23:03 against
the same artifact (`11f12fe`).

Changed: §1 gained the SCN-16 row and the executed window now ends at 23:03; §2.1
now reads "yes, demonstrated directly"; §5 lost the coverage-gap item and its
remaining items were renumbered; §6's sentence names sixteen scenarios; §2's
"what you would change first" now names the missing interface, because the
double-booking concern it used to name is answered.

Not changed: every verdict of §1, the disposition of §4, the addendum assessment
of §3, and the result `PASS`. No observation of the 22:38–22:50 pass was
rewritten; the amendment adds a scenario and removes a caveat that no longer
holds.

Signed by: setrios  Date: 2026-11-13
