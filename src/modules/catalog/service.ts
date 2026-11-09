/**
 * Catalog — database access for services and categories (R5–R9).
 *
 * Reads and writes `services`; writes `categories` only as a side effect of
 * saving a service (D-27), because the contract defines no category operation.
 *
 * Source: REQ-F-018 (services carry a category and are deactivated, never
 *         deleted), REQ-F-024 (free-form categories; the three seeds exist on a
 *         fresh installation and a custom one becomes selectable for future
 *         services), SCN-08; `error-model.md` §3.
 */

import { and, asc, count, eq, sql } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { categories, services } from '../../db/schema.js';

/** `Service` as the contract exposes it. */
export interface ServiceView {
  id: string;
  name: string;
  category: string;
  baseDurationMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `Category` as the contract exposes it. */
export interface CategoryView {
  name: string;
  seeded: boolean;
}

type ServiceRow = typeof services.$inferSelect;

function toService(row: ServiceRow): ServiceView {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    baseDurationMinutes: row.baseDurationMinutes,
    active: row.active,
    // `date-time` is a string in the contract; `res.json` would stringify a
    // Date anyway, but the response schema is checked before that happens.
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Records the category of a service.
 *
 * A category that does not exist yet is created with `seeded:false`; one that
 * exists is left untouched, so the three seeds keep `seeded:true` forever (SCN-08
 * requires the custom category to be selectable afterwards, and the seeds to be
 * unchanged). `on conflict do nothing` rather than an upsert: a later save must
 * never flip a seed's `seeded` value or rename anything.
 */
async function recordCategory(name: string): Promise<void> {
  await getDb()
    .insert(categories)
    .values({ name, seeded: false })
    .onConflictDoNothing({ target: categories.name });
}

export interface ServiceListFilter {
  readonly active?: boolean;
  readonly category?: string;
  readonly limit: number;
  readonly offset: number;
}

/** One page of services plus the total for that filter. */
export async function listServices(
  filter: ServiceListFilter,
): Promise<{ items: ServiceView[]; total: number }> {
  const db = getDb();
  const conditions = [
    ...(filter.active === undefined ? [] : [eq(services.active, filter.active)]),
    ...(filter.category === undefined ? [] : [eq(services.category, filter.category)]),
  ];
  const where = conditions.length === 0 ? undefined : and(...conditions);

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

export interface ServiceCreateInput {
  readonly name: string;
  readonly category: string;
  readonly baseDurationMinutes: number;
  readonly active?: boolean;
}

/** Saves a service and records its category (D-27). */
export async function createService(input: ServiceCreateInput): Promise<ServiceView> {
  const [row] = await getDb()
    .insert(services)
    .values({
      name: input.name,
      category: input.category,
      baseDurationMinutes: input.baseDurationMinutes,
      active: input.active ?? true,
    })
    .returning();

  if (row === undefined) throw new Error('insert into services returned no row');

  await recordCategory(input.category);
  return toService(row);
}

/** One service, or `undefined` for an unknown id. */
export async function findService(id: string): Promise<ServiceView | undefined> {
  const [row] = await getDb().select().from(services).where(eq(services.id, id));
  return row === undefined ? undefined : toService(row);
}

export interface ServicePatchInput {
  readonly name?: string;
  readonly category?: string;
  readonly baseDurationMinutes?: number;
  readonly active?: boolean;
}

/** Applies a patch; `undefined` means the id is unknown. */
export async function updateService(
  id: string,
  patch: ServicePatchInput,
): Promise<ServiceView | undefined> {
  const [row] = await getDb()
    .update(services)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.category === undefined ? {} : { category: patch.category }),
      ...(patch.baseDurationMinutes === undefined
        ? {}
        : { baseDurationMinutes: patch.baseDurationMinutes }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      updatedAt: new Date(),
    })
    .where(eq(services.id, id))
    .returning();

  if (row === undefined) return undefined;

  if (patch.category !== undefined) await recordCategory(patch.category);
  return toService(row);
}

/** Every category, seeds first and then custom ones in creation order. */
export async function listCategories(): Promise<CategoryView[]> {
  const rows = await getDb()
    .select({ name: categories.name, seeded: categories.seeded })
    .from(categories)
    .orderBy(sql`${categories.seeded} desc`, asc(categories.name));

  return rows.map((row) => ({ name: row.name, seeded: row.seeded }));
}
