/**
 * Test fixture: the three seeded service categories.
 *
 * REQ-F-024 requires a fresh installation to offer Hair, Coloring and
 * Barbering as selectable categories before any administrator action, and
 * SCN-08's Given is exactly that set. No operation in the contract creates a
 * category: categories are created implicitly by saving a service with a new
 * one (`POST /admin/services`), so the seeds have to be arranged in storage.
 *
 * This is arrangement, not an assertion about internals. The columns written
 * here — `name`, `seeded` — are the two `Category` exposes
 * (`openapi.yaml#/components/schemas/Category`), and the declaration the
 * fixture follows is in the SMS-14 TEST-GATE (§ "Declared schema"), as plan
 * §5.1 did for `masters` before `tests/helpers/accounts.ts` wrote to it.
 *
 * `on conflict (name) do nothing` makes the fixture idempotent: an
 * implementation that also seeds the categories at start-up is not fought by
 * it.
 *
 * Source: REQ-F-024, SCN-08; `openapi.yaml#/components/schemas/Category`.
 */

import { getPool } from '../../src/db/client.js';

/** The three seed categories, in the order the contract's example lists them. */
export const SEED_CATEGORIES = ['Hair', 'Coloring', 'Barbering'] as const;

/** Inserts the three seeds unless they are already present. */
export async function ensureSeedCategories(): Promise<void> {
  await getPool().query(
    `insert into public.categories (name, seeded)
     values ($1, true), ($2, true), ($3, true)
     on conflict (name) do nothing`,
    [...SEED_CATEGORIES],
  );
}
