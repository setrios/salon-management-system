# SKED dialogue summary — Salon Management System (Lab 2)

Date: 2026-09-26
Input artifacts: `DESCRIPTION.md`, `2026-09-16-sms-reminder-conflict.md` (Lab 1),
`agent-choice.md`, `CLAUDE.md`.
Output artifact: `/spec/salon-management-system-srs-v1.0.tex`.

## Method
Iterative Socratic dialogue (maieutics: model asks; elenchus: human
verifies/corrects model assumptions and, in two cases, revises its own
earlier answers). Each round used 1–3 targeted questions rather than a
single bulk request, per SKED.

## Key uncertainties identified and resolved

| # | Uncertainty | Resolution |
|---|---|---|
| 1 | Client booking platform | Web (browser), responsive for mobile |
| 2 | Master/Admin authentication | Login/password; one account per master (admin-created); single admin account |
| 3 | Service categories | Not a fixed enum — admin creates freely; seed examples: Hair, Coloring, Barbering |
| 4 | Currency | UAH |
| 5 | Standard material units | ml, l, g, kg, pcs + custom unit allowed |
| 6 | Master schedule input | Both recurring weekly pattern and specific individual dates |
| 7 | Revenue report periods | Both preset periods (day/week/month) and custom date range |
| 8 | Client PII protection level | Standard hygiene, no special regulatory NFR |
| 9 | How a client without an account finds/cancels a booking | Confirmation page (shown after booking, reachable via SMS link) with cancel and reschedule controls |
| 10 | UI language | English |

## Assumptions surfaced and explicitly corrected (not silently accepted)

- **Service categories, round 1:** model proposed a fixed 5-category list
  (Hair, Coloring, Manicure/Pedicure, Cosmetology, Barbering) for
  confirmation. Human rejected the fixed-list framing entirely and
  redirected to an open, admin-managed category model with only three seed
  examples. Model's proposed *option A (confirm as-is)* was not accepted;
  the actual resolution matched neither of the two buttoned options offered
  and required a free-text correction.

- **Cancellation/link security ("невгадуваний токен"):** human asked for
  clarification of the term before deciding — model explained the concept
  (sequential IDs vs. UUID) in plain terms before the human made an
  informed choice (confirmed as NFR).

## Decisions that reverse a prior confirmed decision in `DESCRIPTION.md`

Both were flagged explicitly by the model as contradictions before being
accepted, per the elenchus step of SKED — not silently merged.

1. **`DESCRIPTION.md` §8:** *"no SMS is sent for booking confirmation or
   cancellation."*
   **Trigger:** human's answer to "how does a client without an account
   cancel a booking" required a confirmation SMS with a link.
   **Model action:** stopped and named the direct contradiction with the
   already-confirmed decision before proceeding, and asked the human to
   explicitly choose how to resolve it, rather than merging both
   requirements silently.
   **Resolution:** booking and reschedule now send a confirmation SMS with
   a link to a confirmation page; cancellation itself still sends no
   additional SMS (client sees the updated status on that same page) —
   this preserves as much of the original decision as is consistent with
   the new requirement.

2. **`DESCRIPTION.md` §8:** *"The master/administrator do not receive a
   notification when a new booking is made or cancelled."*
   **Trigger:** human's answer about reschedule notifications extended
   naturally to new/cancel as well, again contradicting the confirmed
   decision.
   **Model action:** flagged the contradiction explicitly and asked for
   confirmation before treating it as reversed.
   **Resolution:** masters and administrators now receive notifications
   for new/reschedule/cancellation, via SMS and/or in-app, independently
   configurable per event type and per channel.

Both reversals are recorded in `spec/salon-management-system-srs-v1.0.tex`
§2.1 ("Superseded Decisions") and require an update to `DESCRIPTION.md`
before the next iteration, which is not performed automatically by the
model.

## Deliberately left open (not fixed as a number)

- Concurrent usage / throughput scale — human explicitly declined to fix a
  number for this lab version; no REQ-NF sets a numeric performance target.

## Outcome
Baseline SRS drafted, compiled without LaTeX errors (11 pages), covering
26 functional requirements, 9 non-functional requirements, a domain
glossary, 8 BDD scenarios, and an initial traceability matrix. Pending
human SPEC-GATE approval — see `2026-09-26-spec-gate-decision.md`.
