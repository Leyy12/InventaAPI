import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = ["services/catalog-contract.js","services/catalog-audit.js","services/catalog-writer.js","services/product-submission-contract.js","services/product-submissions.js","services/product-contract.js","functions/subscription-lifecycle.mjs","tests/adviser/r2a/memory-firestore.mjs","tests/adviser/r2a/submissions.test.mjs","tests/adviser/r2a/wiring.test.mjs","dashboard/src/lib/product-image-url.ts","admin-panel/src/lib/product-image-url.ts","admin-panel/src/lib/submission-review.ts","tests/adviser/r2a/review-ui.test.mjs"];
for (const file of sources) {
  const source = readFileSync(resolve(root, file), 'utf8');
  if (/\b(?:fetch|require)\s*\(|\bprocess\.(?:env|binding|getBuiltinModule)\b|\beval\s*\(|new\s+Function\b/u.test(source)) {
    throw new Error(`Unsafe isolated source: ${file}`);
  }
}
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
  .filter(name => process.env[name]).map(name => [name, process.env[name]]));
Object.assign(env, { NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-inventa-r2a',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:9', ADVISER_TEST_EXTERNAL_IO: 'disabled' });
console.log('[r2a] Fixed module manifest; no SDK, credentials, image fetching or external I/O.');
const result = spawnSync(process.execPath, ['--experimental-strip-types',
  '--experimental-loader', pathToFileURL(resolve(root, 'scripts/adviser-r2a-loader.mjs')).href,
  '--test', '--test-reporter=spec', ...sources.filter(file => file.endsWith('.test.mjs')).map(file => resolve(root, file))],
  { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
