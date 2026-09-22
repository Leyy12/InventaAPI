import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportFrozenCatalog, validateCredential, validateTarget, decodeValue, sha256 } from '../../../scripts/frozen-catalog-export.mjs';
import { createReadOnlyAdapter } from '../../../scripts/frozen-catalog-rest.mjs';
import { parseArguments, main } from '../../../scripts/export-frozen-catalog.mjs';

const project = 'demo-r7c-export', database = '(default)';
const root = `projects/${project}/databases/${database}/documents`;
const version = '2026-09-22T00:00:00.123456Z';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const credential = { type: 'service_account', project_id: project, client_email: `fixture@${project}.iam.gserviceaccount.com`,
  private_key: '-----BEGIN PRIVATE KEY-----\nSYNTHETIC_NOT_A_KEY\n-----END PRIVATE KEY-----' };
function encode(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  return typeof value === 'number' ? { doubleValue: value } : { [`${typeof value}Value`]: value };
}
const document = (collection, id, data) => ({ name: `${root}/${collection}/${id}`, updateTime: version, fields: encode(data).mapValue.fields });
const product = i => document('products', `p${String(i).padStart(5, '0')}`, {
  name: `Fixture ${i}`, category: 'Drinks', segment: 'Grocery', sku: `SKU-${i}`, price: 10,
  status: ['Active', 'Inactive', 'Archived', 'Unpublished'][i % 4], variants: [{ sku: `SKU-${i}`, price: 10 }],
});
async function fixture(t, productCount = 2, identityCount = 0) {
  const directory = await mkdtemp(join(tmpdir(), 'inventa-r7c-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { project, confirmProject: project, database, confirmDatabase: database, output: join(directory, 'catalog.json') };
  const data = { products: Array.from({ length: productCount }, (_, i) => product(i)),
    product_submission_identity: Array.from({ length: identityCount }, (_, i) => document('product_submission_identity', `r${String(i).padStart(5, '0')}`,
      { identity: `sku:OLD-${i}`, productId: `old-${i}`, state: i % 2 ? 'retired' : 'deleted' })) };
  const calls = [];
  const adapter = { target: root,
    async control() { calls.push('control'); return document('catalog_control', 'writer', { frozen: true, private_key: 'not exported' }); },
    async count(name) { calls.push(`count:${name}`); return data[name].length; },
    async page(name, token) {
      calls.push(`page:${name}`);
      const start = Number(token || 0), end = start + 500;
      return { documents: structuredClone(data[name].slice(start, end)), ...(end < data[name].length ? { nextPageToken: String(end) } : {}) };
    } };
  return { directory, options, data, calls, adapter,
    run: () => exportFrozenCatalog(options, adapter),
    artifact: async () => JSON.parse(await readFile(options.output, 'utf8')) };
}
async function noArtifact(f) {
  await assert.rejects(access(f.options.output));
  await assert.rejects(access(`${f.options.output}.evidence.json`));
  assert.equal((await readdir(f.directory)).some(name => name.startsWith('.r7c-export-')), false);
}

for (const [name, patch] of [
  ['project required', { project: undefined }], ['database required', { database: undefined }],
  ['target mismatch', { confirmProject: 'other-project' }], ['database confirmation mismatch', { confirmDatabase: 'other' }],
  ['named database not silently selected', { database: 'other', confirmDatabase: 'other' }],
  ['output required', { output: undefined }], ['relative output rejected', { output: 'catalog.json' }],
]) test(name, async t => {
  const f = await fixture(t); Object.assign(f.options, patch);
  await assert.rejects(f.run); assert.deepEqual(f.calls, []);
});
test('credential project mismatch and missing metadata fail closed', () => {
  for (const project_id of [undefined, '', 'other-project']) assert.throws(() => validateCredential({ ...credential, project_id }, project), /CREDENTIAL PROJECT MISMATCH/u);
});
test('credential validation retains only explicit service-account material', () => {
  assert.deepEqual(Object.keys(validateCredential({ ...credential, token_uri: 'https://evil.invalid', refresh_token: 'secret' }, project)).sort(),
    ['client_email', 'private_key', 'project_id']);
  for (const patch of [{ type: 'authorized_user' }, { private_key: undefined }, { client_email: 'other@example.invalid' }]) {
    assert.throws(() => validateCredential({ ...credential, ...patch }, project));
  }
});
test('CLI requires every flag and disallows overwrite/cap/unknown/duplicate switches', async t => {
  const f = await fixture(t), args = ['--project', project, '--confirm-project', project, '--database', database,
    '--confirm-database', database, '--output', f.options.output, '--credentials', join(f.directory, 'synthetic.json')];
  assert.equal(parseArguments(args).project, project);
  for (const flag of ['--overwrite', '--max-products', '--project', '--endpoint', 'constructor', '__proto__']) assert.throws(() => parseArguments([...args, flag, 'anything']));
  assert.throws(() => parseArguments(args.slice(0, -2)));
  assert.throws(() => parseArguments([...args.slice(0, -1), f.options.output]));
});
for (const [name, control] of [
  ['missing control', undefined], ['frozen missing', {}], ['frozen=false', { frozen: false }],
  ['frozen string', { frozen: 'true' }], ['frozen number', { frozen: 1 }],
]) test(name, async t => {
  const f = await fixture(t); f.adapter.control = async () => control && document('catalog_control', 'writer', control);
  await assert.rejects(f.run, /FROZEN CONTROL REQUIRED/u); assert.deepEqual(f.calls, []); await noArtifact(f);
});
test('unreadable control aborts before catalog reads', async t => {
  const f = await fixture(t); f.adapter.control = async () => { throw new Error('denied'); };
  await assert.rejects(f.run); assert.deepEqual(f.calls, []); await noArtifact(f);
});
test('frozen true, zero identities, all visibility states, metadata/hash and no secrets', async t => {
  const f = await fixture(t, 4), evidence = await f.run(), artifact = await f.artifact();
  assert.equal(artifact.products.length, 4); assert.deepEqual(artifact.reservations, []);
  assert.equal(evidence.counts.product_submission_identity, 0);
  assert.equal(evidence.precheck.frozen, true); assert.equal(evidence.postcheck.frozen, true);
  assert.equal(evidence.sha256, sha256(await readFile(f.options.output, 'utf8')));
  assert.equal(JSON.stringify(evidence).includes('private_key'), false);
  assert.equal(evidence.project, project); assert.equal(evidence.database, database);
  assert.ok(f.calls.includes('page:product_submission_identity'));
  assert.deepEqual((await readdir(f.directory)).sort(), ['catalog.json', 'catalog.json.evidence.json']);
});
test('exactly 5,000 products accepted without truncation', async t => {
  const f = await fixture(t, 5000); assert.equal((await f.run()).counts.products, 5000);
  assert.equal((await f.artifact()).products.at(-1).id, 'p04999');
});
test('5,001 products rejected by independent count', async t => {
  const f = await fixture(t, 5001); await assert.rejects(f.run, /PRODUCT CAP EXCEEDED/u); await noArtifact(f);
});
test('5,001st streamed product rejected even if initial count is stale', async t => {
  const f = await fixture(t, 5001); f.adapter.count = async () => 5000;
  await assert.rejects(f.run, /PRODUCT CAP EXCEEDED/u); await noArtifact(f);
});
test('more than 400 existing identities accepted including retired/deleted claims', async t => {
  const f = await fixture(t, 0, 901); await f.run();
  assert.equal((await f.artifact()).reservations.length, 901);
});
test('deterministic JSON field and document ordering', async t => {
  const f = await fixture(t); await f.run();
  const bytes = await readFile(f.options.output, 'utf8');
  f.options.output = join(f.directory, 'second.json');
  for (const doc of f.data.products) doc.fields = Object.fromEntries(Object.entries(doc.fields).reverse());
  await f.run(); assert.equal(await readFile(f.options.output, 'utf8'), bytes);
});
for (const fault of ['duplicate', 'missing-page', 'empty-continuation', 'repeated-token', 'wrong-target', 'missing-version', 'unordered']) {
  test('pagination fails closed: ' + fault, async t => {
    const f = await fixture(t, 501), original = f.adapter.page;
    f.adapter.page = async (name, token) => {
      const page = await original(name, token);
      if (name === 'products') {
        if (fault === 'duplicate' && token) page.documents[0] = product(0);
        if (fault === 'missing-page') delete page.nextPageToken;
        if (fault === 'empty-continuation') page.documents = [];
        if (fault === 'repeated-token') page.nextPageToken = '500';
        if (fault === 'wrong-target') page.documents[0].name = 'projects/other/databases/(default)/documents/products/a';
        if (fault === 'missing-version') delete page.documents[0].updateTime;
        if (fault === 'unordered') page.documents.reverse();
      }
      return page;
    };
    await assert.rejects(f.run); await noArtifact(f);
  });
}
for (const kind of ['false', 'missing', 'updated-while-true']) test('freeze changes mid-export: ' + kind, async t => {
  const f = await fixture(t), original = f.adapter.control; let reads = 0;
  f.adapter.control = async () => {
    const doc = await original();
    if (++reads === 2) {
      if (kind === 'missing') return undefined;
      if (kind === 'false') doc.fields.frozen.booleanValue = false;
      else doc.updateTime = '2026-09-22T01:00:00Z';
    }
    return doc;
  };
  await assert.rejects(f.run); await noArtifact(f);
});
for (const collection of ['products', 'product_submission_identity']) for (const fault of ['version', 'id', 'content', 'count']) {
  test(`${collection} instability: ${fault}`, async t => {
    const f = await fixture(t, 1, 1), original = f.adapter.page; let passes = 0;
    f.adapter.page = async (name, token) => {
      const page = await original(name, token);
      if (name === collection && ++passes === 2) {
        if (fault === 'version') page.documents[0].updateTime = '2026-09-22T01:00:00Z';
        if (fault === 'id') page.documents[0].name += 'changed';
        if (fault === 'content') page.documents[0].fields.extra = { stringValue: 'changed' };
        if (fault === 'count') page.documents = [];
      }
      return page;
    };
    await assert.rejects(f.run); await noArtifact(f);
  });
}
for (const suffix of ['', '.evidence.json']) test('existing output refused: ' + (suffix || 'artifact'), async t => {
  const f = await fixture(t); await writeFile(f.options.output + suffix, 'preserve');
  await assert.rejects(f.run, /OUTPUT EXISTS/u); assert.deepEqual(f.calls, []);
  assert.equal(await readFile(f.options.output + suffix, 'utf8'), 'preserve');
});
test('concurrent output creation is not overwritten and own evidence is cleaned', async t => {
  const f = await fixture(t), original = f.adapter.control; let calls = 0;
  f.adapter.control = async () => { if (++calls === 2) await writeFile(f.options.output, 'concurrent'); return original(); };
  await assert.rejects(f.run); assert.equal(await readFile(f.options.output, 'utf8'), 'concurrent');
  await assert.rejects(access(f.options.output + '.evidence.json'));
});
test('special bookkeeping timestamps retain nanoseconds; semantic timestamps rejected', () => {
  const timestamp = '2026-09-22T00:00:00.123456789Z';
  assert.deepEqual(decodeValue({ timestampValue: timestamp }, ['createdAt']), { $firestoreType: 'timestamp', value: timestamp });
  assert.throws(() => decodeValue({ timestampValue: timestamp }, ['price']));
});
for (const value of [{ geoPointValue: { latitude: 1, longitude: 2 } }, { referenceValue: 'projects/demo/documents/a/b' },
  { bytesValue: 'AA==' }, { integerValue: '9007199254740993' }, { doubleValue: 'NaN' }, { doubleValue: -0 }, { futureType: 1 }]) {
  test('unsupported/lossy Firestore value rejected: ' + Object.keys(value)[0] + JSON.stringify(value), () => assert.throws(() => decodeValue(value)));
}
for (const data of [{ private_key: 'sentinel' }, { nested: { accessToken: 'sentinel' } }, { note: 'sk_test_synthetic' }]) {
  test('sensitive catalog data aborts without output: ' + Object.keys(data)[0], async t => {
    const f = await fixture(t); f.data.products[0].fields = encode(data).mapValue.fields;
    await assert.rejects(f.run, /SENSITIVE/u); await noArtifact(f);
  });
}
test('direct unchanged R3 audit accepts generated artifact', async t => {
  const f = await fixture(t); await f.run();
  const result = spawnSync(process.execPath, ['--experimental-loader', './scripts/adviser-r7c-loader.mjs',
    'scripts/audit-catalog-identities.mjs', f.options.output], { cwd: repo, env: process.env, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).ok, true);
});
test('production adapter behavior permits only exact read operations', async t => {
  const f = await fixture(t), requests = [];
  const adapter = createReadOnlyAdapter(f.options, { accessToken: async () => 'synthetic-token',
    transport: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(options.method === 'POST'
        ? [{ result: { aggregateFields: { total: { integerValue: '0' } } } }] : {}));
    } });
  await adapter.control(); for (const name of ['products', 'product_submission_identity']) { await adapter.page(name); await adapter.count(name); }
  assert.deepEqual(Object.keys(adapter).sort(), ['control', 'count', 'page', 'target']);
  for (const { url, options } of requests) {
    assert.ok(url.startsWith(`https://firestore.googleapis.com/v1/${root}`)); assert.equal(options.redirect, 'error');
    if (options.method === 'POST') {
      assert.ok(url.endsWith(':runAggregationQuery'));
      const body = JSON.parse(options.body); assert.deepEqual(Object.keys(body), ['structuredAggregationQuery']);
      assert.deepEqual(body.structuredAggregationQuery.aggregations, [{ alias: 'total', count: {} }]);
    } else assert.equal(options.method, 'GET');
  }
  assert.throws(() => adapter.page('catalog_reservations'));
  await assert.rejects(() => adapter.count('../users'));
  const source = await readFile(join(repo, 'scripts/frozen-catalog-rest.mjs'), 'utf8');
  assert.doesNotMatch(source, /\.(?:set|add|create|update|delete|commit|batch|bulkWriter|runTransaction)\s*\(/u);
});
test('network errors, redirects and raw credential-bearing messages are sanitized', async t => {
  const f = await fixture(t);
  for (const transport of [async () => { throw new Error('SECRET_SENTINEL'); }, async () => new Response('SECRET_SENTINEL', { status: 302 })]) {
    const adapter = createReadOnlyAdapter(f.options, { accessToken: async () => 'TOKEN_SENTINEL', transport });
    await assert.rejects(adapter.control, error => error.message === 'FIRESTORE READ FAILED');
  }
});
test('no-production-access isolation blocks SDK, network imports and global fetch', async () => {
  for (const name of ['firebase-admin', 'google-auth-library', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:dns']) {
    await assert.rejects(import(name), /BLOCKED/u);
  }
  assert.throws(() => globalThis.fetch('https://firestore.googleapis.com'), /BLOCKED/u);
});
test('CLI failure returns nonzero without raw filesystem/credential errors', async t => {
  const f = await fixture(t); const errors = [], original = console.error;
  try { console.error = value => errors.push(value); assert.equal(await main([]), 1); }
  finally { console.error = original; }
  assert.deepEqual(errors, ['EXPLICIT PROJECT REQUIRED']); await noArtifact(f);
});

test('actual REST adapter and core integrate through synthetic paginated responses', async t => {
  const f = await fixture(t, 1001, 503), seen = [];
  const adapter = createReadOnlyAdapter(f.options, { accessToken: async () => 'SYNTHETIC_ACCESS_TOKEN',
    transport: async (url, options) => {
      seen.push(url);
      const address = new URL(url);
      let result;
      if (address.pathname.endsWith('/catalog_control/writer')) result = await f.adapter.control();
      else if (options.method === 'POST') {
        const collection = JSON.parse(options.body).structuredAggregationQuery.structuredQuery.from[0].collectionId;
        result = [{ result: { aggregateFields: { total: { integerValue: String(f.data[collection].length) } } }, readTime: version }];
      } else {
        const collection = address.pathname.split('/').at(-1);
        assert.equal(address.searchParams.get('orderBy'), '__name__ ASC');
        assert.equal(address.searchParams.get('pageSize'), '500');
        result = await f.adapter.page(collection, address.searchParams.get('pageToken') ?? undefined);
      }
      return new Response(JSON.stringify(result));
    } });
  const evidence = await exportFrozenCatalog(f.options, adapter);
  assert.deepEqual(evidence.counts, { products: 1001, product_submission_identity: 503 });
  assert.ok(seen.some(url => url.includes('pageToken=500')));
  assert.equal((await readFile(f.options.output, 'utf8')).includes('SYNTHETIC_ACCESS_TOKEN'), false);
});
test('short pages with continuation are fully consumed', async t => {
  const f = await fixture(t, 7); f.adapter.page = async (name, token) => {
    const start = Number(token || 0), end = start + 2;
    return { documents: f.data[name].slice(start, end), ...(end < f.data[name].length ? { nextPageToken: String(end) } : {}) };
  };
  assert.equal((await f.run()).counts.products, 7);
});
test('missing identity page detected by independent count', async t => {
  const f = await fixture(t, 0, 501), original = f.adapter.page;
  f.adapter.page = async (name, token) => { const page = await original(name, token); delete page.nextPageToken; return page; };
  await assert.rejects(f.run, /INCOMPLETE COLLECTION/u); await noArtifact(f);
});
test('postscan count change rejected even if both scans matched', async t => {
  const f = await fixture(t), original = f.adapter.count; let reads = 0;
  f.adapter.count = async name => name === 'products' && ++reads === 2 ? 3 : original(name);
  await assert.rejects(f.run, /COLLECTION UNSTABLE/u); await noArtifact(f);
});
test('adapter target mismatch fails before any IO', async t => {
  const f = await fixture(t); f.adapter.target = 'projects/other/databases/(default)/documents';
  await assert.rejects(f.run, /ADAPTER TARGET MISMATCH/u); assert.deepEqual(f.calls, []); await noArtifact(f);
});
test('failed page read removes temporary output', async t => {
  const f = await fixture(t); f.adapter.page = async () => { throw new Error('fixture read failure'); };
  await assert.rejects(f.run); await noArtifact(f);
});
test('concurrent evidence creation remains untouched and prevents final artifact', async t => {
  const f = await fixture(t), original = f.adapter.control; let reads = 0;
  f.adapter.control = async () => {
    if (++reads === 2) await writeFile(`${f.options.output}.evidence.json`, 'concurrent evidence');
    return original();
  };
  await assert.rejects(f.run); await assert.rejects(access(f.options.output));
  assert.equal(await readFile(`${f.options.output}.evidence.json`, 'utf8'), 'concurrent evidence');
});
test('REST rejects malformed JSON/count payloads and unsupported collections', async t => {
  const f = await fixture(t);
  for (const payload of ['not json', '{}', '[]', '[{"result":{"aggregateFields":{"total":{"integerValue":"1e3"}}}}]']) {
    const adapter = createReadOnlyAdapter(f.options, { accessToken: async () => 'synthetic', transport: async () => new Response(payload) });
    await assert.rejects(() => adapter.count('products'));
  }
});
test('credential mismatch through CLI never reaches auth/network import or outputs key', async t => {
  const f = await fixture(t), path = join(f.directory, 'synthetic-only.json');
  await writeFile(path, JSON.stringify({ ...credential, project_id: 'other-project' }));
  const errors = [], original = console.error;
  try {
    console.error = value => errors.push(value);
    assert.equal(await main(['--project', project, '--confirm-project', project, '--database', database,
      '--confirm-database', database, '--output', f.options.output, '--credentials', path]), 1);
  } finally { console.error = original; }
  assert.deepEqual(errors, ['CREDENTIAL PROJECT MISMATCH']); await noArtifact(f);
});
