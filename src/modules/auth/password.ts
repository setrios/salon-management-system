/**
 * Password hashing and verification (D-18).
 *
 * Passwords are stored as scrypt hashes produced by `node:crypto`, so no
 * password-hashing dependency is added (CLAUDE.md forbids the agent installing
 * one, and `bcrypt` was removed from the scaffold). The stored representation is
 *
 *   scrypt$N$r$p$salt-base64$key-base64
 *
 * with N=16384, r=8, p=1 and a 64-byte key, as declared in plan §5.1 and written
 * by `tests/helpers/accounts.ts`.
 *
 * Comparison is constant-time. A hash that cannot be parsed, or whose
 * parameters `scryptSync` rejects, verifies as `false` rather than throwing: a
 * corrupt row must not turn a login attempt into a 500.
 *
 * `hashPassword` was added with S1.2 (SMS-23), when `POST /admin/masters` became
 * the first operation to create a credential. The parameters are read back out of
 * the stored string by the verifier, so a row written by the fixture, by this
 * function or by an older deployment all verify the same way.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** `scrypt$N$r$p$salt$key`; both payloads are standard base64. */
const HASH_FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;

/** Parameters of D-18, used both to hash a new password and to burn a check. */
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

/**
 * Produces the stored representation of a password (D-18).
 *
 * Used by `modules/masters` when the administrator creates an account; the
 * verifier below reads the parameters back out of the string, so the two stay
 * in step without a shared constant.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Key length used when there is no account to compare against, so an unknown
 * username and a wrong password cost the same wall-clock time and cannot be
 * told apart by timing. It matches the length `hashPassword` writes.
 */
const BURN_KEY_LENGTH = KEY_LENGTH;

/** scrypt parameters the burn path uses; the same values as D-18. */
const BURN_PARAMS = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P } as const;

/**
 * Returns true when `password` produced the stored hash.
 *
 * The key length is taken from the stored hash rather than assumed, so a row
 * written with different parameters still verifies; the parameters themselves
 * come from the row, because they are part of the representation.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const match = HASH_FORMAT.exec(stored);
  if (match === null) return false;

  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = match;
  const expected = Buffer.from(keyRaw as string, 'base64');
  if (expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(password, Buffer.from(saltRaw as string, 'base64'), expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
    });
  } catch {
    // Invalid parameters or a hash requiring more memory than scrypt allows.
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Spends the same work as a real verification, for a username that does not
 * exist. The caller ignores the result; the point is that the 401 for an
 * unknown username is not measurably faster than the 401 for a wrong password.
 */
export function burnPasswordCheck(password: string): void {
  try {
    scryptSync(password, Buffer.alloc(16), BURN_KEY_LENGTH, BURN_PARAMS);
  } catch {
    // Nothing to do: this path exists only to consume time.
  }
}
