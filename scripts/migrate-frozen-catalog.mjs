import { readFile, lstat, mkdir, open } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCredential, sha256 } from './frozen-catalog-export.mjs';
import { REPAIR_IDS, REVIEWED_EXPORT_SHA256, repairFrozenProducts } from './frozen-catalog-repair.mjs';
import { backfillCatalogReservations, inspectFrozenCatalog } from '../services/catalog-writer.js';

export function parseMigrationArguments(args) {
  const names = ['operation', 'project', 'confirm-project', 'database', 'confirm-database', 'credentials', 'evidence-dir', 'source-export'];
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2);
    if (!args[i]?.startsWith('--') || !names.includes(key) || Object.hasOwn(options, key)
      || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('R8C EXPLICIT ARGUMENTS REQUIRED');
    options[key] = args[i + 1];
  }
  if (options.project !== 'inventaapi-db' || options['confirm-project'] !== options.project
    || options.database !== '(default)' || options['confirm-database'] !== options.database) throw Error('R8C TARGET MISMATCH');
  if (!['repair', 'backfill'].includes(options.operation) || !isAbsolute(options.credentials || '')
    || !isAbsolute(options['evidence-dir'] || '') || (options.operation === 'repair' && !isAbsolute(options['source-export'] || ''))
    || (options.operation === 'backfill' && options['source-export'] !== undefined)) throw Error('R8C INVALID OPERATION OR PATH');
  return options;
}

export function verifiedRepairSource(bytes) {
  if (sha256(bytes) !== REVIEWED_EXPORT_SHA256) throw Error('R8C REVIEWED EXPORT HASH MISMATCH');
  const source = JSON.parse(bytes);
  const records = source.products.filter(row => REPAIR_IDS.includes(row.id));
  if (records.length !== 6) throw Error('R8C SIX RECORDS REQUIRED');
  return records;
}

async function durableEvidence(directory, name, data) {
  const handle = await open(resolve(directory, name), 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
}

export async function main(args) {
  let app, db, deleteApp, stage = 'preflight';
  try {
    const options = parseMigrationArguments(args);
    if (['FIRESTORE_EMULATOR_HOST', 'GOOGLE_API_USE_MTLS_ENDPOINT', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY',
      'https_proxy', 'http_proxy', 'all_proxy'].some(name => process.env[name])) throw Error('R8C UNSUPPORTED TRANSPORT ENVIRONMENT');
    const stat = await lstat(options.credentials);
    if (!stat.isFile() || stat.size > 65536) throw Error('R8C INVALID CREDENTIAL FILE');
    const credential = validateCredential(JSON.parse(await readFile(options.credentials, 'utf8')), options.project);
    const reviewed = options.operation === 'repair' ? verifiedRepairSource(await readFile(options['source-export'], 'utf8')) : null;
    // Exclusive directory: never overwrite prior evidence, including uncertain runs.
    await mkdir(options['evidence-dir']);
    const save = (name, data) => durableEvidence(options['evidence-dir'], name, data);
    await save('started.json', { project: options.project, database: options.database, operation: options.operation,
      startedAt: new Date().toISOString(), reviewedExportSha256: reviewed ? REVIEWED_EXPORT_SHA256 : null });
    const sdk = await import('firebase-admin/app');
    deleteApp = sdk.deleteApp;
    app = sdk.initializeApp({ projectId: options.project, credential: sdk.cert({ projectId: options.project,
      clientEmail: credential.client_email, privateKey: credential.private_key }) }, 'r8c-frozen-migration');
    const { getFirestore } = await import('firebase-admin/firestore');
    db = getFirestore(app); // Explicitly confirmed (default); no ADC/env bootstrap.
    stage = 'operation-or-readback';
    let result;
    if (reviewed) {
      result = await repairFrozenProducts(db, reviewed, {
        before: data => save('before.json', data), after: data => save('after.json', data),
      });
    } else {
      const before = await db.runTransaction(tx => inspectFrozenCatalog(tx, db));
      await save('before.json', { frozen: true, required: before.required, remaining: before.missing.length,
        alreadyValid: before.alreadyValid, selectedIds: before.missing.slice(0, 400).map(row => row.id) });
      result = await backfillCatalogReservations(db, new Date().toISOString());
      await save('after.json', result);
    }
    await save('complete.json', { ...result, completedAt: new Date().toISOString() });
    console.log(JSON.stringify(result));
    return 0;
  } catch {
    // Never expose SDK exceptions, tokens, headers, credentials or product content.
    console.error(`R8C FAILED (${stage}); KEEP FROZEN. Inspect evidence and persisted state before retry; a commit may have succeeded.`);
    return 1;
  } finally {
    if (db) await db.terminate().catch(() => {});
    if (app) await deleteApp(app).catch(() => {});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
