import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of ['services/api-history.js', 'dashboard/src/lib/api-history.ts', 'dashboard/src/lib/api-examples.ts']) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  if (/\b(?:require)\s*\(|\bprocess\.(?:env|binding|getBuiltinModule)\b/u.test(source)) throw new Error('Impure isolated helper');
}
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--experimental-loader', './scripts/adviser-r5b-loader.mjs',
  '--test', '--test-reporter=spec', 'tests/adviser/r5b/history.test.mjs', 'tests/adviser/r5b/ux.test.mjs', 'tests/adviser/r5b/wiring.test.mjs'],
  { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
