/** Single source of truth for the property-table columns. The table builds its
 *  columns from these ids, and the Settings dialog lists them for show/hide —
 *  so the two can never drift apart. */

export interface ColumnDef {
  id: string;
  label: string;
}

export const COLUMN_DEFS: ColumnDef[] = [
  { id: 'structure', label: 'Structure' },
  { id: 'formula', label: 'Formula' },
  { id: 'smiles', label: 'SMILES' },
  { id: 'mw', label: 'MW' },
  { id: 'logP', label: 'cLogP' },
  { id: 'tpsa', label: 'TPSA' },
  { id: 'hbd', label: 'HBD' },
  { id: 'hba', label: 'HBA' },
  { id: 'rotBonds', label: 'RotB' },
  { id: 'rings', label: 'Rings' },
  { id: 'aromaticRings', label: 'ArRings' },
  { id: 'heavyAtoms', label: 'Heavy' },
  { id: 'fractionCsp3', label: 'Fsp3' },
  { id: 'qed', label: 'QED' },
  { id: 'inchiKey', label: 'InChIKey' },
];

/** The numeric descriptor columns (right-aligned plain-number cells). */
export const NUMERIC_COLUMN_IDS = [
  'mw',
  'logP',
  'tpsa',
  'hbd',
  'hba',
  'rotBonds',
  'rings',
  'aromaticRings',
  'heavyAtoms',
  'fractionCsp3',
  'qed',
] as const;
