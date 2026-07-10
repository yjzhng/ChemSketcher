.PHONY: install server-install desktop-install desktop web build

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

# Plain browser dev server (start the Python backend separately — see README).
web:
	npm run dev

# Production web build.
build:
	npm run build
