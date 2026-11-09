/**
 * Units — database access for R17.
 *
 * REQ-F-025 fixes five standard units (ml, l, g, kg, pcs) and allows a
 * material to be saved with a custom one. `UnitList.standard` is therefore a
 * constant, and `UnitList.custom` is the distinct non-standard units the
 * materials table is actually using — not a table of its own, because no
 * operation creates a unit (D-26).
 *
 * Source: REQ-F-025, D-26; `openapi.yaml#/components/schemas/UnitList`.
 */

import { getDb } from '../../db/client.js';
import { materials } from '../../db/schema.js';

/** The fixed five, in the order `openapi.yaml`'s example lists them. */
export const STANDARD_UNITS = ['ml', 'l', 'g', 'kg', 'pcs'] as const;

export interface UnitList {
  standard: string[];
  custom: string[];
}

/**
 * Both lists. A standard unit never appears in `custom`, even when a material
 * uses it: `standard` already offers it, and listing it twice would let a
 * client present the same unit as two choices.
 *
 * A material that is deactivated keeps contributing its unit: the unit is still
 * in use by that material, and deactivation is not deletion (REQ-F-018).
 */
export async function listUnits(): Promise<UnitList> {
  const rows = await getDb()
    .selectDistinct({ unit: materials.unit })
    .from(materials)
    .orderBy(materials.unit);

  const standard: readonly string[] = STANDARD_UNITS;
  const custom = rows.map((row) => row.unit).filter((unit) => !standard.includes(unit));

  return { standard: [...STANDARD_UNITS], custom: [...new Set(custom)] };
}
