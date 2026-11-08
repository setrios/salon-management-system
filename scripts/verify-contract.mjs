#!/usr/bin/env node
/**
 * Contract presence check.
 *
 * Reads `spec/api/openapi.yaml` — the approved contract, and the only file it
 * touches — and prints the number of operations it defines. No network, no
 * database, no server: it is the cheap check that the contract the tests are
 * derived from is the one in the repository and that it still parses.
 *
 * This stage only counts. Response-by-response validation of a running server
 * comes later, with the first operation that has something to validate.
 *
 * The `yaml` parser is loaded from the root install once dependencies exist.
 * If they do not, the copy that already ships with the contract tooling under
 * `spec/api/node_modules` is used, so the check also runs before `npm install`.
 * Nothing here writes to either location.
 *
 * Exit codes: 0 the contract parsed and operations were counted; 1 otherwise
 * (unreadable file, invalid YAML, no `paths`, an operation without operationId,
 * or no usable `yaml` package).
 *
 * Usage: node scripts/verify-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = resolve(ROOT, 'spec/api/openapi.yaml');

const METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options', 'trace'];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * Resolves `yaml.parse`.
 *
 * The root install is the real source (`yaml` is a direct dependency). The
 * fallback to the contract tooling's copy exists only so this check can run in a
 * tree where `npm install` has not happened yet; it is a transitive dependency
 * and must not outlive the scaffold. When it is used, it says so on stderr.
 *
 * TODO(S1.0): delete the fallback once root dependencies are installed.
 */
function loadParse() {
  const require = createRequire(import.meta.url);

  try {
    const module = require('yaml');
    if (typeof module?.parse === 'function') return module.parse;
  } catch {
    // Not installed at the root yet.
  }

  try {
    const module = require(resolve(ROOT, 'spec/api/node_modules/yaml'));
    if (typeof module?.parse === 'function') {
      process.stderr.write(
        'note: `yaml` resolved from spec/api/node_modules (transitive); run `npm install` at the root.\n',
      );
      return module.parse;
    }
  } catch {
    // Nothing to fall back to.
  }

  fail('cannot load the `yaml` package: run `npm install` at the repository root.');
}

function main() {
  const parse = loadParse();

  let raw;
  try {
    raw = readFileSync(CONTRACT_PATH, 'utf8');
  } catch (error) {
    fail(`cannot read spec/api/openapi.yaml: ${error.message}`);
  }

  let doc;
  try {
    doc = parse(raw);
  } catch (error) {
    fail(`spec/api/openapi.yaml is not valid YAML: ${error.message}`);
  }

  if (doc === null || typeof doc !== 'object' || typeof doc.paths !== 'object' || doc.paths === null) {
    fail('spec/api/openapi.yaml has no paths object');
  }

  let operations = 0;
  const missingOperationId = [];

  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (pathItem === null || typeof pathItem !== 'object') continue;

    for (const method of METHODS) {
      const operation = pathItem[method];
      if (operation === undefined) continue;

      operations += 1;
      if (typeof operation.operationId !== 'string') {
        missingOperationId.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  process.stdout.write(`contract: ${doc.openapi ?? 'unknown version'} — ${operations} operations\n`);

  if (missingOperationId.length > 0) {
    fail(`operations without operationId:\n  ${missingOperationId.join('\n  ')}`);
  }

  process.exit(0);
}

main();
