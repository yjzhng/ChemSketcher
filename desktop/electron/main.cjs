// ChemSketcher desktop shell. A thin Electron window that loads the live Vite
// dev server (HMR) — so frontend edits hot-reload with no rebundling. The dev
// orchestrator (scripts/dev.mjs) starts the Python RDKit backend + Vite,
// verifies the served page is actually ChemSketcher (port guard), then
// launches this with VITE_DEV_URL.
//
// This is a from-source dev launcher, not a packaged app.

const { app, BrowserWindow, dialog, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Stable name so the user-data dir is "ChemSketcher" even in the from-source run.
app.setName('ChemSketcher');

const devUrl = process.env.VITE_DEV_URL || null;

let mainWindow = null;

// Brand the macOS dock with the ChemSketcher icon (the from-source run otherwise
// shows the stock Electron icon).
function setDockIcon() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const png = path.join(__dirname, '..', 'build-resources', 'icon.png');
  if (fs.existsSync(png)) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(png));
    } catch {
      /* ignore */
    }
  }
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 640,
    title: 'ChemSketcher',
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

// Belt-and-suspenders; the orchestrator already waits for and identity-checks
// the Vite server before launching us.
async function waitForUrl(url, { tries = 80, delayMs = 250 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

async function boot() {
  setDockIcon();
  if (!devUrl) {
    dialog.showErrorBox(
      'ChemSketcher',
      'Start the desktop app via the launcher so Vite + the backend are running:\n\n  make desktop\n\n(or: node desktop/scripts/dev.mjs)',
    );
    app.quit();
    return;
  }
  await waitForUrl(devUrl);
  createMainWindow(devUrl);
  if (process.env.CHEMSKETCHER_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app
  .whenReady()
  .then(boot)
  .catch((err) => {
    dialog.showErrorBox('ChemSketcher failed to start', String(err?.stack || err));
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (devUrl && BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(devUrl);
  }
});
