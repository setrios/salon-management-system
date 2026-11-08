/**
 * Copies the generated contract next to the compiled validators.
 *
 * `src/contract/validators.ts` resolves `openapi.json` relative to its own
 * module, which is correct for the TypeScript sources and for the test run, but
 * `tsc` emits only `.js` files. Without this copy, a built application cannot
 * load the contract and the first 404/405 request becomes a 500
 * ("src/contract/openapi.json is missing"). Found by the S1.0 control run
 * (`logs/runs/runs-01.md`).
 *
 * Runs from the repository root, as npm scripts do.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const source = 'src/contract/openapi.json';
const target = 'dist/src/contract/openapi.json';

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`copy-contract: ${source} -> ${target}`);
