/**
 * Shared HTTP helpers for the S1.2 reference-data modules.
 *
 * The five admin modules differ in their resources, not in their transport
 * concerns: every one of them answers with a contract schema, reads pagination
 * the same way, validates parameters before touching the database, and turns a
 * unique-constraint violation into 409 `DUPLICATE_RESOURCE`. Putting those four
 * things here keeps the modules to the part that is actually about masters,
 * services, links or materials, and gives stage R a single place to refactor.
 *
 * The 409 mapping is deliberately narrow. `error-model.md` §3 names exactly three
 * uniqueness constraints, so only the violation of those named constraints
 * (PostgreSQL SQLSTATE 23505 on the constraint the operation declares) becomes
 * 409; every other database error stays an unexpected failure and reaches the
 * 500 branch. This is what CL-10 requires: no rule may be invented to satisfy a
 * declared-but-unreachable 409.
 */

import type { RequestHandler, Response } from 'express';

import { getSchemaValidator } from '../../contract/validators.js';

/** The fields every list operation reads from `res.locals.query`. */
export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

/** A contract schema name; the validator is compiled on first use and cached. */
export function sendJson(res: Response, status: number, schema: string, body: unknown): void {
  const validate = getSchemaValidator(schema);
  if (!validate(body)) {
    // A response that does not satisfy its own contract schema is a server
    // defect, not a client mistake; the error handler turns this into a 500 and
    // writes the stack to stderr. Reaching it means the mapping code and the
    // contract disagree.
    throw new Error(
      `response does not satisfy ${schema}: ${JSON.stringify(validate.errors ?? [])}`,
    );
  }

  // `res.json` appends `; charset=utf-8`. That is correct for success bodies:
  // `error-model.md` §2.4 fixes the parameter only for `problem+json`, and the
  // tests accept `/^application\/json/` for success responses.
  res.status(status).json(body);
}

/**
 * Sends a 201 with the `Location` header every create operation declares.
 *
 * `baseUrl` is the request's mount path (`/api/v1`), so the header is an
 * absolute path the client can follow without knowing the prefix; the contract
 * declares it as `type: string, format: uri`.
 */
export function sendCreated(
  res: Response,
  schema: string,
  body: { id: string },
  collectionPath: string,
): void {
  res.setHeader('Location', `${res.locals.baseUrl ?? ''}${collectionPath}/${body.id}`);
  sendJson(res, 201, schema, body);
}

/** Page request derived from the already-validated query (see `validateParams`). */
export function pageRequest(res: Response): PageRequest {
  const query = res.locals.query as { page?: number; pageSize?: number } | undefined;
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** The `{items, page, pageSize, total}` envelope all four page schemas share. */
export function pageBody<T>(
  items: T[],
  total: number,
  request: PageRequest,
): { items: T[]; page: number; pageSize: number; total: number } {
  return { items, page: request.page, pageSize: request.pageSize, total };
}

/** PostgreSQL SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

interface DatabaseError {
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly cause?: unknown;
}

/** How far down a `cause` chain to look; Drizzle adds one level, pg adds none. */
const CAUSE_DEPTH = 3;

/**
 * True when `error` is the violation of `constraint`.
 *
 * The constraint name is checked, not only the SQLSTATE: a future constraint
 * (for example one added by a later ticket) must not be silently reported as a
 * duplicate of the resource this operation creates.
 *
 * The database error is not the error the query throws. Drizzle wraps whatever
 * the driver raised in a `DrizzleQueryError` whose `cause` is the `pg` error
 * carrying `code` and `constraint`, so the fields are looked for down the
 * `cause` chain rather than on the thrown object alone.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;

  for (let depth = 0; depth <= CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;

    const candidate = current as DatabaseError;
    if (candidate.code === UNIQUE_VIOLATION && candidate.constraint === constraint) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}

/**
 * Runs an async handler and forwards a rejection to the error handler.
 *
 * Express 5 already forwards a rejected promise returned by a handler (the
 * router wraps every layer in `ret.then(null, next)`), so this is a deliberate
 * no-op in behaviour. It is kept because the route bodies are `async` functions
 * declared as `(req, res) => Promise<void>`: without the wrapper their type is
 * not a `RequestHandler`, and the explicit `catch` documents that every database
 * failure of these modules ends in the single 500 branch rather than in an
 * unhandled rejection.
 */
export function asyncRoute(
  handler: (req: Parameters<RequestHandler>[0], res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}
