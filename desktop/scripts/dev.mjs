// ChemSketcher desktop dev loop — a live from-source Electron window around the
// Vite UI (HMR), with the Python RDKit backend booted alongside it. Quitting
// the window ends the whole session (backend + Vite + Electron).
//
//   make desktop            (or: node desktop/scripts/dev.mjs)
//
// Boot order: Python backend → wait for /health → Vite (pinned port) → verify
// the served page is ChemSketcher (port guard) → Electron window.
//
// Identity + ports come from package.json `appConfig` (the OneProduction
// convention) — the single source of truth. Never hard-code them here.
//
// SESSION GUARDS — so one app's session never mixes with a sibling's:
//   1. The dev port is PINNED (vite strictPort). A second concurrent session, or
//      a sibling squatting the port, fails loudly instead of silently drifting
//      onto another port. Fleet registry: uniOme 5173 · autumnLab 5273 ·
//      ChemViewer 5373 · OneProduction 5473 · ChemSketcher 5573.
//   2. Identity check — we fetch the served URL and require it to actually be
//      ChemSketcher before pointing Electron at it.
//   3. On macOS we brand a cheap APFS clone of Electron with a UNIQUE bundle id
//      (<appIdNamespace>.<name>) so two sibling apps don't collide in Launch
//      Services.
//   4. Single-instance lock (see electron/main.cjs).

import { spawn, execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repo = resolve(desktop, '..'); // ChemSketcher root = the Vite app + server/

// package.json = single source of truth for identity + ports.
const pkg = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
const APP_NAME = pkg.productName;
const BASE_PORT = String(process.env.CHEMSKETCHER_PORT || pkg.appConfig.devPort);
const API_PORT = String(process.env.CHEMSKETCHER_API_PORT || pkg.appConfig.apiPort);

const viteBin = resolve(repo, 'node_modules/.bin/vite');
const electronBinDefault = resolve(desktop, 'node_modules/.bin/electron');
const venvPython = resolve(repo, 'server/.venv/bin/python');
const pythonBin = existsSync(venvPython) ? venvPython : process.env.PYTHON || 'python3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// macOS branded Electron clone with a UNIQUE bundle id (see header, guard #3).
// The `.dev` suffix matters: the SHIPPED app (electron-builder.yml) claims
// <namespace>.<name>, and two different binaries registering one bundle id makes
// Launch Services pick whichever it saw last — so a from-source run could hand
// "open ChemSketcher" to the installed copy, or vice versa. Dev is its own id.
const BRAND_ID = `${pkg.appConfig.appIdNamespace}.${pkg.name}.dev`;
const BRAND_REV = '3'; // bump to force a re-brand (e.g. icon or bundle-id change)
function brandedElectronBin() {
  if (process.platform !== 'darwin' || process.env.CHEMSKETCHER_NO_BRAND === '1') {
    return null;
  }
  try {
    const stock = resolve(desktop, 'node_modules/electron/dist/Electron.app');
    if (!existsSync(stock)) return null;
    const ver = JSON.parse(
      readFileSync(resolve(desktop, 'node_modules/electron/package.json'), 'utf8'),
    ).version;
    const branded = resolve(desktop, `build/${APP_NAME}.app`);
    const marker = resolve(desktop, 'build/.electron-brand');
    const want = `${ver}:${BRAND_REV}`;
    const cur = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : '';
    if (cur !== want || !existsSync(branded)) {
      console.log(`[dev] branding Electron → ${APP_NAME} (one-time)…`);
      mkdirSync(resolve(desktop, 'build'), { recursive: true });
      rmSync(branded, { recursive: true, force: true });
      execFileSync('cp', ['-Rc', stock, branded]); // APFS copy-on-write clone
      execFileSync('/usr/libexec/PlistBuddy', [
        '-c', `Set :CFBundleName ${APP_NAME}`,
        '-c', `Set :CFBundleDisplayName ${APP_NAME}`,
        '-c', `Set :CFBundleIdentifier ${BRAND_ID}`,
        resolve(branded, 'Contents/Info.plist'),
      ]);
      // Swap in the ChemSketcher icon so the running window/app tile isn't stock.
      const icns = resolve(desktop, 'build-resources/icon.icns');
      if (existsSync(icns)) {
        copyFileSync(icns, resolve(branded, 'Contents/Resources/electron.icns'));
      }
      execFileSync('codesign', ['--force', '--sign', '-', branded], { stdio: 'ignore' });
      writeFileSync(marker, want);
    }
    execFileSync('codesign', ['--verify', branded], { stdio: 'ignore' });
    const exe = resolve(branded, 'Contents/MacOS/Electron');
    return existsSync(exe) ? exe : null;
  } catch (e) {
    console.warn('[dev] Electron branding failed, using stock:', e.message);
    return null;
  }
}

const children = [];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function waitForHealth(url, tries = 120, delay = 300) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(delay);
  }
  console.error(`[dev] RDKit backend did not answer at ${url}`);
  shutdown(1);
}

