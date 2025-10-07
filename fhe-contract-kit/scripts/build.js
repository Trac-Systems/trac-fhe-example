// Build script that compiles the Rust N-API addon via Cargo and
// copies the produced .node artifact to ./dist/
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const nativeDir = path.join(__dirname, '..', 'native');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status);
}

console.log('[fhe-contract-kit] building native addon with cargo --release ...');
run('cargo', ['build', '--release'], nativeDir);

const target = path.join(nativeDir, 'target', 'release');
const files = fs.readdirSync(target);
const nodeFile = files.find(f => f.endsWith('.node'));
if (!nodeFile) {
  console.error('Could not find .node artifact in target/release. Is Rust + napi-build set up?');
  process.exit(1);
}

const distDir = path.join(__dirname, '..', 'dist');
fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.join(target, nodeFile), path.join(distDir, 'fhe_node.node'));
console.log('[fhe-contract-kit] copied', nodeFile, '=> dist/fhe_node.node');
