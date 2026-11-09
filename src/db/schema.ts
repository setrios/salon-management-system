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
import {
  boolean,
  check,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

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

/**
 * Service categories (REQ-F-024, D-27).
 *
 * Columns declared in the SMS-14 TEST-GATE §6 before the seed fixture wrote to
 * them. `name` is unique because that is the identity the contract exposes and
 * the fixture's `on conflict (name)` relies on; `seeded` is true exactly for
 * Hair, Coloring and Barbering and is never changed afterwards.
 *
 * No operation creates, renames or deletes a category. A custom category comes
 * into existence as a side effect of saving a service with it (D-27), which is
 * why `modules/catalog` writes here from the service path and R9 only reads.
 */
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  seeded: boolean('seeded').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Services (REQ-F-018, REQ-F-024).
 *
 * `category` is the category *name*, which is what `Service.category` exposes;
 * it is not a foreign key, so a service keeps its category label even if the
 * categories table is rebuilt. No uniqueness on `name`: error-model.md §3 names
 * no such constraint, and CL-10 states that the declared 409 on R6/R8 has no
 * trigger (D-24).
 */
export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    baseDurationMinutes: integer('base_duration_minutes').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('services_duration_check', sql`${table.baseDurationMinutes} > 0`)],
);

/**
 * Master-service links with a price (REQ-F-018).
 *
 * The unique pair is the second of the three uniqueness constraints named in
 * error-model.md §3; a second link for the same pair is 409 `DUPLICATE_RESOURCE`
 * (asserted by R11). Money is stored in integer minor units plus its currency,
 * exactly as the `Money` schema defines it.
 *
 * `on delete` is deliberately absent: nothing in this stage deletes a master or
 * a service (REQ-F-018 deactivates instead), so a cascading rule would describe
 * behaviour no operation can reach.
 */
export const masterServices = pgTable(
  'master_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    masterId: uuid('master_id')
      .notNull()
      .references(() => masters.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    priceAmountMinor: integer('price_amount_minor').notNull(),
    priceCurrency: text('price_currency').notNull().default('UAH'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('master_services_master_service_unique').on(table.masterId, table.serviceId),
    check('master_services_price_check', sql`${table.priceAmountMinor} >= 0`),
  ],
);

/**
 * Materials with a unit of measure (REQ-F-018, REQ-F-025).
 *
 * `name` is unique — the third of the three constraints error-model.md §3 names,
 * and the trigger for the 409 assertions on R14 and R16. `unit` is free text:
 * the five standard units are a fixed list offered by R17 (`UnitList.standard`),
 * not a column constraint, and REQ-F-025 allows a custom unit. `stockQuantity`
 * is fractional because ml, l, g and kg are measured, not counted.
 */
export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    unit: text('unit').notNull(),
    stockQuantity: doublePrecision('stock_quantity').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('materials_stock_check', sql`${table.stockQuantity} >= 0`)],
);

/**
 * Availability — a master's weekly pattern (REQ-F-015).
 *
 * Two tables, not one with a nullable date: a weekly rule and a date rule carry
 * different columns (`day_of_week` has no meaning on a date, `date` none on a
 * weekday), and the read path selects one set or the other, never a mix. Keeping
 * them apart makes "a date rule replaces the weekly rule for that date" a plain
 * SQL choice rather than a filter over a union type.
 *
 * `day_of_week` is the ISO numbering 1 (Monday) … 7 (Sunday), matching
 * `WeeklyRule.dayOfWeek` exactly, so no conversion happens at the boundary.
 * `start_time` and `end_time` are `HH:MM` wall clock in Europe/Kyiv, the salon's
 * single zone (REQ-NF-007); they are stored as text because that is what the
 * contract carries and what a rule means — a rule is a wall-clock fact, not an
 * instant. The offset is applied when a slot is built (`lib/time.ts`).
 *
 * Neither table has a uniqueness constraint or an overlap check. The S1.3 gate
 * fixes that: overlapping windows on one weekday are undefined by the SRS and
 * the contract (§5 G4), so the schema must not choose union, intersection or
 * rejection by accident.
 */
export const availabilityWeekly = pgTable(
  'availability_weekly',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    masterId: uuid('master_id')
      .notNull()
      .references(() => masters.id),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('availability_weekly_day_check', sql`${table.dayOfWeek} between 1 and 7`),
    // Decision (a) from the SMS-15 gate: a window that ends at or before its
    // start is self-contradictory input, so the database refuses it as well as
    // the route. This is a comparison of two zero-padded `HH:MM` strings, which
    // sorts in clock order by construction.
    check('availability_weekly_window_check', sql`${table.endTime} > ${table.startTime}`),
  ],
);

/** Availability overrides for specific dates (REQ-F-015, SCN-09). */
export const availabilityDates = pgTable(
  'availability_dates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    masterId: uuid('master_id')
      .notNull()
      .references(() => masters.id),
    date: text('date').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('availability_dates_window_check', sql`${table.endTime} > ${table.startTime}`),
  ],
);
