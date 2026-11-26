/**
 * Where the browser tests run: one port and one database, both separate from
 * the Vitest suite's (see `playwright.config.ts`).
 *
 * `UI_TEST_DATABASE_URL` overrides the database; its name must end in `_test`,
 * the guard `tests/setup.ts` applies, because every spec file truncates it.
 */

/** Port of the server the browser tests start. */
export const UI_PORT = 3100;

/** Origin of that server; also its `PUBLIC_BASE_URL`, so confirmation links open here. */
export const UI_BASE_URL = `http://localhost:${UI_PORT}`;

/** Database the browser tests own. */
export const UI_DATABASE_URL =
  process.env.UI_TEST_DATABASE_URL ?? 'postgres://salon:salon@127.0.0.1:5432/salon_ui_test';

if (!/_test$/.test(new URL(UI_DATABASE_URL).pathname)) {
  throw new Error(`UI_TEST_DATABASE_URL must name a database ending in _test: ${UI_DATABASE_URL}`);
}
