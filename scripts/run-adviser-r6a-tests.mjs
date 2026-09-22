import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of ['services/admin-traffic.js', 'services/api-key-security.js', 'functions/subscription-lifecycle.mjs',
  'services/reporting.js', 'services/product-contract.js', 'admin-panel/src/lib/admin-traffic.ts',
  'tests/adviser/phase2a/memory-firestore.mjs', 'tests/adviser/r6a/backend.test.mjs', 'tests/adviser/r6a/frontend.test.mjs']) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  if (/\b(?:fetch|require)\s*\(|\bprocess\.(?:env|binding|getBuiltinModule)\b|\beval\s*\(|new\s+Function\b/u.test(source)) throw new Error('Impure isolated helper');
}
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--experimental-loader', './scripts/adviser-r6a-loader.mjs',
  '--test', '--test-reporter=spec', 'tests/adviser/r6a/backend.test.mjs', 'tests/adviser/r6a/frontend.test.mjs', 'tests/adviser/r6a/wiring.test.mjs'],
  { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
