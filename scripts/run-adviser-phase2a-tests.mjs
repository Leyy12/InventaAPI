import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = ['tests/adviser/phase2a/api-key-security.test.mjs', 'tests/adviser/phase2a/rules-and-wiring.test.mjs'];
const sources = [
  ...tests, 'tests/adviser/phase2a/memory-firestore.mjs',
  'services/api-key-security.js', 'services/api-key-management.js', 'services/account-quota.js',
  'services/daas-security.js', 'services/daas-catalog.js', 'services/product-contract.js',
];
for (const file of sources) {
  const source = readFileSync(resolve(root, file), 'utf8');
  if (/\b(?:fetch|require)\s*\(|\bprocess\.(?:env|binding|getBuiltinModule)\b|\beval\s*\(|new\s+Function\b/u.test(source)) {
    throw new Error(`Unsafe runtime operation in isolated manifest: ${file}`);
  }
}

// Do not inherit NODE_OPTIONS, service credentials, SDK configuration, or secrets.
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
  .filter(name => process.env[name]).map(name => [name, process.env[name]]));
Object.assign(env, {
  NODE_ENV: 'test', ADVISER_TEST_EXTERNAL_IO: 'disabled',
  FIREBASE_PROJECT_ID: 'demo-inventaapi-adviser-phase2a',
  GCLOUD_PROJECT: 'demo-inventaapi-adviser-phase2a',
  GOOGLE_CLOUD_PROJECT: 'demo-inventaapi-adviser-phase2a',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:9', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9',
});
console.log('[adviser-phase2a] Fixed module allowlist; SDK/network imports and global network APIs blocked.');
console.log('[adviser-phase2a] In-memory transactions and static rules evidence only; no emulator or production access.');
const result = spawnSync(process.execPath, [
  '--experimental-loader', pathToFileURL(resolve(root, 'scripts/adviser-phase2a-loader.mjs')).href,
  '--test', '--test-reporter=spec', ...tests.map(file => resolve(root, file)),
], { cwd: root, env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
