/**
 * Public catalogue — database access for P1–P6.
 *
 * Six read-only operations over `services`, `categories`, `masters` and
 * `master_services`. Nothing here writes, and nothing here raises a status: the
 * routes layer decides 404 for an id that names no bookable master.
 *
 * Two rules of this surface are decided here rather than in the contract, both
 * recorded in `logs/tdd/tdd-SMS-25.md` §5:
 *
 *   - **D10.** The public surface is about *bookable masters*. The administrator
 *     is a row of `masters` (D-19) with `role = 'admin'`, so every master read
 *     filters on `role = 'master'`; an administrator id is therefore a 404 on
 *     P5 and P6, and never appears in P4's page.
 *   - **D11.** P1 lists active services only. P4's and P6's `active` parameter
 *     defaults to the unfiltered set, so a client asks for retired rows
 *     explicitly.
 *
 * Source: REQ-F-001 (a service carries its base duration; a master offers it at
 *         a price), REQ-F-002 (the master and their services are readable
 *         without an account), REQ-F-014 (a master's service list is the link
 *         records), REQ-F-018 (deactivation keeps a row, hides it from new
 *         selection), REQ-F-024 (the three seeds plus custom categories);
 *         `resource-model.md` §5.1 (P1–P6), D19 (`MasterPublic`).
 */

import { and, asc, count, eq, sql } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { categories, masterServices, masters, services } from '../../db/schema.js';

/** `Service` as the contract exposes it — the same shape R5–R8 return. */
export interface PublicServiceView {
  id: string;
  name: string;
  category: string;
  baseDurationMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `MasterPublic` as the contract exposes it: an id and a full name, nothing else. */
export interface MasterPublicView {
  id: string;
  fullName: string;
}

/** `Category` as the contract exposes it. */
export interface CategoryView {
  name: string;
  seeded: boolean;
}

/** `MasterService` as the contract exposes it: the price is nested `Money`. */
export interface PublicLinkView {
  id: string;
  masterId: string;
  serviceId: string;
  price: { amountMinor: number; currency: string };
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The page of a public list (P1, P4, P6) as an offset. */
export interface PublicListFilter {
  readonly limit: number;
  readonly offset: number;
}

type ServiceRow = typeof services.$inferSelect;
type LinkRow = typeof masterServices.$inferSelect;

function toService(row: ServiceRow): PublicServiceView {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    baseDurationMinutes: row.baseDurationMinutes,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLink(row: LinkRow): PublicLinkView {
  return {
    id: row.id,
    masterId: row.masterId,
    serviceId: row.serviceId,
    price: { amountMinor: row.priceAmountMinor, currency: row.priceCurrency },
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** P1's filter: active services, optionally by category and by a name substring. */
export interface ServiceListFilter extends PublicListFilter {
  readonly category?: string;
  readonly q?: string;
}

/** P1 — one page of active services plus the total for the filter (D11). */
export async function listActiveServices(
  filter: ServiceListFilter,
): Promise<{ items: PublicServiceView[]; total: number }> {
  const db = getDb();
  const conditions = [
    eq(services.active, true),
    ...(filter.category === undefined ? [] : [eq(services.category, filter.category)]),
    // `q` is "case-insensitive substring match on the service name" (P1's own
    // description). `ILIKE` is the database's case-insensitive match, and the
    // wildcards are escaped so a client searching for `%` searches for `%`.
    ...(filter.q === undefined
      ? []
      : [sql`${services.name} ilike ${'%' + escapeLike(filter.q) + '%'}`]),
  ];
  const where = and(...conditions);

  const rows = await db
    .select()
    .from(services)
    .where(where)
    .orderBy(asc(services.createdAt), asc(services.id))
    .limit(filter.limit)
    .offset(filter.offset);

  const [totalRow] = await db.select({ value: count() }).from(services).where(where);

  return { items: rows.map(toService), total: totalRow?.value ?? 0 };
}

/** Escapes the `LIKE` metacharacters so a search term is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * P2 — one service by id, active or not.
 *
 * No `active` filter: `Service` carries the flag, so the caller sees a retired
 * service rather than a 404. Hiding it is P1's job (D11).
 */
export async function findPublicService(id: string): Promise<PublicServiceView | undefined> {
  const [row] = await getDb().select().from(services).where(eq(services.id, id));
  return row === undefined ? undefined : toService(row);
}

/** P3 — every category, seeds first. Same ordering as the administrator's R9. */
export async function listPublicCategories(): Promise<CategoryView[]> {
  const rows = await getDb()
    .select({ name: categories.name, seeded: categories.seeded })
    .from(categories)
    .orderBy(sql`${categories.seeded} desc`, asc(categories.name));

  return rows.map((row) => ({ name: row.name, seeded: row.seeded }));
}

/** P4's filter: bookable masters only, optionally narrowed by `active`. */
export interface MasterListFilter extends PublicListFilter {
  readonly active?: boolean;
}

/** P4 — one page of bookable masters in public representation (D10). */
export async function listBookableMasters(
  filter: MasterListFilter,
): Promise<{ items: MasterPublicView[]; total: number }> {
  const db = getDb();
  const conditions = [
    eq(masters.role, 'master'),
    ...(filter.active === undefined ? [] : [eq(masters.active, filter.active)]),
  ];
  const where = and(...conditions);

  const rows = await db
    .select({ id: masters.id, fullName: masters.fullName })
    .from(masters)
    .where(where)
    .orderBy(asc(masters.fullName), asc(masters.id))
    .limit(filter.limit)
    .offset(filter.offset);

  const [totalRow] = await db.select({ value: count() }).from(masters).where(where);

  return {
    items: rows.map((row) => ({ id: row.id, fullName: row.fullName })),
    total: totalRow?.value ?? 0,
  };
}

/**
 * P5 — one bookable master, or `undefined`.
 *
 * The `role` predicate is what makes an administrator id a 404 (D10): the row
 * exists, but it names no master a client can book.
 */
export async function findBookableMaster(id: string): Promise<MasterPublicView | undefined> {
  const [row] = await getDb()
    .select({ id: masters.id, fullName: masters.fullName })
    .from(masters)
    .where(and(eq(masters.id, id), eq(masters.role, 'master')));

  return row === undefined ? undefined : { id: row.id, fullName: row.fullName };
}

/** P6's filter: the links of one bookable master, optionally by `active`. */
export interface MasterLinkFilter extends PublicListFilter {
  readonly active?: boolean;
}

/** P6 — one page of a master's links plus the total for the filter. */
export async function listMasterLinks(
  masterId: string,
  filter: MasterLinkFilter,
): Promise<{ items: PublicLinkView[]; total: number }> {
  const db = getDb();
  const conditions = [
    eq(masterServices.masterId, masterId),
    ...(filter.active === undefined ? [] : [eq(masterServices.active, filter.active)]),
  ];
  const where = and(...conditions);

  const rows = await db
    .select()
    .from(masterServices)
    .where(where)
    .orderBy(asc(masterServices.createdAt), asc(masterServices.id))
    .limit(filter.limit)
    .offset(filter.offset);

  const [totalRow] = await db.select({ value: count() }).from(masterServices).where(where);

  return { items: rows.map(toLink), total: totalRow?.value ?? 0 };
}
