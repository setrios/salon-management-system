/**
 * The single error renderer.
 *
 * Every 4XX/5XX response is `application/problem+json` with the `Problem`
 * schema, the only error shape in the contract, so this is the one place that
 * writes an error body. Normative source: `spec/api/error-model.md` §2 (fields,
 * media type) and §3 (the closed 16-code catalog with its titles).
 */

import type { ErrorRequestHandler, Request, Response } from 'express';

import { getTraceId } from './trace.js';

/** The closed catalog of `error-model.md` §3: code → [HTTP status, title]. */
export const PROBLEM_CATALOG = {
  MALFORMED_REQUEST: [400, 'Malformed request'],
  VALIDATION_ERROR: [422, 'Validation failed'],
  UNAUTHENTICATED: [401, 'Not authenticated'],
  FORBIDDEN: [403, 'Forbidden'],
  NOT_FOUND: [404, 'Not found'],
  METHOD_NOT_ALLOWED: [405, 'Method not allowed'],
  SLOT_UNAVAILABLE: [409, 'Slot unavailable'],
  DUPLICATE_RESOURCE: [409, 'Duplicate resource'],
  INVALID_STATE_TRANSITION: [409, 'Invalid state transition'],
  PAYMENT_ALREADY_RECORDED: [409, 'Payment already recorded'],
  APPOINTMENT_NOT_COMPLETED: [409, 'Appointment not completed'],
  MATERIAL_STOCK_INSUFFICIENT: [409, 'Insufficient stock'],
  INVALID_PERIOD: [422, 'Invalid period'],
  BUSINESS_RULE_VIOLATION: [422, 'Business rule violated'],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Unsupported media type'],
  INTERNAL_ERROR: [500, 'Internal error'],
} as const satisfies Record<string, readonly [number, string]>;

/** One of the 16 codes of `error-model.md` §3; each maps to one status and title. */
export type ProblemCode = keyof typeof PROBLEM_CATALOG;

/** Why one field of a 422 body failed (`ValidationErrorItem.code` in the contract). */
export type ValidationItemCode =
  | 'REQUIRED'
  | 'PATTERN_MISMATCH'
  | 'FORMAT_INVALID'
  | 'ENUM_MISMATCH'
  | 'OUT_OF_RANGE'
  | 'UNKNOWN_FIELD';

/** One `errors[]` entry of a 422 `Problem`: the field as a dot path, its code, a sentence. */
export interface ValidationErrorItem {
  field: string;
  code: ValidationItemCode;
  message: string;
}

/**
 * The RFC 9457 body every error answer has (`Problem` in the contract). `type`
 * and `title` follow from `code`; `instance` and `traceId` are filled from the
 * request, so a log line and an answer can be matched.
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: ProblemCode;
  traceId?: string;
  errors?: ValidationErrorItem[];
}

/** An error carrying its own code. Routes throw this; nothing else builds a body. */
export class HttpProblem extends Error {
  readonly code: ProblemCode;
  readonly status: number;
  readonly detail: string | undefined;
  readonly errors: ValidationErrorItem[] | undefined;

  constructor(code: ProblemCode, detail?: string, errors?: ValidationErrorItem[]) {
    super(detail ?? PROBLEM_CATALOG[code][1]);
    this.name = 'HttpProblem';
    this.code = code;
    this.status = PROBLEM_CATALOG[code][0];
    this.detail = detail;
    this.errors = errors;
  }
}

/**
 * Sends a Problem, and is the one place that sets the media type.
 *
 * `res.end()` rather than `res.json()`: the JSON helper appends
 * `; charset=utf-8`, and `error-model.md` §2.4 declares `application/problem+json`
 * without a parameter.
 */
export function sendProblem(res: Response, problem: Problem): void {
  res.status(problem.status);
  res.setHeader('Content-Type', 'application/problem+json');
  res.end(JSON.stringify(problem));
}

/**
 * A body the JSON parser refused (an `http-errors` object with
 * `type: 'entity.parse.failed'`). The rejection happens in `express.json`,
 * before any route runs, so no route can own this mapping (SMS-44).
 */
function isBodyParseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: unknown }).type === 'entity.parse.failed'
  );
}

/** How deep `describeError` follows a chain of causes; a cycle stops here too. */
const MAX_CAUSES = 5;

/**
 * An error for the log: its stack, then each `cause` in order as
 * `caused by: <name>: <message>`.
 *
 * Drizzle reports a failed statement as `Failed query: <sql>` and puts the
 * PostgreSQL reason (`relation "masters" does not exist`, `ECONNREFUSED`, …)
 * in `cause`; without the chain the log says that a query failed but not why
 * (SMS-75). The text goes to the log only, never to the client (error-model
 * §4).
 */
function describeError(error: unknown): string {
  const lines = [error instanceof Error ? (error.stack ?? error.message) : String(error)];
  let cause = error instanceof Error ? error.cause : undefined;
  for (let depth = 0; cause !== undefined && depth < MAX_CAUSES; depth += 1) {
    lines.push(
      cause instanceof Error
        ? `caused by: ${cause.name}: ${cause.message}`
        : `caused by: ${typeof cause === 'string' ? cause : JSON.stringify(cause)}`,
    );
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return lines.join('\n');
}

/**
 * Terminal error handler, registered last.
 *
 * A thrown `HttpProblem` is rendered as-is; a body the JSON parser rejected is
 * a client mistake and becomes 400 `MALFORMED_REQUEST` (error-model.md §4: 400
 * is for a request that cannot be parsed, and 500 is never used for a
 * client-caused condition); anything else is unexpected and becomes 500.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const traceId = getTraceId(res);
  const known = error instanceof HttpProblem ? error : undefined;
  const parseFailure = known === undefined && isBodyParseError(error);
  const code = known?.code ?? (parseFailure ? 'MALFORMED_REQUEST' : 'INTERNAL_ERROR');
  const [status, title] = PROBLEM_CATALOG[code];
  const detail =
    known?.detail ?? (parseFailure ? 'The request body is not valid JSON.' : undefined);

  if (known === undefined && !parseFailure) {
    process.stderr.write(`[${traceId ?? 'no-trace'}] unhandled error: ${describeError(error)}\n`);
  }

  sendProblem(res, {
    type: `https://api.salon.example/problems/${code.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    instance: (req as Request).originalUrl.split('?')[0],
    code,
    // `traceId` is optional in `Problem`; when the middleware did not run there
    // is no id to correlate, so the field is omitted rather than invented.
    ...(traceId === undefined ? {} : { traceId }),
    ...(detail === undefined ? {} : { detail }),
    ...(known?.errors === undefined || known.errors.length === 0 ? {} : { errors: known.errors }),
  });
};
