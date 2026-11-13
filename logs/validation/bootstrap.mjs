/**
 * Validation bootstrap — the two accounts the human validation needs.
 *
 * The checklist in `logs/validation/checklist.md` assumes an administrator and a
 * master already exist: the API has no self-registration (REQ-F-017), so a fresh
 * database has nobody who can log in. This script inserts exactly those two rows
 * and prints their credentials; everything after it is done through HTTP, by hand.
 *
 * It writes to `DATABASE_URL` — the database the developer's `npm start` uses —
 * and refuses a `_test` database, because the suite truncates that one. Running it
 * twice is harmless: an existing username is left as it is.
 *
 * The passwords below are development placeholders, not secrets; the file is
 * committed with them on purpose so the checklist is reproducible.
 *
 * Usage:
 *   npm run build
 *   node --env-file-if-exists=.env logs/validation/bootstrap.mjs
 */

import pg from 'pg';

import { hashPassword } from '../../dist/src/modules/auth/password.js';

const CONNECTION = process.env.DATABASE_URL;
if (CONNECTION === undefined || CONNECTION === '') {
  throw new Error('DATABASE_URL must be set (the database `npm start` uses).');
}

const database = new URL(CONNECTION).pathname.replace(/^\//, '');
if (database.endsWith('_test')) {
  throw new Error(
    `refusing to seed "${database}": the test suite truncates a database whose name ends in _test`,
  );
}

const ACCOUNTS = [
  {
    role: 'admin',
    username: 'admin-val',
    password: 'validation-password-2026',
    fullName: 'Validation Administrator',
  },
  {
    role: 'master',
    username: 'master-val',
    password: 'validation-password-2026',
    fullName: 'Validation Master',
  },
];

const client = new pg.Client({ connectionString: CONNECTION });
await client.connect();

try {
  // A database without the schema is the common first mistake: say so instead of
  // failing on `relation "masters" does not exist`.
  const table = await client.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'masters'`,
  );
  if (table.rowCount === 0) {
    throw new Error(
      `the database "${database}" has no schema: run \`npx drizzle-kit migrate\` (or start the API once) before this script`,
    );
  }

  for (const account of ACCOUNTS) {
    await client.query(
      `insert into public.masters (full_name, username, password_hash, role, active)
       values ($1, $2, $3, $4, true)
       on conflict (username) do nothing`,
      [account.fullName, account.username, hashPassword(account.password), account.role],
    );
    console.log(`account ready: ${account.role}/${account.username}`);
  }

  const { rows } = await client.query(
    `select username, role, active from public.masters where username in ('admin-val', 'master-val')
     order by role`,
  );
  console.log('\nrows now in the database:');
  for (const row of rows) console.log(`  ${row.role.padEnd(6)} ${row.username} active=${row.active}`);

  console.log(`
Log in with:

  ADMIN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \\
    -H 'Content-Type: application/json' \\
    -d '{"username":"admin-val","password":"validation-password-2026"}' \\
    | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')

  MASTER=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \\
    -H 'Content-Type: application/json' \\
    -d '{"username":"master-val","password":"validation-password-2026"}' \\
    | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
`);
} finally {
  await client.end();
}
