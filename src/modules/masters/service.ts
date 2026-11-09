/**
 * Masters — database access for R1–R4.
 *
 * Knows Drizzle and the `masters` table, not HTTP. The routes layer turns a
 * missing row into 404 and a constraint violation into 409.
 *
 * Source: REQ-F-012, REQ-F-018; `error-model.md` §3 (the three uniqueness
 * constraints are the only 409 triggers); plan §5.1 (`masters` columns).
 */

import { asc, count, eq } from 'drizzle-orm';

import { getDb } from '../../db/client.js';
import { masters } from '../../db/schema.js';
import { hashPassword } from '../auth/password.js';

/** The columns `Master` exposes; `password_hash` and `role` are not among them. */
export interface MasterView {
  id: string;
  fullName: string;
  username: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The PostgreSQL constraint a duplicate username violates (see `error-model.md` §3). */
export const USERNAME_CONSTRAINT = 'masters_username_unique';

type MasterRow = typeof masters.$inferSelect;

function toMaster(row: MasterRow): MasterView {
  return {
    id: row.id,
    fullName: row.fullName,
    username: row.username,
    active: row.active,
    // `date-time` is a string in the contract; `res.json` would stringify a
    // Date anyway, but the response schema is checked before that happens.
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface MasterListFilter {
  readonly active?: boolean;
  readonly limit: number;
  readonly offset: number;
}

/** One page of accounts plus the total for that filter. */
export async function listMasters(
  filter: MasterListFilter,
): Promise<{ items: MasterView[]; total: number }> {
  const db = getDb();
  const where = filter.active === undefined ? undefined : eq(masters.active, filter.active);

  const rows = await db
    .select()
    .from(masters)
    .where(where)
    .orderBy(asc(masters.createdAt), asc(masters.id))
    .limit(filter.limit)
    .offset(filter.offset);

  const [totalRow] = await db.select({ value: count() }).from(masters).where(where);

  return { items: rows.map(toMaster), total: totalRow?.value ?? 0 };
}

export interface MasterCreateInput {
  readonly fullName: string;
  readonly username: string;
  readonly password: string;
  readonly active?: boolean;
}

/** Inserts an account; the caller maps a unique violation to 409. */
export async function createMaster(input: MasterCreateInput): Promise<MasterView> {
  const [row] = await getDb()
    .insert(masters)
    .values({
      fullName: input.fullName,
      username: input.username,
      passwordHash: hashPassword(input.password),
      role: 'master',
      active: input.active ?? true,
    })
    .returning();

  if (row === undefined) throw new Error('insert into masters returned no row');
  return toMaster(row);
}

/** One account, or `undefined` for an unknown id. */
export async function findMaster(id: string): Promise<MasterView | undefined> {
  const [row] = await getDb().select().from(masters).where(eq(masters.id, id));
  return row === undefined ? undefined : toMaster(row);
}

export interface MasterPatchInput {
  readonly fullName?: string;
  readonly active?: boolean;
}

/** Applies the patch the schema already validated; `undefined` means 404. */
export async function updateMaster(
  id: string,
  patch: MasterPatchInput,
): Promise<MasterView | undefined> {
  const [row] = await getDb()
    .update(masters)
    .set({
      ...(patch.fullName === undefined ? {} : { fullName: patch.fullName }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      updatedAt: new Date(),
    })
    .where(eq(masters.id, id))
    .returning();

  return row === undefined ? undefined : toMaster(row);
}
