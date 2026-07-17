// Production packaging config — DERIVED from package.json (the OneProduction
// convention). Never hard-code identity here; change package.json `name`,
// `productName` or `appConfig` instead and everything below follows.
//
// Distribution reality: there is no Apple Developer ID, so this ships UNSIGNED
// and the user takes the "Open Anyway" route (System Settings → Privacy &
// Security) on first launch. See scripts/after-pack.cjs for why we still sign
// ad-hoc — that step is what makes the friendly dialog appear instead of the
// dead-end "app is damaged" one.
//
// To sign for real later: drop `identity: null`, set CSC_LINK/CSC_KEY_PASSWORD
// to a Developer ID cert, and add a notarize step.
const pkg = require('../package.json'); // repo root = the single source of truth

module.exports = {
  // e.g. tech.yjzhng.chemsketcher — the dev-branded Electron deliberately uses
  // <this>.dev (see scripts/dev.mjs) so the two never collide in Launch Services.
  appId: `${pkg.appConfig.appIdNamespace}.${pkg.name}`,
  productName: pkg.productName,
  // Author may carry a trailing <email> or (url); keep just the name for the copyright line.
  copyright: `© ${String(pkg.author).replace(/\s*[<(][^>)]*[>)]\s*$/, '')}`,

  directories: { output: 'dist', buildResources: 'build-resources' },

  // desktop/package.json is only the Electron shell's manifest; the app's real
  // version/description live in the root package.json, so graft them on rather
  // than letting the two drift.
  extraMetadata: {
    version: pkg.version,
    description: pkg.description,
  },

  // Give the packaged .app a valid ad-hoc signature (see the hook).
  afterPack: 'scripts/after-pack.cjs',

  // Inside the asar: the shell plus the identity/icon that scripts/build.mjs
  // bakes out of package.json. No node_modules — the shell uses only Electron
  // built-ins, and the backend is Python (provisioned at first run).
  files: ['electron/**', 'build/app-config.json', 'build/icon.png', 'package.json'],

  // Shipped UNPACKED as real directories: the Python backend has to read the
  // web dist off disk to serve it, and has to import its own .py files — neither
  // can see inside an asar.
  extraResources: [
    { from: 'build/web', to: 'web' },
    { from: 'build/server', to: 'server' },
  ],

  asar: true,

  mac: {
    category: 'public.app-category.education',
    icon: 'build-resources/icon.icns',
    // Arch comes from the CLI (see the dist:* scripts) so each variant builds
    // exactly one architecture; an arch list here would override those flags.
    target: [{ target: 'dmg' }],
    artifactName: '${productName}-${version}-${arch}.${ext}',
    // Reproducibly UNSIGNED: never auto-sign with whatever cert happens to be on
    // the build machine (an Apple *Development* cert is worse than unsigned for
    // other users). The afterPack hook ad-hoc signs instead.
    identity: null,
  },

  dmg: { title: '${productName} ${version}' },
};
