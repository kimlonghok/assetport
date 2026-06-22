// Build script for the AssetPort VS Code extension.
//
// We bundle with esbuild instead of plain `tsc` because the extension depends on
// @napi-rs/image, whose native `.node` binary cannot be bundled. Its loader first
// tries `require('./image.<target>.node')` (a file sitting beside it) before falling
// back to the per-platform npm package. We exploit that: bundle all JS into
// dist/extension.js, leave the native requires external, and copy the host platform's
// `.node` next to the bundle so that first branch resolves at runtime — no node_modules
// needed inside the VSIX.
//
// This produces a VSIX for the HOST platform only. Publishing for other platforms means
// running this build on (or with the binary for) each target and packaging with
// `vsce package --target <platform>`.

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const outdir = path.join(__dirname, 'dist');

// Leave anything that touches a native binary as a runtime require. esbuild resolves
// every require() literal at build time across all of @napi-rs/image's platform
// branches (it can't tell which one runs), so without this it fails on the dozen
// non-host platform packages and on the wasi fallback that isn't even shipped.
const nativeExternalPlugin = {
  name: 'napi-native-external',
  setup(build) {
    const passthrough = (args) => ({ path: args.path, external: true });
    build.onResolve({ filter: /\.node$/ }, passthrough);
    build.onResolve({ filter: /\.wasi\.cjs$/ }, passthrough);
    build.onResolve({ filter: /^@napi-rs\/image-/ }, passthrough);
    build.onResolve({ filter: /^@napi-rs\/wasm-runtime/ }, passthrough);
    build.onResolve({ filter: /^@emnapi\// }, passthrough);
  },
};

// Find the native binary that pnpm/npm installed for THIS platform and copy it beside
// the bundle, keeping its original name (e.g. image.darwin-arm64.node) so the loader's
// `require('./image.<target>.node')` branch finds it.
function copyHostBinary() {
  const imgPkgJson = require.resolve('@napi-rs/image/package.json');
  const imgDir = path.dirname(imgPkgJson);
  const optionalDeps = Object.keys(require(imgPkgJson).optionalDependencies || {});

  for (const dep of optionalDeps) {
    try {
      const depPkgJson = require.resolve(`${dep}/package.json`, { paths: [imgDir] });
      const depDir = path.dirname(depPkgJson);
      const binary = fs.readdirSync(depDir).find((file) => file.endsWith('.node'));
      if (binary) {
        fs.copyFileSync(path.join(depDir, binary), path.join(outdir, binary));
        return binary;
      }
    } catch {
      // Not the host platform's package — keep looking.
    }
  }
  throw new Error('Could not find an installed @napi-rs/image native binary for this platform.');
}

function makeBuildOptions({ production: prod }) {
  return {
    entryPoints: [path.join(__dirname, 'src/extension.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: path.join(outdir, 'extension.js'),
    external: ['vscode'],
    plugins: [nativeExternalPlugin],
    sourcemap: !prod,
    minify: prod,
  };
}

// Build the platform-agnostic JS bundle into a clean dist/. The native `.node` is added
// separately so the same bundle can be reused for every per-platform VSIX.
async function buildBundle({ production: prod = production } = {}) {
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });
  await esbuild.build(makeBuildOptions({ production: prod }));
}

async function run() {
  if (watch) {
    fs.rmSync(outdir, { recursive: true, force: true });
    fs.mkdirSync(outdir, { recursive: true });
    const ctx = await esbuild.context(makeBuildOptions({ production }));
    await ctx.watch();
    copyHostBinary();
    console.log('esbuild: watching for changes...');
    return;
  }

  await buildBundle();
  const binary = copyHostBinary();
  console.log(`Bundled dist/extension.js and copied ${binary}`);
}

// Run as a CLI for local dev/host builds; export the pieces the per-platform packager reuses.
if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildBundle, copyHostBinary, outdir };
