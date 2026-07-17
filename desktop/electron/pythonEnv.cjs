// First-run environment provisioning for the PACKAGED app.
//
// The backend is Python + RDKit, which — unlike a Node server — can't be
// bundled into the app by a JS bundler: RDKit is a compiled extension with a
// ~400 MB installed footprint. So the .dmg ships WITHOUT an interpreter and the
// app provisions one on first launch, into the user-data dir:
//
//   ~/Library/Application Support/ChemSketcher/python/
//     bin/python3      a self-contained CPython (python-build-standalone)
//     lib/…            + rdkit, fastapi, uvicorn installed into its site-packages
//     .ready           stamp: only written after a fully successful install
//
// Why user-data and not the bundle: the .app is read-only (and code-signed —
// writing into it would break the signature), and this keeps the download out
// of the installer.
//
// No venv. The interpreter is private to this app and never moves, so a venv
// would only add a layer of absolute-path indirection to isolate it from
// itself. We pip-install straight into it.
//
// Everything reports through onProgress({ pct, message }) so the caller can
// drive a real progress window — a silent multi-minute first launch is
// indistinguishable from a hang.

const { execFile, execFileSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const PBS_BASE = 'https://github.com/astral-sh/python-build-standalone/releases/download';

// Progress budget per phase. The pip step dominates wall-clock, so it gets the
// widest band; the numbers only need to be monotonic and roughly honest.
const PCT = { download: [3, 45], extract: [45, 55], pip: [55, 97] };

const run = (file, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(file, args, opts, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(stdout),
    );
  });

/**
 * A Python env that ignores the user's ambient Python settings. A stray
 * PYTHONHOME/PYTHONPATH (or an activated virtualenv in the launching shell)
 * would otherwise make our private interpreter import the wrong stdlib.
 */
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  delete env.PYTHONSTARTUP;
  delete env.VIRTUAL_ENV;
  return env;
}

/** python-build-standalone's arch slug for the arch this build of the app IS. */
function pbsArch() {
  // Trustworthy here, unlike `uname -m` in a shell script: each .dmg is built
  // for exactly one arch, so an arm64 app reports arm64. (An x64 build run
  // under Rosetta reports x64 and gets an x86_64 Python — correct: the whole
  // process tree is x86_64 either way.)
  if (process.arch === 'arm64') return 'aarch64';
  if (process.arch === 'x64') return 'x86_64';
  throw new Error(`unsupported architecture: ${process.arch}`);
}

/** Identifies an env: reprovision if the pin, the deps, or the arch changed. */
function stampFor(spec, requirements) {
  const deps = crypto.createHash('sha256').update(requirements).digest('hex').slice(0, 12);
  return `${spec.version}+${spec.pbsTag}|${pbsArch()}|${deps}`;
}

const pythonBinIn = (root) => path.join(root, 'bin', 'python3');

/**
 * Remove a previous (or half-written) Python tree. python-build-standalone
 * ships some files read-only, which makes a plain rm -rf fail with "Directory
 * not empty" — so make it writable first.
 */
