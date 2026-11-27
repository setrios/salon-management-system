/**
 * Correlation id.
 *
 * `traceMiddleware` assigns one UUID v4 per request to `res.locals.traceId`. It
 * is the join key between an HTTP response, the JSONL request record and any
 * `Problem.traceId` in an error body.
 *
 * The contract defines no header for it, so it is never transmitted as one: the
 * only place a client sees it is `Problem.traceId` (`spec/api/error-model.md`
 * §2.1), and the only place it is stored is the log.
 */

import { randomUUID } from 'node:crypto';

import type { RequestHandler, Response } from 'express';

/**
 * Reads the trace id assigned to this response, or `undefined` when the
 * middleware did not run.
 *
 * It must not invent an id: a freshly generated UUID would be absent from every
 * log line of the request, so a `Problem.traceId` in the response would point at
 * nothing. `undefined` lets the caller omit the optional field instead, which
 * keeps the correlation either true or absent.
 */
export function getTraceId(res: Response): string | undefined {
  return typeof res.locals.traceId === 'string' ? res.locals.traceId : undefined;
}

/** Gives every request a fresh trace id, which the log line and the `Problem` both carry. */
export const traceMiddleware: RequestHandler = (_req, res, next) => {
  res.locals.traceId = randomUUID();
  next();
};
