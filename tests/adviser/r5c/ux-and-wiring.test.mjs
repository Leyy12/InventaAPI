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

test('Customer API Keys exposes no replace action or replacement dialog for any plan', () => {
  assert.doesNotMatch(keys, /Replace API Key|replaceKey|OneTimeReplacement|replacement\.secret|replace-title|replacement-title|RotateCw/u);
  for (const plan of ['Free Trial', 'Pro', 'Pro Max']) {
    assert.match(keys, /\{apiKey\.plan\}/u, `${plan} key card keeps plan metadata`);
  }
});
test('Customer Revoke remains available and uses the existing DELETE flow', () => {
  assert.match(keys, /const revokeKey = async \(id: string, name: string\) => \{/u);
  assert.match(keys, /window\.confirm\(/u);
  assert.match(keys, /apiKeyRequest\(user, `\/\$\{encodeURIComponent\(id\)\}`, \{ method: "DELETE" \}\)/u);
  assert.match(keys, /window\.alert\("Failed to revoke API key\. Please try again\."\)/u);
  assert.match(keys, /onClick=\{\(\) => void revokeKey\(apiKey\.id, apiKey\.name\)\}/u);
});
test('key list and generation remain account-scoped and separate from key replacement', () => {
  assert.match(keys, /key=\{user\.uid\}/u);
  assert.match(keys, /const data = await apiKeyRequest\(user\)/u);
  assert.match(keys, /apiKey\.keyPrefix\}••••••••/u);
  assert.match(products, /api\/v1\/api-keys\/generate/u);
  assert.doesNotMatch(keys, /api\/v1\/api-keys\/generate|Generate Your First Key|generateNewKey/u);
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
