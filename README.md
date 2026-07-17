# ChemSketcher

An open-source, Ketcher-based desktop chemical structure editor. Draw a
molecule, and an interactive table shows its physicochemical properties and
attributes at a glance. Add several structures to compare them side by side.
Runs in the browser or as a from-source Electron desktop app.

## Stack

- **Vite + React + TypeScript** — UI and the interactive property table
  (TanStack Table).
- **EPAM Ketcher** — the structure editor (`ketcher-react` + the standalone
  Indigo WASM service, so it runs with no server).
- **Python + RDKit** — a small FastAPI backend computes descriptors and renders
  the structure SVG. Vite proxies `/api` → it.
- **Electron** — a from-source desktop shell around the live Vite server.

## Quick start (browser)

```sh
make install          # npm install (web deps)
make server-install   # create server/.venv and install RDKit + FastAPI
```

`server-install` builds the venv from a Python that **matches your CPU
architecture** — native arm64 on Apple Silicon, x86_64 on Intel. If your
machine has no suitable native Python (e.g. only an x86_64/Rosetta `python3`),
it downloads a self-contained CPython for the right arch into `server/.python`
(no Homebrew or system changes). Logic lives in
[desktop/scripts/ensure-venv.sh](desktop/scripts/ensure-venv.sh).

Then run the two processes (two terminals):

```sh
# terminal 1 — property backend
server/.venv/bin/python server/app.py

# terminal 2 — web UI (proxies /api to the backend)
npm run dev           # http://localhost:5573
```

## Desktop app (Electron, from source)

```sh
make desktop          # boots the Python backend + Vite + a native window
```

Or just **double-click `ChemSketcher.app`** in the repo — a tiny launcher stub
that installs deps on first run (web + Electron + the Python venv), then opens
the app. Update with `git pull` and relaunch; nothing to rebundle.

The orchestrator (`desktop/scripts/dev.mjs`) starts the RDKit backend, waits
for it to answer, starts Vite on the pinned port from package.json
(`appConfig.devPort` = 5573; unique across the fleet), verifies
the served page is actually ChemSketcher (port guard), then opens the window.
Quitting the window ends the session.

## How it works

1. You draw a structure in Ketcher.
2. **Add to table** grabs the molfile and POSTs it to `/api/compute`.
3. The RDKit backend returns descriptors (MW, logP, TPSA, HBD/HBA, rings,
   rotatable bonds, QED, InChIKey, …) plus a rendered SVG.
4. A row appears in the sortable table. Repeat to compare compounds.

Naming is deferred for now — the table keys compounds by formula / InChIKey.

## Layout

| Path | What |
| --- | --- |
| `src/` | Frontend (Ketcher editor, property table, store, API client). |
| `server/` | Python RDKit + FastAPI property backend. |
| `desktop/` | Electron shell + dev orchestrator (`make desktop`). |
| `vite.config.ts` | Vite config; proxies `/api` to the Python backend. |
