/**
 * Database schema — DECLARATION ONLY.
 *
 * This file is part of the scaffold and intentionally contains no Drizzle code.
 * Tables are added ticket by ticket, each after its failing test and its
 * TEST-GATE, following the stage plan in
 * `logs/2026-11-08-implementation-plan.md` §8. Writing the schema first would
 * make the implementation lead the tests instead of the other way round.
 *
 * Authoritative sources for the eventual columns:
 *   spec/api/resource-model.md §2   — domain resources and relationships
 *   spec/api/openapi.yaml           — component schemas (external shape)
 *   spec/salon-management-system-srs-v1.3.tex — REQ-F rules per entity
 *
 * Planned tables (11), each an entity of resource-model.md §2:
 *
 *   masters                  Master: id uuid, full_name text, username text
 *                            (unique), password_hash text, role text
 *                            ('master' | 'admin'), active boolean default true,
 *                            created_at/updated_at timestamptz — declared in
 *                            plan §5.1, created by SMS-22 (D-18, D-19)
 *   services                 Service: name, category, base duration, active
 *   categories               Category: free-form name, `seeded` marker
 *   master_services          MasterService: master↔service link with price
 *   availability_weekly      Availability weekly rule (dayOfWeek, start, end)
 *   availability_dates       Availability date override (date, start, end)
 *   appointments             Appointment: status, times, durations, prices,
 *                            embedded client name/phone, access-token hash
 *   appointment_services     AppointmentService: service line + price snapshot
 *   payments                 Payment: amount (minor units), status, method;
 *                            at most one per appointment, immutable (D12)
 *   materials                Material: name, unit, stock quantity
 *   material_transactions    MaterialTransaction: receipt/issue, quantity
 *
 * Deferred, not part of the 11: `reminders`, `notifications` and
 * `notification_preferences` are returned by operations but are populated by
 * the reminder/notification subsystem, which the stage plan schedules after the
 * booking path (S4). Their shape is fixed by `Appointment.reminders[]`,
 * `Notification`, `NotificationPreference` in openapi.yaml.
 *
 * TODO(ticket-driven): replace this comment block with `pgTable` declarations
 * as each ticket reaches its `feat:` commit. Until then, importing this file is
 * valid and yields nothing — that keeps the scaffold type-checkable without
 * pre-empting any test.
 */
