import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GENERATION_POLICY, REVOCATION_WARNING, generationErrorMessage } from '../../../dashboard/src/lib/api-key-generation.ts';
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const keys = read('dashboard/src/app/dashboard/api-keys/page.tsx');
const products = read('dashboard/src/app/dashboard/products/page.tsx');

test('generation policy explicitly separates account UTC day from request quota on both entry points', () => {
  assert.equal(GENERATION_POLICY, 'API keys can be generated once per account per UTC day.');
  for (const source of [keys, products]) {
    assert.match(source, /\{GENERATION_POLICY\}/);
    assert.match(source, /generationErrorMessage\(data\)/);
    assert.match(source, /API request quota/);
  }
});
test('generation denial has its own message and explicit server UTC boundary', () => {
  const message = generationErrorMessage({ error: 'API_KEY_DAILY_GENERATION_LIMIT', nextEligibleAt: '2026-09-23T00:00:00.000Z' });
  assert.match(message, /already generated an API key today/);
  assert.match(message, /2026-09-23 00:00 UTC/);
  assert.doesNotMatch(message, /request limit|request quota exceeded/i);
});
for (const nextEligibleAt of [null, undefined, 'bad', '2026-02-30T00:00:00.000Z', '2026-09-23T12:00:00.000Z', '2026-09-23T00:00:00+08:00']) {
  test(`invalid next time keeps safe reset explanation: ${nextEligibleAt}`, () => {
    const message = generationErrorMessage({ error: 'API_KEY_DAILY_GENERATION_LIMIT', nextEligibleAt });
    assert.match(message, /next UTC reset/); assert.doesNotMatch(message, /Next eligible time:/);
  });
}
for (const error of ['ACCOUNT_DISABLED', 'QUOTA_EXCEEDED', 'SERVICE_UNAVAILABLE']) test(`non-generation error is not mislabeled: ${error}`, () => {
  assert.equal(generationErrorMessage({ error, message: 'Original safe explanation' }), 'Original safe explanation');
});
test('revocation stays available with warning about only usable key and no refund', () => {
  assert.match(REVOCATION_WARNING, /does not restore/); assert.match(REVOCATION_WARNING, /only usable key/);
  assert.match(keys, /\$\{REVOCATION_WARNING\}/); assert.match(keys, /method: 'DELETE'/);
});

