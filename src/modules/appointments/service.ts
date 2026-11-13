/**
 * Appointments — database access for P8, P9, P10 and P11.
 *
 * Knows Drizzle, the two appointment tables and the reads a booking needs. The
 * routes layer turns a refusal into a status; nothing here raises one.
 *
 * **The concurrency answer is decision D2, and it has two halves.**
 *
 *   1. `pg_advisory_xact_lock` keyed on the master's id, taken at the top of the
 *      booking transaction. It serialises the check-then-insert for one master,
 *      which is what makes the *overlap* check sound: two requests for 10:00 and
 *      10:30 with a 90-minute block are different starts, so no unique index can
 *      see them as a conflict, and without the lock both would read "free" and
 *      both would insert (O7).
 *   2. The partial unique index on `(master_id, start_at) where status <>
 *      'cancelled'`. It is the backstop for the exact-start race (O6) and it
 *      survives a future code path that forgets the lock. Its violation is
 *      mapped to 409 `SLOT_UNAVAILABLE`, not 500 (O8).
 *
 * The lock is transaction-scoped (`_xact_`), so it is released when the
 * transaction ends, including on rollback — there is no unlock to forget. It is
 * keyed on the master, not on the table, so two bookings for different masters
 * do not wait for each other.
 *
 * Why not `SELECT … FOR UPDATE` on the master row: it would make R13 (editing a
 * master) wait for a booking to finish, so two unrelated actions would block
 * each other, and every booking would leave a new row version in `masters`.
 *
 * Source: REQ-F-001, REQ-F-002, REQ-F-003, REQ-F-004, REQ-F-006, REQ-F-031,
 *         REQ-NF-001; `resource-model.md` §4 (only `cancelled` frees a block),
 *         §5.1 (P8, P9, P10), line 165 (POST actions are idempotent in effect);
 *         `error-model.md` §3 (409 `SLOT_UNAVAILABLE`), §3.1 (the state table);
 *         D15.
 */

import { and, asc, count, eq, gte, inArray, lt, ne, sql, type SQL } from 'drizzle-orm';

import { getDb, type Database } from '../../db/client.js';
import {
  appointmentServices,
  appointments,
  masterServices,
  masters,
  notifications,
  payments,
  services,
} from '../../db/schema.js';
import { salonDateTime } from '../../lib/occupancy.js';
import { addCalendarDays, parseCalendarDate, salonInstant } from '../../lib/time.js';
import type { BookableService } from './rules.js';
import { isAppointmentStatus, stateOutcome } from './state.js';
import type { AppointmentLine, PaymentView } from './view.js';
import { isUniqueViolation } from '../reference-data/http.js';
import {
  dispatchDueReminders,
  insertReminders,
  readReminders,
  readRemindersFor,
  recalculateReminders,
  recordAppointmentEvent,
} from '../notifications/service.js';
import type { ReminderRow } from '../notifications/reminders.js';

/**
 * A Drizzle handle: the pool-backed instance or a transaction.
 *
 * The overlap check must run on the transaction that holds the advisory lock,
 * so the functions that can be called from inside it accept either.
 */
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** The PostgreSQL constraint the partial unique index raises (D2). */
export const APPOINTMENT_SLOT_CONSTRAINT = 'appointments_master_start_unique';

/** A master as a booking needs them: the row exists and whether it is active. */
export interface BookableMaster {
  readonly id: string;
  readonly fullName: string;
  readonly active: boolean;
  readonly role: string;
}

/** The master a booking names, or `undefined` when the id names no row. */
export async function findBookingMaster(masterId: string): Promise<BookableMaster | undefined> {
  const [row] = await getDb()
    .select({
      id: masters.id,
      fullName: masters.fullName,
      active: masters.active,
      role: masters.role,
    })
    .from(masters)
    .where(eq(masters.id, masterId));

  return row;
}

/**
 * The requested services, in the order they were asked for, with the master's
 * link attached.
 *
 * One entry per *requested* id, so a repeated id appears twice (D8) and an
 * unknown id appears as `undefined` in its position — the caller can then name
 * the offending id rather than only knowing that one is missing.
 */
