"""Compute physicochemical descriptors and a 2D depiction from an RDKit mol.

Kept separate from the web layer (app.py) so the chemistry is easy to test and
extend. Every value here becomes a column in the ChemSketcher property table.
"""

from __future__ import annotations

from typing import Any, Optional

from rdkit import Chem
from rdkit.Chem import AllChem, Crippen, Descriptors, QED, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D


def mol_from_input(molfile: Optional[str], smiles: Optional[str]) -> Optional[Chem.Mol]:
    """Build a mol from a molfile (preferred — keeps the drawn 2D coords) or SMILES.

    Returns None if neither yields a valid molecule.
    """
    mol: Optional[Chem.Mol] = None
    if molfile and molfile.strip():
        mol = Chem.MolFromMolBlock(molfile, sanitize=True)
    if mol is None and smiles and smiles.strip():
        mol = Chem.MolFromSmiles(smiles)
        if mol is not None:
            AllChem.Compute2DCoords(mol)
    return mol


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def render_svg(mol: Chem.Mol, width: int = 260, height: int = 180) -> str:
    """A transparent-background 2D SVG depiction of the molecule."""
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    opts = drawer.drawOptions()
    opts.clearBackground = False
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


def compute_all(mol: Chem.Mol) -> list[dict[str, Any]]:
    """One descriptor dict per disconnected molecule on the canvas.

    Ketcher hands us a single molblock that may hold several structures; we
    split it into fragments (each keeps its drawn 2D coordinates) so every
    molecule becomes its own table row. Unsanitizable fragments are skipped.

    Identical structures are collapsed to one row (keyed by canonical SMILES):
    two copies of the same compound have identical properties, so a second row
    is just noise — and the ring tool in particular can stamp overlapping
    duplicate rings that would otherwise show up twice.
    """
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for frag in Chem.GetMolFrags(mol, asMols=True, sanitizeFrags=False):
        try:
            Chem.SanitizeMol(frag)
        except Exception:  # noqa: BLE001 — skip a fragment RDKit can't make sense of
            continue
        if frag.GetNumHeavyAtoms() == 0:
            continue
        key = Chem.MolToSmiles(frag)  # canonical — same structure → same key
        if key in seen:
            continue
        seen.add(key)
        out.append(compute(frag))
    return out


def compute(mol: Chem.Mol) -> dict[str, Any]:
    """Descriptor dict for one molecule. Keys mirror the table columns."""
    inchi = Chem.MolToInchi(mol)
    return {
        "smiles": Chem.MolToSmiles(mol),
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "mw": _round(Descriptors.MolWt(mol)),
        "exactMw": _round(Descriptors.ExactMolWt(mol), 4),
        "logP": _round(Crippen.MolLogP(mol)),
        "tpsa": _round(rdMolDescriptors.CalcTPSA(mol)),
        "hbd": rdMolDescriptors.CalcNumHBD(mol),
        "hba": rdMolDescriptors.CalcNumHBA(mol),
        "rotBonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "rings": rdMolDescriptors.CalcNumRings(mol),
        "aromaticRings": rdMolDescriptors.CalcNumAromaticRings(mol),
        "heavyAtoms": mol.GetNumHeavyAtoms(),
        "fractionCsp3": _round(rdMolDescriptors.CalcFractionCSP3(mol), 3),
        "qed": _round(QED.qed(mol), 3),
        "inchi": inchi,
        "inchiKey": Chem.InchiToInchiKey(inchi) if inchi else "",
        "svg": render_svg(mol),
    }
