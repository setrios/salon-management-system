/**
 * Access tokens (D-8).
 *
 * `openapi.yaml` fixes `bearerAuth` as an HTTP bearer scheme with
 * `bearerFormat: JWT`, and `LoginResponse.tokenType` is the constant `Bearer`,
 * so there are no sessions and no cookies. Tokens are HS256 JWTs signed and
 * verified with `jose`; the key is `config.jwtSecret` and the lifetime is
 * `config.jwtExpiresIn`, which is also the `expiresIn` the login response
 * reports.
 *
 * Claims: `sub` (master id), `role` ('master' | 'admin'), `name` (display
 * name). `exp` is set from `jwtExpiresIn` and enforced on verification.
 *
 * Verification returns `undefined` for every failure — signature, algorithm,
 * expiry, malformed claim set — because `error-model.md` §3 gives them all one
 * outcome: 401 `UNAUTHENTICATED`. Distinguishing them in the response would
 * tell an attacker which part of a forged token was wrong.
 */

import { jwtVerify, SignJWT } from 'jose';

import { config } from '../../config.js';

export type StaffRole = 'master' | 'admin';

/** The authenticated caller: `Principal` minus its transport. */
export interface TokenClaims {
  readonly id: string;
  readonly role: StaffRole;
  readonly displayName: string;
}

const SECRET = new TextEncoder().encode(config.jwtSecret);

/** Issues a token for an authenticated account. */
export async function issueAccessToken(claims: TokenClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ role: claims.role, name: claims.displayName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.id)
    .setIssuedAt(now)
    .setExpirationTime(now + config.jwtExpiresIn)
    .sign(SECRET);
}

/**
 * Verifies a token and returns its claims, or `undefined` when it does not
 * verify. `algorithms` is pinned so a token cannot downgrade to `none` or to a
 * different family.
 */
export async function verifyAccessToken(token: string): Promise<TokenClaims | undefined> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });

    const role =
      payload.role === 'master' ? 'master' : payload.role === 'admin' ? 'admin' : undefined;

    if (typeof payload.sub !== 'string' || typeof payload.name !== 'string' || role === undefined) {
      return undefined;
    }

    return { id: payload.sub, role, displayName: payload.name };
  } catch {
    return undefined;
  }
}
