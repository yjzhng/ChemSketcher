.PHONY: install server-install desktop-install desktop web build launcher dist dist-arm64 dist-x64

# Install root (web) dependencies.
install:
	npm install

# Create the Python venv and install RDKit + FastAPI for the property backend.
# Uses a Python matching the device arch (native arm64 on Apple Silicon),
# downloading a self-contained one if the machine has none.
server-install:
	bash desktop/scripts/ensure-venv.sh

# Install the desktop shell's Electron (one-time, ~100 MB).
desktop-install:
	npm --prefix desktop install

# Launch the from-source Electron desktop app: boots the Python backend,
# Vite (with port guard), and a native window. Auto-installs Electron first run.
desktop:
	@[ -d desktop/node_modules/electron ] || $(MAKE) desktop-install
	@[ -d server/.venv ] || $(MAKE) server-install
	node desktop/scripts/dev.mjs

# (Re)generate the double-clickable ChemSketcher.app launcher for the dev path.
launcher:
	node desktop/scripts/make-launcher.mjs

# Plain browser dev server (start the Python backend separately — see README).
web:
	npm run dev

# Production web build.
build:
	npm run build

# --- Shipping: build the distributable .dmg --------------------------------
# Packages the Electron app + built UI + Python backend sources into a .dmg (the
# RDKit env is fetched on the user's first launch, not bundled). Ad-hoc signed so
# the download shows the "Open Anyway" dialog, not "damaged". Output: desktop/dist/.
# Requires desktop deps (electron-builder): `make desktop-install`.
dist:
	npm --prefix desktop run dist

# One-arch variants (each .dmg then only runs on that arch).
dist-arm64:
	npm --prefix desktop run dist:arm64

dist-x64:
	npm --prefix desktop run dist:x64
