/**
 * Availability — database access for P7, M3 and M4.
 *
 * Knows Drizzle and the two availability tables, not HTTP. The routes layer
 * turns a missing master into 404 and an invalid window into 422; nothing here
 * raises a status.
 *
 * Storage shape vs contract shape: a weekly rule and a date rule are rows, an
 * `Availability` is two arrays. Reads assemble the arrays; a write replaces both
 * inside one transaction, because M4 is a *full replacement* (resource-model §4)
 * and a half-applied replacement would leave a master with a mix of two rule
 * sets.
 *
 * Source: REQ-F-015, SCN-09; `spec/api/resource-model.md` §4 (`PUT` = full
 *         replacement), §5.3 (M3, M4); `openapi.yaml` `Availability`.
 */

import { asc, eq, inArray } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { availabilityDates, availabilityWeekly, masters, services } from '../../db/schema.js';
import type { AvailabilityInput } from '../../lib/availability.js';

/** One service's id and base duration, for the duration sum of P7. */
export interface ServiceDuration {
  readonly id: string;
  readonly baseDurationMinutes: number;
}

/** True when a master with this id exists (any `active` value). */
export async function masterExists(masterId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: masters.id })
    .from(masters)
    .where(eq(masters.id, masterId))
    .limit(1);

  return row !== undefined;
}

/**
 * The requested services' durations, in the order they were asked for.
 *
 * Returns one entry per id that exists, so the caller can tell "every id is
 * known" from "one of them is not": P7 answers 404 for an unknown service id
 * (`error-model.md` §3 lists P7 under 404), which the route decides from the
 * length of this list against the length of the request.
 */
export async function findServiceDurations(serviceIds: readonly string[]): Promise<ServiceDuration[]> {
  if (serviceIds.length === 0) return [];

  const rows = await getDb()
    .select({ id: services.id, baseDurationMinutes: services.baseDurationMinutes })
    .from(services)
    .where(inArray(services.id, [...serviceIds]));

  // `inArray` does not preserve the requested order; the caller only sums the
  // durations, so any order gives the same total, but returning the request
  // order keeps the function's contract honest for a future caller that echoes it.
  const byId = new Map(rows.map((row) => [row.id, row]));
  return serviceIds
    .map((id) => byId.get(id))
    .filter((row): row is ServiceDuration => row !== undefined);
}

/** The caller's stored rule set, or two empty arrays when none was ever set. */
export async function readAvailability(masterId: string): Promise<AvailabilityInput> {
  const db = getDb();

  const weeklyRows = await db
    .select()
    .from(availabilityWeekly)
    .where(eq(availabilityWeekly.masterId, masterId))
    .orderBy(asc(availabilityWeekly.dayOfWeek), asc(availabilityWeekly.startTime));

  const dateRows = await db
    .select()
    .from(availabilityDates)
    .where(eq(availabilityDates.masterId, masterId))
    .orderBy(asc(availabilityDates.date), asc(availabilityDates.startTime));

  return {
    weekly: weeklyRows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
    })),
    dates: dateRows.map((row) => ({
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
    })),
  };
}

/**
 * Replaces the whole rule set for `masterId` in one transaction.
 *
 * Delete-then-insert, not an upsert: M4 is a replacement, so a rule the client
 * left out must disappear, and an upsert would leave it behind. The transaction
 * is what makes the replacement atomic, so a failure half-way rolls back to the
 * previous set rather than leaving a mixture.
 */
export async function replaceAvailability(
  masterId: string,
  input: AvailabilityInput,
): Promise<AvailabilityInput> {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.delete(availabilityWeekly).where(eq(availabilityWeekly.masterId, masterId));
    await tx.delete(availabilityDates).where(eq(availabilityDates.masterId, masterId));

    if (input.weekly.length > 0) {
      await tx.insert(availabilityWeekly).values(
        input.weekly.map((rule) => ({
          masterId,
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
        })),
      );
    }

    if (input.dates.length > 0) {
      await tx.insert(availabilityDates).values(
        input.dates.map((rule) => ({
          masterId,
          date: rule.date,
          startTime: rule.startTime,
          endTime: rule.endTime,
        })),
      );
    }
  });

  return readAvailability(masterId);
}
