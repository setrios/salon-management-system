# Final validation against the initial concept (SMS-67)

| | |
|---|---|
| Ticket | SMS-67 (lab 6, steps 14–15) — the developer's, not the agent's |
| Concept | `spec/DESCRIPTION.md` — written before the SKED dialogue |
| System | the running system of the developer's clean run (SMS-64), `v1.0.0` candidate after `fd47ff3` |
| Date | 2026-11-27 |
| Validated by | setrios, 2026-11-27 (answers given in the session; recorded by the coding agent) |

Lab 6 step 14: return to the concept formed before the SKED dialogue and judge
whether the system solves the problem it was built for — not whether the tests
pass. Step 15: a substantial mismatch is not closed by editing documentation;
it is recorded, and an addendum or a next SDD cycle is decided.

The agent prepared this sheet and the checks; every verdict below is the
developer's.

---

## A. The owner's four problems (`DESCRIPTION.md` §2)

| # | Problem | How to see it in the system | Verdict | Note |
|---|---|---|---|---|
| P1 | scheduling conflicts among masters | book a time on `/`; open `/` again and choose the same services, date and master — that time is no longer offered (or *This time is no longer available* if two people book at once) | **Yes** | a taken time is not offered again; a second booking of it was refused with `SLOT_UNAVAILABLE` in the developer's clean run (SMS-64) |
| P2 | loss of client visit history | **Appointments** (A1): every appointment with the client's name and phone, filtered by **From** / **To**, **Master**, **Status**; cancelled and completed ones stay. *There is no search by client name or phone, and no "history of one client" screen — the SRS did not require one.* | **Partly** | no visit is lost any more: every appointment is kept with the client's name and phone and nothing is deleted (REQ-NF-005). Finding one client's visits is not possible except by scanning dates — **carried to the next SDD cycle** (§E, SMS-80) |
| P3 | no control over consumable stock | **Materials**: stock per material; a material's **Transactions** (receipt / issue); **Reports → Stock levels**; an issue beyond the stock is refused | **Yes** | |
| P4 | no consolidated financial overview | **Reports → Revenue** (Day / Week / Month or a range, by method) and **Popular services** | **Yes** | |

## B. The core functions (`DESCRIPTION.md` §5)

| Role | Function | Verdict |
|---|---|---|
| Client | book one or several services in one visit; duration and cost summed | Yes |
| Client | choose master, date and time from the master's availability | Yes |
| Client | confirmed immediately, no approval step | Yes |
| Client | confirmation page with cancel / reschedule; reachable again by its link | Yes |
| Client | cancel and reschedule free, any time, any number of times | Yes |
| Client | SMS on booking and reschedule, 24 h and 2 h reminders, skipped if already past — *simulated: recorded, visible to the administrator, not sent to a phone* | Yes, as simulated |
| Master | own calendar; own services and prices; own working hours (weekly and dates) | Yes |
| Master | notifications per event and channel, each switchable | Yes |
| Administrator | masters, services, prices, materials; create / edit / cancel appointments | Yes |
| Administrator | material receipts and issues | Yes |
| Administrator | payment (amount, paid / unpaid, method) only after completion | Yes |
| Administrator | revenue, popular services, stock levels | Yes |
| Administrator | notified of every appointment event of every master, except their own actions | Yes |

## C. Scope kept (`DESCRIPTION.md` §7)

Nothing excluded by the concept was built: no client accounts, no loyalty or
discounts, no salary calculation, no no-show tracking, no recipe-based stock
deduction, no payment gateway. — **Confirmed** by the developer.

## D. Lab 6 additions to check against intent

The interface was built in lab 6 (decision D-L6-1). Its order of the client's
steps — services → time → master → details — was the developer's (U-2).

| Question | Verdict |
|---|---|
| Does the client website let a client book without help? | **Yes** |
| Is the staff dashboard usable for the daily work the concept describes? | **Yes** — after SMS-73 and SMS-76 (the developer's hands-on check before G5) and SMS-79 (made during this validation) |

## E. Verdict (steps 14–15)

| | |
|---|---|
| Does the system solve the problem of `DESCRIPTION.md` §2? | **Yes, with one item partly solved** |
| Mismatches found | P2 — the owner cannot look up one client's visits; the history is kept but only browsable by date, master and status |
| Is it substantial? | Not for this version: nothing is lost (the problem as stated — *loss* of history — no longer occurs), and the SRS has no requirement for a client lookup. It is a real need for the owner's daily work |
| Decision | **A next SDD cycle**, not an addendum to v1.0.0 (developer's decision). Recorded as SMS-80 in the backlog: a client lookup (search appointments by name or phone) starts with its own SKED round, SRS revision and API-GATE, because it changes the contract (a query on R18) and the interface |
| Changes made during this validation | SMS-79 (times in the browser's hour cycle, the developer's decision during this validation) — implemented and gated before this verdict |
| Result | **PASS, with SMS-80 recorded for the next cycle** |
