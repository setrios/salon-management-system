/**
 * Creates the salon's single administrator (SMS-74, finding F13).
 *
 *   npm run create-admin -- --username admin --full-name "Administrator"
 *
 * The password is read from ADMIN_PASSWORD, or asked for when the terminal is
 * interactive. It is hashed here with the server's own `hashPassword` and
 * written with a parameterised query, so the hash never passes through a shell
 * string — the README's old `psql -c "INSERT … '<hash>' …"` lost every `$` of
 * the hash to the shell and stored an unusable one.
 *
 * The rules are the ones the API applies to a master account (`MasterCreate`
 * in openapi.yaml): username 3–64 of `[a-zA-Z0-9._-]`, password 8–128
 * characters. There is one administrator (REQ-F-017): a second run refuses.
 *
 * DATABASE_URL comes from the environment; `npm run create-admin` loads `.env`.
 * Exit codes: 0 created, 1 refused or failed, 2 usage.
 */

import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import pg from 'pg';

import { hashPassword } from '../src/modules/auth/password.ts';

const USAGE =
  'Usage: npm run create-admin -- --username <name> [--full-name "<name>"]\n' +
  '       (password from ADMIN_PASSWORD, or asked for)';

/** Stops with a message and an exit code. */
function fail(message, code = 1) {
  process.stderr.write(`create-admin: ${message}\n`);
  process.exit(code);
}

/** Asks for the password on an interactive terminal, without echoing it. */
async function askPassword() {
  if (!process.stdin.isTTY) fail('set ADMIN_PASSWORD, or run in a terminal to be asked.', 2);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const write = rl._writeToOutput?.bind(rl);
  rl._writeToOutput = (text) => {
    if (write !== undefined && text.includes('Password')) write(text);
  };
  const answer = await rl.question('Password for the administrator: ');
  rl.close();
  process.stdout.write('\n');
  return answer;
}

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    'full-name': { type: 'string', default: 'Administrator' },
  },
  strict: true,
});

const username = values.username?.trim() ?? '';
const fullName = values['full-name'].trim();
if (username === '') fail(`--username is required.\n${USAGE}`, 2);
if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
  fail('the username must be 3–64 letters, digits, dots, underscores or hyphens.', 2);
}
if (fullName === '' || fullName.length > 120) fail('the full name must be 1–120 characters.', 2);

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  fail('DATABASE_URL is not set: put it in .env (see .env.example) or in the environment.');
}

const password = process.env.ADMIN_PASSWORD ?? (await askPassword());
if (password.length < 8 || password.length > 128) fail('the password must be 8–128 characters.', 2);

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query('begin');
  const existing = await client.query("select username from masters where role = 'admin'");
  if (existing.rowCount > 0) {
    await client.query('rollback');
    fail(
      `an administrator already exists (${existing.rows[0].username}); there is one (REQ-F-017).`,
    );
  }
  const taken = await client.query('select 1 from masters where username = $1', [username]);
  if (taken.rowCount > 0) {
    await client.query('rollback');
    fail(`the username "${username}" is already taken.`);
  }
  await client.query(
    `insert into masters (full_name, username, password_hash, role, active)
     values ($1, $2, $3, 'admin', true)`,
    [fullName, username, hashPassword(password)],
  );
  await client.query('commit');
  process.stdout.write(`create-admin: created the administrator "${username}" (${fullName}).\n`);
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  const cause = error instanceof Error ? error.message : String(error);
  fail(`could not create the administrator: ${cause}`);
} finally {
  await client.end().catch(() => undefined);
}
