/**
 * Bearer-token authentication.
 *
 * `openapi.yaml` fixes `bearerAuth` as an HTTP bearer scheme with
 * `bearerFormat: JWT`, and `LoginResponse.tokenType` is the constant `Bearer`, so
 * there are no sessions or cookies (D-8). Token verification lives in
 * `modules/auth/tokens.ts`, which owns the HS256 key and the claim set; this
 * middleware only reads the header and maps a failed verification to the single
 * 401 the contract defines.
 *
 * A missing header and an unverifiable token both give 401 `UNAUTHENTICATED`
 * (`error-model.md` §4). Role and ownership checks are not here — each arrives
 * with the operation that has a test for it.
 */

import type { RequestHandler } from 'express';

import { verifyAccessToken, type StaffRole } from '../modules/auth/tokens.js';
import { HttpProblem } from './error-handler.js';

export type PrincipalRole = StaffRole;

export interface Principal {
  id: string;
  role: PrincipalRole;
  displayName: string;
}

/** Requires a valid bearer token; sets `res.locals.principal`. */
export const authenticate: RequestHandler = async (req, res, next) => {
  const token = /^Bearer +(\S+)$/i.exec((req.headers.authorization ?? '').trim())?.[1];
  if (token === undefined) {
    next(new HttpProblem('UNAUTHENTICATED', 'A bearer token is required for this operation.'));
    return;
  }

  // Signature, expiry, algorithm and claim failures are deliberately
  // indistinguishable in the response: `verifyAccessToken` returns `undefined`
  // for all of them.
  const claims = await verifyAccessToken(token);
  if (claims === undefined) {
    next(new HttpProblem('UNAUTHENTICATED', 'The bearer token is not valid.'));
    return;
  }

  res.locals.principal = claims satisfies Principal;
  next();
};
