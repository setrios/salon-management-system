/**
 * Authentication service: credential lookup and password check.
 *
 * Knows the database and the password representation, not HTTP. The route layer
 * turns `undefined` into the single 401 the contract defines.
 *
 * Constant-shape failure: an unknown username and a wrong password both return
 * `undefined`, and the unknown-username path runs a burn scrypt computation so
 * that the two are not separated by timing either. The response body is
 * identical (see `tests/api/auth.test.ts`), which is the property
 * `error-model.md` §3 requires when it gives both causes one code.
 *
 * `masters.active` is deliberately not filtered here: no S1.1 test defines what
 * deactivation does to an existing login (REQ-F-014/015 arrive with S1.2), and
 * guessing would add behaviour without a failing test behind it.
 */

import { getPool } from '../../db/client.js';
import { burnPasswordCheck, verifyPassword } from './password.js';
import type { StaffRole, TokenClaims } from './tokens.js';

interface AccountRow {
  id: string;
  full_name: string;
  password_hash: string;
  role: string;
}

/**
 * Returns the principal for valid credentials, or `undefined`.
 *
 * The lookup is by `username`, which plan §5.1 declares unique, so at most one
 * row can match.
 */
export async function authenticateCredentials(
  username: string,
  password: string,
): Promise<TokenClaims | undefined> {
  const { rows } = await getPool().query<AccountRow>(
    `select id, full_name, password_hash, role from public.masters where username = $1`,
    [username],
  );

  const account = rows[0];
  if (account === undefined) {
    burnPasswordCheck(password);
    return undefined;
  }

  if (!verifyPassword(password, account.password_hash)) return undefined;

  return {
    id: account.id,
    role: account.role as StaffRole,
    displayName: account.full_name,
  };
}