function nuke(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    execFileSync('chmod', ['-R', 'u+w', dir], { stdio: 'ignore' });
  } catch {
    /* best effort — rm may still succeed */
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

async function downloadPython(root, spec, onProgress) {
  const name = `cpython-${spec.version}+${spec.pbsTag}-${pbsArch()}-apple-darwin-install_only.tar.gz`;
  const url = `${PBS_BASE}/${spec.pbsTag}/${name}`;
  const tmp = path.join(os.tmpdir(), `chemsketcher-${name}`);

  const [lo, hi] = PCT.download;
  onProgress({ pct: lo, message: 'Downloading Python…' });

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Python download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;

  let got = 0;
  let lastPct = lo;
  const src = Readable.fromWeb(res.body);
  src.on('data', (chunk) => {
    got += chunk.length;
    if (!total) return;
    const pct = Math.round(lo + (hi - lo) * (got / total));
    if (pct === lastPct) return; // don't spam IPC on every chunk
    lastPct = pct;
    const mb = (n) => (n / 1e6).toFixed(0);
    onProgress({ pct, message: `Downloading Python… ${mb(got)} / ${mb(total)} MB` });
  });
  await pipeline(src, fs.createWriteStream(tmp));

  onProgress({ pct: PCT.extract[0], message: 'Unpacking Python…' });
  nuke(root);
  fs.mkdirSync(root, { recursive: true });
  // The tarball's single top-level `python/` dir is stripped, so bin/ + lib/
  // land directly in root.
  await run('tar', ['-xzf', tmp, '-C', root, '--strip-components=1']);
  fs.rmSync(tmp, { force: true });

  const py = pythonBinIn(root);
  if (!fs.existsSync(py)) throw new Error('unpacked Python is missing bin/python3');
  return py;
}

/**
 * pip has no overall progress signal, so the bar ramps with elapsed time inside
 * the pip band (capped, monotonic) while the MESSAGE comes from pip's real
 * output — which is the part that tells the user something is happening.
 */
function pipInstall(py, requirementsPath, onProgress) {
  return new Promise((resolve, reject) => {
    const [lo, hi] = PCT.pip;
    const started = Date.now();
    let message = 'Installing RDKit…';
    let pct = lo;

    onProgress({ pct, message });
    const tick = setInterval(() => {
      // ~1%/2s, so a typical 2–3 min install walks most of the band.
      pct = Math.min(hi, lo + Math.floor((Date.now() - started) / 2000));
      onProgress({ pct, message });
    }, 1000);

    const child = spawn(
      py,
      [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--no-input',
        '--no-warn-script-location',
        '-r',
        requirementsPath,
      ],
      { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let tail = '';
    const scan = (buf) => {
      const s = buf.toString();
      tail = (tail + s).slice(-4000); // keep the end for the error message
      for (const line of s.split('\n')) {
        const m =
          /^\s*(Collecting|Downloading|Building|Installing collected packages)\b(.*)$/.exec(line);
        if (m) message = `${m[1]}${m[2]}`.trim().slice(0, 80);
      }
    };
    child.stdout.on('data', scan);
    child.stderr.on('data', scan);
    child.on('error', (err) => {
      clearInterval(tick);
      reject(err);
    });
    child.on('exit', (code) => {
      clearInterval(tick);
      if (code === 0) resolve();
      else reject(new Error(`pip install failed (exit ${code})\n${tail.trim()}`));
    });
  });
}

/**
 * Resolve a Python that can run the backend, provisioning one if needed.
 * Cheap and side-effect-free once the env is in place (the common case).
 *
 * @returns {Promise<{ python: string, provisioned: boolean }>}
 */
async function ensurePythonEnv({ root, requirementsPath, spec, onProgress = () => {} }) {
  const requirements = fs.readFileSync(requirementsPath, 'utf8');
  const stamp = stampFor(spec, requirements);
  const marker = path.join(root, '.ready');
  const python = pythonBinIn(root);

  // .ready is written last and only on success, so its presence means the whole
  // install completed — no need to re-verify imports on every launch.
  if (fs.existsSync(python) && fs.existsSync(marker)) {
    try {
      if (fs.readFileSync(marker, 'utf8').trim() === stamp) {
        return { python, provisioned: false };
      }
    } catch {
      /* unreadable marker → reprovision */
    }
  }

  fs.rmSync(marker, { force: true }); // a partial env must never look ready
  const py = await downloadPython(root, spec, onProgress);
  await pipInstall(py, requirementsPath, onProgress);
  fs.writeFileSync(marker, stamp);
  onProgress({ pct: 100, message: 'Ready.' });
  return { python: py, provisioned: true };
}

module.exports = { ensurePythonEnv, cleanEnv, pythonBinIn };
