/**
 * Applies the migrations to the browser tests' database once, before the
 * server starts serving requests that need the tables.
 *
 * Playwright starts `webServer` before running `globalSetup`, but the server
 * touches the database only when a request arrives, and no request arrives
 * before this function has returned.
 */

import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { UI_DATABASE_URL } from './env.js';

/** Playwright's global setup: migrate the UI database. */
export default async function globalSetup(): Promise<void> {
  const pool = new pg.Pool({ connectionString: UI_DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: resolve('src/db/migrations') });
  } finally {
    await pool.end();
  }
}
