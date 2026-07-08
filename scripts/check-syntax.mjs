// Fast syntax gate: parse every source file with the same ESM loader the
// browser uses. Fails the build on the first parse error.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(join(dir, entry.name));
  }
  return out;
}

const files = [...jsFiles('js'), 'sw.js'];
let failed = 0;

for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'pipe' });
    console.log('  ok   ' + f);
  } catch (e) {
    failed++;
    console.error('  FAIL ' + f + '\n' + (e.stderr?.toString() || e.message));
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed syntax check`);
  process.exit(1);
}
console.log(`\n${files.length} files OK`);
