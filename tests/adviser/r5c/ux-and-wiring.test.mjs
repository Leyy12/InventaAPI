import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GENERATION_POLICY, REVOCATION_WARNING, generationErrorMessage } from '../../../dashboard/src/lib/api-key-generation.ts';
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const keys = read('dashboard/src/app/dashboard/api-keys/page.tsx');
const products = read('dashboard/src/app/dashboard/products/page.tsx');

test('generation policy remains on Products and is absent from the management-only API Keys page', () => {
  assert.equal(GENERATION_POLICY, 'API keys can be generated once per account per UTC day.');
  assert.match(products, /\{GENERATION_POLICY\}/);
  assert.match(products, /generationErrorMessage\(data\)/);
  assert.match(products, /API request quotas are separate/);
  assert.doesNotMatch(keys, /generationErrorMessage|showGenerateModal|generateNewKey|\/generate/u);
  assert.match(keys, /New API keys are created from/);
  assert.match(keys, /href="\/dashboard\/products"/);
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
  assert.match(keys, /\$\{REVOCATION_WARNING\}/); assert.match(keys, /method: "DELETE"/);
});

// Execute the actual replacement event handler with synthetic UI and request
// dependencies. No browser, SDK initialization, or real HTTP call is involved.
async function replace(response, options = {}) {
  const handler = keys.slice(keys.indexOf('  const replaceKey = async () => {'), keys.indexOf('  const copySecret = async () => {'));
  const state = { secrets: [], pending: [], paywall: [], selected: [], errors: [], refreshes: 0, calls: 0, paths: [] };
  const selectedKey = options.selectedKey === undefined ? { id: 'old-id', name: 'Integration' } : options.selectedKey;
  const replacingRef = { current: false };
  const run = new Function('selectedKey', 'replacingRef', 'upgradeRequired', 'entitlementStatus',
    'setReplacing', 'setReplaceError', 'apiKeyRequest', 'user', 'setSelectedKey',
    'setReplacement', 'setCopyFeedback', 'fetchApiKeys', 'ApiKeyRequestError', 'setServerUpgradeRequired',
    `${handler}; return replaceKey();`);
  await run(selectedKey, replacingRef, options.upgradeRequired || false,
    options.entitlementStatus === undefined ? 'inactive' : options.entitlementStatus,
    value => state.pending.push(value), value => state.errors.push(value),
    async (_user, path, request) => {
      state.calls++; state.paths.push([path, request.method]);
      if (response.error) {
        const failure = new Error(response.message || response.error);
        failure.code = response.error;
        throw failure;
      }
      return response;
    },
    { uid: 'owner' }, value => state.selected.push(value), value => state.secrets.push(value),
    () => {}, () => { state.refreshes++; }, Error,
    value => state.paywall.push(value));
  return state;
}
test('actual replacement handler reveals one-time secret and refreshes masked metadata', async () => {
  const state = await replace({ success: true, id: 'new-id', name: 'Integration', key: 'synthetic-one-time-secret' });
  assert.deepEqual(state.secrets, [{ id: 'new-id', name: 'Integration', secret: 'synthetic-one-time-secret' }]);
  assert.deepEqual(state.paths, [['/old-id/replace', 'POST']]);
  assert.equal(state.refreshes, 1);
  assert.deepEqual(state.pending, [true, false]);
  assert.deepEqual(state.selected, [null]);
  assert.match(keys, /Save this key now\. For security, InventaAPI will not display it again/);
  assert.match(products, /you won't see it again/);
});
test('replacement secret survives a list refresh but not account switch or route reload', async () => {
  const session = keys.slice(keys.indexOf('function AccountKeysSession('));
  assert.match(keys, /key=\{user\.uid\}/);
  assert.match(session, /\[replacement, setReplacement\] = useState<OneTimeReplacement \| null>\(null\)/);
  assert.doesNotMatch(session, /key=\{(?:props\.)?entitlementStatus\}/);
  const result = await replace({ success: true, id: 'new-id', key: 'synthetic-one-time-secret' });
  assert.equal(result.refreshes, 1);
  assert.equal(result.secrets[0].secret, 'synthetic-one-time-secret');
  assert.match(keys, /replacement\.secret/);
});
test('actual success dismissal clears the only secret-bearing replacement state', () => {
  const source = keys.slice(keys.indexOf('  const dismissReplacement = () => {'), keys.indexOf('  const revokeKey = async'));
  const state = { replacement: { secret: 'synthetic-one-time-secret' }, feedback: 'Copied', focused: false };
  const dismiss = new Function('copyTimerRef', 'clearTimeout', 'setReplacement', 'setCopyFeedback', 'headingRef',
    `${source}; return dismissReplacement;`)({ current: null }, () => {},
      value => { state.replacement = value; }, value => { state.feedback = value; },
      { current: { focus: () => { state.focused = true; } } });
  dismiss();
  assert.deepEqual(state, { replacement: null, feedback: '', focused: true });
});
test('full reload/navigation has no recovery channel for the one-time secret', () => {
  const session = keys.slice(keys.indexOf('function AccountKeysSession('));
  assert.match(session, /useState<OneTimeReplacement \| null>\(null\)/);
  assert.match(keys, /key=\{user\.uid\}/);
  assert.doesNotMatch(keys, /localStorage|sessionStorage|document\.cookie|indexedDB|navigator\.sendBeacon/);
  assert.doesNotMatch(keys, /console\.(?:log|error)\([^)]*(?:replacement|secret)/);
});
test('replacement is not an ordinary daily generation and never contacts the generation endpoint', async () => {
  const state = await replace({ success: true, id: 'new-id', key: 'synthetic-one-time-secret' });
  assert.deepEqual(state.paths, [['/old-id/replace', 'POST']]);
  assert.doesNotMatch(keys, /api_key_generation_days|nextEligibleAt|\/generate/u);
});
test('post-Trial replacement denial presents Upgrade to Pro and no secret', async () => {
  const state = await replace({ error: 'UPGRADE_REQUIRED', message: 'Upgrade to Pro to continue using the API.' });
  assert.deepEqual(state.secrets, []); assert.equal(state.refreshes, 0);
  assert.deepEqual(state.paywall, [true]); assert.deepEqual(state.selected, []);
  assert.match(state.errors.at(-1), /Upgrade to Pro/);
});
test('replacement cannot run without a selected owned key or verified entitlement', async () => {
  for (const options of [{ selectedKey: null }, { entitlementStatus: null }, { upgradeRequired: true }]) {
    const state = await replace({ success: true, id: 'new-id', key: 'synthetic-one-time-secret' }, options);
    assert.equal(state.calls, 0); assert.deepEqual(state.secrets, []);
  }
});
test('clipboard copies exact replacement secret; failure retains visible secret', async () => {
  const source = keys.slice(keys.indexOf('  const copySecret = async () => {'), keys.indexOf('  const dismissReplacement = () => {'));
  const values = []; const feedback = [];
  const copy = new Function('replacement', 'navigator', 'setCopyFeedback', 'copyTimerRef', 'clearTimeout', 'setTimeout',
    `${source}; return copySecret;`)({ secret: 'synthetic-one-time-secret' },
      { clipboard: { writeText: async value => values.push(value) } },
      value => feedback.push(value), { current: null }, () => {}, () => 1);
  await copy();
  assert.deepEqual(values, ['synthetic-one-time-secret']);
  assert.deepEqual(feedback, ['Copied']);
  const failed = new Function('replacement', 'navigator', 'setCopyFeedback', 'copyTimerRef', 'clearTimeout', 'setTimeout',
    `${source}; return copySecret;`)({ secret: 'synthetic-one-time-secret' },
      { clipboard: { writeText: async () => { throw new Error('denied'); } } },
      value => feedback.push(value), { current: null }, () => {}, () => 1);
  await failed();
  assert.match(feedback.at(-1), /Copy failed/);
  assert.match(keys, /\{replacement\.secret\}/);
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
