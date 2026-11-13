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
 *
 * **`notifications` is no longer deferred.** It arrives with SMS-26 (S2.2),
 * because that stage is the first to record a message: REQ-F-005 says exactly
 * one confirmation SMS is *recorded* per booking, and R24
 * (`listAppointmentNotifications`) is the operation that exposes what was
 * recorded. `reminders` is no longer deferred either: SMS-29 (S3.2) made the
 * 24 h and 2 h reminders stored rows of the same table.
 *
 * **`notification_preferences` is no longer deferred.** It arrives with SMS-30
 * (S4.1): REQ-F-016 gives a master a notification "per their own preferences",
 * and M5/M6 are the operations that read and change them.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
 * The material ledger (REQ-F-020, D13).
 *
 * A row is one recorded movement: `receipt` adds `quantity` to the material's
 * balance, `issue` subtracts it. `materials.stock_quantity` is the running
 * total and this table is the history that explains it; the two are written in
 * one database transaction, so they cannot disagree.
 *
 * `quantity` is fractional for the same reason the balance is (ml, l, g, kg),
 * and `occurred_at` is when the movement happened — the operator's fact, echoed
 * back exactly — while `created_at` is when the row was recorded. Both exist
 * because a receipt can be entered for a delivery that arrived yesterday, and
 * the list is ordered by the fact, not by the entry (M3).
 *
 * `type` is constrained to the contract's two values rather than left to the
 * application, matching `payment_status_check` and the appointment status: a
 * third value would make every branch on it incomplete.
 */
export const materialTransactions = pgTable(
  'material_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id),
    type: text('type').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('material_transactions_type_check', sql`${table.type} in ('receipt', 'issue')`),
    check('material_transactions_quantity_check', sql`${table.quantity} > 0`),
    // The ledger's only read is "this material's rows, newest first"; the index
    // serves it directly (M3).
    index('material_transactions_material_occurred_idx').on(table.materialId, table.occurredAt),
  ],
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

/**
 * Appointments (REQ-F-001, REQ-F-003, REQ-F-031).
 *
 * `start_at` and `end_at` are instants, not wall clock: an appointment names a
 * moment, and the salon's zone is applied when it is built (`lib/time.ts`).
 * `end_at` is `start_at` plus the *occupied* block, not the summed duration —
 * REQ-F-031 rounds the block up to 30 minutes, and the reserved time is what a
 * conflicting booking must be compared against.
 *
 * `status` starts at `confirmed` (REQ-F-003: there is no approval state) and is
 * constrained to the three values the contract's `Appointment.status` enum
 * names. The constraint is the schema's, not a route's: S2.3 and S3.1 add the
 * transitions, and neither may invent a fourth value.
 *
 * **The partial unique index is decision D2, and it is half of the concurrency
 * answer.** Two simultaneous requests for the same start must not both insert;
 * the index makes the second one a database-level failure. It is *partial* on
 * `status <> 'cancelled'` because a cancelled appointment frees its block: a
 * later booking at the same instant is legitimate, and a plain unique index
 * would refuse it forever. The other half — the overlap the index cannot see —
 * is `pg_advisory_xact_lock(master_id)` in `modules/appointments/service.ts`.
 *
 * `access_token` is the client's credential (REQ-NF-001, REQ-F-004). It is
 * generated by the database so two concurrent bookings cannot collide on it,
 * and it is unique for the same reason. `confirmationUrl` is derived from it,
 * not stored: the base URL is a deployment fact, not a property of a booking.
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    masterId: uuid('master_id')
      .notNull()
      .references(() => masters.id),
    clientName: text('client_name').notNull(),
    clientPhone: text('client_phone').notNull(),
    status: text('status').notNull().default('confirmed'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    totalDurationMinutes: integer('total_duration_minutes').notNull(),
    occupiedDurationMinutes: integer('occupied_duration_minutes').notNull(),
    totalPriceAmountMinor: integer('total_price_amount_minor').notNull(),
    totalPriceCurrency: text('total_price_currency').notNull().default('UAH'),
    accessToken: uuid('access_token').notNull().unique().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'appointments_status_check',
      sql`${table.status} in ('confirmed', 'completed', 'cancelled')`,
    ),
    check('appointments_block_check', sql`${table.endAt} > ${table.startAt}`),
    check('appointments_durations_check', sql`${table.totalDurationMinutes} > 0 and ${table.occupiedDurationMinutes} >= 30`),
    check('appointments_price_check', sql`${table.totalPriceAmountMinor} >= 0`),
    uniqueIndex('appointments_master_start_unique')
      .on(table.masterId, table.startAt)
      .where(sql`${table.status} <> 'cancelled'`),
  ],
);

/**
 * Appointment service lines — a snapshot, not a join (REQ-F-001).
 *
 * `name`, `base_duration_minutes` and the price are copied at booking time, so
 * a later rename, re-price or deactivation of the service does not rewrite what
 * a client was told they booked. `service_id` is kept as a reference for
 * reporting, but no read of an appointment resolves the live row.
 *
 * `position` preserves the order the client sent `serviceIds` in, so a repeated
 * id (decision D8: counted twice) produces two identical lines in a stable
 * order rather than two rows the database may return in either order.
 */
