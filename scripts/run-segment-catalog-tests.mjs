import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = ['functions/entitlement-limits.mjs', 'services/customer-catalog.js', 'services/product-contract.js', 'services/customer-segment.js',
  'dashboard/src/lib/segment-catalog.ts', 'dashboard/src/lib/trial-catalog-selection.ts',
  'dashboard/src/lib/trial-display.mjs', 'dashboard/src/lib/linked-product-selection.ts',
  'tests/adviser/phase2a/memory-firestore.mjs', 'tests/adviser/segment-catalog/catalog.test.mjs',
  'tests/adviser/segment-catalog/customer.test.mjs'];
for (const file of sources) {
  if (/\b(?:fetch|require)\s*\(|\bprocess\.(?:env|binding|getBuiltinModule)\b|\beval\s*\(|new\s+Function\b/u.test(readFileSync(resolve(root, file), 'utf8'))) {
    throw new Error(`Unsafe isolated source: ${file}`);
  }
}
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
Object.assign(env, { NODE_ENV: 'test', ADVISER_TEST_EXTERNAL_IO: 'disabled' });
console.log('[segment-catalog] Fixed manifest; synthetic fixtures only; no SDK, credentials or external I/O.');
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--experimental-loader',
  pathToFileURL(resolve(root, 'scripts/segment-catalog-loader.mjs')).href, '--test', '--test-reporter=spec',
  ...sources.filter(file => file.endsWith('.test.mjs')).map(file => resolve(root, file))], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
