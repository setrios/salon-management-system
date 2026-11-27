/**
 * Terminal 404 / 405.
 *
 * Reached when no route handled the request. It raises an `HttpProblem` instead
 * of answering directly, so both statuses use exactly the same rendering path as
 * every other error (error-model.md §4).
 *
 * Two cases are distinguished, because the contract distinguishes them:
 *
 *   - the path is defined in the contract, but the method is not → 405
 *     `METHOD_NOT_ALLOWED`;
 *   - anything else → 404 `NOT_FOUND`.
 *
 * The path set comes from the contract, not from the Express router: at S1.0 no
 * operation router is mounted, and Express 5 offers no public way to ask whether
 * a path is registered under another method. See `src/contract/paths.ts` and the
 * temporary-asymmetry note in `logs/gates/2026-11-08-test-SMS-44.md` §1: a
 * contract path whose *method* is defined but not yet implemented stays 404,
 * because 405 speaks about the method, not about implementation progress.
 */

import type { RequestHandler } from 'express';

import { contractPathFor } from '../contract/paths.js';
import { HttpProblem } from './error-handler.js';

/**
 * The terminal handler for a request nothing answered: 405 `METHOD_NOT_ALLOWED`
 * when the path exists in the contract with other methods, otherwise 404
 * `NOT_FOUND`. Registered after the API and the interface's pages.
 */
export const notFound: RequestHandler = (req, _res, next) => {
  const match = contractPathFor(req.path);

  if (match !== undefined && !match.methods.has(req.method)) {
    next(
      new HttpProblem(
        'METHOD_NOT_ALLOWED',
        `The path is defined for ${[...match.methods].sort().join(', ')}.`,
      ),
    );
    return;
  }

  // `detail` does not repeat the path. RFC 9457 puts it in `instance`, which the
  // error handler fills from the request, so repeating it here would duplicate
  // the same string in two fields of one body.
  next(new HttpProblem('NOT_FOUND', 'No resource is defined at the requested path.'));
};