export async function findBookableServices(
  masterId: string,
  serviceIds: readonly string[],
): Promise<(BookableService | undefined)[]> {
  if (serviceIds.length === 0) return [];

  const db = getDb();
  const uniqueIds = [...new Set(serviceIds)];

  const serviceRows = await db
    .select({
      id: services.id,
      name: services.name,
      baseDurationMinutes: services.baseDurationMinutes,
      active: services.active,
    })
    .from(services)
    .where(inArray(services.id, uniqueIds));

  const linkRows = await db
    .select({
      serviceId: masterServices.serviceId,
      priceAmountMinor: masterServices.priceAmountMinor,
      priceCurrency: masterServices.priceCurrency,
      active: masterServices.active,
    })
    .from(masterServices)
    .where(
      and(eq(masterServices.masterId, masterId), inArray(masterServices.serviceId, uniqueIds)),
    );

  const serviceById = new Map(serviceRows.map((row) => [row.id, row]));
  const linkByService = new Map(linkRows.map((row) => [row.serviceId, row]));

  return serviceIds.map((id) => {
    const service = serviceById.get(id);
    if (service === undefined) return undefined;

    const link = linkByService.get(id);
    return {
      id: service.id,
      name: service.name,
      baseDurationMinutes: service.baseDurationMinutes,
      active: service.active,
      priceAmountMinor: link?.priceAmountMinor,
      currency: link?.priceCurrency ?? 'UAH',
      offered: link !== undefined && link.active,
      linkInactive: link !== undefined && !link.active,
    };
  });
}

/** One existing appointment's block, as the overlap check compares it. */
export interface BookedBlock {
  readonly start: Date;
  readonly end: Date;
}

/**
 * The blocks already taken on one master's calendar that could touch `[from, to)`.
 *
 * The query is deliberately wider than the block: it takes every non-cancelled
 * appointment of the master that starts before `to` and ends after `from`, which
 * is exactly the set that can overlap. `status <> 'cancelled'` matches the
 * partial index's predicate, so a cancelled appointment frees its time
 * (`resource-model.md` §4).
 *
 * `executor` is the transaction when the check runs under the advisory lock, so
 * the read sees the same snapshot the insert will extend. Reading through the
 * pool instead would be a second connection and a second snapshot.
 *
 * `excludeAppointmentId` is P11's need: a reschedule must not see the record it
 * is moving as a block against itself. P8 passes nothing.
 */
export async function bookedBlocks(
  masterId: string,
  from: Date,
  to: Date,
  executor: Executor = getDb(),
  excludeAppointmentId?: string,
): Promise<BookedBlock[]> {
  const rows = await executor
    .select({ startAt: appointments.startAt, endAt: appointments.endAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.masterId, masterId),
        ne(appointments.status, 'cancelled'),
        sql`${appointments.startAt} < ${to}`,
        sql`${appointments.endAt} > ${from}`,
        excludeAppointmentId === undefined
          ? undefined
          : ne(appointments.id, excludeAppointmentId),
      ),
    );

  return rows.map((row) => ({ start: row.startAt, end: row.endAt }));
}

/** One service line as it is written to `appointment_services`. */
export interface ServiceLineInput {
  readonly serviceId: string;
  readonly name: string;
  readonly baseDurationMinutes: number;
  readonly priceAmountMinor: number;
  readonly priceCurrency: string;
}

/** Everything a booking writes, already decided by the caller. */
export interface CreateAppointmentInput {
  readonly masterId: string;
  readonly clientName: string;
  readonly clientPhone: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly totalDurationMinutes: number;
  readonly occupiedDurationMinutes: number;
  readonly totalPriceAmountMinor: number;
  readonly totalPriceCurrency: string;
  readonly lines: readonly ServiceLineInput[];
  /** The injected clock: the instant the confirmation message is recorded as sent. */
  readonly now: Date;
  /** Who initiated the booking; 'admin' suppresses the administrator's row (REQ-F-030). */
  readonly actor?: 'client' | 'admin';
}

/** The row a booking produced, as the response needs it. */
export interface CreatedAppointment {
  readonly id: string;
  readonly accessToken: string;
  readonly status: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly totalDurationMinutes: number;
  readonly occupiedDurationMinutes: number;
  readonly totalPriceAmountMinor: number;
  readonly totalPriceCurrency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly ServiceLineInput[];
  /** The two reminder rows the booking wrote, in the order they occur (H1). */
  readonly reminders: readonly ReminderRow[];
}

/**
 * Writes the appointment, its lines and its confirmation message inside one
 * transaction, under the master's advisory lock (D2).
 *
 * The lock is taken **before** the caller's overlap check would be meaningful,
 * so the caller passes a `recheck` callback that runs inside the transaction
 * after the lock is held. That is the whole point: a check made before the lock
 * would be a check against a state another transaction can change between the
 * check and the insert.
 *
 * **The `notifications` row is written here, not after the transaction
 * (decision E2).** REQ-F-005 says exactly one confirmation SMS is *recorded* per
 * successful booking; a row inserted after the commit could survive a failure of
 * the appointment insert and report a message for a booking that does not exist,
 * or be lost after a booking that does. One transaction, one commit, or neither.
 * The partial unique index on `(appointment_id)` for
 * `client`/`new`/`sms` is the backstop (E4): a second such row cannot exist, even
 * if a future code path forgets this transaction.
 *
 * Returns `undefined` when the recheck refuses — the caller maps that to 409.
 * A unique-index violation is caught and also returns `undefined`, so the
 * backstop and the lock produce one answer (O8).
 */
