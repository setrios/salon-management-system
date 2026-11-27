/**
 * Test fixture: staff accounts.
 *
 * The SRS (v1.3, §2 Actors) knows two kinds of staff account, and neither can
 * be produced through the API at S1.1:
 *
 *   - the single administrator — REQ-F-017 says exactly one exists, and the
 *     contract has no operation that creates one, so it is provisioned out of
 *     band;
 *   - masters — created by the administrator through `POST /admin/masters`,
 *     which arrives in S1.2 (SMS-23).
 *
 * A test of authentication therefore arranges the account in storage directly.
 * This is arrangement, not an assertion about internals: the tests assert HTTP
 * behaviour only, and the two columns they write are the ones the contract's
 * `Master` schema already exposes (`fullName`, `username`) plus the credential
 * representation.
 *
 * Credential representation (gate decision D-18, `logs/gates/2026-11-08-test-SMS-21.md`):
 * scrypt from `node:crypto` — no added dependency, since installing one is
 * forbidden and `bcrypt` was removed from the scaffold. The stored string is
 * `scrypt$N$r$p$salt-base64$key-base64`, with N=16384, r=8, p=1 and a 64-byte
 * key, which keeps the work factor inside Node's default `maxmem`.
 *
 * Source: REQ-F-012, REQ-F-017; spec/salon-management-system-srs-v1.3.tex §2
 *         (Actors); spec/api/resource-model.md §2 (`Master` has login
 *         credentials).
 */

import { randomBytes, randomUUID, scryptSync } from 'node:crypto';

import { getPool } from '../../src/db/client.js';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** The role of a seeded staff account — the same two values as `masters.role`. */
export type StaffRole = 'master' | 'admin';

/** What a test chooses about a staff account it seeds; the password is given in plain text. */
export interface AccountInput {
  readonly role: StaffRole;
  readonly username: string;
  readonly password: string;
  readonly fullName: string;
}

/** A seeded account: the input, plus the id the database gave it. */
export interface SeededAccount extends AccountInput {
  readonly id: string;
}

/** The stored form of a password: `scrypt$N$r$p$salt$key`, base64 payloads. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

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
 * Inserts one staff account and returns it, id included.
 *
 * `created_at` and `updated_at` are left to the column defaults; the fixture
 * writes only what the behaviour under test needs.
 */
export async function seedAccount(input: AccountInput): Promise<SeededAccount> {
  const id = randomUUID();

  await getPool().query(
    `insert into public.masters (id, full_name, username, password_hash, role, active)
     values ($1, $2, $3, $4, $5, true)`,
    [id, input.fullName, input.username, hashPassword(input.password), input.role],
  );

  return { id, ...input };
}
