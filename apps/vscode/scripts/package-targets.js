// Build one platform-specific VSIX per VS Code target, all from a single host machine.
//
// Why this works without owning every OS: @napi-rs/image ships each platform's native
// binary as its own npm package (the optionalDependencies of @napi-rs/image). Those are
// just downloadable files, so we `npm pack` the binary for every target — even ones we
// can't run — extract the `.node`, drop it beside the bundle under the exact name the napi
// loader does `require('./image.<target>.node')` for, and run `vsce package --target <t>`.
// The VS Code Marketplace then serves the matching VSIX to each user automatically.
//
// Because we can't load a Windows/Linux binary here, each VSIX is verified after packaging
// by unzipping it and asserting the expected `.node` is present — our stand-in for not
// running the target OS.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { buildBundle, outdir } = require('../esbuild.js');

const cacheDir = path.join(__dirname, '..', '.napi-cache');
const releaseDir = path.join(__dirname, '..', 'release');

// VS Code platform target -> the @napi-rs/image package that carries its native binary.
// Covers ~99% of users. Deliberately skipped: alpine-x64/arm64 (musl), linux-armhf,
// win32-ia32, android/freebsd — publishing is all-or-nothing per platform, so any target
// without a VSIX simply gets no extension. Add a row here to cover one.
const TARGETS = {
  'darwin-arm64': '@napi-rs/image-darwin-arm64',
  'darwin-x64': '@napi-rs/image-darwin-x64',
  'win32-x64': '@napi-rs/image-win32-x64-msvc',
  'win32-arm64': '@napi-rs/image-win32-arm64-msvc',
  'linux-x64': '@napi-rs/image-linux-x64-gnu',
  'linux-arm64': '@napi-rs/image-linux-arm64-gnu',
};

const SKIPPED = ['alpine-x64', 'alpine-arm64', 'linux-armhf', 'win32-ia32'];

// Pin downloaded binaries to the installed @napi-rs/image version so the JS loader's ABI
// expectation and the native binary always match.
function napiVersion() {
  return require('@napi-rs/image/package.json').version;
}

const pkgVersion = require('../package.json').version;

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

// Resolve the `.node` for a target, downloading + extracting it if it isn't already cached.
// The host platform's package is already in node_modules, so reuse that directly.
function ensureBinary(napiPkg, version) {
  // Host platform: pnpm already installed it.
  try {
    const depPkgJson = require.resolve(`${napiPkg}/package.json`);
    const depDir = path.dirname(depPkgJson);
    const binary = fs.readdirSync(depDir).find((f) => f.endsWith('.node'));
    if (binary) return path.join(depDir, binary);
  } catch {
    // Not installed for this host — fall through to download.
  }

  const dest = path.join(cacheDir, napiPkg.replace(/[@/]/g, '_'));
  if (fs.existsSync(dest)) {
    const cached = fs.readdirSync(dest).find((f) => f.endsWith('.node'));
    if (cached) return path.join(dest, cached);
  }

  fs.mkdirSync(dest, { recursive: true });
  // `npm pack` writes a tarball; capture its filename from stdout (last non-empty line).
  const out = execFileSync('npm', ['pack', `${napiPkg}@${version}`, '--pack-destination', dest], {
    encoding: 'utf8',
  });
  const tgz = out.trim().split('\n').filter(Boolean).pop();
  run('tar', ['-xzf', path.join(dest, tgz), '-C', dest, '--strip-components=1']);

  const binary = fs.readdirSync(dest).find((f) => f.endsWith('.node'));
  if (!binary) throw new Error(`No .node found in ${napiPkg}@${version}`);
  return path.join(dest, binary);
}

function cleanNativeFromDist() {
  for (const f of fs.readdirSync(outdir)) {
    if (f.endsWith('.node')) fs.rmSync(path.join(outdir, f));
  }
}

// After packaging we can't run the foreign binary, so prove the VSIX at least contains the
// expected `.node` under the right name — catches download/extraction/naming failures.
function verifyVsix(vsixPath, expectedBinaryName) {
  const listing = execFileSync('unzip', ['-l', vsixPath], { encoding: 'utf8' });
  if (!listing.includes(expectedBinaryName)) {
    throw new Error(`VSIX ${path.basename(vsixPath)} is missing ${expectedBinaryName}`);
  }
}

async function main() {
  const version = napiVersion();
  console.log(`Building all-platform VSIXs (@napi-rs/image@${version})\n`);

  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  // The JS bundle is identical across platforms — build it once, then only swap the binary.
  await buildBundle({ production: true });

  const built = [];
  for (const [target, napiPkg] of Object.entries(TARGETS)) {
    console.log(`\n=== ${target} (${napiPkg}) ===`);
    const binaryPath = ensureBinary(napiPkg, version);
    const binaryName = path.basename(binaryPath);

    cleanNativeFromDist();
    fs.copyFileSync(binaryPath, path.join(outdir, binaryName));

    const vsix = path.join(releaseDir, `assetport-${pkgVersion}-${target}.vsix`);
    run('npx', ['vsce', 'package', '--target', target, '--no-dependencies', '-o', vsix]);
    verifyVsix(vsix, binaryName);
    console.log(`✓ ${path.basename(vsix)} (${binaryName})`);
    built.push(target);
  }

  console.log(`\nDone. ${built.length} VSIXs in release/:`);
  built.forEach((t) => console.log(`  - ${t}`));
  console.log(`\nSkipped targets (no VSIX → no extension for those users): ${SKIPPED.join(', ')}`);
  console.log('Publish with: npx vsce publish --packagePath release/*.vsix (requires a real publisher).');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