// Execute the actual API Keys event handler with synthetic UI/Firebase/network
// dependencies. No browser, SDK initialization or real HTTP call is involved.
async function submit(response, name = 'Integration') {
  const handler = keys.slice(keys.indexOf('  const generateNewKey = async () => {'), keys.indexOf('  const revokeKey ='));
  const state = { secrets: [], names: [], productNames: [], alerts: [], pending: [], paywall: [], modal: [], refreshes: 0, calls: 0, bodies: [], errors: [] };
  const run = new Function('newKeyName', 'user', 'fetch', 'process', 'alert', 'console', 'setGeneratingKey',
    'setNewlyGeneratedKey', 'setGeneratedKeyName', 'setGeneratedProductNames', 'setNewKeyName', 'fetchApiKeys', 'generationErrorMessage',
    'selectedCustomerProducts', 'canGenerate', 'setServerPaywall', 'setShowGenerateModal', `${handler}; return generateNewKey();`);
  await run(name, { email: 'fixture@example.test', getIdToken: async () => 'synthetic-token' },
    async (_url, options) => { state.calls++; state.bodies.push(JSON.parse(options.body)); return { ok: response.ok, json: async () => response.data }; },
    { env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:9' } }, value => state.alerts.push(value), { error: value => state.errors.push(value) },
    value => state.pending.push(value), value => state.secrets.push(value), value => state.names.push(value),
    value => state.productNames.push(value), () => {}, () => state.refreshes++, generationErrorMessage,
    [{ id: 'canonical-product-id', name: 'Fixture Product' }], true,
    value => state.paywall.push(value), value => state.modal.push(value));
  return state;
}
test('actual generation handler reveals successful one-time secret and refreshes metadata', async () => {
  const state = await submit({ ok: true, data: { key: 'synthetic-one-time-secret' } });
  assert.deepEqual(state.secrets, ['synthetic-one-time-secret']); assert.deepEqual(state.names, ['Integration']); assert.equal(state.refreshes, 1);
  assert.deepEqual(state.productNames, [['Fixture Product']]);
  assert.deepEqual(state.bodies[0].linkedProductIds, ['canonical-product-id']);
  assert.equal('linkedProducts' in state.bodies[0], false);
  assert.deepEqual(state.pending, [true, false]); assert.deepEqual(state.alerts, []); assert.deepEqual(state.errors, []);
  assert.match(keys, /won&apos;t be able to see it again/);
  assert.match(products, /you won't see it again/);
});
test('one-time secret state survives entitlement and list refresh without weakening account isolation', async () => {
  const session = keys.slice(keys.indexOf('function AccountKeysSession('), keys.indexOf('function AccountKeys('));
  const child = keys.slice(keys.indexOf('function AccountKeys('), keys.indexOf('  const [apiKeys,'));
  assert.match(keys, /<AccountKeysSession key=\{user\.uid\}/);
  assert.match(session, /<AccountKeys key=\{props\.entitlementStatus\}/);
  assert.match(session, /\[showGenerateModal, setShowGenerateModal\] = useState\(false\)/);
  assert.match(session, /\[newlyGeneratedKey, setNewlyGeneratedKey\] = useState<string \| null>\(null\)/);
  assert.match(session, /\[generatedKeyName, setGeneratedKeyName\] = useState<string \| null>\(null\)/);
  assert.match(session, /\[generatedProductNames, setGeneratedProductNames\] = useState<string\[\]>\(\[\]\)/);
  assert.doesNotMatch(child, /useState.*(?:showGenerateModal|newlyGeneratedKey|generatedKeyName|generatedProductNames)/);
  const result = await submit({ ok: true, data: { key: 'synthetic-one-time-secret' } });
  assert.deepEqual(result.secrets, ['synthetic-one-time-secret']);
  assert.equal(result.refreshes, 1);
  assert.deepEqual(result.modal, []); // background refresh does not dismiss success
  assert.match(keys, /\{newlyGeneratedKey \? \(/); // success view remains bound to the session state
  assert.match(keys, /\{generatedProductNames\.map/); // product labels also survive child remount
});
test('explicit dismissal clears every secret-bearing success field; reopen cannot restore it', () => {
  const dismissal = keys.match(/onClick=\{\(\) => \{(\s*setShowGenerateModal\(false\);\s*setNewlyGeneratedKey\(null\);\s*setGeneratedKeyName\(null\);\s*setGeneratedProductNames\(\[\]\);\s*)\}\}/);
  assert.ok(dismissal, 'success dismissal must clear the modal, secret, and related metadata');
  const state = { modal: true, secret: 'synthetic-one-time-secret', name: 'Fixture', products: ['Fixture Product'] };
  new Function('setShowGenerateModal', 'setNewlyGeneratedKey', 'setGeneratedKeyName', 'setGeneratedProductNames', dismissal[1])(
    value => { state.modal = value; }, value => { state.secret = value; }, value => { state.name = value; }, value => { state.products = value; });
  assert.deepEqual(state, { modal: false, secret: null, name: null, products: [] });
  const openSource = keys.slice(keys.indexOf('  const openGenerateModal = () => {'), keys.indexOf('  useEffect(() => {'));
  const reopen = new Function('canGenerate', 'setProductsLoading', 'setShowGenerateModal', `${openSource}; return openGenerateModal;`)(
    true, () => {}, value => { state.modal = value; });
  reopen();
  assert.equal(state.modal, true);
  assert.equal(state.secret, null);
});
test('full reload/navigation has no recovery channel for the one-time secret', () => {
  const session = keys.slice(keys.indexOf('function AccountKeysSession('), keys.indexOf('function AccountKeys('));
  assert.match(session, /useState<string \| null>\(null\)/);
  assert.match(keys, /return user \? <AccountKeysSession key=\{user\.uid\}/);
  assert.doesNotMatch(keys, /localStorage|sessionStorage|document\.cookie|indexedDB|navigator\.sendBeacon/);
  assert.doesNotMatch(keys, /console\.log\([^)]*newlyGeneratedKey|console\.error\([^)]*newlyGeneratedKey/);
});
test('actual handler daily denial never reveals secret or refreshes list', async () => {
  const state = await submit({ ok: false, data: { error: 'API_KEY_DAILY_GENERATION_LIMIT', nextEligibleAt: '2026-09-23T00:00:00.000Z' } });
  assert.deepEqual(state.secrets, []); assert.equal(state.refreshes, 0);
  assert.match(state.alerts[0], /2026-09-23 00:00 UTC/); assert.deepEqual(state.pending, [true, false]);
});
test('post-Trial generation denial presents Upgrade to Pro and no secret', async () => {
  const state = await submit({ ok: false, data: { error: 'UPGRADE_REQUIRED' } });
  assert.deepEqual(state.secrets, []); assert.equal(state.refreshes, 0);
  assert.deepEqual(state.paywall, [true]); assert.deepEqual(state.modal, [false]);
  assert.match(state.alerts[0], /Upgrade to Pro/);
});
test('actual handler invalid local name never contacts generation endpoint', async () => {
  const state = await submit({ ok: true, data: {} }, '  '); assert.equal(state.calls, 0); assert.deepEqual(state.secrets, []);
});
test('clipboard success is awaited; failure retains visible secret', () => {
  for (const source of [keys, products]) assert.match(source, /await navigator\.clipboard\.writeText/);
  assert.match(keys, /Copy failed\. Save the displayed key manually before closing/);
  assert.match(products, /Copy failed\. Save the displayed API key manually before leaving/);
});
test('60/minute IP limiter and backend-mediated generation route remain', () => {
  assert.match(read('server.js'), /max: 60/);
  assert.match(read('routes/apikeys.js'), /router\.post\('\/generate', handlers\.create\)/);
});
test('marker rules explicitly deny browser access and mutation', () => {
  assert.match(read('firestore.rules'), /match \/api_key_generation_days\/\{id\} \{ allow read, write: if false; \}/);
});
test('generation handler has no logging of credentials, quota mutation or history write', () => {
  const source = read('services/api-key-management.js');
  assert.doesNotMatch(source, /console\.|api_telemetry/);
  assert.match(source, /tx\.set\(ref, record\);\s*tx\.set\(marker,/);
  assert.doesNotMatch(source, /tx\.(?:set|update)\(usage/);
});
