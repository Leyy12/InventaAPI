import { createHash } from 'node:crypto';
import { lstat, mkdtemp, open, link, unlink, rm } from 'node:fs/promises';
import { dirname, basename, isAbsolute, join } from 'node:path';

export const EXPORTER_VERSION = 'r7c-v1';
export const COLLECTIONS = Object.freeze(['products', 'product_submission_identity']);
export class ExportError extends Error {}
export function fail(code) { throw new ExportError(code); }
export function validateTarget(options) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(options.project || '')) fail('EXPLICIT PROJECT REQUIRED');
  if (options.confirmProject !== options.project) fail('PROJECT CONFIRMATION MISMATCH');
  if (options.database !== '(default)') fail('EXPLICIT DATABASE (default) REQUIRED');
  if (options.confirmDatabase !== options.database) fail('DATABASE CONFIRMATION MISMATCH');
  if (!isAbsolute(options.output || '') || !options.output.endsWith('.json')) fail('ABSOLUTE JSON OUTPUT REQUIRED');
}
export function validateCredential(credential, project) {
  if (credential?.project_id !== project) fail('CREDENTIAL PROJECT MISMATCH');
  if (credential.type !== 'service_account' || typeof credential.client_email !== 'string'
    || !credential.client_email.endsWith(`@${project}.iam.gserviceaccount.com`)
    || typeof credential.private_key !== 'string' || !credential.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
    fail('EXPLICIT SERVICE ACCOUNT CREDENTIAL REQUIRED');
  }
  // Return only required fields: never honor token_uri, universe_domain or other endpoints from JSON.
  return { project_id: project, client_email: credential.client_email, private_key: credential.private_key };
}
export const sha256 = text => createHash('sha256').update(text).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/u.test(value)
  && Number.isFinite(Date.parse(value));
const sensitiveKey = /^(?:private_?key|access_?token|refresh_?token|password|client_?secret|authorization|paymongo.*secret|webhook.*secret|firebase.*private.*key)$/iu;
const sensitiveValue = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\b(?:sk_(?:test|live)_|whsk_|ya29\.)|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/u;

// Preserve JSON-native audit inputs, never coerce identity or price fields.
// Special types are rejected except tagged top-level bookkeeping timestamps,
// which R3 does not consume. No Date millisecond truncation.
export function decodeFields(fields = {}, path = []) {
  if (!object(fields)) fail('INVALID FIRESTORE FIELDS');
  return Object.fromEntries(Object.keys(fields).sort().map(key => {
    if (sensitiveKey.test(key)) fail('SENSITIVE CATALOG FIELD REJECTED');
    return [key, decodeValue(fields[key], [...path, key])];
  }));
}
export function decodeValue(value, path = []) {
  if (!object(value) || Object.keys(value).length !== 1) fail('INVALID FIRESTORE VALUE');
  const [type] = Object.keys(value), raw = value[type];
  if (type === 'nullValue' && raw === null) return null;
  if (type === 'booleanValue' && typeof raw === 'boolean') return raw;
  if (type === 'stringValue' && typeof raw === 'string') {
    if (sensitiveValue.test(raw)) fail('SENSITIVE CATALOG VALUE REJECTED');
    return raw;
  }
  if (type === 'integerValue' && typeof raw === 'string' && /^-?(?:0|[1-9]\d*)$/u.test(raw)
    && Number.isSafeInteger(Number(raw)) && !Object.is(Number(raw), -0)) return Number(raw);
  if (type === 'doubleValue' && typeof raw === 'number' && Number.isFinite(raw) && !Object.is(raw, -0)) return raw;
  if (type === 'mapValue' && object(raw) && Object.keys(raw).every(key => key === 'fields')) return decodeFields(raw.fields, path);
  if (type === 'arrayValue' && object(raw) && Object.keys(raw).every(key => key === 'values')
    && (raw.values === undefined || Array.isArray(raw.values))) return (raw.values || []).map((item, i) => decodeValue(item, [...path, i]));
  if (type === 'timestampValue' && time(raw) && path.length === 1
    && ['createdAt', 'updatedAt', 'created_at', 'updated_at', 'reviewedAt'].includes(path[0])) {
    return { $firestoreType: 'timestamp', value: raw };
  }
  fail('UNSUPPORTED OR LOSSY FIRESTORE TYPE');
}
function controlEvidence(document, root) {
  if (document?.name !== `${root}/catalog_control/writer` || document.fields?.frozen?.booleanValue !== true
    || Object.keys(document.fields.frozen).length !== 1 || !time(document.updateTime)) fail('FROZEN CONTROL REQUIRED');
  return { frozen: true, updateTime: document.updateTime };
}
function validCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) fail('INVALID COLLECTION COUNT');
  return count;
}
async function scan(adapter, collection, expected, root) {
  const records = [], versions = [], tokens = new Set();
  let token, previous;
  do {
    const page = await adapter.page(collection, token);
    if (!object(page) || (page.documents !== undefined && !Array.isArray(page.documents))) fail('INVALID PAGE');
    const docs = page.documents || [];
    if (docs.length > 500) fail('INVALID PAGE SIZE');
    for (const doc of docs) {
      const prefix = `${root}/${collection}/`;
      if (typeof doc.name !== 'string' || !doc.name.startsWith(prefix)) fail('DOCUMENT TARGET MISMATCH');
      const id = doc.name.slice(prefix.length);
      if (!id || id.includes('/') || !time(doc.updateTime)) fail('INVALID DOCUMENT METADATA');
      if (previous !== undefined && Buffer.compare(Buffer.from(previous), Buffer.from(id)) >= 0) fail('DUPLICATE OR UNORDERED DOCUMENT');
      previous = id;
      // Check before decoding/storing a 5,001st product; never silently truncate.
      if (collection === 'products' && records.length === 5000) fail('PRODUCT CAP EXCEEDED');
      const data = decodeFields(doc.fields);
      records.push({ id, data });
      versions.push([id, doc.updateTime, sha256(JSON.stringify(data))]);
      if (records.length > expected) fail('COLLECTION COUNT CHANGED');
    }
    const next = page.nextPageToken;
    if (next !== undefined && (typeof next !== 'string' || !next || tokens.has(next) || !docs.length)) fail('INCOMPLETE OR REPEATED PAGE');
    if (next) tokens.add(next);
    token = next;
  } while (token);
  if (records.length !== expected) fail('INCOMPLETE COLLECTION');
  return { records, versions };
}
async function absent(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail('OUTPUT EXISTS');
}
async function durableWrite(path, content) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
}

