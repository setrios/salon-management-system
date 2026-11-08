/**
 * Database schema — tables declared ticket by ticket.
 *
 * Each table is added after its failing test and its TEST-GATE, following the
 * stage plan in `logs/2026-11-08-implementation-plan.md` §8. Writing the schema
 * first would make the implementation lead the tests instead of the other way
 * round.
 *
 * Authoritative sources:
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
 */

import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Staff accounts: masters and the single administrator.
 *
 * The columns are the artifact declared in plan §5.1 before the S1.1 fixture
 * wrote to them; the same list appears in `tests/helpers/accounts.ts`.
 *
 * D-19: one table, not two. The administrator is a row with `role = 'admin'`;
 * REQ-F-017 allows exactly one, and no operation creates accounts at this
 * stage. D-18: `password_hash` holds the scrypt string
 * `scrypt$N$r$p$salt-base64$key-base64` and is never returned by any operation.
 */
export const masters = pgTable(
  'masters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('masters_role_check', sql`${table.role} in ('master', 'admin')`)],
);
