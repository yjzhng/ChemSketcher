/** Descriptor payload returned by the Python RDKit backend (/api/compute). */
export interface Descriptors {
  smiles: string;
  formula: string;
  mw: number;
  exactMw: number;
  logP: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotBonds: number;
  rings: number;
  aromaticRings: number;
  heavyAtoms: number;
  fractionCsp3: number;
  qed: number;
  inchi: string;
  inchiKey: string;
  /** 2D depiction rendered server-side by RDKit. */
  svg: string;
}

/** A row in the property table: descriptors + a client-side id. */
export interface Compound extends Descriptors {
  id: string;
}

export type ComputeResponse =
  | { ok: true; compounds: Descriptors[] }
  | { ok: false; error: string };
