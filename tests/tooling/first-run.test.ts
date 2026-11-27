/**
 * SMS-74 — the README's first run works in a clean environment.
 *
 * The developer's run of the README on a fresh checkout (2026-11-26) failed
 * twice before the first sign-in:
 *
 *   F11  `npx drizzle-kit migrate` does not read `.env` — `npm start` does
 *        (`--env-file-if-exists=.env`), drizzle-kit does not — so
 *        `drizzle.config.ts` saw no `DATABASE_URL`, used `''`, and the
 *        migrations were silently not applied;
 *   F13  the README's first-administrator `INSERT` put the scrypt hash inside
 *        double quotes, where the shell expanded every `$` and stored a broken
 *        hash; the administrator could not sign in.
 *
 * The configuration is exercised in a temporary directory with its own `.env`,
 * so no developer's `.env` is read by these tests.
 *
 *   E1  drizzle.config.ts takes DATABASE_URL from ./.env when the environment has none
 *   E2  an environment value wins over .env (the rule `npm start` follows)
 *   E3  with neither, loading the configuration fails with a message naming DATABASE_URL
 *   C1  `scripts/create-admin.mjs` creates the administrator; a password with `$`
 *       signs in through A1
 *   C2  a second run refuses: there is one administrator (REQ-F-017)
 *   C3  without --username it writes nothing and prints its usage
 *
 * Source: lab 6 step 8 (README checked by running it); README "Quick start",
 *         "The first administrator"; REQ-F-012, REQ-F-017; findings F11, F13.
 * Ticket: SMS-74 (Test)
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getPool } from '../../src/db/client.js';

const run = promisify(execFile);
const ROOT = process.cwd();
const CONFIG_URL = pathToFileURL(resolve(ROOT, 'drizzle.config.ts')).href;

/** The environment of a child process, without any database variable of this one. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  if (!('DATABASE_URL' in extra)) delete env.DATABASE_URL;
  delete env.TEST_DATABASE_URL;
  return env;
}

/** Loads drizzle.config.ts in a fresh process whose working directory is `cwd`. */
async function configUrlIn(cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(CONFIG_URL)}); process.stdout.write(m.default.dbCredentials.url);`,
    ],
    { cwd, env },
  );
  return stdout;
}

describe('SMS-74 F11 — drizzle.config.ts reads .env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sms74-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('E1 takes DATABASE_URL from ./.env when the environment has none', async () => {
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://from-env-file/salon\n');
    expect(await configUrlIn(dir, cleanEnv())).toBe('postgres://from-env-file/salon');
  });

  it('E2 lets an environment value win over .env', async () => {
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://from-env-file/salon\n');
    const env = cleanEnv({ DATABASE_URL: 'postgres://from-environment/salon' });
    expect(await configUrlIn(dir, env)).toBe('postgres://from-environment/salon');
  });

  it('E3 fails with a message naming DATABASE_URL when neither has it', async () => {
    rmSync(join(dir, '.env'), { force: true });
    await expect(configUrlIn(dir, cleanEnv())).rejects.toThrow(/DATABASE_URL/);
  });
});

describe('SMS-74 F13 — scripts/create-admin.mjs', () => {
  const app = createApp();
  const script = resolve(ROOT, 'scripts/create-admin.mjs');
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const password = 'pa$$w0rd$1 with $HOME';

  async function createAdmin(args: string[], extra: Record<string, string> = {}) {
    return run(process.execPath, [script, ...args], {
      cwd: ROOT,
      env: cleanEnv({ DATABASE_URL: databaseUrl, ...extra }),
    });
  }

  async function adminCount(): Promise<number> {
    const { rows } = await getPool().query<{ n: string }>(
      "select count(*) as n from masters where role = 'admin'",
    );
    return Number(rows[0]?.n ?? 0);
  }

  it('C1 creates the administrator, and a password with $ signs in', async () => {
    const { stdout } = await createAdmin(['--username', 'owner', '--full-name', 'Salon Owner'], {
      ADMIN_PASSWORD: password,
    });
    expect(stdout).toMatch(/owner/);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'owner', password });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('admin');
  });

  it('C2 refuses a second administrator', async () => {
    await expect(
      createAdmin(['--username', 'second', '--full-name', 'Second'], {
        ADMIN_PASSWORD: 'x-password',
      }),
    ).rejects.toThrow(/administrator already exists/i);
    expect(await adminCount()).toBe(1);
  });

  it('C3 writes nothing and prints its usage without --username', async () => {
    const before = await adminCount();
    await expect(createAdmin([], { ADMIN_PASSWORD: 'x-password' })).rejects.toThrow(/usage/i);
    expect(await adminCount()).toBe(before);
  });
});
