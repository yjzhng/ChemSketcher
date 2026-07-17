// Assemble everything the packaged app needs into desktop/build/. Run from
// anywhere; electron-builder then packages build/ per electron-builder.cjs.
//
//   build/web/           the built UI (vite build) — served by the backend
//   build/server/        the Python backend sources + requirements.txt
//   build/app-config.json  identity + ports, baked out of the root package.json
//   build/icon.png       dock/setup-window icon
//
// Kept as a script rather than npm chaining so the order and the reasons are
// explicit (and so app-config.json can't be forgotten).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repo = resolve(desktop, '..');
const build = resolve(desktop, 'build');

const pkg = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
const run = (cmd, args, cwd) => {
  console.log(`▸ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
};

mkdirSync(build, { recursive: true });

// 1. Build the UI. `npm run build` typechecks first, so a broken build can't ship.
run('npm', ['run', 'build'], repo);
const dist = resolve(repo, 'dist');
if (!existsSync(dist)) throw new Error('web build produced no dist/');
rmSync(resolve(build, 'web'), { recursive: true, force: true });
cpSync(dist, resolve(build, 'web'), { recursive: true });

// 2. The Python backend, sources only — the dev venv/caches must never ship
//    (they're machine- and arch-specific; the app builds its own env at first run).
rmSync(resolve(build, 'server'), { recursive: true, force: true });
mkdirSync(resolve(build, 'server'), { recursive: true });
for (const f of ['app.py', 'descriptors.py', 'requirements.txt']) {
  const src = resolve(repo, 'server', f);
  if (!existsSync(src)) throw new Error(`server/${f} is missing`);
  cpSync(src, resolve(build, 'server', f));
}

// 3. Identity for the runtime (electron/config.cjs reads this when packaged,
//    where there's no repo package.json to read).
writeFileSync(
  resolve(build, 'app-config.json'),
  `${JSON.stringify(
    {
      name: pkg.name,
      productName: pkg.productName,
      version: pkg.version,
      appConfig: pkg.appConfig,
    },
    null,
    2,
  )}\n`,
);

// 4. Icon for the dock fallback + the first-run setup window.
const iconPng = resolve(desktop, 'build-resources/icon.png');
if (existsSync(iconPng)) cpSync(iconPng, resolve(build, 'icon.png'));

console.log('✓ desktop build ready: build/{web, server, app-config.json, icon.png}');
