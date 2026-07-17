#!/bin/bash
# Run ChemSketcher from source in its own Electron window — no install ceremony,
# no rebundle. Clone → double-click the .app → live; `git pull` → relaunch →
# updated (the dev stack compiles the latest source on the fly into a native
# window). This is the DEV path; end users get the .dmg instead.
#
# First run has to fetch three slow things (npm deps, Electron's ~150 MB binary,
# and a Python/RDKit env). That's minutes of silence in a Finder-launched app
# with no terminal, which is indistinguishable from a hang — so we drive a real
# progress window (see start_progress_window).
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

APP_NAME="$(node -p "require('./package.json').productName" 2>/dev/null || echo ChemSketcher)"

# Logs live under the repo so they travel with the folder. The .app stub already
# points here; when run directly we still want somewhere to send install output.
LOG_DIR="$PWD/logs"
mkdir -p "$LOG_DIR" 2>/dev/null || true
LOG="$LOG_DIR/launch.log"

# macOS notification — the fallback when the progress window can't be built.
note() {
  osascript -e "display notification \"$1\" with title \"$APP_NAME\"" >/dev/null 2>&1 || true
}

# We gate first-run on Electron's ACTUAL binary, not just node_modules/: a fresh
# `npm install` creates the dirs first, then Electron's postinstall fetches a
# ~150 MB binary. If that stalls, is force-quit, or is skipped entirely (see
# ensure_electron), the dirs exist but the binary doesn't — a plain "is
# node_modules there?" check would skip install forever and no window would ever
# open. Resolve it exactly like electron/index.js does, via path.txt.
electron_ready() {
  [ -f desktop/node_modules/electron/path.txt ] &&
    [ -x "desktop/node_modules/electron/dist/$(cat desktop/node_modules/electron/path.txt 2>/dev/null)" ]
}

# `npm install` runs the postinstall that normally downloads Electron, but some
# setups skip ALL package install scripts (a global `ignore-scripts=true`,
# @lavamoat/allow-scripts, corporate npm policy) — then npm "succeeds" with no
# usable Electron and the app dies with "Electron failed to install correctly".
# Running its installer explicitly fetches the binary regardless (idempotent).
ensure_electron() {
  electron_ready && return 0
  [ -f desktop/node_modules/electron/install.js ] || return 1
  ( cd desktop/node_modules/electron && node install.js )
}

# --- first-run progress window ----------------------------------------------
# macOS notification banners auto-dismiss and can't show a bar, and Electron
# isn't installed yet so we can't draw our own window. So compile a tiny
# AppleScript *applet* at runtime: its `progress` UI is a real persistent window
# with a bar + %. It polls a status file ("PCT|message") that we update; writing
# 100 makes it exit. Falls back to notifications if osacompile is unavailable.
STATUS="${TMPDIR:-/tmp}/chemsketcher-setup.progress"
APPLET="${TMPDIR:-/tmp}/ChemSketcherSetup.app"
APPSRC="${TMPDIR:-/tmp}/chemsketcher-progress.applescript"
WIN=0

progress_write() { printf '%s|%s' "$1" "$2" > "$STATUS" 2>/dev/null || true; }

start_progress_window() {
  command -v osacompile >/dev/null 2>&1 || return 1
  progress_write 0 "starting…"
  cat > "$APPSRC" <<APPLESCRIPT
on run
  set statusFile to "$STATUS"
  set progress total steps to 100
  set progress description to "Setting up $APP_NAME"
  set progress additional description to "Starting…"
  repeat
    set txt to "0|working…"
    try
      set txt to (do shell script "cat " & quoted form of statusFile)
    end try
    set AppleScript's text item delimiters to "|"
    try
      set pct to (text item 1 of txt) as integer
    on error
      set pct to 0
    end try
    if (count of text items of txt) > 1 then
      set msg to text item 2 of txt
    else
      set msg to ""
    end if
    if pct < 0 then set pct to 0
    if pct > 100 then set pct to 100
    set progress completed steps to pct
    set progress additional description to ((pct as string) & "%  ·  " & msg)
    if pct is greater than or equal to 100 then exit repeat
    delay 1
  end repeat
end run
APPLESCRIPT
  rm -rf "$APPLET"
  osacompile -o "$APPLET" "$APPSRC" >/dev/null 2>&1 || return 1
  open "$APPLET" >/dev/null 2>&1 || return 1
  return 0
}

finish_progress_window() {
  if [ "$WIN" -eq 1 ]; then
    progress_write 100 "$1"
    # The applet polls every 1s: let it read 100 and close BEFORE we delete the
    # status file, else its next read finds none, falls back to 0%, and the
    # window never closes.
    sleep 2
  fi
  rm -f "$STATUS" "$APPSRC"; rm -rf "$APPLET"
}

setup_failed() {
  finish_progress_window "failed"
  note "Setup failed — see logs/launch.log, then relaunch"
  exit 1
}

# Run one setup step in the background while ramping the bar from $1 toward $2.
# npm/pip give no usable overall %, so the bar ramps ~1%/s within the step's
# band and is capped there — monotonic, and honest about which step is running.
run_step() { # lo hi label cmd...
  local lo=$1 hi=$2 label=$3; shift 3
  local start=$SECONDS pct
  progress_write "$lo" "$label"
  [ "$WIN" -eq 0 ] && note "Setting up — $label…"
  echo "===== $label =====" >>"$LOG"
  "$@" >>"$LOG" 2>&1 &
  local pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    pct=$(( lo + SECONDS - start )); [ "$pct" -gt "$hi" ] && pct=$hi
    progress_write "$pct" "$label"
    sleep 1
  done
  wait "$pid" || setup_failed
}

# --- first run ---------------------------------------------------------------
if [ ! -d node_modules ] || ! electron_ready || [ ! -d server/.venv ]; then
  start_progress_window && WIN=1 || note "First run: setting up $APP_NAME… (a few minutes)"

  [ -d node_modules ] || run_step 2 24 "installing dependencies" npm install
  if ! electron_ready; then
    run_step 25 62 "downloading Electron (~150 MB)" npm install --prefix desktop
    # Guarantee the binary even if npm skipped its postinstall.
    electron_ready || run_step 62 70 "downloading Electron (~150 MB)" bash -c 'cd desktop/node_modules/electron && node install.js'
  fi
  # Python + RDKit. Provisions a native-arch interpreter if the machine has none.
  run_step 71 97 "installing RDKit (Python backend)" bash desktop/scripts/ensure-venv.sh

  if ! electron_ready; then
    finish_progress_window "failed"
    note "Electron didn't finish downloading — relaunch to retry (log: logs/launch.log)"
    exit 1
  fi
  finish_progress_window "done"
fi

note "Starting $APP_NAME…"
exec node desktop/scripts/dev.mjs
