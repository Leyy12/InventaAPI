import { readFile, lstat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportFrozenCatalog, validateTarget, validateCredential, ExportError, fail } from './frozen-catalog-export.mjs';
import { createReadOnlyAdapter } from './frozen-catalog-rest.mjs';

export function parseArguments(args) {
  const names = { '--project': 'project', '--confirm-project': 'confirmProject', '--database': 'database',
    '--confirm-database': 'confirmDatabase', '--output': 'output', '--credentials': 'credentials' };
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = Object.hasOwn(names, args[i]) ? names[args[i]] : undefined;
    if (!name || Object.hasOwn(options, name) || typeof args[i + 1] !== 'string' || args[i + 1].startsWith('--')) fail('INVALID ARGUMENTS');
    options[name] = args[i + 1];
  }
  validateTarget(options);
  if (!isAbsolute(options.credentials || '') || resolve(options.credentials) === resolve(options.output)
    || resolve(options.credentials) === resolve(`${options.output}.evidence.json`)) fail('EXPLICIT CREDENTIAL FILE REQUIRED');
  return options;
}
export async function main(args) {
  try {
    const options = parseArguments(args);
    // Explicit file only: no dotenv, database/firebase bootstrap, CLI aliases or ADC.
    const stat = await lstat(options.credentials);
    if (!stat.isFile() || stat.size > 65536) fail('INVALID CREDENTIAL FILE');
    const credential = validateCredential(JSON.parse(await readFile(options.credentials, 'utf8')), options.project);
    if (['FIRESTORE_EMULATOR_HOST', 'GOOGLE_API_USE_MTLS_ENDPOINT', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY',
      'https_proxy', 'http_proxy', 'all_proxy'].some(name => process.env[name])) fail('UNSUPPORTED TRANSPORT ENVIRONMENT');
    const { JWT } = await import('google-auth-library');
    const client = new JWT({ email: credential.client_email, key: credential.private_key,
      scopes: ['https://www.googleapis.com/auth/datastore'] });
    const adapter = createReadOnlyAdapter(options, {
      accessToken: async () => (await client.getAccessToken()).token,
      transport: globalThis.fetch,
    });
    const evidence = await exportFrozenCatalog(options, adapter);
    console.log(JSON.stringify({ status: 'EXPORT COMPLETE', counts: evidence.counts, sha256: evidence.sha256 }));
    return 0;
  } catch (error) {
    // Never emit raw SDK/network/filesystem errors: they may carry credentials/data.
    console.error(error instanceof ExportError ? error.message : 'EXPORT FAILED; NO SUCCESS REPORTED');
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
