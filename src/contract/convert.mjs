/**
 * OpenAPI 3.0.3 → JSON Schema draft-07 conversion.
 *
 * The contract stays 3.0.3 and is never edited here (D-10). AJV 8 validates
 * draft-07, so two constructs are rewritten: `exclusiveMinimum: true` with
 * `minimum: N` → `exclusiveMinimum: N` (CL-08), and
 * `#/components/schemas/X` → `#/definitions/X`. Annotation-only keywords are
 * dropped; they carry no validation meaning.
 *
 * `nullable` is deliberately not handled: the contract contains no occurrence of
 * it, so a branch for it would be unreachable code. If a later contract change
 * introduces it, the converter gains the branch in the same change, with the
 * test that needs it.
 *
 * Output (`src/contract/openapi.json`, git-ignored): `{ definitions,
 * operations }`. Responses are not collected — nothing needs them until a check
 * of a real response exists, which arrives with the test requiring it.
 *
 * Usage: node src/contract/convert.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = resolve(HERE, '../../spec/api/openapi.yaml');
const OUTPUT = resolve(HERE, 'openapi.json');

const METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options', 'trace'];
const DROPPED = new Set(['example', 'examples', 'xml', 'externalDocs', 'discriminator']);

/** Converts one schema node (or nested node) to draft-07. */
function convert(node) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(convert);

  const out = {};

  for (const [key, value] of Object.entries(node)) {
    if (DROPPED.has(key)) continue;

    if (key === '$ref') out.$ref = value.replace('#/components/schemas/', '#/definitions/');
    else if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
      // draft-07 wants a number; 3.0 expresses it as a flag on the bound.
      const bound = node[key === 'exclusiveMinimum' ? 'minimum' : 'maximum'];
      if (typeof value === 'number') out[key] = value;
      else if (value === true && typeof bound === 'number') out[key] = bound;
    } else if (key === 'minimum' || key === 'maximum') {
      if (node[key === 'minimum' ? 'exclusiveMinimum' : 'exclusiveMaximum'] !== true) out[key] = value;
    } else if (key === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, schema]) => [name, convert(schema)]),
      );
    } else if (key === 'items' || key === 'not' || key === 'additionalProperties') {
      out[key] = convert(value);
    } else if ((key === 'allOf' || key === 'oneOf' || key === 'anyOf') && Array.isArray(value)) {
      out[key] = value.map(convert);
    } else out[key] = value;
  }

  return out;
}

/** Resolves a `#/components/parameters/X` reference, keeping what validation needs. */
function parameter(entry, doc) {
  const resolved = entry.$ref ? doc.components?.parameters?.[entry.$ref.split('/').pop()] : entry;
  if (resolved === undefined) throw new Error(`unresolved parameter reference: ${entry.$ref}`);
  return {
    name: resolved.name,
    in: resolved.in,
    required: resolved.required === true || resolved.in === 'path',
    schema: convert(resolved.schema ?? {}),
  };
}

async function main() {
  // `yaml` ships both an ESM and a CommonJS entry point depending on version,
  // so its exports are read off the module rather than imported by name.
  const yaml = await import('yaml');
  const parse = yaml.parse ?? yaml.default?.parse;
  if (typeof parse !== 'function') {
    process.stderr.write('the installed `yaml` package exposes no parse()\n');
    process.exit(1);
  }

  const doc = parse(readFileSync(CONTRACT, 'utf8'));
  const operations = [];

  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of METHODS) {
      const operation = item[method];
      if (operation === undefined) continue;
      if (typeof operation.operationId !== 'string') {
        throw new Error(`${method.toUpperCase()} ${path} has no operationId`);
      }

      const raw = operation.requestBody;
      const body = raw?.$ref ? doc.components?.requestBodies?.[raw.$ref.split('/').pop()] : raw;

      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path,
        parameters: [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((e) =>
          parameter(e, doc),
        ),
        requestBody: body
          ? {
              required: body.required === true,
              schema: convert(body.content?.['application/json']?.schema ?? {}),
            }
          : null,
      });
    }
  }

  const definitions = Object.fromEntries(
    Object.entries(doc.components?.schemas ?? {}).map(([name, schema]) => [name, convert(schema)]),
  );

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify({ definitions, operations }, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `converted ${CONTRACT}\n  -> ${OUTPUT}\n  schemas:    ${Object.keys(definitions).length}\n  operations: ${operations.length}\n`,
  );
}

// `main` is async only because the parser is imported dynamically; a rejected
// promise must still exit non-zero.
main().catch((error) => {
  process.stderr.write(`conversion failed: ${error?.message ?? error}\n`);
  process.exit(1);
});