export async function createAppointment(
  input: CreateAppointmentInput,
  recheck: (tx: Executor) => Promise<boolean>,
): Promise<CreatedAppointment | undefined> {
  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      // Transaction-scoped: released on commit or rollback, never forgotten.
      // The key is `master_id`: the advisory-lock functions take bigint or two
      // ints, not a uuid, so the uuid is hashed to 64 bits. `hashtextextended`
      // rather than `hashtext` because the latter returns 32 bits, and a
      // collision there would serialise two unrelated masters.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.masterId}::text, 0))`);

      if (!(await recheck(tx))) return undefined;

      const [row] = await tx
        .insert(appointments)
        .values({
          masterId: input.masterId,
          clientName: input.clientName,
          clientPhone: input.clientPhone,
          status: 'confirmed',
          startAt: input.startAt,
          endAt: input.endAt,
          totalDurationMinutes: input.totalDurationMinutes,
          occupiedDurationMinutes: input.occupiedDurationMinutes,
          totalPriceAmountMinor: input.totalPriceAmountMinor,
          totalPriceCurrency: input.totalPriceCurrency,
        })
        .returning();

      if (row === undefined) throw new Error('insert into appointments returned no row');

      await tx.insert(appointmentServices).values(
        input.lines.map((line, position) => ({
          appointmentId: row.id,
          serviceId: line.serviceId,
          position,
          name: line.name,
          baseDurationMinutes: line.baseDurationMinutes,
          priceAmountMinor: line.priceAmountMinor,
          priceCurrency: line.priceCurrency,
        })),
      );

      // REQ-F-005: exactly one client confirmation SMS per booking. `sent` is
      // "handed to the simulated channel" (E3): delivery itself is simulated.
      await tx.insert(notifications).values({
        appointmentId: row.id,
        audience: 'client',
        eventType: 'new',
        channel: 'sms',
        status: 'sent',
        sentAt: input.now,
      });

      // REQ-F-010, REQ-F-011: the two reminders, in the same transaction (H1).
      // Their status is decided here, against the booking's clock (H2).
      const reminders = await insertReminders(tx, row.id, row.startAt, input.now);

      // REQ-F-016, REQ-F-023: the master's and the administrator's rows, one per
      // enabled channel (S4.1, I5). The client's own rows are above (E2, H1) and
      // are not governed by preferences (I7).
      await recordAppointmentEvent(tx, {
        appointmentId: row.id,
        eventType: 'new',
        actor: input.actor ?? 'client',
        now: input.now,
      });

      return {
        id: row.id,
        accessToken: row.accessToken,
        status: row.status,
        startAt: row.startAt,
        endAt: row.endAt,
        totalDurationMinutes: row.totalDurationMinutes,
        occupiedDurationMinutes: row.occupiedDurationMinutes,
        totalPriceAmountMinor: row.totalPriceAmountMinor,
        totalPriceCurrency: row.totalPriceCurrency,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lines: input.lines,
        reminders,
      };
    });
  } catch (error) {
    // The partial unique index is the backstop for the exact-start race (D2)
    // and the second half of REQ-F-005's "exactly one" (E4). It is mapped here,
    // not left to the 500 branch, so a request that loses a race gets the same
    // business refusal as one the lock serialised (O8).
    if (isUniqueViolation(error, APPOINTMENT_SLOT_CONSTRAINT)) return undefined;
    throw error;
  }
}

/** The stored appointment P9 returns, or `undefined` when the token names none. */
export interface StoredAppointment {
  readonly id: string;
  readonly status: string;
  readonly clientName: string;
  readonly clientPhone: string;
  readonly masterId: string;
  readonly masterFullName: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly totalDurationMinutes: number;
  readonly occupiedDurationMinutes: number;
  readonly totalPriceAmountMinor: number;
  readonly totalPriceCurrency: string;
  readonly accessToken: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly AppointmentLine[];
  /** The two reminder rows, in the order they occur (S3.2, H1). */
  readonly reminders: readonly ReminderRow[];
}

/**
 * P9 — the appointment the token names, with its master and its line snapshot.
 *
 * `access_token` is the credential (REQ-NF-001), so the lookup is by that column
 * and by nothing else; an unknown token and a token that names a `cancelled`
 * record are different answers, and only the first is 404 (SRS v1.3 glossary:
 * the page and its token stay valid, read-only, after cancellation).
 *
 * The master's name is read through a join (E8): it is the current name, not a
 * snapshot, and the archive of what was booked is the service lines.
 */
