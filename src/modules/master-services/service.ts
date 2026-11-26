/**
 * Master-service links — database access for R10–R12.
 *
 * A link carries the price a master charges for a service. The pair
 * (master, service) is unique, which is the second of the three constraints
 * `error-model.md` §3 names; the routes layer maps its violation to 409.
 *
 * Source: REQ-F-018; `error-model.md` §3; plan §5.1 (`master_services` columns).
 */

import { and, asc, count, eq } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { masters, masterServices } from '../../db/schema.js';

/** `MasterService` as the contract exposes it: the price is nested `Money`. */
export interface MasterServiceView {
  id: string;
  masterId: string;
  serviceId: string;
  price: { amountMinor: number; currency: string };
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The PostgreSQL constraint a duplicate link violates (see `error-model.md` §3). */
export const LINK_CONSTRAINT = 'master_services_master_service_unique';

type LinkRow = typeof masterServices.$inferSelect;

function toLink(row: LinkRow): MasterServiceView {
  return {
    id: row.id,
    masterId: row.masterId,
    serviceId: row.serviceId,
    price: { amountMinor: row.priceAmountMinor, currency: row.priceCurrency },
    active: row.active,
    // `date-time` is a string in the contract; `res.json` would stringify a
    // Date anyway, but the response schema is checked before that happens.
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface LinkListFilter {
  readonly masterId?: string;
  readonly serviceId?: string;
  readonly active?: boolean;
  /**
   * The page, when the caller wants one. R10 always passes both; M2 passes
   * neither, because `MasterServiceList` is a bare array with no envelope
   * (S4.2, J7).
   */
  readonly limit?: number;
  readonly offset?: number;
}

/** One page of links plus the total for that filter. */
export async function listLinks(
  filter: LinkListFilter,
): Promise<{ items: MasterServiceView[]; total: number }> {
  const db = getDb();
  const conditions = [
    ...(filter.masterId === undefined ? [] : [eq(masterServices.masterId, filter.masterId)]),
    ...(filter.serviceId === undefined ? [] : [eq(masterServices.serviceId, filter.serviceId)]),
    ...(filter.active === undefined ? [] : [eq(masterServices.active, filter.active)]),
  ];
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const ordered = db
    .select()
    .from(masterServices)
    .where(where)
    .orderBy(asc(masterServices.createdAt), asc(masterServices.id));

  // `limit` is optional (S4.2, J7): M2 asks for the caller's links without a
  // page envelope, and Drizzle's builder takes a number, not `undefined`.
  const rows =
    filter.limit === undefined
      ? await ordered
      : await ordered.limit(filter.limit).offset(filter.offset ?? 0);

  const [totalRow] = await db.select({ value: count() }).from(masterServices).where(where);

  return { items: rows.map(toLink), total: totalRow?.value ?? 0 };
}

export interface LinkCreateInput {
  readonly masterId: string;
  readonly serviceId: string;
  readonly price: { amountMinor: number; currency: string };
  readonly active?: boolean;
}

/**
 * True when `masterId` names a master — a row of `masters` with
 * `role = 'master'`, so neither an unknown id nor the administrator's (D10).
 * R11 checks it before inserting, instead of letting the foreign key fail
 * with 500 (SMS-71).
 */
export async function isMasterId(masterId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: masters.id })
    .from(masters)
    .where(and(eq(masters.id, masterId), eq(masters.role, 'master')));
  return row !== undefined;
}

/** Inserts a link; the caller maps a unique violation to 409. */
export async function createLink(input: LinkCreateInput): Promise<MasterServiceView> {
  const [row] = await getDb()
    .insert(masterServices)
    .values({
      masterId: input.masterId,
      serviceId: input.serviceId,
      priceAmountMinor: input.price.amountMinor,
      priceCurrency: input.price.currency,
      active: input.active ?? true,
    })
    .returning();

  if (row === undefined) throw new Error('insert into master_services returned no row');
  return toLink(row);
}

export interface LinkPatchInput {
  readonly price?: { amountMinor: number; currency: string };
  readonly active?: boolean;
}

/**
 * Applies a patch; `undefined` means the id is unknown.
 *
 * `MasterServicePatch` closes the pair (no `masterId`/`serviceId`), so an update
 * cannot collide with the unique pair and declares 409 only as dead letter
 * (CL-10). Nothing is mapped to it here.
 */
export async function updateLink(
  id: string,
  patch: LinkPatchInput,
): Promise<MasterServiceView | undefined> {
  const [row] = await getDb()
    .update(masterServices)
    .set({
      ...(patch.price === undefined
        ? {}
        : { priceAmountMinor: patch.price.amountMinor, priceCurrency: patch.price.currency }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      updatedAt: new Date(),
    })
    .where(eq(masterServices.id, id))
    .returning();

  return row === undefined ? undefined : toLink(row);
}
