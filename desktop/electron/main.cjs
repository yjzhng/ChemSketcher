// ChemSketcher desktop shell. Two very different boots behind one file:
//
// DEV (from source) — the orchestrator (scripts/dev.mjs) starts the Python
//   backend + Vite, verifies the served page is really ours (port guard), then
//   launches us with VITE_DEV_URL. We just open a window on it, so frontend
//   edits hot-reload with no rebundling.
//
// PACKAGED (.dmg) — there is no Vite and no repo. We provision the Python/RDKit
//   env on first run (see pythonEnv.cjs), start the backend ourselves, and point
//   the window at it. The backend serves the built UI and /api on one origin, so
//   the renderer's fetch('/api/…') works identically in both modes.
//
// Identity + ports come from package.json via config.cjs — never hard-coded.

const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const cfg = require('./config.cjs');
const { ensurePythonEnv, cleanEnv } = require('./pythonEnv.cjs');

// Stable name so the user-data dir is the product name even in a from-source run.
app.setName(cfg.productName);

const isDev = !app.isPackaged;
const devUrl = process.env.VITE_DEV_URL || null;
const devPort = devUrl ? new URL(devUrl).port : '';

// A dev session is identified by its dev port. The app's normal port keeps the
// standard userData dir; an instance deliberately started on another port (an
// isolated test run) gets its own, so it neither shares state with nor trips the
// single-instance lock of the everyday session.
if (devPort && devPort !== String(cfg.appConfig.devPort)) {
  app.setPath('userData', path.join(app.getPath('userData'), `dev-${devPort}`));
}

// Single-instance lock (OneProduction session guard): launching the same session
// twice focuses the existing window instead of spawning a parallel process.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let setupWindow = null;
let backend = null;
let appUrl = null; // what the window loads; kept for the macOS re-open path

