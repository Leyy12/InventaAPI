import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = ['tests/adviser/phase2b1/payment.test.mjs', 'tests/adviser/phase2b1/wiring.test.mjs'];
const sources = [...tests, 'functions/subscription-lifecycle.mjs', 'tests/adviser/phase2b1/memory-firestore.mjs', 'services/api-key-security.js',
  'services/payment-contract.js', 'services/paymongo-checkout.js', 'services/payment-checkout.js', 'services/payment-webhook.js'];
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
console.log('[phase2b1] Fixed module allowlist; no Firebase SDK, secrets, network, or real provider requests.');
const result = spawnSync(process.execPath, [
  '--experimental-loader', pathToFileURL(resolve(root, 'scripts/adviser-phase2b1-loader.mjs')).href,
  '--test', '--test-reporter=spec', ...tests.map(file => resolve(root, file)),
], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