export const appointmentServices = pgTable(
  'appointment_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    baseDurationMinutes: integer('base_duration_minutes').notNull(),
    priceAmountMinor: integer('price_amount_minor').notNull(),
    priceCurrency: text('price_currency').notNull().default('UAH'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('appointment_services_appointment_position_unique').on(
      table.appointmentId,
      table.position,
    ),
    check('appointment_services_duration_check', sql`${table.baseDurationMinutes} > 0`),
    check('appointment_services_price_check', sql`${table.priceAmountMinor} >= 0`),
  ],
);

/**
 * Notification records — the messages the system has decided to send (REQ-F-005).
 *
 * A row is written by the operation that causes the message, in the same
 * transaction that causes it, so a booking and its confirmation message are
 * created together or not at all. At S2.2 that is the booking transaction in
 * `modules/appointments/service.ts`; S2.3 (cancellation), S3.1 (reschedule) and
 * S4.1 (preferences) add their own rows through the same table.
 *
 * **`sent` means "handed to the simulated channel", not "delivered to a phone".**
 * SMS delivery is simulated in this version (SRS §3, Assumptions and
 * Dependencies), so the record states the system's decision, and `sent_at` is
 * the instant it was made.
 *
 * **The partial unique index is decision E4, and it is the backstop that makes
 * REQ-F-005 "exactly one" rather than "at least one".** One appointment can have
 * at most one `client`/`new`/`sms` record; a second insert fails at the database.
 * It is *partial* on those three predicates because a second reschedule must
 * send a second SMS with `event_type = 'reschedule'` (REQ-F-009), and a full
 * unique on the four columns would forbid it.
 *
 * `scheduled_at` is nullable: a record written now (status `sent`) has no future
 * moment. The reminder engine (SMS-29) writes `scheduled` rows with it set.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id),
    audience: text('audience').notNull(),
    eventType: text('event_type').notNull(),
    channel: text('channel').notNull(),
    status: text('status').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'notifications_audience_check',
      sql`${table.audience} in ('client', 'master', 'admin')`,
    ),
    check(
      'notifications_event_type_check',
      sql`${table.eventType} in ('new', 'reschedule', 'cancellation', 'reminder_24h', 'reminder_2h')`,
    ),
    check('notifications_channel_check', sql`${table.channel} in ('sms', 'in_app')`),
    check(
      'notifications_status_check',
      sql`${table.status} in ('scheduled', 'sent', 'skipped', 'failed')`,
    ),
    uniqueIndex('notifications_appointment_new_client_sms_unique')
      .on(table.appointmentId)
      .where(
        sql`${table.eventType} = 'new' and ${table.audience} = 'client' and ${table.channel} = 'sms'`,
      ),
  ],
);

/**
 * Notification preferences (REQ-F-016, REQ-F-023, REQ-F-026; S4.1, I1–I2).
 *
 * One row per combination the caller has **toggled**: the table is a sparse
 * override, and a missing row means `enabled: true` (I2). The principal is a
 * `masters` row — the administrator is one, with `role = 'admin'` (REQ-F-017) —
 * so one table serves both roles.
 *
 * The unique index is what makes M6 an upsert rather than a second row: the
 * operation changes exactly one combination (REQ-F-026), and a duplicate would
 * make "the caller's setting" ambiguous.
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    principalId: uuid('principal_id')
      .notNull()
      .references(() => masters.id),
    channel: text('channel').notNull(),
    eventType: text('event_type').notNull(),
    enabled: boolean('enabled').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'notification_preferences_channel_check',
      sql`${table.channel} in ('sms', 'in_app')`,
    ),
    check(
      'notification_preferences_event_type_check',
      sql`${table.eventType} in ('new', 'reschedule', 'cancellation')`,
    ),
    uniqueIndex('notification_preferences_principal_channel_event_unique').on(
      table.principalId,
      table.channel,
      table.eventType,
    ),
  ],
);