app.on('second-instance', () => {
  const win = mainWindow || setupWindow;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

// ---- windows ---------------------------------------------------------------

// Brand the macOS dock in the from-source run (it's the stock Electron binary,
// so its icon would show otherwise). The packaged .app gets its icon from the
// bundle, via electron-builder's mac.icon.
function setDockIcon() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const png = path.join(__dirname, '..', 'build-resources', 'icon.png');
  if (!fs.existsSync(png)) return;
  try {
    app.dock.setIcon(nativeImage.createFromPath(png));
  } catch {
    /* ignore */
  }
}

function createMainWindow(url) {
  appUrl = url;
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 640,
    title: cfg.productName,
    backgroundColor: '#f4f6f9',
    webPreferences: { contextIsolation: true },
  });
  // Surface renderer console + load failures in the terminal/launch log so a
  // blank page isn't a silent mystery.
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url_) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url_}`);
  });
  mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * The first-run progress window. Created lazily: a launch that has nothing to
 * report (the normal case, once the env exists) never flashes a window.
 */
function showSetup() {
  if (setupWindow) return setupWindow;
  setupWindow = new BrowserWindow({
    width: 460,
    height: 320,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    title: `Setting up ${cfg.productName}`,
    backgroundColor: '#f4f6f9',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'setup-preload.cjs'),
    },
  });
  setupWindow.setMenuBarVisibility(false);
  // The name travels as a query param — the page must not hard-code identity.
  setupWindow.loadFile(path.join(__dirname, 'setup.html'), {
    query: { name: cfg.productName },
  });
  setupWindow.on('closed', () => {
    setupWindow = null;
  });
  return setupWindow;
}

function sendSetup(channel, payload) {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.webContents.send(channel, payload);
  }
}

// Queue progress until the page has actually loaded, else the first events
// (which arrive while the window is still loading) are dropped.
let setupReady = false;
const pending = [];
function emitProgress(data) {
  const win = showSetup();
  if (win.webContents.isLoading() && !setupReady) {
    pending.push(data);
    win.webContents.once('did-finish-load', () => {
      setupReady = true;
      for (const p of pending.splice(0)) sendSetup('setup:progress', p);
    });
    return;
  }
  sendSetup('setup:progress', data);
  if (process.platform === 'darwin' && win) win.setProgressBar(data.pct / 100);
}

function destroySetup() {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.destroy();
  setupWindow = null;
}

// ---- backend ---------------------------------------------------------------

/** Ask the OS for a free port. Beats a fixed port for a shipped app: the user's
 *  machine may already have anything on 8573, and we don't need a stable one. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, tries = 200, delayMs = 250) {
  for (let i = 0; i < tries; i++) {
    if (backend && backend.exitCode !== null) {
      throw new Error(`The backend stopped unexpectedly (exit ${backend.exitCode}).`);
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`The backend did not respond at ${url}.`);
}

function startBackend(python, serverDir, webDir, port) {
  stopBackend();
  backend = spawn(python, [path.join(serverDir, 'app.py')], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnv({
      CHEMSKETCHER_API_PORT: String(port),
      CHEMSKETCHER_WEB_DIR: webDir, // presence of this is what makes it serve the UI
    }),
  });
  const log = (b) => process.stdout.write(`[backend] ${b}`);
  backend.stdout.on('data', log);
  backend.stderr.on('data', log);
}

function stopBackend() {
  if (!backend) return;
  try {
    backend.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  backend = null;
}

// ---- boot ------------------------------------------------------------------

async function bootPackaged() {
  const serverDir = path.join(process.resourcesPath, 'server');
  const webDir = path.join(process.resourcesPath, 'web');
  const envRoot = path.join(app.getPath('userData'), 'python');

  // If boot is slow but silent (a cold RDKit import), say something rather than
  // leaving a bare dock icon. Provisioning cancels this by reporting first.
  const splash = setTimeout(() => emitProgress({ pct: 0, message: 'Starting…' }), 1200);

  try {
    const { python } = await ensurePythonEnv({
      root: envRoot,
      requirementsPath: path.join(serverDir, 'requirements.txt'),
      spec: cfg.appConfig.python,
      onProgress: emitProgress,
    });

    const port = await freePort();
    startBackend(python, serverDir, webDir, port);
    await waitForHealth(`http://127.0.0.1:${port}/api/health`);

    clearTimeout(splash);
    destroySetup();
    createMainWindow(`http://127.0.0.1:${port}/`);
  } catch (err) {
    clearTimeout(splash);
    stopBackend();
    showSetup();
    const message = String(err?.message || err);
    console.error('[setup]', err?.stack || message);
    // The window may still be loading on a fast failure (e.g. offline).
    if (setupWindow.webContents.isLoading()) {
      setupWindow.webContents.once('did-finish-load', () => sendSetup('setup:error', { message }));
    } else {
      sendSetup('setup:error', { message });
    }
  }
}

async function bootDev() {
  if (!devUrl) {
    dialog.showErrorBox(
      cfg.productName,
      'Start the desktop app via the launcher so Vite + the backend are running:\n\n  make desktop\n\n(or: node desktop/scripts/dev.mjs)',
    );
    app.quit();
    return;
  }
  // Belt-and-suspenders; the orchestrator already waits for and identity-checks
  // the Vite server before launching us.
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(devUrl);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  createMainWindow(devUrl);
  if (process.env.CHEMSKETCHER_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.on('setup:retry', () => {
  bootPackaged();
});
ipcMain.on('setup:quit', () => {
  app.quit();
});

app
  .whenReady()
  .then(() => {
    if (isDev) setDockIcon();
    return isDev ? bootDev() : bootPackaged();
  })
  .catch((err) => {
    dialog.showErrorBox(`${cfg.productName} failed to start`, String(err?.stack || err));
    app.quit();
  });

app.on('will-quit', stopBackend);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// macOS: the app outlives its window, so a dock click re-opens it on the same
// URL (the backend/Vite server it points at is still running).
app.on('activate', () => {
  if (appUrl && BrowserWindow.getAllWindows().length === 0) createMainWindow(appUrl);
});
