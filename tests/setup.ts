/**
 * Vitest global setup.
 *
 * Responsibilities, in order:
 *   1. Load `.env` if present (no dotenv dependency) and force `NODE_ENV=test`
 *      BEFORE any application module is imported — `src/config.ts` reads the
 *      environment once, at import time, so the order matters.
 *   2. Redirect the application to `TEST_DATABASE_URL`. That variable must name
 *      a database ending in `_test`; the suite truncates tables before each test
 *      file (decision D-7), so a mistyped URL must fail loudly instead of wiping
 *      a development database.
 *   3. Apply every migration in `src/db/migrations` to the test database, so
 *      `npm test` reproduces the schema on an empty database — the migrations
 *      are the only source of the schema, and the migrator records what it has
 *      applied, so repeated runs are no-ops.
 *   4. Truncate every table before each test file, so suites do not depend on
 *      execution order.
 *   5. Close the pool once, after the last file.
 *
 * Application modules are imported dynamically inside the hooks for the same
 * reason: a static `import` would be evaluated before step 1 runs.
 *
 * Source: logs/2026-11-08-implementation-plan.md §3 (D-7), §5.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll } from 'vitest';

/** Minimal `.env` reader: `KEY=value`, `#` comments, no interpolation. */
function loadDotEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    return; // No .env: the environment already carries what it needs.
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function databaseNameOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

loadDotEnv();
process.env.NODE_ENV = 'test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';

if (testDatabaseUrl !== '') {
  const databaseName = databaseNameOf(testDatabaseUrl);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${databaseName}": the name must end in _test (decision D-7).`,
    );
  }
  // Set before an application module reads the environment.
  process.env.DATABASE_URL = testDatabaseUrl;
}

/** True when a test database is configured; suites needing one get a clear error otherwise. */
export const hasTestDatabase = testDatabaseUrl !== '';

/** Lists the tables of the public schema, or nothing when the schema is empty. */
async function listPublicTables(): Promise<string[]> {
  const { getPool } = await import('../src/db/client.js');
  const { rows } = await getPool().query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  return rows.map((row) => row.table_name);
}

/**
 * Truncates every table so that a test file starts from an empty database.
 * Exported so a suite that seeds mid-file can reset without duplicating the SQL.
 */
export async function truncateAll(): Promise<void> {
  const tables = await listPublicTables();
  if (tables.length === 0) return;

  const { getPool } = await import('../src/db/client.js');
  const quoted = tables.map((table) => `"public"."${table}"`).join(', ');
  await getPool().query(`truncate table ${quoted} restart identity cascade`);
}

/**
 * Applies the migrations from `src/db/migrations` to the test database.
 *
 * `migrate` reads `meta/_journal.json` and applies only what the journal table
 * does not already record, so a second run changes nothing. The folder is
 * resolved from the process working directory, which is the repository root
 * under both `npm test` and a direct `npx vitest run`.
 */
async function migrateDatabase(): Promise<void> {
  const { getDb } = await import('../src/db/client.js');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(getDb(), {
    migrationsFolder: resolve(process.cwd(), 'src/db/migrations'),
  });
}

beforeAll(async () => {
  if (!hasTestDatabase) return; // Pure unit suites do not need a database.
  await migrateDatabase();
  await truncateAll();
});

afterAll(async () => {
  if (!hasTestDatabase) return;
  const { closeDb } = await import('../src/db/client.js');
  await closeDb();
});
