import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { NODE_ENV: 'test', PRODUCT_MEDIA_TEST_LOOPBACK: 'true',
  PRODUCT_MEDIA_TEST_BEFORE: String(process.argv.includes('--before')), CI: 'true' });
const result = spawnSync(process.execPath, ['--import', './tests/adviser/product-media/network-guard.mjs',
  '--test', '--test-reporter=spec', 'tests/adviser/product-media/http-response.test.mjs',
  'tests/adviser/product-media/browser-delivery.test.mjs', 'tests/adviser/product-media/rate-limit.test.mjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit', windowsHide: true, timeout: 120000,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
