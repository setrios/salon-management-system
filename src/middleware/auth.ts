/**
 * Bearer-token authentication.
 *
 * `openapi.yaml` fixes `bearerAuth` as an HTTP bearer scheme with
 * `bearerFormat: JWT`, and `LoginResponse.tokenType` is the constant `Bearer`, so
 * there are no sessions or cookies (D-8). Tokens are HS256 JWTs verified with
 * `jose`; claims are `sub` (master id), `role` ('master' | 'admin') and `name`.
 *
 * A missing header and an unverifiable token both give 401 `UNAUTHENTICATED`
 * (`error-model.md` §4). Role and ownership checks are not here — each arrives
 * with the operation that has a test for it.
 */

import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';

import { config } from '../config.js';
import { HttpProblem } from './error-handler.js';

export type PrincipalRole = 'master' | 'admin';

export interface Principal {
  id: string;
  role: PrincipalRole;
  displayName: string;
}

const SECRET = new TextEncoder().encode(config.jwtSecret);

/** Requires a valid bearer token; sets `res.locals.principal`. */
export const authenticate: RequestHandler = async (req, res, next) => {
  const token = /^Bearer +(\S+)$/i.exec((req.headers.authorization ?? '').trim())?.[1];
  if (token === undefined) {
    next(new HttpProblem('UNAUTHENTICATED', 'A bearer token is required for this operation.'));
    return;
  }

  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    const role =
      payload.role === 'master' ? 'master' : payload.role === 'admin' ? 'admin' : undefined;

    if (typeof payload.sub !== 'string' || typeof payload.name !== 'string' || role === undefined) {
      next(new HttpProblem('UNAUTHENTICATED', 'The bearer token is not valid.'));
      return;
    }

    res.locals.principal = { id: payload.sub, role, displayName: payload.name } satisfies Principal;
    next();
  } catch {
    // Signature, expiry, algorithm and claim failures are deliberately
    // indistinguishable in the response.
    next(new HttpProblem('UNAUTHENTICATED', 'The bearer token is not valid.'));
  }
};
