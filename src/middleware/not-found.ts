/**
 * Terminal 404.
 *
 * Reached only when no route matched. It raises a `NOT_FOUND` HttpProblem
 * instead of answering directly, so that 404 has exactly the same rendering
 * path as every other error (error-model.md §4: 404 "Resource id or token
 * unknown"; 405 is reserved for a defined path with an undefined method).
 *
 * The scaffold registers no `/api/v1` operation yet, so at this stage every API
 * request lands here. That is the expected state before S1.0, and the first
 * failing test asserts exactly this response.
 *
 * TODO(ticket-driven): 405. Express also falls through to this handler when the
 * path exists but the method does not, which the catalog requires to be
 * `METHOD_NOT_ALLOWED`. Recognising it needs the set of paths the router
 * actually registered, so it is added together with the first mounted router —
 * before any test asserts a 405.
 */

import type { RequestHandler } from 'express';

import { HttpProblem } from './error-handler.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  // `detail` does not repeat the path. RFC 9457 puts it in `instance`, which the
  // error handler fills from the request, so repeating it here would duplicate
  // the same string in two fields of one body.
  next(new HttpProblem('NOT_FOUND', 'No resource is defined at the requested path.'));
};
