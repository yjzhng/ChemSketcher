// electron-builder afterPack hook — give the packaged .app a VALID ad-hoc signature.
//
// Why this exists: we distribute unsigned (no Apple Developer ID). Left alone,
// the output bundle carries a broken/partial signature, which macOS reads as
// TAMPERED — the user gets "'ChemSketcher' is damaged and can't be opened. Move
// it to the Trash", a dead end with no override in the GUI. A *valid* ad-hoc
// signature instead produces the ordinary "unidentified developer / Apple can't
// check it for malware" dialog, whose System Settings → "Open Anyway" flow needs
// no Terminal. That is the difference between shippable and not.
//
// (Apple Silicon also *requires* a signature to run at all, so truly-unsigned
// isn't an option — a clean ad-hoc signature is the correct end state here.)
//
// --sign - is ad-hoc; --force overwrites the partial signature; --deep covers
// nested code (Electron framework, helpers) so the whole bundle verifies.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  // Fail the build rather than ship a bundle that will show "damaged".
  execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  console.log(`  • ad-hoc signed + verified ${path.basename(app)}`);
};