async function fetchAppointment(condition: SQL): Promise<StoredAppointment | undefined> {
  const db = getDb();

  const [row] = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      clientName: appointments.clientName,
      clientPhone: appointments.clientPhone,
      masterId: appointments.masterId,
      masterFullName: masters.fullName,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      totalDurationMinutes: appointments.totalDurationMinutes,
      occupiedDurationMinutes: appointments.occupiedDurationMinutes,
      totalPriceAmountMinor: appointments.totalPriceAmountMinor,
      totalPriceCurrency: appointments.totalPriceCurrency,
      accessToken: appointments.accessToken,
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .innerJoin(masters, eq(masters.id, appointments.masterId))
    .where(condition);

  if (row === undefined) return undefined;

  const lines = await db
    .select({
      serviceId: appointmentServices.serviceId,
      name: appointmentServices.name,
      baseDurationMinutes: appointmentServices.baseDurationMinutes,
      priceAmountMinor: appointmentServices.priceAmountMinor,
      priceCurrency: appointmentServices.priceCurrency,
    })
    .from(appointmentServices)
    .where(eq(appointmentServices.appointmentId, row.id))
    .orderBy(appointmentServices.position);

  const reminders = await readReminders(db, row.id);
  const payment = await findPayment(row.id);

  // N2: absent when the appointment has none, so the body omits the key.
  return { ...row, lines, reminders, ...(payment === undefined ? {} : { payment }) };
}

/**
 * The appointment's payment, or `undefined` when it has none (D12: at most one).
 *
 * The `recordedAt` instant leaves in the salon's offset, like every other
 * instant this API returns.
 */
export async function findPayment(
  appointmentId: string,
  executor: Executor = getDb(),
): Promise<PaymentView | undefined> {
  const [row] = await executor
    .select()
    .from(payments)
    .where(eq(payments.appointmentId, appointmentId));

  if (row === undefined) return undefined;

  return {
    id: row.id,
    appointmentId: row.appointmentId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status as 'paid' | 'unpaid',
    method: row.method as 'cash' | 'card',
    recordedAt: salonDateTime(row.recordedAt),
  };
}

export async function findByToken(token: string): Promise<StoredAppointment | undefined> {
  return fetchAppointment(eq(appointments.accessToken, token));
}

export async function findById(id: string): Promise<StoredAppointment | undefined> {
  return fetchAppointment(eq(appointments.id, id));
}

/**
 * P9's read, with the reminder dispatch in front of it (H3).
 *
 * The dispatch is a write, and a read is the only trigger the system has: the
 * lab has no scheduler. It runs only for a `confirmed` record — a cancelled or
 * completed one is not dispatched (H5) — and only when something is due, so a
 * read of a record whose reminders are still ahead issues no `update` at all.
 *
 * The rows are re-read only when the dispatch changed something, so the common
 * case is one read of the appointment and one of its reminders.
 */
export async function loadAppointment(
  token: string,
  now: Date,
): Promise<StoredAppointment | undefined> {
  const record = await findByToken(token);
  if (record === undefined) return undefined;
  if (record.status !== 'confirmed') return record;

  const dispatched = await dispatchDueReminders(record.id, now);
  if (dispatched === 0) return record;

  return { ...record, reminders: await readReminders(getDb(), record.id) };
}

/**
 * Loads one appointment by id, dispatching due reminders when confirmed.
 *
 * S5.1a: sibling of `loadAppointment` (by token), used by `getAppointmentAdmin`.
 */
export async function loadAppointmentById(
  id: string,
  now: Date,
): Promise<StoredAppointment | undefined> {
  const record = await findById(id);
  if (record === undefined) return undefined;
  if (record.status !== 'confirmed') return record;

  const dispatched = await dispatchDueReminders(record.id, now);
  if (dispatched === 0) return record;

  return { ...record, reminders: await readReminders(getDb(), record.id) };
}

/** What P10's cancellation did, as the route needs to answer it. */
export type CancelByTokenResult =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'rejected'; readonly code: 'INVALID_STATE_TRANSITION' }
  | { readonly kind: 'cancelled'; readonly record: StoredAppointment };

/**
 * P10 — cancel the appointment the token names.
 *
 * The decision is `state.ts`'s (`error-model.md` §3.1); this function only
 * carries it out. Three outcomes:
 *
 *   - the token names nothing → `not-found` (the route answers 404);
 *   - the record is `completed` → `rejected` (the route answers 409);
 *   - the record is `confirmed` → one guarded `update`, then a re-read;
 *   - the record is already `cancelled` → no write at all, then a re-read.
 *
 * **The `update` is guarded by `status = 'confirmed'`** (F5). A concurrent
 * cancellation that wins the race leaves this one with zero rows instead of
 * writing a second `updated_at`; the re-read then answers the state the winner
 * wrote, which is the same 200 the table gives a repeat. The guard is the same
 * precondition the table names, so the two cannot disagree.
 *
 * **No advisory lock** (F4): cancellation only frees a block, it never takes
 * one, so it cannot create a double booking. The partial unique index
 * `appointments_master_start_unique` is what makes the freed slot bookable
 * again, and it is the database's, not this function's.
 *
 * **No `notifications` row** (K6): SRS v1.3 lines 253–256 say no SMS is sent for
 * a cancellation, and the master's and administrator's alerts are SMS-30.
 *
 * `now` is the injected clock (D9): the transition writes it to `updated_at`,
 * and the re-read reads the reminder rows the dispatch may have changed.
 */
