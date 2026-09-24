import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = ['tests/adviser/phase2b2/lifecycle.test.mjs', 'tests/adviser/phase2b2/wiring.test.mjs',
  'tests/adviser/phase2b2/polling.test.mjs'];
const calendarTest = 'tests/adviser/phase2b2/calendar.test.mjs';
const sources = ["functions/subscription-lifecycle.mjs","services/api-key-security.js","services/api-key-management.js","services/account-quota.js","services/daas-catalog.js",'services/product-contract.js', 'services/customer-segment.js',"services/payment-contract.js","services/payment-checkout.js","services/paymongo-checkout.js","services/payment-webhook.js","services/account-deletion.js","services/admin-entitlements.js","tests/adviser/phase2b1/memory-firestore.mjs","tests/adviser/phase2b2/lifecycle.test.mjs","tests/adviser/phase2b2/wiring.test.mjs"];
sources.push('dashboard/src/lib/entitlement-poller.ts', 'tests/adviser/phase2b2/polling.test.mjs', calendarTest);
for (const file of sources) {
  const source = readFileSync(resolve(root, file), 'utf8');
  if (/\b(?:fetch|require)\s*\(|\bprocess\.(?:env|binding|getBuiltinModule)\b|\beval\s*\(|new\s+Function\b/u.test(source)) {
    throw new Error(`Unsafe operation in isolated manifest: ${file}`);
  }
}
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
  .filter(name => process.env[name]).map(name => [name, process.env[name]]));
Object.assign(env, { NODE_ENV: 'test', ADVISER_TEST_EXTERNAL_IO: 'disabled',
  FIREBASE_PROJECT_ID: 'demo-inventa-payment', FIRESTORE_EMULATOR_HOST: '127.0.0.1:9' });
console.log('[phase2b2] Fixed module allowlist; no Firebase SDK, secrets, network, or real provider requests.');
for (const run of [{ files: tests, env }, ...['UTC', 'America/New_York', 'Asia/Manila', 'Europe/Berlin'].map(TZ => ({
  files: [calendarTest], env: { ...env, TZ },
}))]) {
  console.log(`[phase2b2] ${run.env.TZ || 'lifecycle + deterministic polling'} validation`);
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '--experimental-loader', pathToFileURL(resolve(root, 'scripts/adviser-phase2b2-loader.mjs')).href,
    '--test', '--test-reporter=spec', ...run.files.map(file => resolve(root, file)),
  ], { cwd: root, env: run.env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
