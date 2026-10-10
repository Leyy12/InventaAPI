import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { NODE_ENV: 'test', PRODUCT_MEDIA_TEST_LOOPBACK: 'false' });
const result = spawnSync(process.execPath, ['--import', './tests/adviser/product-media/network-guard.mjs', '--test', '--test-reporter=spec',
  'tests/r0/firebase-initialization.test.mjs', 'tests/r0/release-config.test.mjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit', windowsHide: true, timeout: 60000,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
