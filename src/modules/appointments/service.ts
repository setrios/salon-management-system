/**
 * Appointments — database access for P8.
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
 * Source: REQ-F-001, REQ-F-002, REQ-F-003, REQ-F-004, REQ-F-031, REQ-NF-001;
 *         `resource-model.md` §4 (only `cancelled` frees a block), §5.1 (P8);
 *         `error-model.md` §3 (409 `SLOT_UNAVAILABLE`).
 */

import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { getDb, type Database } from '../../db/client.js';
import {
  appointmentServices,
  appointments,
  masterServices,
  masters,
  notifications,
  services,
} from '../../db/schema.js';
import type { BookableService } from './rules.js';
import type { AppointmentLine } from './view.js';
import { isUniqueViolation } from '../reference-data/http.js';

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
 */
export async function bookedBlocks(
  masterId: string,
  from: Date,
  to: Date,
  executor: Executor = getDb(),
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
export async function findByToken(token: string): Promise<StoredAppointment | undefined> {
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
    .where(eq(appointments.accessToken, token));

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

  return { ...row, lines };
}