export async function cancelByToken(token: string, now: Date): Promise<CancelByTokenResult> {
  const db = getDb();

  const [current] = await db
    .select({ id: appointments.id, status: appointments.status })
    .from(appointments)
    .where(eq(appointments.accessToken, token));

  if (current === undefined) return { kind: 'not-found' };

  // The column has `appointments_status_check` behind it, so a value outside the
  // enum is a broken invariant, not a client mistake: it becomes a 500 rather
  // than a status the contract does not define.
  if (!isAppointmentStatus(current.status)) {
    throw new Error(
      `appointment ${current.id} has status "${current.status}", which error-model.md §3.1 does not define`,
    );
  }

  const outcome = stateOutcome(current.status, 'cancel');

  if (outcome.kind === 'rejected') return { kind: 'rejected', code: outcome.code };

  if (outcome.kind === 'transition') {
    // H3: a reminder that fell due while the record was still live was sent
    // then, so the dispatch runs before the state changes. A repeat cancel
    // (already `cancelled`) does not dispatch: H5.
    await dispatchDueReminders(current.id, now);

    await db
      .update(appointments)
      .set({ status: outcome.to, updatedAt: now })
      .where(and(eq(appointments.id, current.id), eq(appointments.status, 'confirmed')));

    // REQ-F-016, REQ-F-023: the cancellation reaches the master and the
    // administrator, per their preferences (S4.1, I5). The client's own row is
    // still not written: SRS v1.3 lines 253–256 say no SMS is sent for a
    // cancellation (K6).
    await recordAppointmentEvent(db, {
      appointmentId: current.id,
      eventType: 'cancellation',
      actor: 'client',
      now,
    });
  }

  const record = await findByToken(token);
  if (record === undefined) {
    throw new Error(`appointment ${current.id} disappeared between the update and the read`);
  }

  return { kind: 'cancelled', record };
}

/** Everything an appointment edit writes, already decided by `reschedule.ts`. */
export interface AppointmentEditInput {
  readonly appointmentId: string;
  readonly masterId: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly totalDurationMinutes: number;
  readonly occupiedDurationMinutes: number;
  /** The lines to store: the snapshot, the re-priced snapshot, or R21's new set. */
  readonly lines: readonly ServiceLineInput[];
  /** True when the master changed, so the stored line prices follow the new links (G8). */
  readonly reprice: boolean;
  /** True when `lines` replaces the stored rows (R21 with `serviceIds`, L4). */
  readonly replaceLines: boolean;
  readonly totalPriceAmountMinor: number;
  readonly totalPriceCurrency: string;
  /** R21 may correct the client in the same write (K4). */
  readonly client?: { readonly name: string; readonly phone: string };
  /** True when the time moved, so the two reminder moments follow (H6). */
  readonly recalculateReminders: boolean;
  /** True for a time or master change: one client reschedule row (REQ-F-009). */
  readonly emitReschedule: boolean;
  /** Who initiated the edit: 'admin' suppresses the administrator's row (REQ-F-030). */
  readonly actor: 'client' | 'admin';
  /** The injected clock: `updated_at` and the reschedule message's `sent_at`. */
  readonly now: Date;
}

/** What an edit's write did, as the route needs to answer it. */
export type AppointmentEditResult =
  | { readonly kind: 'slot-unavailable' }
  | { readonly kind: 'rejected'; readonly code: 'INVALID_STATE_TRANSITION' }
  | { readonly kind: 'moved'; readonly record: StoredAppointment };

/**
 * An edit — P11's reschedule and R21's administrator patch — inside one
 * transaction.
 *
 * **One write for both operations** (K3): P11 and R21 differ in what they
 * decided, not in what the write does, so a second copy of this transaction
 * would be a second place for the reminder recalculation, the guarded update and
 * the event rows to drift.
 *
 * **The advisory lock is on the new master** (D2, G5), taken before the caller's
 * `recheck` runs. A reschedule takes a block on the new master's calendar, so it
 * is the same check-then-write race P8 has, and the same lock answers it. The
 * partial unique index `appointments_master_start_unique` is the backstop for
 * the exact-start race, and its violation is mapped to `slot-unavailable`, not
 * left to the 500 branch.
 *
 * **The `update` is guarded by `status = 'confirmed'`** (the same precondition
 * `state.ts` names for `edit`). The state was checked before the transaction;
 * the guard is what makes a concurrent cancel or complete win cleanly — zero
 * rows, and the route answers 409 rather than writing over the winner.
 *
 * **The `reschedule` row is written here, not after the commit** (G6, the same
 * reasoning as E2 for the confirmation): one transaction, one commit, or
 * neither. There is no unique index for it, because REQ-F-007 allows any number
 * of reschedules (R17). R21 writes it only for a time or master change (K4, L4)
 * and passes its own `actor`, so REQ-F-030 suppresses the administrator's row.
 *
 * **The lines are re-priced only when the master changed** (G8); when R21 also
 * names a service set, `replaceLines` rewrites the rows instead (L4).
 *
 * **The reminder rows are recalculated in the same transaction** (H6) when the
 * time moved: the new `startAt` moves both moments, and a moment that is now
 * past is `skipped` rather than left `scheduled` for a dispatch that would never
 * come. An edit that keeps the time (a master, service-set or client change)
 * leaves them alone.
 *
 * The re-read is `findById` **after** the transaction commits, so it sees the
 * committed row; reading inside the transaction through the pool would be a
 * second connection and would not see the uncommitted update.
 */
