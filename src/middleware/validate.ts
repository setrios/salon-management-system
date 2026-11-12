/**
 * Request validation against the contract.
 *
 * Schemas are looked up by `operationId` in the generated contract, never
 * restated in a route module: the contract is the authority at run time, not
 * only in the tests. `spec/api/error-model.md` §3 fixes the codes:
 * 400 MALFORMED_REQUEST (body required but absent, parameter missing or wrongly
 * typed), 415 UNSUPPORTED_MEDIA_TYPE, 422 VALIDATION_ERROR (schema violation).
 *
 * The schema-violation status is derived from the operation's declared response
 * codes (CL-09): an operation that declares 422 gets 422, one that does not gets
 * 400. `login` is the only body-taking operation in the contract without 422,
 * and the rule never reads the operation id, so a later contract change is
 * followed automatically.
 */

import type { RequestHandler } from 'express';

import {
  getOperation,
  getSchemaValidator,
  toValidationItems,
  type ConvertedOperation,
  type ConvertedParameter,
} from '../contract/validators.js';
import { parseCalendarDate } from '../lib/time.js';
import { HttpProblem } from './error-handler.js';

/**
 * The Problem for a body that violates its schema.
 *
 * CL-09: the status follows the operation's declared responses, never its id —
 * 422 when the operation declares 422, otherwise 400. `errors[]` is carried in
 * both cases, because `error-model.md` §2.1 allows it "for validation failures"
 * and a schema violation is one whichever status the response set leaves room
 * for.
 */
function bodyViolation(
  operation: ConvertedOperation,
  errors: Parameters<typeof toValidationItems>[0],
): HttpProblem {
  const code = operation.responseCodes.includes(422) ? 'VALIDATION_ERROR' : 'MALFORMED_REQUEST';
  return new HttpProblem(code, 'The body contains invalid fields.', toValidationItems(errors));
}

