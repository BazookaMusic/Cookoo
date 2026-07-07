// Build for deployment.
//
// This app has no bundler — it ships hand-authored ES modules that run directly
// in the browser (keeps the bundle tiny and the source debuggable). "Building"
// therefore means: validate, test, and assemble a clean `dist/` publish folder
// that Netlify (or any static host) serves as-is.

import {
  rmSync, mkdirSync, cpSync, readFileSync, existsSync, statSync, readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const BUDGET_KB = 100; // NFR-2: bundle <= 100KB gzipped (HTML + CSS + JS)

const run = (args) => execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });

// Assets that make up the deployable app.
const ASSETS = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'css',
  'js',
  'icons',
];

function step(msg) { console.log(`\n→ ${msg}`); }

// 1. Validate syntax of every module.
step('Checking syntax');
run([join(ROOT, 'scripts/check-syntax.mjs')]);

// 2. Run the test suite (auto-discovers test/*.test.mjs).
step('Running tests');
run(['--test']);

// 3. Assemble dist/.
step('Assembling dist/');
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const a of ASSETS) {
  const src = join(ROOT, a);
  if (!existsSync(src)) throw new Error(`Missing asset: ${a}`);
  cpSync(src, join(DIST, a), { recursive: true });
}
// Ship the header/redirect config alongside the site if present.
for (const cfg of ['_headers', '_redirects']) {
  if (existsSync(join(ROOT, cfg))) cpSync(join(ROOT, cfg), join(DIST, cfg));
}
console.log('  copied:', ASSETS.join(', '));

// 4. Enforce the gzip bundle budget (HTML + CSS + JS only; audio is synthesised,
//    icons are separate image assets).
step('Checking bundle size');
let bundleBytes = 0;
const codeFiles = [];
walk(DIST, (f) => {
  if (/\.(html|css|js|webmanifest)$/.test(f)) codeFiles.push(f);
});
for (const f of codeFiles) {
  bundleBytes += gzipSync(readFileSync(f)).length;
}
const kb = bundleBytes / 1024;
console.log(`  ${codeFiles.length} code files, ${kb.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`);

// Report the icon weight separately for visibility.
let iconBytes = 0;
walk(join(DIST, 'icons'), (f) => { iconBytes += statSync(f).size; });
console.log(`  icons: ${(iconBytes / 1024).toFixed(1)} KB (raw, not counted against budget)`);

if (kb > BUDGET_KB) {
  console.error(`\n✗ Bundle ${kb.toFixed(1)} KB exceeds ${BUDGET_KB} KB budget`);
  process.exit(1);
}

step(`Build complete → ${DIST}`);

// ---- helpers ----
function walk(dir, fn) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, fn);
    else fn(p);
  }
}
