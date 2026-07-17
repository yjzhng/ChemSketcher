# ChemSketcher desktop

The Electron shell — both the from-source dev window and the packaged macOS app.
One `main.cjs` handles both; identity and ports come from the root
[package.json](../package.json) `appConfig` (never hard-coded).

## Two boots, one main

**Dev (from source)** — `scripts/dev.mjs` starts the Python backend + Vite,
verifies the served page is actually ChemSketcher (port guard), then launches
Electron with `VITE_DEV_URL`. `main.cjs` just opens a window on it, so frontend
edits hot-reload with no rebundling. Started by `make desktop` or double-clicking
the generated `ChemSketcher.app` launcher (see `scripts/make-launcher.mjs`).

**Packaged (`.dmg`)** — there is no Vite and no repo. `main.cjs`:

1. provisions the Python/RDKit env on first run (`electron/pythonEnv.cjs`) into
   `~/Library/Application Support/ChemSketcher/python/`, with a progress window
   (`electron/setup.html`);
2. starts the backend itself on a free port;
3. points the window at it — the backend serves the built UI **and** `/api` on one
   origin, so `fetch('/api/…')` is identical to dev.

## Why RDKit is provisioned, not bundled

RDKit is a compiled Python extension (~400 MB installed); a JS bundler can't pack
it. So the `.dmg` ships without an interpreter and builds one on first launch from
a pinned [python-build-standalone](https://github.com/astral-sh/python-build-standalone)
CPython (`appConfig.python`) + `pip install rdkit fastapi uvicorn`. A `.ready`
stamp makes it idempotent; the same pin drives the dev venv
(`scripts/ensure-venv.sh`), so both paths get the same interpreter.

## Packaging

`scripts/build.mjs` assembles `build/` (built UI, backend sources, baked
`app-config.json`, icon); `electron-builder.cjs` packages it and
`scripts/after-pack.cjs` ad-hoc signs the bundle — that valid signature is what
produces the "Open Anyway" dialog instead of "app is damaged" on a quarantined
download. Ships unsigned (`mac.identity: null`); to sign/notarize for real, set a
Developer ID cert per the note in `electron-builder.cjs`.

```sh
npm run build        # assemble build/
npm run dist         # both arches → dist/*.dmg
npm run dist:arm64   # single arch
npm run dist:x64
```

## Files

| Path | What |
| --- | --- |
| `electron/main.cjs` | Dev + packaged boot; window, backend, setup lifecycle. |
| `electron/config.cjs` | App identity, resolved from package.json / baked `app-config.json`. |
| `electron/pythonEnv.cjs` | First-run CPython + RDKit provisioning with progress. |
| `electron/setup.html`, `setup-preload.cjs` | First-run progress window. |
| `scripts/dev.mjs` | From-source orchestrator (backend + Vite + window). |
| `scripts/build.mjs` | Assemble the packaged inputs into `build/`. |
| `scripts/make-launcher.mjs` | Generate the double-click `ChemSketcher.app` (dev). |
| `scripts/ensure-venv.sh` | Dev Python venv, arch-matched. |
| `electron-builder.cjs`, `scripts/after-pack.cjs` | Packaging + ad-hoc signing. |
| `launch.sh` | What the dev `.app` runs: install-on-first-run, then `dev.mjs`. |
