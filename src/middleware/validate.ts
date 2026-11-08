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
} from '../contract/validators.js';
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
  return (req, _res, next) => {
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
    return next(validate(req.body) ? undefined : bodyViolation(operation, validate.errors));
  };
}

/**
 * Validates the path and query parameters an operation declares. Coerced values
 * are published on `res.locals.params` / `res.locals.query`; `req.query` is not
 * written, because in Express 5 it is a getter.
 */
export function validateParams(operationId: string): RequestHandler {
  return (req, res, next) => {
    const params: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};

    for (const parameter of getOperation(operationId).parameters) {
      if (parameter.in !== 'path' && parameter.in !== 'query') continue;
      const target = parameter.in === 'path' ? params : query;
      const raw = ((parameter.in === 'path' ? req.params : req.query) as Record<string, unknown>)[
        parameter.name
      ];

      if (raw === undefined) {
        if (parameter.required) {
          return next(new HttpProblem('MALFORMED_REQUEST', `${parameter.name} is required.`));
        }
        continue;
      }

      const type = (parameter.schema as { type?: string }).type;
      if (typeof raw !== 'string' || (type === 'integer' && !/^-?\d+$/.test(raw))) {
        return next(new HttpProblem('MALFORMED_REQUEST', `${parameter.name} has the wrong type.`));
      }

      target[parameter.name] = type === 'integer' ? Number(raw) : raw;
    }

    res.locals.params = params;
    res.locals.query = query;
    next();
  };
}
