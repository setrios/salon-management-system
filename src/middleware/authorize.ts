/**
 * Role authorisation — one gate, not seventeen checks.
 *
 * Every `/admin/*` operation in the contract is JWT-A: `security: [bearerAuth]`
 * and, per `resource-model.md` §2 (Actors) and REQ-F-018, the administrator is
 * the only role permitted. The 401 (no valid credentials) belongs to
 * `authenticate`, which runs in front of this middleware; this one answers the
 * second question — an authenticated caller with the wrong role — with 403
 * `FORBIDDEN`, which `error-model.md` §3 defines as "authenticated but wrong
 * role".
 *
 * The gate is declared once, here, and mounted as a handler list on every
 * administrator operation. Seventeen copies of the *check* would still pass the
 * tests, but the S1.2 RED matrix asks one question seventeen times and deserves
 * one answer; a per-route condition would also be the first thing to drift when
 * stage R refactors the modules.
 *
 * It is attached to operations rather than to the router as a whole because the
 * two answers have different scopes. `error-model.md` §4 makes 405 "path exists,
 * method does not", and the contract defines that outcome for a path on which no
 * operation is mounted — a request that never names an operation has nothing to
 * authenticate for. A router-level gate would answer 401 there instead, and it
 * would also answer 401 for an unknown path, which §4 requires to stay 404
 * (both are asserted by `tests/api/structural.test.ts`).
 *
 * 401 precedes 403: `authenticate` invokes `next()` only after a token verifies,
 * so a request without credentials never reaches `requireRole`.
 */

import type { RequestHandler } from 'express';

import { authenticate, type PrincipalRole } from './auth.js';
import { HttpProblem } from './error-handler.js';

/**
 * Allows only the given role; anything else is 403 `FORBIDDEN`.
 *
 * A missing principal is a wiring mistake (the middleware was mounted without
 * `authenticate` first). It is answered 401 rather than 403, because "no valid
 * credentials" is the truthful reading of a request that never authenticated,
 * and it keeps the direction of trust the same as `getCurrentPrincipal`.
 *
 * The `detail` names the role the operation requires, and it is derived from
 * `role` rather than written out per call site: S1.3 introduced the first
 * non-administrator use (`requireRole('master')` on `/me/availability`), and a
 * hard-coded "administrator" there would have described the wrong gate in the
 * body while the status was right. The map is exhaustive over `PrincipalRole`,
 * so a third role fails to compile until it is named here.
 */
const ROLE_DETAIL: Record<PrincipalRole, string> = {
  admin: 'This operation requires the administrator role.',
  master: 'This operation requires the master role.',
};

export function requireRole(role: PrincipalRole): RequestHandler {
  return (_req, res, next) => {
    const principal = res.locals.principal as { role?: PrincipalRole } | undefined;

    if (principal === undefined) {
      next(new HttpProblem('UNAUTHENTICATED', 'A bearer token is required for this operation.'));
      return;
    }

    if (principal.role !== role) {
      next(new HttpProblem('FORBIDDEN', ROLE_DETAIL[role]));
      return;
    }

    next();
  };
}

/**
 * The complete administrator gate: a valid bearer token, then the right role.
 *
 * Spread onto an operation's handler list (`...adminAccess`), so every
 * administrator operation is guarded by the same two functions and no route can
 * choose a different order.
 */
export const adminAccess: readonly RequestHandler[] = [authenticate, requireRole('admin')];

/**
 * The complete master gate: a valid bearer token, then the master role.
 *
 * The mirror of `adminAccess`, and the same two functions in the same order.
 * S1.3 wrote the pair out in `availability/routes.ts`; S4.2 is the third module
 * to need it, so it is declared once here and the three spread it.
 */
export const masterAccess: readonly RequestHandler[] = [authenticate, requireRole('master')];
