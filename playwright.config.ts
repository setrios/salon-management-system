/**
 * Playwright configuration — the browser tests of the interface (SMS-57).
 *
 * The tests drive the built server exactly as a user would: `npm run build`,
 * then `node dist/src/index.js` on its own port and its own database. They are
 * derived from `spec/ui/screens.md` (UI-GATE GO, 2026-11-26), not from the
 * interface's code.
 *
 * Why a separate database. The Vitest suite truncates `salon_test` before every
 * file; sharing it would let one runner empty the tables the other is reading.
 * `salon_ui_test` keeps the two runners independent, and its name ends in
 * `_test` for the same guard `tests/setup.ts` applies.
 *
 * Why one worker. Every spec file resets the same database in `beforeAll`, so
 * two workers would race on it — the reason the Vitest config is single-fork.
 */

import { randomBytes } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

import { UI_BASE_URL, UI_DATABASE_URL, UI_PORT } from './tests/ui/support/env.js';

// The worker processes import the repository's helpers, which read the
// configuration of `src/config.ts`; in `test` mode it takes TEST_DATABASE_URL.
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = UI_DATABASE_URL;

export default defineConfig({
  testDir: 'tests/ui',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/ui/support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: UI_BASE_URL,
    trace: 'retain-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run build && node dist/src/index.js',
    url: `${UI_BASE_URL}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'development',
      PORT: String(UI_PORT),
      DATABASE_URL: UI_DATABASE_URL,
      PUBLIC_BASE_URL: UI_BASE_URL,
      JWT_SECRET: randomBytes(32).toString('hex'),
      LOG_DIR: 'logs/runtime/ui',
    },
  },
});
