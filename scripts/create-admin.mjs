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

/**
 * Asks for the password on an interactive terminal, without echoing it.
 *
 * The terminal is put in raw mode and the characters are collected one by one,
 * so nothing typed is written back (SMS-77: readline echoed it). Enter ends the
 * input, Backspace removes the last character, Ctrl-C and Ctrl-D cancel. The
 * terminal's mode is restored on every way out.
 */
function askPassword() {
  if (!process.stdin.isTTY) fail('set ADMIN_PASSWORD, or run in a terminal to be asked.', 2);
  process.stdout.write('Password for the administrator: ');
  return new Promise((resolvePassword) => {
    let password = '';
    const stdin = process.stdin;
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          finish();
          resolvePassword(password);
          return;
        }
        if (char === '\u0003' || char === '\u0004') {
          finish();
          fail('cancelled; nothing was written.', 1);
        }
        if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
        else if (char >= ' ') password += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
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