export async function editAppointment(
  input: AppointmentEditInput,
  recheck: (tx: Executor) => Promise<boolean>,
): Promise<AppointmentEditResult> {
  const db = getDb();

  type Outcome =
    | { readonly kind: 'slot-unavailable' }
    | { readonly kind: 'rejected' }
    | { readonly kind: 'moved' };

  let outcome: Outcome;

  try {
    outcome = await db.transaction(async (tx): Promise<Outcome> => {
      // Transaction-scoped, keyed on the new master: released on commit or
      // rollback, and two edits for different masters do not wait.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.masterId}::text, 0))`);

      if (!(await recheck(tx))) return { kind: 'slot-unavailable' };

      const updated = await tx
        .update(appointments)
        .set({
          masterId: input.masterId,
          startAt: input.startAt,
          endAt: input.endAt,
          totalDurationMinutes: input.totalDurationMinutes,
          occupiedDurationMinutes: input.occupiedDurationMinutes,
          totalPriceAmountMinor: input.totalPriceAmountMinor,
          totalPriceCurrency: input.totalPriceCurrency,
          ...(input.client === undefined
            ? {}
            : { clientName: input.client.name, clientPhone: input.client.phone }),
          updatedAt: input.now,
        })
        .where(
          and(
            eq(appointments.id, input.appointmentId),
            eq(appointments.status, 'confirmed'),
          ),
        )
        .returning({ id: appointments.id });

      const row = updated[0];
      // A concurrent cancel or complete won the race: the record is no longer
      // editable, and the route answers the state the winner wrote.
      if (row === undefined) return { kind: 'rejected' };

      if (input.replaceLines) {
        // L4: the new set is the record's set, so the old rows go in the same
        // transaction — one commit, or neither set exists.
        await tx
          .delete(appointmentServices)
          .where(eq(appointmentServices.appointmentId, input.appointmentId));
        await tx.insert(appointmentServices).values(
          input.lines.map((line, position) => ({
            appointmentId: input.appointmentId,
            serviceId: line.serviceId,
            position,
            name: line.name,
            baseDurationMinutes: line.baseDurationMinutes,
            priceAmountMinor: line.priceAmountMinor,
            priceCurrency: line.priceCurrency,
          })),
        );
      } else if (input.reprice) {
        for (const [position, line] of input.lines.entries()) {
          await tx
            .update(appointmentServices)
            .set({
              priceAmountMinor: line.priceAmountMinor,
              priceCurrency: line.priceCurrency,
            })
            .where(
              and(
                eq(appointmentServices.appointmentId, input.appointmentId),
                eq(appointmentServices.position, position),
              ),
            );
        }
      }

      if (input.recalculateReminders) {
        // REQ-F-029, SCN-11: the two reminder rows follow the new time, in place
        // (H6). A moment that is now past becomes `skipped`; one that is now
        // ahead becomes `scheduled` again, which is the reactivation SCN-11
        // describes.
        await recalculateReminders(tx, input.appointmentId, input.startAt, input.now);
      }

      if (input.emitReschedule) {
        // REQ-F-009: exactly one reschedule SMS per successful reschedule.
        await tx.insert(notifications).values({
          appointmentId: input.appointmentId,
          audience: 'client',
          eventType: 'reschedule',
          channel: 'sms',
          status: 'sent',
          sentAt: input.now,
        });

        // REQ-F-016, REQ-F-023: the master's and the administrator's rows for
        // the new time (S4.1, I5); `actor: 'admin'` suppresses the acting
        // administrator's own row (REQ-F-030, K5).
        await recordAppointmentEvent(tx, {
          appointmentId: input.appointmentId,
          eventType: 'reschedule',
          actor: input.actor,
          now: input.now,
        });
      }

      return { kind: 'moved' };
    });
  } catch (error) {
    if (isUniqueViolation(error, APPOINTMENT_SLOT_CONSTRAINT)) {
      return { kind: 'slot-unavailable' };
    }
    throw error;
  }

  if (outcome.kind === 'slot-unavailable') return { kind: 'slot-unavailable' };
  if (outcome.kind === 'rejected') {
    return { kind: 'rejected', code: 'INVALID_STATE_TRANSITION' };
  }

  const record = await findById(input.appointmentId);
  if (record === undefined) {
    throw new Error(`appointment ${input.appointmentId} disappeared after the edit`);
  }

  return { kind: 'moved', record };
}

