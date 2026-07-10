#!/bin/bash
# Run ChemSketcher from source in its own Electron window — no install ceremony,
# no rebundle. Clone → run → live; `git pull` → relaunch → updated (the dev
# stack compiles the latest source on the fly into a native window).
set -e

# On Apple Silicon, LaunchServices can start a .app with an x86_64 (Rosetta)
# arch preference that propagates to every child — `uname -m` then reports
# x86_64 and universal binaries run their x86 slice. Flip the whole chain to
# native arm64 up front so node/python and all children run native and arch
# detection is truthful. (/usr/bin/arch and sysctl are on the default PATH.)
if [ "$(uname -s)" = "Darwin" ] && \
   [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] && \
   [ "$(uname -m)" != "arm64" ]; then
  exec arch -arm64 "$0" "$@"
fi

cd "$(cd "$(dirname "$0")/.." && pwd)" # repo root (desktop/launch.sh → ..)

# Finder-launched .apps inherit a minimal PATH (no node/npm/python). Recover the
# user's real login-shell PATH so the SAME toolchain as a normal terminal is used.
USER_PATH="$(/bin/zsh -lic 'printf %s "$PATH"' 2>/dev/null || true)"
export PATH="${USER_PATH:+$USER_PATH:}/opt/homebrew/bin:/usr/local/bin:$PATH"

# macOS desktop notification (the .app runs silently to a log, so give feedback).
note() {
  osascript -e "display notification \"$1\" with title \"ChemSketcher\"" >/dev/null 2>&1 || true
}

first_run=0
if [ ! -d node_modules ] || [ ! -d desktop/node_modules ] || [ ! -d server/.venv ]; then
  first_run=1
  note "First run: installing dependencies… (a few minutes)"
fi

# 1. Web deps (Vite/React/Ketcher).
if [ ! -d node_modules ]; then npm install; fi
# 2. Electron shell.
if [ ! -d desktop/node_modules ]; then (cd desktop && npm install); fi
# 3. Python RDKit backend venv, built from a Python matching the device arch
#    (native arm64 on Apple Silicon) — provisions one if none is found.
bash desktop/scripts/ensure-venv.sh

[ "$first_run" = "1" ] && note "Dependencies ready."
note "Starting ChemSketcher…"
exec node desktop/scripts/dev.mjs
