# Merge conflict: SMS reminder rule for late bookings

Branches: sms-late-booking-agent, sms-late-booking-manual
File: DESCRTIPTOIN.md

## Conflict
Agent branch: send only reminders that still fit before the appointment.
Manual branch: send no reminders for bookings made <24h in advance.

## Resolution
Chosen: - Each reminder is sent only if its scheduled time is still in the future at the moment of booking: a booking made less than 24 hours before the appointment skips the 24-hour reminder, and a booking made less than 2 hours before skips both (a missed reminder is recorded as skipped, never sent retroactively)
Reason: Suppressing all reminders for late bookings would leave same-day clients with zero notifications, contradicting the reminder feature's purpose.