/** Validates the body of an operation against its schema. No body → passes. */
export function validateBody(operationId: string): RequestHandler {
  return (req, res, next) => {
    const operation = getOperation(operationId);
    const body = operation.requestBody;
    if (body === null) {
      next();
      return;
    }

    // `express.json()` leaves `req.body` as `{}` when it parsed nothing, so an
    // empty object plus a declared length means the media type was wrong.
    const hasBody =
      Object.keys(req.body ?? {}).length > 0 ||
      Number(req.headers['content-length'] ?? '0') > 0 ||
      req.headers['transfer-encoding'] !== undefined;

    if (!hasBody) {
      if (!body.required) return next();
      return next(new HttpProblem('MALFORMED_REQUEST', 'A request body is required.'));
    }

    const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
    if (type !== 'application/json') {
      return next(new HttpProblem('UNSUPPORTED_MEDIA_TYPE', 'The body must be application/json.'));
    }

    const name = (body.schema as { $ref?: string } | undefined)?.$ref?.split('/').pop();
    if (name === undefined) {
      return next(new Error(`operation ${operationId} has a body without a named schema`));
    }

    const validate = getSchemaValidator(name);
    if (!validate(req.body)) {
      next(bodyViolation(operation, validate.errors));
      return;
    }

    // The validated body is published the same way `validateParams` publishes
    // its parameters, so handlers read one place (`res.locals.body`) instead of
    // reaching back into `req.body` — which `useDefaults: false` leaves as the
    // client sent it, defaults included only when the client wrote them.
    res.locals.body = req.body;
    next();
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Coerces one raw parameter to the type its schema declares, or returns
 * `undefined` when the value is not of that type.
 *
 * `error-model.md` §4 puts "a query parameter has the wrong type" in 400
 * `MALFORMED_REQUEST`, and the declaration that decides the type is the
 * parameter's own schema — so a `boolean` is `true`/`false` and a `uuid` must be
 * a UUID, not merely a string.
 */
function coerce(
  raw: unknown,
  schema: { type?: string; format?: string; enum?: readonly unknown[] },
): unknown {
  if (typeof raw !== 'string') return undefined;

  let value: unknown = raw;

  if (schema.type === 'integer' || schema.type === 'number') {
    if (!/^-?\d+$/.test(raw)) return undefined;
    value = Number(raw);
  } else if (schema.type === 'boolean') {
    if (raw !== 'true' && raw !== 'false') return undefined;
    value = raw === 'true';
  } else if (schema.format === 'uuid' && !UUID.test(raw)) {
    return undefined;
  } else if (schema.format === 'date' && parseCalendarDate(raw) === null) {
    // `date` is a *calendar* date, not merely a string of the right shape:
    // `2026-02-30` matches the pattern and names no day. AJV's `date` format
    // already agrees with this reading on bodies; query parameters are coerced
    // here because Express hands them over as strings. Every query parameter the
    // contract declares as `date` sits on an operation that declares 400, so
    // rejecting it here stays inside each operation's declared set (CL-09).
    return undefined;
  }

  // An `enum` is part of the parameter's declared type, not a business rule: a
  // value outside it is the same mistake as a `boolean` that is not
  // `true`/`false`, and `error-model.md` §4 puts that in 400. Every operation
  // with an enum query parameter declares 400, so the answer stays inside its
  // declared set (CL-09's rule again).
  if (schema.enum !== undefined && !schema.enum.includes(value)) return undefined;

  return value;
}

/**
 * The Problem for a parameter that is absent or of the wrong type.
 *
 * CL-09's mirror, and the same principle: the status comes from the operation's
 * declared response set, never from its id.
 *
 *  - An operation that declares 400 gets 400 `MALFORMED_REQUEST`, which is what
 *    `error-model.md` §4 calls a wrongly typed parameter. §3's catalog is
 *    explicit about the scope of that row: 400 belongs to "all operations that
 *    accept a body or query parameters".
 *  - An operation that does *not* declare 400 but does declare 404 is one that
 *    identifies a resource by its path alone. An identifier that is not a valid
 *    `uuid` names no resource, so the answer is 404 `NOT_FOUND` — inside the
 *    declared set, with no contract change and no new clarification.
 *
 * The second branch exists because `getMasterAdmin`, `getServiceAdmin` and
 * `getMaterialAdmin` declare `200, 401, 403, 404, 500` and no 400: answering 400
 * there would be a response the contract does not define. The declared set is
 * read here rather than special-cased per operation, so a later contract change
 * is followed without editing this function.
 */
function parameterProblem(
  operation: ConvertedOperation,
  parameter: ConvertedParameter,
  detail: string,
): HttpProblem {
  if (operation.responseCodes.includes(400)) {
    return new HttpProblem('MALFORMED_REQUEST', detail);
  }

  if (parameter.in === 'path' && operation.responseCodes.includes(404)) {
    return new HttpProblem('NOT_FOUND', 'No resource is defined with this id.');
  }

  // Neither declared: the contract leaves no answer for this mistake. 400 is the
  // reading `error-model.md` §4 gives a malformed parameter, and reaching this
  // branch for an operation in the approved contract would be a gap to clarify,
  // not a case to design around.
  return new HttpProblem('MALFORMED_REQUEST', detail);
}

/**
 * Validates the path and query parameters an operation declares. Coerced values
 * are published on `res.locals.params` / `res.locals.query`; `req.query` is not
 * written, because in Express 5 it is a getter.
 */
export function validateParams(operationId: string): RequestHandler {
  return (req, res, next) => {
    const operation = getOperation(operationId);
    const params: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};

    for (const parameter of operation.parameters) {
      if (parameter.in !== 'path' && parameter.in !== 'query') continue;
      const target = parameter.in === 'path' ? params : query;
      const raw = ((parameter.in === 'path' ? req.params : req.query) as Record<string, unknown>)[
        parameter.name
      ];

      if (raw === undefined) {
        if (parameter.required) {
          return next(
            parameterProblem(operation, parameter, `${parameter.name} is required.`),
          );
        }
        continue;
      }

      const value = coerce(
        raw,
        parameter.schema as { type?: string; format?: string; enum?: readonly unknown[] },
      );
      if (value === undefined) {
        return next(
          parameterProblem(operation, parameter, `${parameter.name} has the wrong type.`),
        );
      }

      target[parameter.name] = value;
    }

    res.locals.params = params;
    res.locals.query = query;
    next();
  };
}
