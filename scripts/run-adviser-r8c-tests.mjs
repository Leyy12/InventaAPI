import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
  .filter(name => process.env[name]).map(name => [name, process.env[name]]));
const result = spawnSync(process.execPath, ['--experimental-loader', './scripts/adviser-r8c-loader.mjs',
  '--test', '--test-reporter=spec', 'tests/adviser/r8c/migration.test.mjs'],
{ cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