/** What R22's or R23's transition did, as the route needs to answer it. */
export type StatusTransitionResult =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'rejected'; readonly code: 'INVALID_STATE_TRANSITION' }
  | { readonly kind: 'done'; readonly record: StoredAppointment };

/**
 * R22 and R23 — apply one column of `error-model.md` §3.1 to a record by id.
 *
 * The table is `state.ts`'s; this function only carries it out. A `confirmed`
 * record is updated under a `status = 'confirmed'` guard (F5), so a concurrent
 * winner leaves this one with zero rows instead of a second `updated_at`; an
 * already-terminal record answers its stored state without a write.
 *
 * **Cancellation writes the event and completion does not** (REQ-F-030, K6): the
 * event catalog is `new`, `reschedule`, `cancellation`, and the acting
 * administrator's own row is suppressed while the master's stands. Completion
 * has no event to write.
 *
 * The `now` is the injected clock (D9), written to `updated_at` and to the
 * cancellation row's `sent_at`.
 */
export async function transitionAppointmentById(
  appointmentId: string,
  action: 'cancel' | 'complete',
  now: Date,
): Promise<StatusTransitionResult> {
  const db = getDb();

  const [current] = await db
    .select({ id: appointments.id, status: appointments.status })
    .from(appointments)
    .where(eq(appointments.id, appointmentId));

  if (current === undefined) return { kind: 'not-found' };

  // The column has `appointments_status_check` behind it, so a value outside the
  // enum is a broken invariant, not a client mistake: it becomes a 500 rather
  // than a status the contract does not define.
  if (!isAppointmentStatus(current.status)) {
    throw new Error(
      `appointment ${current.id} has status "${current.status}", which error-model.md §3.1 does not define`,
    );
  }

  const outcome = stateOutcome(current.status, action);
  if (outcome.kind === 'rejected') return { kind: 'rejected', code: outcome.code };

  if (outcome.kind === 'transition') {
    await db.transaction(async (tx): Promise<void> => {
      const updated = await tx
        .update(appointments)
        .set({ status: outcome.to, updatedAt: now })
        .where(
          and(
            eq(appointments.id, current.id),
            eq(appointments.status, 'confirmed'),
          ),
        )
        .returning({ id: appointments.id });

      if (updated.length === 0) return; // a concurrent transition won

      if (action === 'cancel') {
        await recordAppointmentEvent(tx, {
          appointmentId: current.id,
          eventType: 'cancellation',
          actor: 'admin',
          now,
        });
      }
    });
  }

  const record = await findById(appointmentId);
  if (record === undefined) {
    throw new Error(`appointment ${appointmentId} disappeared after the transition`);
  }

  return { kind: 'done', record };
}

/** M1's filters, as the contract declares them. */
export interface MyAppointmentFilters {
  readonly from?: string;
  readonly to?: string;
  readonly status?: string;
}

export interface AdminAppointmentFilters {
  readonly masterId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly status?: string;
}

/**
 * Lists appointments with filters across all masters or for a specific master.
 *
 * S5.1a R20 and S4.2 M1 share this implementation: M1 locks `masterId` to the
 * authenticated caller, while R20 accepts an optional `masterId` query filter.
 * Ordering is `startAt` then `id` ascending (J4, K9).
 */
