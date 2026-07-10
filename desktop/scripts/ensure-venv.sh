#!/bin/bash
# Ensure server/.venv exists and is built from a Python that MATCHES THE DEVICE
# ARCHITECTURE (native arm64 on Apple Silicon, x86_64 on Intel) and is in a
# version range RDKit ships wheels for. This avoids the classic Apple-Silicon
# trap where `python3` is an x86_64 build running under Rosetta — RDKit then
# installs the x86 wheel and everything runs slow/mismatched.
#
# Strategy (cheapest first):
#   1. If server/.venv already matches the device arch + a good version → done.
#   2. Else find an existing python3 that matches → build the venv from it.
#   3. Else (common on a fresh Apple-Silicon Mac with only a system/Rosetta
#      python) DOWNLOAD a self-contained python-build-standalone matching the
#      device arch into server/.python and build the venv from THAT — no
#      Homebrew, no system changes.
set -e
cd "$(cd "$(dirname "$0")/../.." && pwd)" # repo root (desktop/scripts → ../..)

# Python versions RDKit publishes wheels for that we're happy to use. When we
# have to download, we fetch the first (newest) one.
SUPPORTED="3.12 3.11 3.10"
# Pinned python-build-standalone release (override via env to bump).
PBS_TAG="${CHEMSKETCHER_PBS_TAG:-20241219}"
PBS_VER="${CHEMSKETCHER_PBS_VER:-3.12.8}"

# TRUE hardware arch. `uname -m` reports the *process* arch, which is x86_64
# when we're running under a Rosetta preference on Apple Silicon — so ask the
# hardware directly via sysctl and only fall back to uname off macOS.
host_arch="$(uname -m)"
if [ "$(uname -s)" = "Darwin" ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
  host_arch="arm64"
fi
venv="server/.venv"
pyroot="server/.python" # where a downloaded standalone Python lives

# Echo "ok" if $1 is a runnable python that is SINGLE-ARCH == host and a
# supported version. We reject universal2 ("x86_64 arm64") binaries on purpose:
# LaunchServices can start a .app with an x86_64 arch preference that propagates
# to a fat Python, which then runs the wrong slice and can't load the arm64
# wheels we installed. An arm64-only interpreter has no x86 slice, so it always
# runs native — no matter how it was launched.
probe() {
  local py="$1" exe ver archs
  command -v "$py" >/dev/null 2>&1 || [ -x "$py" ] || return 0
  exe="$("$py" -c 'import os,sys;print(os.path.realpath(sys.executable))' 2>/dev/null)" || return 0
  ver="$("$py" -c 'import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)" || return 0
  case " $SUPPORTED " in *" $ver "*) ;; *) return 0 ;; esac
  if command -v lipo >/dev/null 2>&1; then
    archs="$(lipo -archs "$exe" 2>/dev/null)"
    [ "$archs" = "$host_arch" ] && echo ok # exact single-arch match only
  else
    # No lipo (Xcode CLT absent): fall back to the runtime arch report.
    [ "$("$py" -c 'import platform;print(platform.machine())' 2>/dev/null)" = "$host_arch" ] && echo ok
  fi
}

# 1. Existing venv already good? Then there's nothing to do.
if [ -x "$venv/bin/python" ] && [ "$(probe "$venv/bin/python")" = ok ]; then
  exit 0
fi

# 2. Find a suitable base interpreter already on the machine.
base=""
for cand in "$PYTHON" python3.12 python3.11 python3.10 python3; do
  [ -n "$cand" ] || continue
  if [ "$(probe "$cand")" = ok ]; then base="$cand"; break; fi
done

# 3. None suitable → provision a self-contained Python for THIS arch.
if [ -z "$base" ]; then
  if [ -x "$pyroot/bin/python3" ] && [ "$(probe "$pyroot/bin/python3")" = ok ]; then
    base="$pyroot/bin/python3"
  elif [ "$(uname -s)" = "Darwin" ]; then
    case "$host_arch" in
      arm64) sarch=aarch64 ;;
      x86_64) sarch=x86_64 ;;
      *) echo "ensure-venv: unsupported macOS arch '$host_arch'" >&2; exit 1 ;;
    esac
    url="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/cpython-${PBS_VER}+${PBS_TAG}-${sarch}-apple-darwin-install_only.tar.gz"
    echo "ensure-venv: no native ${host_arch} Python found — downloading a self-contained CPython ${PBS_VER} (${sarch})…"
    # python-build-standalone ships some read-only files, so make writable
    # before removing (a plain `rm -rf` can otherwise fail "Directory not empty").
    [ -e "$pyroot" ] && chmod -R u+w "$pyroot" 2>/dev/null || true
    rm -rf "$pyroot"; mkdir -p "$pyroot"
    curl -fsSL "$url" | tar -xz -C "$pyroot" --strip-components=1
    base="$pyroot/bin/python3"
  else
    echo "ensure-venv: need a native ${host_arch} Python 3.10–3.12 on PATH (auto-download is macOS-only)." >&2
    exit 1
  fi
fi

echo "ensure-venv: building $venv from $("$base" -c 'import platform,sys;print(f"{sys.executable} ({platform.machine()}, {sys.version.split()[0]})")')"
rm -rf "$venv"
"$base" -m venv "$venv"
"$venv/bin/pip" install --upgrade pip >/dev/null
"$venv/bin/pip" install -r server/requirements.txt
echo "ensure-venv: done."
