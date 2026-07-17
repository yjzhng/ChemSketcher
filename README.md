# ChemSketcher

Open-source molecule sketchpad desktop app based on [EPAM Ketcher](https://lifescience.opensource.epam.com/ketcher/). Comes with an interactive table that shows various physchem properties of the drawn molecules, computed live by [RDKit](https://www.rdkit.org). 

Features: 
- Each distinct molecule is recognised automatically
- Supported molecule properties: SMILES, molecular weight, logP, TPSA, donors/acceptors, ring counts, QED, InChIKey


## Quick start

1. Download the `.dmg` from the [latest release](https://github.com/yjzhng/ChemSketcher/releases/latest) — `arm64` (Apple Silicon) or `x64` (Intel).
2. Install **ChemSketcher** to Applications.
3. **First launch** may be blocked by system security, to resolve: 
   - **macOS 15 (Sequoia) or newer:** double-click ChemSketcher → a "not opened"
     alert appears → open **System Settings → Privacy & Security**, scroll down,
     and click **Open Anyway**.
   - **macOS 14 or older:** **right-click** ChemSketcher → **Open** → **Open** in
     the dialog.
4. After that it opens normally.

> [!NOTE]
> **First launch downloads the chemistry engine.** ChemSketcher fetches a
> self-contained Python + RDKit (~a few minutes) with a progress window. This
> happens once; everything lands in `~/Library/Application Support/ChemSketcher/`
> and the app bundle is never modified.

> [!TIP]
> Terminal alternative to the Gatekeeper prompt, once installed:
> `xattr -dr com.apple.quarantine /Applications/ChemSketcher.app`

### To use it

1. **Draw** a molecule, or paste in a SMILES string and press **Load**.
2. **Open / Save / Save As** (top-left) read and write structure files
   (`.mol`, `.sdf`, `.ket`, `.smi`, …).
3. Customise properties to include the in **Settings** (top-right)
4. Show/hide and table and change its position with the layout buttons (top-right). 
5. Drag the divider to
   resize.

## Run from source (developers)

- **Native window (macOS):** clone the repo and **double-click `ChemSketcher.app`**
  — a launcher stub that installs dependencies behind a progress window on first
  run, then opens the app. `git pull` and relaunch to update. Equivalent to
  `make desktop`.
- **Browser / any OS:**

  ```sh
  make install          # web deps
  make server-install   # Python venv + RDKit + FastAPI

  # then, in two terminals:
  server/.venv/bin/python server/app.py   # property backend
  npm run dev                             # http://localhost:5573
  ```

Needs [Node.js](https://nodejs.org) + git. On first run the app also provisions a
Python/RDKit environment that **matches your CPU architecture** (native arm64 on
Apple Silicon, x86_64 on Intel), downloading a self-contained CPython if the
machine has none — no Homebrew, no system changes.

### Build the installer

```sh
make desktop-install    # one-time: Electron + electron-builder
make dist               # → desktop/dist/ChemSketcher-<version>-<arch>.dmg (both arches)
make dist-arm64         # or a single architecture
make dist-x64
```

The `.dmg` is **ad-hoc signed** (no Developer ID), which is what makes a
downloaded copy show the "unidentified developer / Open Anyway" dialog rather
than "app is damaged". The RDKit engine is not bundled — it is provisioned on the
user's first launch. See [desktop/README.md](desktop/README.md) for the desktop
architecture, and the header of
[desktop/electron/pythonEnv.cjs](desktop/electron/pythonEnv.cjs) for how
provisioning works.


## Built with

- [EPAM Ketcher](https://lifescience.opensource.epam.com/ketcher/) + the
  [Indigo Toolkit](https://lifescience.opensource.epam.com/indigo/) — structure
  editor and cheminformatics (Apache-2.0).
- [RDKit](https://www.rdkit.org) — descriptor and structure computation (BSD-3-Clause).
- [React](https://react.dev), [Vite](https://vitejs.dev),
  [TanStack Table](https://tanstack.com/table), [Zustand](https://github.com/pmndrs/zustand) — UI.
- [FastAPI](https://fastapi.tiangolo.com) + [Uvicorn](https://www.uvicorn.org) — backend.
- [Electron](https://www.electronjs.org) + [electron-builder](https://www.electron.build) — desktop shell and packaging.
- [python-build-standalone](https://github.com/astral-sh/python-build-standalone) — the self-contained interpreter provisioned at first run.

## References

- Landrum, G., et al. *RDKit: Open-source cheminformatics.* https://www.rdkit.org
- Pavlov, D., Rybalkin, M., Karulin, B., Kozhevnikov, M., Savelyev, A., &
  Churinov, A. (2011). Indigo: universal cheminformatics API. *Journal of
  Cheminformatics, 3*(Suppl 1), P4. https://doi.org/10.1186/1758-2946-3-S1-P4

## License

ChemSketcher's source is released under the **MIT License** — see
[LICENSE](LICENSE). It builds on third-party components under their own permissive
licenses (Ketcher/Indigo: Apache-2.0; RDKit: BSD-3-Clause), noted in
[Built with](#built-with) above.
