// Runtime app identity, resolved for BOTH modes from the one source of truth.
//
// package.json `appConfig` is authoritative (the OneProduction convention) —
// nothing here or downstream may hard-code a name, id or port. Dev runs inside
// the repo and reads the real package.json; the packaged app has no repo around
// it, so scripts/build.mjs bakes the same fields into build/app-config.json.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const src = app.isPackaged
  ? path.join(__dirname, '..', 'build', 'app-config.json')
  : path.join(__dirname, '..', '..', 'package.json');

const pkg = JSON.parse(fs.readFileSync(src, 'utf8'));

module.exports = {
  name: pkg.name,
  productName: pkg.productName,
  version: pkg.version,
  appConfig: pkg.appConfig,
  // Matches electron-builder.cjs — see the note there about the dev `.dev` suffix.
  appId: `${pkg.appConfig.appIdNamespace}.${pkg.name}`,
};