export async function listAppointmentsAdmin(
  filters: AdminAppointmentFilters,
  limit: number,
  offset: number,
  now: Date,
): Promise<{ items: StoredAppointment[]; total: number }> {
  const db = getDb();

  const conditions: SQL[] = [];
  if (filters.masterId !== undefined) {
    conditions.push(eq(appointments.masterId, filters.masterId));
  }
  if (filters.status !== undefined) {
    conditions.push(eq(appointments.status, filters.status));
  }

  const from = filters.from === undefined ? null : parseCalendarDate(filters.from);
  if (from !== null) {
    conditions.push(gte(appointments.startAt, new Date(salonInstant(from, 0))));
  }

  const to = filters.to === undefined ? null : parseCalendarDate(filters.to);
  if (to !== null) {
    conditions.push(
      lt(appointments.startAt, new Date(salonInstant(addCalendarDays(to, 1), 0))),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      clientName: appointments.clientName,
      clientPhone: appointments.clientPhone,
      masterId: appointments.masterId,
      masterFullName: masters.fullName,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      totalDurationMinutes: appointments.totalDurationMinutes,
      occupiedDurationMinutes: appointments.occupiedDurationMinutes,
      totalPriceAmountMinor: appointments.totalPriceAmountMinor,
      totalPriceCurrency: appointments.totalPriceCurrency,
      accessToken: appointments.accessToken,
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .innerJoin(masters, eq(masters.id, appointments.masterId))
    .where(where)
    .orderBy(asc(appointments.startAt), asc(appointments.id))
    .limit(limit)
    .offset(offset);

  const [totals] = await db.select({ total: count() }).from(appointments).where(where);
  const total = Number(totals?.total ?? 0);

  if (rows.length === 0) return { items: [], total };

  const ids = rows.map((row) => row.id);

  // J5: the dispatch runs before the rows are read, so a reminder that fell due
  // is `sent` in the body this read returns.
  for (const id of ids) await dispatchDueReminders(id, now);

  const lines = await db
    .select({
      appointmentId: appointmentServices.appointmentId,
      serviceId: appointmentServices.serviceId,
      name: appointmentServices.name,
      baseDurationMinutes: appointmentServices.baseDurationMinutes,
      priceAmountMinor: appointmentServices.priceAmountMinor,
      priceCurrency: appointmentServices.priceCurrency,
    })
    .from(appointmentServices)
    .where(inArray(appointmentServices.appointmentId, ids))
    .orderBy(asc(appointmentServices.appointmentId), asc(appointmentServices.position));

  const linesByAppointment = new Map<string, AppointmentLine[]>();
  for (const line of lines) {
    const list = linesByAppointment.get(line.appointmentId) ?? [];
    list.push({
      serviceId: line.serviceId,
      name: line.name,
      baseDurationMinutes: line.baseDurationMinutes,
      priceAmountMinor: line.priceAmountMinor,
      priceCurrency: line.priceCurrency,
    });
    linesByAppointment.set(line.appointmentId, list);
  }

  const reminders = await readRemindersFor(db, ids);

  return {
    items: rows.map((row) => ({
      ...row,
      lines: linesByAppointment.get(row.id) ?? [],
      reminders: reminders.get(row.id) ?? [],
    })),
    total,
  };
}

/**
 * M1 — one page of the caller's own appointments (REQ-F-013, J1–J5).
 *
 * The scope is the `masterId` the route takes from the token's subject, not a
 * parameter: REQ-F-013's AC is that the calendar contains only the caller's
 * appointments, and a parameter would make that a promise the query could
 * break.
 */
export async function listMyAppointments(
  masterId: string,
  filters: MyAppointmentFilters,
  limit: number,
  offset: number,
  now: Date,
): Promise<{ items: StoredAppointment[]; total: number }> {
  return listAppointmentsAdmin({ ...filters, masterId }, limit, offset, now);
}

/** What R27 did, as the route needs to answer it (N5). */
export type RecordPaymentOutcome =
  | { readonly kind: 'recorded'; readonly payment: PaymentView }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'not-completed' }
  | { readonly kind: 'already-recorded' };

export interface RecordPaymentInput {
  readonly amountMinor: number;
  readonly currency: string;
  readonly method: 'cash' | 'card';
  readonly status: 'paid' | 'unpaid';
}

/**
 * R27 — record the payment of a completed appointment (REQ-F-021, D12).
 *
 * **The order of the two 409s (N5).** The record's state is read first: an
 * appointment that is not `completed` answers `not-completed`, whatever else is
 * true of it. Only a completed record reaches the insert, where D12's unique
 * constraint answers `already-recorded` — the constraint rather than a
 * read-then-write, so two simultaneous requests cannot both pass a check and
 * both insert.
 *
 * **The appointment row is not written** (N6): recording money is not a change
 * to the booking, so its `status` and `updatedAt` stay as they were.
 *
 * `now` is the application's clock and becomes the payment's `recordedAt`.
 */
export async function recordPayment(
  appointmentId: string,
  input: RecordPaymentInput,
  now: Date,
): Promise<RecordPaymentOutcome> {
  const db = getDb();

  const record = await findById(appointmentId);
  if (record === undefined) return { kind: 'not-found' };
  if (record.status !== 'completed') return { kind: 'not-completed' };

  try {
    await db.insert(payments).values({
      appointmentId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: input.status,
      method: input.method,
      recordedAt: now,
    });
  } catch (error) {
    // D12's unique constraint on `appointment_id`. Mapped like the booking's
    // slot constraint: a request that loses the race gets the same business
    // refusal as one that found the row first, never a 500.
    if (isUniqueViolation(error, PAYMENT_CONSTRAINT)) return { kind: 'already-recorded' };
    throw error;
  }

  const payment = await findPayment(appointmentId);
  if (payment === undefined) {
    throw new Error(`payment for appointment ${appointmentId} was not readable after insert`);
  }
  return { kind: 'recorded', payment };
}

/** The unique constraint D12's cardinality is enforced by. */
export const PAYMENT_CONSTRAINT = 'payments_appointment_id_unique';
