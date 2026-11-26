/**
 * Vitest global setup: regenerate the contract bundle before any test runs.
 *
 * `src/contract/openapi.json` is derived from `spec/api/openapi.yaml` and is
 * git-ignored, so a clean checkout does not contain it and `npm test` could not
 * even load the schemas. `npm run build` regenerates it, but tests must not
 * depend on a build having run: the contract is the oracle the tests compile
 * their validators from.
 *
 * It is regenerated on every run, not only when the file is missing: a stale
 * bundle would silently make tests compare the code against an older copy of
 * the contract, which is the one failure this check cannot tolerate.
 *
 * This lives in `globalSetup`, not in `tests/setup.ts`: setup files run once per
 * test file inside a worker, so several workers would write the same file
 * concurrently. Global setup runs once, in the main process, before collection.
 * The converter exits non-zero on a parse error; running it as a child process
 * turns that into an exception here rather than letting it terminate the runner
 * through `process.exit`.
 */

import { execFileSync } from 'node:child_process';

export default function setup(): void {
  try {
    execFileSync(process.execPath, ['src/contract/convert.mjs'], { stdio: 'pipe' });
  } catch (error) {
    // `stdio: 'pipe'` keeps the converter's message out of the terminal, so it
    // is carried into the exception instead of being lost.
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim() ?? '';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`contract conversion failed: ${stderr === '' ? message : stderr}`, {
      cause: error,
    });
  }
}
