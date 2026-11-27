# Final validation against the initial concept (SMS-67)

| | |
|---|---|
| Ticket | SMS-67 (lab 6, steps 14–15) — the developer's, not the agent's |
| Concept | `spec/DESCRIPTION.md` — written before the SKED dialogue |
| System | the running system of the developer's clean run (SMS-64), `v1.0.0` candidate after `fd47ff3` |
| Date | 2026-11-27 |
| Validated by | _the developer_ |

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
| P1 | scheduling conflicts among masters | book a time on `/`; open `/` again and choose the same services, date and master — that time is no longer offered (or *This time is no longer available* if two people book at once) | _Yes / Partly / No_ | |
| P2 | loss of client visit history | **Appointments** (A1): every appointment with the client's name and phone, filtered by **From** / **To**, **Master**, **Status**; cancelled and completed ones stay. *There is no search by client name or phone, and no "history of one client" screen — the SRS did not require one.* | _Yes / Partly / No_ | |
| P3 | no control over consumable stock | **Materials**: stock per material; a material's **Transactions** (receipt / issue); **Reports → Stock levels**; an issue beyond the stock is refused | _Yes / Partly / No_ | |
| P4 | no consolidated financial overview | **Reports → Revenue** (Day / Week / Month or a range, by method) and **Popular services** | _Yes / Partly / No_ | |

## B. The core functions (`DESCRIPTION.md` §5)

| Role | Function | Verdict |
|---|---|---|
| Client | book one or several services in one visit; duration and cost summed | |
| Client | choose master, date and time from the master's availability | |
| Client | confirmed immediately, no approval step | |
| Client | confirmation page with cancel / reschedule; reachable again by its link | |
| Client | cancel and reschedule free, any time, any number of times | |
| Client | SMS on booking and reschedule, 24 h and 2 h reminders, skipped if already past — *simulated: recorded, visible to the administrator, not sent to a phone* | |
| Master | own calendar; own services and prices; own working hours (weekly and dates) | |
| Master | notifications per event and channel, each switchable | |
| Administrator | masters, services, prices, materials; create / edit / cancel appointments | |
| Administrator | material receipts and issues | |
| Administrator | payment (amount, paid / unpaid, method) only after completion | |
| Administrator | revenue, popular services, stock levels | |
| Administrator | notified of every appointment event of every master, except their own actions | |

## C. Scope kept (`DESCRIPTION.md` §7)

Nothing excluded by the concept was built: no client accounts, no loyalty or
discounts, no salary calculation, no no-show tracking, no recipe-based stock
deduction, no payment gateway. — _confirm / note_

## D. Lab 6 additions to check against intent

The interface was built in lab 6 (decision D-L6-1). Its order of the client's
steps — services → time → master → details — was the developer's (U-2).

| Question | Verdict |
|---|---|
| Does the client website let a client book without help? | |
| Is the staff dashboard usable for the daily work the concept describes? | |

## E. Verdict (steps 14–15)

| | |
|---|---|
| Does the system solve the problem of `DESCRIPTION.md` §2? | _Yes / Partly / No_ |
| Mismatches found | |
| For each: is it substantial? | |
| Decision for each substantial one | _addendum 002 now / a next SDD cycle / accepted as is, with the reason_ |
| Result | _PASS / PASS with recorded items / FAIL_ |