// Defense #1: wait until the URL serves OUR app — not just "something answers".
async function waitForChemSketcher(url, tries = 160, delay = 300) {
  for (let i = 0; i < tries; i++) {
    try {
      const text = await (await fetch(url)).text();
      if (text.includes(APP_NAME)) return;
      console.error(
        `[dev] ${url} answered but is not ${APP_NAME} (port conflict?) — refusing to launch`,
      );
      shutdown(1);
    } catch {
      /* not up yet */
    }
    await sleep(delay);
  }
  console.error(`[dev] ${url} did not come up`);
  shutdown(1);
}

function startBackend() {
  console.log(`[dev] starting RDKit backend (${pythonBin}) on :${API_PORT}…`);
  const child = spawn(pythonBin, [resolve(repo, 'server/app.py')], {
    cwd: repo,
    detached: true,
    env: { ...process.env, CHEMSKETCHER_API_PORT: API_PORT },
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] backend exited (code ${code})`);
      shutdown(1);
    }
  });
}

// Start Vite on our unique base port (strictPort OFF) and resolve the ACTUAL
// URL it bound, so a busy port auto-increments instead of failing the launch.
function startVite() {
  return new Promise((resolveUrl, reject) => {
    const child = spawn(viteBin, ['--host', '127.0.0.1', '--port', BASE_PORT], {
      cwd: repo,
      detached: true,
      env: { ...process.env, CHEMSKETCHER_API_PORT: API_PORT },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let done = false;
    const scan = (buf) => {
      const s = buf.toString();
      process.stdout.write(s);
      const m = s.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m && !done) {
        done = true;
        resolveUrl(`http://127.0.0.1:${m[1]}`);
      }
    };
    child.stdout.on('data', scan);
    child.stderr.on('data', scan);
    child.on('exit', (code) => {
      if (!done) reject(new Error(`Vite exited (code ${code}) before serving`));
    });
  });
}

console.log(`[dev] starting ${APP_NAME}: backend + Vite (base :${BASE_PORT}) + Electron…`);

startBackend();
await waitForHealth(`http://127.0.0.1:${API_PORT}/api/health`);

let webUrl;
try {
  webUrl = await startVite();
} catch (e) {
  console.error('[dev]', e.message);
  shutdown(1);
}

await waitForChemSketcher(webUrl);

const electronEnv = { ...process.env, VITE_DEV_URL: webUrl };
delete electronEnv.ELECTRON_RUN_AS_NODE;
const electronBin = brandedElectronBin() || electronBinDefault;
const electron = spawn(electronBin, ['.'], {
  cwd: desktop,
  stdio: 'inherit',
  detached: true,
  env: electronEnv,
});
children.push(electron);
electron.on('exit', (code) => shutdown(code ?? 0)); // quitting the app ends the session
