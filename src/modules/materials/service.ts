/**
 * Materials — database access for R13–R16 and, since S5.2, R25–R26.
 *
 * `name` is unique, the third of the three constraints `error-model.md` §3
 * names; the routes layer maps its violation to 409 on both create (R14) and
 * rename (R16). `unit` is free text (REQ-F-025) and `stock_quantity` is
 * fractional because ml, l, g and kg are measured, not counted.
 *
 * **The ledger (R25, R26).** REQ-F-020: a transaction moves the balance by its
 * quantity. The two rows — the transaction and the material's new
 * `stock_quantity` — are written in one database transaction, under a row lock
 * on the material (`select … for update`, M8), so two issues cannot both read
 * the same balance and together oversell it. A refusal returns before any
 * insert, so nothing is written when stock is short.
 *
 * Source: REQ-F-018, REQ-F-025, REQ-F-020, D13; `error-model.md` §3, §5.6;
 *         plan §5.1 (`materials` columns; `material_transactions`).
 */

import { and, asc, count, desc, eq, gte, ilike, lt, type SQL } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { materials, materialTransactions } from '../../db/schema.js';
import { salonDateTime } from '../../lib/occupancy.js';
import { addCalendarDays, parseCalendarDate, salonInstant } from '../../lib/time.js';

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

/* ==========================================================================
 * The material ledger (R25, R26) — S5.2
 * ======================================================================== */

/** `MaterialTransaction` as the contract exposes it. */
export interface MaterialTransactionView {
  id: string;
  materialId: string;
  type: 'receipt' | 'issue';
  quantity: number;
  occurredAt: string;
  note?: string;
  createdAt: string;
}

type MaterialTransactionRow = typeof materialTransactions.$inferSelect;

function toTransaction(row: MaterialTransactionRow): MaterialTransactionView {
  return {
    id: row.id,
    materialId: row.materialId,
    type: row.type as 'receipt' | 'issue',
    quantity: row.quantity,
    // Instants leave in the salon's own offset, as every other instant in this
    // API does (`Appointment.startAt` through `salonDateTime`); `createdAt`
    // below is the row's own record time and keeps the material's ISO form.
    occurredAt: salonDateTime(row.occurredAt),
    ...(row.note === null ? {} : { note: row.note }),
    createdAt: row.createdAt.toISOString(),
  };
}

export interface MaterialTransactionFilter {
  readonly type?: 'receipt' | 'issue';
  /** Calendar dates, inclusive (M4); `from`/`to` follow R20's reading. */
  readonly from?: string;
  readonly to?: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * One page of a material's ledger, or `undefined` when the material is unknown.
 *
 * Order is `occurredAt` descending with `id` descending as the tie-break (M3):
 * the fact the row records decides, so a movement entered late still sorts by
 * when it happened. Filtering follows the contract — `type`, and inclusive
 * `from`/`to` days in Kyiv (M4).
 */
export async function listMaterialTransactions(
  materialId: string,
  filter: MaterialTransactionFilter,
): Promise<{ items: MaterialTransactionView[]; total: number } | undefined> {
  const db = getDb();

  const [material] = await db
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.id, materialId));
  if (material === undefined) return undefined;

  const conditions: SQL[] = [eq(materialTransactions.materialId, materialId)];
  if (filter.type !== undefined) {
    conditions.push(eq(materialTransactions.type, filter.type));
  }

  const from = filter.from === undefined ? null : parseCalendarDate(filter.from);
  if (from !== null) {
    conditions.push(gte(materialTransactions.occurredAt, new Date(salonInstant(from, 0))));
  }

  const to = filter.to === undefined ? null : parseCalendarDate(filter.to);
  if (to !== null) {
    conditions.push(
      lt(
        materialTransactions.occurredAt,
        new Date(salonInstant(addCalendarDays(to, 1), 0)),
      ),
    );
  }

  const where = and(...conditions);

  const rows = await db
    .select()
    .from(materialTransactions)
    .where(where)
    .orderBy(desc(materialTransactions.occurredAt), desc(materialTransactions.id))
    .limit(filter.limit)
    .offset(filter.offset);

  const [totalRow] = await db
    .select({ value: count() })
    .from(materialTransactions)
    .where(where);

  return { items: rows.map(toTransaction), total: totalRow?.value ?? 0 };
}

export interface MaterialTransactionInput {
  readonly type: 'receipt' | 'issue';
  readonly quantity: number;
  /** The instant the movement happened, already parsed. */
  readonly occurredAt: Date;
  readonly note?: string;
}

/**
 * Records one movement and moves the balance with it (REQ-F-020, D13).
 *
 * Three outcomes, and the caller maps them to HTTP: `recorded`, `not-found`
 * (unknown material), `insufficient` (an issue larger than the balance at the
 * moment of the write — the numbers ride along so the refusal can name them,
 * `error-model.md` §5.6). The refusal writes nothing; the lock is released when
 * the transaction ends.
 *
 * `now` is the application's clock, like every other write: it becomes the
 * material's `updatedAt` (M9), while the transaction's own `createdAt` is the
 * row's.
 */
export type MaterialTransactionOutcome =
  | { kind: 'recorded'; transaction: MaterialTransactionView }
  | { kind: 'not-found' }
  | { kind: 'insufficient'; requested: number; balance: number; unit: string };

export async function recordMaterialTransaction(
  materialId: string,
  input: MaterialTransactionInput,
  now: Date,
): Promise<MaterialTransactionOutcome> {
  return getDb().transaction(async (tx) => {
    // M8: the balance is read under a row lock, so a concurrent issue waits.
    const [material] = await tx
      .select({
        id: materials.id,
        unit: materials.unit,
        stockQuantity: materials.stockQuantity,
      })
      .from(materials)
      .where(eq(materials.id, materialId))
      .for('update');

    if (material === undefined) return { kind: 'not-found' };

    if (input.type === 'issue' && material.stockQuantity < input.quantity) {
      return {
        kind: 'insufficient',
        requested: input.quantity,
        balance: material.stockQuantity,
        unit: material.unit,
      };
    }

    const [row] = await tx
      .insert(materialTransactions)
      .values({
        materialId: material.id,
        type: input.type,
        quantity: input.quantity,
        occurredAt: input.occurredAt,
        ...(input.note === undefined ? {} : { note: input.note }),
      })
      .returning();

    if (row === undefined) {
      throw new Error('insert into material_transactions returned no row');
    }

    const delta = input.type === 'receipt' ? input.quantity : -input.quantity;
    await tx
      .update(materials)
      .set({ stockQuantity: material.stockQuantity + delta, updatedAt: now })
      .where(eq(materials.id, material.id));

    return { kind: 'recorded', transaction: toTransaction(row) };
  });
}
