/**
 * Materials — database access for R13–R16.
 *
 * `name` is unique, the third of the three constraints `error-model.md` §3
 * names; the routes layer maps its violation to 409 on both create (R14) and
 * rename (R16). `unit` is free text (REQ-F-025) and `stock_quantity` is
 * fractional because ml, l, g and kg are measured, not counted.
 *
 * Source: REQ-F-018, REQ-F-025; `error-model.md` §3; plan §5.1 (`materials`
 *         columns).
 */

import { and, asc, count, eq, ilike } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { materials } from '../../db/schema.js';

/** `Material` as the contract exposes it. */
export interface MaterialView {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The PostgreSQL constraint a duplicate material name violates. */
export const NAME_CONSTRAINT = 'materials_name_unique';

type MaterialRow = typeof materials.$inferSelect;

function toMaterial(row: MaterialRow): MaterialView {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    stockQuantity: row.stockQuantity,
    active: row.active,
    // `date-time` is a string in the contract; `res.json` would stringify a
    // Date anyway, but the response schema is checked before that happens.
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface MaterialListFilter {
  readonly active?: boolean;
  readonly q?: string;
  readonly limit: number;
  readonly offset: number;
}

/** One page of materials plus the total for that filter. */
export async function listMaterials(
  filter: MaterialListFilter,
): Promise<{ items: MaterialView[]; total: number }> {
  const db = getDb();
  const conditions = [
    ...(filter.active === undefined ? [] : [eq(materials.active, filter.active)]),
    // `q` is the contract's free-text search over the material name; a
    // case-insensitive substring match is the least surprising reading of a
    // declared but unspecified `q` (openapi.yaml has no description for it).
    ...(filter.q === undefined ? [] : [ilike(materials.name, `%${filter.q}%`)]),
  ];
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const rows = await db
    .select()
    .from(materials)
    .where(where)
    .orderBy(asc(materials.createdAt), asc(materials.id))
    .limit(filter.limit)
    .offset(filter.offset);

  const [totalRow] = await db.select({ value: count() }).from(materials).where(where);

  return { items: rows.map(toMaterial), total: totalRow?.value ?? 0 };
}

export interface MaterialCreateInput {
  readonly name: string;
  readonly unit: string;
  /** The contract's create-only name for the material's opening stock. */
  readonly initialStockQuantity?: number;
  readonly active?: boolean;
}

/** Inserts a material; the caller maps a unique violation to 409. */
export async function createMaterial(input: MaterialCreateInput): Promise<MaterialView> {
  const [row] = await getDb()
    .insert(materials)
    .values({
      name: input.name,
      unit: input.unit,
      stockQuantity: input.initialStockQuantity ?? 0,
      active: input.active ?? true,
    })
    .returning();

  if (row === undefined) throw new Error('insert into materials returned no row');
  return toMaterial(row);
}

/** One material, or `undefined` for an unknown id. */
export async function findMaterial(id: string): Promise<MaterialView | undefined> {
  const [row] = await getDb().select().from(materials).where(eq(materials.id, id));
  return row === undefined ? undefined : toMaterial(row);
}

export interface MaterialPatchInput {
  readonly name?: string;
  readonly unit?: string;
  readonly active?: boolean;
}

/**
 * Applies a patch; `undefined` means the id is unknown.
 *
 * `stockQuantity` is not patchable: `MaterialPatch` closes it, and stock moves
 * through material transactions (S2.4), not through this operation.
 */
export async function updateMaterial(
  id: string,
  patch: MaterialPatchInput,
): Promise<MaterialView | undefined> {
  const [row] = await getDb()
    .update(materials)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.unit === undefined ? {} : { unit: patch.unit }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      updatedAt: new Date(),
    })
    .where(eq(materials.id, id))
    .returning();

  return row === undefined ? undefined : toMaterial(row);
}
