import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = ["functions/subscription-lifecycle.mjs","services/free-trial.js","services/api-key-security.js","services/api-key-management.js","services/account-quota.js","services/daas-security.js","services/daas-catalog.js","services/product-contract.js","services/customer-segment.js","services/reporting.js","services/product-submissions.js","services/product-submission-contract.js","services/catalog-audit.js","services/catalog-writer.js","services/catalog-contract.js","tests/adviser/phase2a/memory-firestore.mjs","tests/adviser/r2a/memory-firestore.mjs","dashboard/src/lib/entitlement-poller.ts","tests/adviser/free-trial/trial.test.mjs"];
for (const file of sources) {
  const source = readFileSync(resolve(root, file), 'utf8');
  if (/\b(?:fetch|require)\s*\(|\bprocess\.(?:env|binding|getBuiltinModule)\b|\beval\s*\(|new\s+Function\b/u.test(source)) {
    throw new Error(`Unsafe isolated source: ${file}`);
  }
}
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
  .filter(name => process.env[name]).map(name => [name, process.env[name]]));
Object.assign(env, { NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-inventa-free-trial',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:9', ADVISER_TEST_EXTERNAL_IO: 'disabled' });
console.log('[free-trial] Fixed module manifest; no SDK, credentials, image fetching or external I/O.');
const result = spawnSync(process.execPath, ['--experimental-strip-types',
  '--experimental-loader', pathToFileURL(resolve(root, 'scripts/adviser-free-trial-loader.mjs')).href,
  '--test', '--test-reporter=spec', ...sources.filter(file => file.endsWith('.test.mjs')).map(file => resolve(root, file))],
  { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
