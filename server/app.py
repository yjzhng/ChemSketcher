"""ChemSketcher property backend.

A small FastAPI service that turns a drawn structure (molfile or SMILES) into
physicochemical descriptors + a 2D SVG, using RDKit. The Vite dev server
proxies /api → here, and the desktop orchestrator boots it before the window.

Run directly:  python server/app.py   (honours CHEMSKETCHER_API_PORT; the
default comes from appConfig.apiPort in package.json)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from descriptors import compute_all, mol_from_input

app = FastAPI(title="ChemSketcher backend")

# The UI normally reaches us through Vite's /api proxy (same origin), but allow
# direct localhost calls too for debugging / a standalone browser tab.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ComputeRequest(BaseModel):
    molfile: str | None = None
    smiles: str | None = None


@app.get("/health")
def health() -> dict[str, object]:
    from rdkit import rdBase

    return {"ok": True, "service": "chemsketcher", "rdkit": rdBase.rdkitVersion}


@app.post("/compute")
def compute_endpoint(req: ComputeRequest) -> dict[str, object]:
    # A blank or unparseable canvas is not an error during live editing — it
    # just means no rows. Return an empty list so the table clears cleanly.
    mol = mol_from_input(req.molfile, req.smiles)
    if mol is None:
        return {"ok": True, "compounds": []}
    try:
        return {"ok": True, "compounds": compute_all(mol)}
    except Exception as exc:  # noqa: BLE001 — surface any RDKit failure to the UI
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def _default_api_port() -> int:
    """package.json `appConfig.apiPort` is the single source of truth for ports."""
    try:
        pkg = json.loads((Path(__file__).resolve().parent.parent / "package.json").read_text())
        return int(pkg["appConfig"]["apiPort"])
    except Exception:  # noqa: BLE001 — fall back if run outside the repo
        return 8573


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("CHEMSKETCHER_API_PORT") or _default_api_port())
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
