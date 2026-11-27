/**
 * SMS-77 — create-admin does not show the password while it is typed.
 *
 * The developer's re-run of the README (2026-11-27) printed
 * `Password for the administrator: tomi`: the typed password was echoed to the
 * terminal, while the README says "typing is not shown". A password on the
 * screen is a password in the scrollback, the screen share and the terminal's
 * log — the same class of leak as F13, through another door.
 *
 * The prompt only runs on an interactive terminal, so the case runs the script
 * under a pseudo-terminal (`script` from util-linux) and types into it. Where
 * that tool is missing (macOS ships a BSD `script` with another syntax), the
 * case is skipped and says so.
 *
 *   P1  the typed password does not appear in the terminal's output
 *   P2  the account is still created with that password (A1 signs in)
 *
 * Source: README "The first administrator" ("typing is not shown");
 *         REQ-F-012, REQ-F-017; SMS-74 (F13).
 * Ticket: SMS-77 (Test)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { getPool } from '../../src/db/client.js';

/** True when util-linux's `script` is available to give the script a terminal. */
function hasUtilLinuxScript(): boolean {
  try {
    return execFileSync('script', ['--version'], { encoding: 'utf8' }).includes('util-linux');
  } catch {
    return false;
  }
}

const PASSWORD = 'typed-secret-4821';

describe.skipIf(!hasUtilLinuxScript())('SMS-77 create-admin hides the typed password', () => {
  it('P1 does not echo the password, and P2 creates the account with it', async () => {
    await getPool().query("delete from masters where role = 'admin'");

    const script = resolve(process.cwd(), 'scripts/create-admin.mjs');
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: process.env.DATABASE_URL };
    delete env.ADMIN_PASSWORD;

    // `script` runs the command on a pseudo-terminal; the password and Enter
    // are typed into it once the prompt has had time to appear.
    const typed = spawnSync(
      'sh',
      [
        '-c',
        `(sleep 1; printf '%s\\r' "$TYPED") | script -qec "node ${script} --username prompt-check --full-name 'Prompt Check'" /dev/null`,
      ],
      { env: { ...env, TYPED: PASSWORD }, encoding: 'utf8', timeout: 20_000 },
    );
    const screen = `${typed.stdout}${typed.stderr}`;

    expect(screen).toContain('Password for the administrator:');
    expect(screen).toContain('created the administrator "prompt-check"');
    expect(screen).not.toContain(PASSWORD);

    const login = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ username: 'prompt-check', password: PASSWORD });
    expect(login.status).toBe(200);
  });
});
