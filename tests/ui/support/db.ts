/**
 * Database reset for the browser tests.
 *
 * Every spec file starts from the state a fresh installation has after the
 * README's first-run steps: the three seed categories (migration 0001) and one
 * administrator written by hand. Everything else a test needs is created
 * through the API, as an administrator would (`api.ts`).
 */

import pg from 'pg';

import { hashPassword } from '../../helpers/accounts.js';
import { SEED_CATEGORIES } from '../../helpers/reference-data.js';
import { UI_DATABASE_URL } from './env.js';

/** The administrator every spec file signs in as. */
export const ADMIN = {
  username: 'ui-admin',
  password: 'ui-admin-password',
  fullName: 'Salon Administrator',
} as const;

/** Empties every table, restores the seeds and writes the administrator. */
export async function resetDatabase(): Promise<void> {
  const pool = new pg.Pool({ connectionString: UI_DATABASE_URL });
  try {
    const { rows } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => `"public"."${row.table_name}"`).join(', ');
      await pool.query(`truncate table ${tables} restart identity cascade`);
    }
    await pool.query(
      `insert into public.categories (name, seeded) values ($1, true), ($2, true), ($3, true)`,
      [...SEED_CATEGORIES],
    );
    await pool.query(
      `insert into public.masters (full_name, username, password_hash, role, active)
       values ($1, $2, $3, 'admin', true)`,
      [ADMIN.fullName, ADMIN.username, hashPassword(ADMIN.password)],
    );
  } finally {
    await pool.end();
  }
}
