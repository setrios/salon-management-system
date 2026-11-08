/**
 * PostgreSQL connection.
 *
 * One `pg.Pool` for the process, wrapped by Drizzle. The pool is created
 * lazily on first use so that importing the application does not require a
 * reachable database — unit tests and the contract checker must be able to
 * import modules without a live server.
 *
 * Source: logs/2026-11-08-implementation-plan.md §5; decision D-14.
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
// `pg` is CommonJS. The default import is the form guaranteed to work from an ES
// module regardless of the named-export detection Node performs on a CJS entry
// file; the class is then read off it. The `Pool` type comes from the separate
// type-only import, which is erased at compile time.
import pg, { type Pool as PgPool } from 'pg';

import { config } from '../config.js';

const { Pool } = pg;

/**
 * No schema generic yet: `./schema.ts` exports nothing until the first ticket
 * declares a table. Adding the generic here then is a one-line change.
 */
export type Database = NodePgDatabase;

let pool: PgPool | undefined;
let db: Database | undefined;

/** Returns the shared Drizzle instance, creating the pool on first call. */
export function getDb(): Database {
  if (db !== undefined) return db;

  if (config.databaseUrl === '') {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env, or set TEST_DATABASE_URL for the test run.',
    );
  }

  pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  db = drizzle(pool);
  return db;
}

/** Returns the underlying pool, for tests that need to run raw SQL. */
export function getPool(): PgPool {
  getDb();
  // getDb() assigns `pool` before returning.
  return pool as PgPool;
}

/** Closes the pool. Safe to call when nothing was opened. */
export async function closeDb(): Promise<void> {
  if (pool === undefined) return;
  await pool.end();
  pool = undefined;
  db = undefined;
}
