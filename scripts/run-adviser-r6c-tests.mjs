import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Do not inherit credentials or load .env. The loader denies network and SDK imports.
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
  .filter(name => process.env[name]).map(name => [name, process.env[name]]));
const result = spawnSync(process.execPath, ['--experimental-loader', './scripts/adviser-r6c-loader.mjs',
  '--test', '--test-reporter=spec', 'tests/adviser/r6c/payment-mode.test.mjs', 'tests/adviser/r6c/wiring.test.mjs'],
{ cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
