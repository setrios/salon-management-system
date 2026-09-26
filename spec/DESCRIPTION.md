# Salon Management System — Information System Concept

## Document status
This document is a preliminary concept note for the information system.
It is **not a finalized Software Requirements Specification (SRS)** and is
intended as input material for further requirements clarification through a
structured dialogue.

**Revision note (2026-09-26):** two decisions in §8 were superseded during
the Lab 2 SKED dialogue. The controlling requirements artifact is now
`spec/salon-management-system-srs-v1.0.tex`; see
`logs/2026-09-26-sked-dialogue-summary.md` for the full rationale.

## 1. Working project name
**Salon Management System** — an information system for client record-keeping
and service booking for a beauty salon.

## 2. Problem and goal
The owner of a small unisex beauty salon currently manages client records,
service bookings, and material stock manually (notebook/messengers/Excel),
which leads to:
- scheduling conflicts among masters;
- loss of client visit history;
- lack of control over consumable material stock;
- no consolidated financial overview (revenue, popular services).

**Goal of the system** — to automate client booking for services, master and
schedule management, material stock tracking, and basic financial reporting
for a single location.

## 3. Context and scope
- Single location (one address), no branch network, single time zone.
- Service type: unisex — both men's and women's services (haircuts, coloring,
  manicure, cosmetology procedures, etc.; the exact category list is to be
  defined separately).

## 4. Stakeholders and roles (actors)

| Role | Description |
|---|---|
| Client | Books a service without registration (using name and phone number) |
| Master | Has their own list of services and prices, a flexible work schedule, and sees their own appointment calendar |
| Administrator | Manages reference data, appointments, materials, and reporting |

## 5. Core functions

### For the client
- Online booking for one or several services in a single visit (duration and
  cost are summed)
- Choice of master, date, and time, based on the master's availability
- The booking is **confirmed immediately** upon creation — no manual approval
  step from a master or administrator is required
- After booking, the client sees a confirmation page with the appointment
  details and links to cancel or reschedule it; the same page is reachable
  later via the link sent by SMS
- Cancellation is **always free of charge**, with no deadline restriction
- Rescheduling is **also free of charge**, with no deadline restriction and
  no limit on the number of times
- Receives an SMS (implementation simulated) confirming the booking, with a
  link to the confirmation page; a new SMS with the updated details is sent
  on each reschedule; no separate SMS is sent for cancellation itself
- Receives two SMS reminders before the visit — 24 hours and 2 hours
  before the appointment (implementation simulated)
- Each reminder is sent only if its scheduled time is still in the future
  at the moment of booking or the most recent reschedule: a booking (or
  reschedule) made less than 24 hours before the appointment skips the
  24-hour reminder, and less than 2 hours before skips both (a missed
  reminder is recorded as skipped, never sent retroactively)

### For the master
- View their own appointment schedule
- View the list of services they perform and their own prices for them
- Flexibly manage their own work schedule (available days/hours set manually)
- Receives a notification (SMS and/or in-app, independently configurable per
  event type) when one of their own appointments is created, rescheduled,
  or cancelled

### For the administrator
- Manage reference data: masters, services (service↔master↔price link),
  materials
- Create/edit/cancel client appointments
- Track material movement (receipt/issue)
- Record payment (amount, payment status: paid/unpaid, payment method) after
  the service has been completed
- View reports: revenue by period, popular services, current material stock
  levels
- Receives a notification (SMS and/or in-app, independently configurable per
  event type) for every appointment created, rescheduled, or cancelled,
  across all masters

## 6. Preliminary list of key entities
- **Client** — client (name, phone; no account)
- **Master** — master (name, work schedule)
- **Service** — service (name, category, base duration)
- **MasterService** — master↔service link with an individual price
- **Appointment** — booking (client, master, date/time, status; confirmed
  automatically on creation; carries an unguessable access token used for
  the confirmation page)
- **AppointmentService** — services within a single appointment (multiple
  services per visit)
- **Payment** — payment (amount, status, payment method), linked to an
  appointment; recorded only after the service is completed
- **Material** — material (name, unit of measure — selected from a standard
  list with the option to add a custom one, stock level)
- **MaterialTransaction** — material movement (receipt/issue, date, quantity)
- **Notification** — event-driven messages: booking confirmation and
  reschedule confirmation (each with a link to the confirmation page) and
  two reminders (24h/2h) to the client; new/reschedule/cancellation alerts
  to master and administrator; each with a channel and a send status —
  sent / skipped / failed (simulated implementation)

## 7. Deliberately excluded from the initial scope
- Client registration with an account/password
- Loyalty program, bonuses, discounts for returning clients
- Automatic calculation of a master's salary
- Tracking of client no-shows
- Automatic material deduction based on a service "recipe" (general stock
  tracking only)
- Online payment / payment gateway integration (only recording the fact of
  payment)

## 8. Confirmed decisions
- The salon operates at a single location, in a single time zone, with no
  branch network.
- Each master's work schedule is individual and set manually.
- A single client visit may include several services at once — duration and
  cost are summed.
- Materials are tracked through general accounting (receipt/issue only),
  without detail on how much was used for a specific appointment.
- A client's booking is confirmed immediately upon creation, with no manual
  approval step.
- Cancellation by the client is always free of charge, with absolutely no
  restriction on notice period (even minutes before the appointment).
  Rescheduling is likewise free of charge and unrestricted, by notice period
  or by number of times.
- Units of measure for materials are chosen from a standard list, with the
  option to add a custom unit.
- **(Revised 2026-09-26 — supersedes the previous "no SMS for booking
  confirmation or cancellation" decision.)** The client receives an SMS
  confirming the booking, and a new SMS with updated details on each
  reschedule; both contain a link to a confirmation page where the client
  can cancel or reschedule. No separate SMS is sent for cancellation
  itself — the confirmation page reflects the updated status. Two
  reminders are still sent — 24 hours and 2 hours before the appointment.
  A reminder is skipped (not sent retroactively) if its scheduled time has
  already passed at the moment of booking or reschedule.
- **(Revised 2026-09-26 — supersedes the previous "master/administrator do
  not receive a notification" decision.)** The master and the administrator
  each receive a notification — SMS and/or in-app — when an appointment is
  created, rescheduled, or cancelled. Each of them can independently enable
  or disable each channel for each event type.
- Payment is recorded only after the service has been completed — a booking
  cannot be marked as pre-paid.
- Scheduling uses a 30-minute time-slot granularity.

## 9. Open questions (for further clarification)
All initial open questions from this round have been resolved. Further
questions are expected to surface during the upcoming SKED dialogue as the
requirements are detailed further.