// Adapter capability is deliberately only control/count/page (no write methods).
export async function exportFrozenCatalog(options, adapter, { now = () => new Date() } = {}) {
  validateTarget(options);
  const root = `projects/${options.project}/databases/${options.database}/documents`;
  if (adapter.target !== root) fail('ADAPTER TARGET MISMATCH');
  const evidencePath = `${options.output}.evidence.json`;
  await absent(options.output); await absent(evidencePath);
  const startedAt = now().toISOString();
  const temp = await mkdtemp(join(dirname(options.output), '.r7c-export-'));
  let evidencePublished = false, artifactPublished = false;
  try {
    const precheck = controlEvidence(await adapter.control(), root);
    const counts = {}, first = {};
    for (const collection of COLLECTIONS) {
      counts[collection] = validCount(await adapter.count(collection));
      if (collection === 'products' && counts[collection] > 5000) fail('PRODUCT CAP EXCEEDED');
      first[collection] = await scan(adapter, collection, counts[collection], root);
    }
    for (const collection of COLLECTIONS) {
      const second = await scan(adapter, collection, counts[collection], root);
      if (JSON.stringify(first[collection].versions) !== JSON.stringify(second.versions)
        || validCount(await adapter.count(collection)) !== counts[collection]) fail('COLLECTION UNSTABLE');
    }
    const postcheck = controlEvidence(await adapter.control(), root);
    if (precheck.updateTime !== postcheck.updateTime) fail('FROZEN CONTROL CHANGED');
    const artifact = JSON.stringify({ products: first.products.records, reservations: first.product_submission_identity.records }, null, 2) + '\n';
    const evidence = { exporterVersion: EXPORTER_VERSION, project: options.project, database: options.database,
      startedAt, completedAt: now().toISOString(), counts, precheck, postcheck,
      stability: 'PASS: two ordered ID/updateTime/content passes and independent counts',
      artifact: basename(options.output), sha256: sha256(artifact) };
    await durableWrite(join(temp, 'catalog.json'), artifact);
    await durableWrite(join(temp, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    // Hard links publish complete bytes exclusively: unlike rename, never overwrite
    // a concurrent destination. The final catalog is the last success marker.
    await link(join(temp, 'evidence.json'), evidencePath); evidencePublished = true;
    await link(join(temp, 'catalog.json'), options.output); artifactPublished = true;
    return evidence;
  } finally {
    if (evidencePublished && !artifactPublished) await unlink(evidencePath).catch(() => {});
    await rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}
