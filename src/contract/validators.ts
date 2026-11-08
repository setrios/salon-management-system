/**
 * AJV validators compiled from the contract.
 *
 * The approved OpenAPI document is the only source of request shape (D-10).
 * Schemas are not restated by hand: they are read from
 * `src/contract/openapi.json`, which `convert.mjs` generates from
 * `spec/api/openapi.yaml`, so a contract change reaches validation without a
 * second place to edit.
 *
 * `ajv-formats` supplies every format the contract uses: `uuid`, `date`,
 * `date-time`, `uri` and `password` (the last is a UI hint and validates as a
 * no-op, which is its meaning in OpenAPI).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `ajv` and `ajv-formats` are CommonJS packages that also set `__esModule` and
// export `default`. Under `moduleResolution: NodeNext` TypeScript sees the
// namespace object as the default, so `import Ajv from 'ajv'` is typed as
// `typeof import('ajv')` — not constructable — even though `new Ajv()` works at
// run time. The named `Ajv` export is a real class in both worlds, so it is
// used instead; `addFormats` has no named export and is cast from the default.
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import addFormatsDefault, { type FormatsPlugin } from 'ajv-formats';

const addFormats = addFormatsDefault as unknown as FormatsPlugin;

import type { ValidationErrorItem, ValidationItemCode } from '../middleware/error-handler.js';

const ROOT_SCHEMA_ID = 'https://contract.local/openapi.schema.json';

/** Shape of the generated document; see convert.mjs. */
export interface ConvertedContract {
  definitions: Record<string, object>;
  operations: ConvertedOperation[];
}

export interface ConvertedOperation {
  operationId: string;
  method: string;
  path: string;
  parameters: ConvertedParameter[];
  requestBody: { required: boolean; schema?: object } | null;
  /** Declared status codes, ascending. Drives the 400-vs-422 rule (CL-09). */
  responseCodes: number[];
}

export interface ConvertedParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: object;
}

let contractCache: ConvertedContract | undefined;
let ajvCache: Ajv | undefined;
const validators = new Map<string, ValidateFunction>();

/**
 * Loads the generated contract, with an actionable message when it has not been
 * generated yet — the file is git-ignored because it is derived.
 */
export function loadContract(): ConvertedContract {
  if (contractCache !== undefined) return contractCache;

  const path = resolve(dirname(fileURLToPath(import.meta.url)), 'openapi.json');
  let parsed: ConvertedContract;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as ConvertedContract;
  } catch {
    throw new Error(
      'src/contract/openapi.json is missing. Run `npm run convert:contract` to generate it from spec/api/openapi.yaml.',
    );
  }

  if (parsed?.definitions === undefined) {
    throw new Error('src/contract/openapi.json has an unexpected shape. Re-run `npm run convert:contract`.');
  }

  contractCache = parsed;
  return parsed;
}

/**
 * Registers every component schema under one root, so the `#/definitions/X`
 * references the converter emitted resolve against a single document. Compiling
 * a definition in isolation would leave every cross-reference dangling.
 */
function getAjv(): Ajv {
  if (ajvCache !== undefined) return ajvCache;

  const ajv = new Ajv({ strict: false, allErrors: true, useDefaults: false });
  addFormats(ajv);
  ajv.addSchema({
    $id: ROOT_SCHEMA_ID,
    $schema: 'http://json-schema.org/draft-07/schema#',
    definitions: loadContract().definitions,
  } as Parameters<Ajv['addSchema']>[0]);

  ajvCache = ajv;
  return ajv;
}

/** Returns a compiled validator for a named component schema. */
export function getSchemaValidator(name: string): ValidateFunction {
  const cached = validators.get(name);
  if (cached !== undefined) return cached;

  const uri = `${ROOT_SCHEMA_ID}#/definitions/${name}`;
  const compiled = getAjv().getSchema(uri);
  if (compiled === undefined) {
    throw new Error(`No schema "${name}" in the generated contract; re-run \`npm run convert:contract\`.`);
  }

  // `getSchema` is typed as possibly-async; the contract has no `$async` schema,
  // so the sync branch is the only one AJV can produce here.
  const validator = compiled as ValidateFunction;
  validators.set(name, validator);
  return validator;
}

/** Returns the operation metadata for an `operationId`, or throws. */
export function getOperation(operationId: string): ConvertedOperation {
  const found = loadContract().operations.find((operation) => operation.operationId === operationId);
  if (found === undefined) throw new Error(`Unknown operationId "${operationId}" in the contract.`);
  return found;
}

const KEYWORD_TO_CODE: Record<string, ValidationItemCode> = {
  required: 'REQUIRED',
  pattern: 'PATTERN_MISMATCH',
  format: 'FORMAT_INVALID',
  enum: 'ENUM_MISMATCH',
  additionalProperties: 'UNKNOWN_FIELD',
};

const RANGE_KEYWORDS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
]);

/** `client.phone`, `serviceIds[2]` — the dot path of `error-model.md` §2.2. */
function fieldPath(error: ErrorObject): string {
  const params = error.params as { missingProperty?: string; additionalProperty?: string };
  const path = error.instancePath
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join('.')
    .replace(/\.(\d+)/g, '[$1]');
  const leaf = params.missingProperty ?? params.additionalProperty;

  if (leaf !== undefined) return path === '' ? leaf : `${path}.${leaf}`;
  return path === '' ? '(root)' : path;
}

/** Converts AJV errors into the contract's `errors[]`. */
export function toValidationItems(
  errors: readonly ErrorObject[] | null | undefined,
): ValidationErrorItem[] {
  return (errors ?? []).map((error) => ({
    field: fieldPath(error),
    code: RANGE_KEYWORDS.has(error.keyword)
      ? 'OUT_OF_RANGE'
      : (KEYWORD_TO_CODE[error.keyword] ?? 'FORMAT_INVALID'),
    message: error.message ?? 'The value is not valid.',
  }));
}
