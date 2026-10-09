import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const env = Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','JAVA_HOME','USERPROFILE'].filter(key => process.env[key]).map(key => [key,process.env[key]]));
Object.assign(env, { NODE_ENV:'test', FIREBASE_PROJECT_ID:'demo-inventa-product-media', GCLOUD_PROJECT:'demo-inventa-product-media',
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:9', FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9', CI:'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true' });
const emulator = process.argv.includes('--storage');
env.PRODUCT_MEDIA_TEST_LOOPBACK = emulator ? 'true' : 'false';
const files = emulator ? ['tests/adviser/product-media/storage-emulator.test.mjs']
  : ['tests/adviser/product-media/lifecycle.test.mjs','tests/adviser/product-media/processing.test.mjs','tests/adviser/product-media/csv.test.mjs','tests/adviser/product-media/frontend.test.mjs','tests/adviser/product-media/storage-adapter.test.mjs'];
const result = spawnSync(process.execPath,['--experimental-strip-types','--import','./tests/adviser/product-media/network-guard.mjs',
  '--test','--test-reporter=spec',...files],{ cwd:root,env,stdio:'inherit',windowsHide:true,timeout:180000 });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
