import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const keys = read('dashboard/src/app/dashboard/api-keys/page.tsx');
const products = read('dashboard/src/app/dashboard/products/page.tsx');
const backend = read('services/api-key-management.js');
const routes = read('routes/apikeys.js');

test('API Keys is management-only; Products retains generation entry point', () => {
  assert.doesNotMatch(keys, /showGenerateModal|generateNewKey|openGenerateModal|\/generate|Generate Your First Key/);
  assert.match(keys, /No API keys yet/);
  assert.match(keys, /API keys are created from Products/);
  assert.match(keys, /href="\/dashboard\/products"[^>]*>Go to Products/);
  assert.match(products, /api\/v1\/api-keys\/generate/);
  assert.match(products, /Generate API Key/);
});

test('active Customer key cards retain masked metadata and Revoke without a replacement action', () => {
  assert.match(keys, /apiKey\.keyPrefix\}••••••••/);
  assert.match(keys, /Secret shown only once/);
  assert.doesNotMatch(keys, /Replace API Key|replaceKey|RotateCw/u);
  assert.match(keys, /\{apiKey\.plan\}/);
  assert.match(keys, /formatDate\(apiKey\.lastUsed\)/);
  assert.match(keys, /Show.*Integration Code Examples/u);
  assert.match(keys, /Created \{formatDate\(apiKey\.createdAt\)\}/u);
  assert.match(keys, /<div className="flex flex-col sm:flex-row gap-2">/u);
  assert.match(keys, /Revoke/);
  assert.match(keys, /method: "DELETE"/);
  assert.doesNotMatch(keys, /navigator\.clipboard\.writeText\(apiKey\.keyPrefix/);
});

test('replacement action, confirmation, one-time modal, and focus targets are absent for every plan', () => {
  for (const plan of ['Free Trial', 'Pro', 'Pro Max']) {
    assert.match(keys, /\{apiKey\.plan\}/, `${plan} key card still shows its plan`);
    assert.doesNotMatch(keys, /Replace API Key|replaceKey|Replace this API key|API Key Replaced|OneTimeReplacement|replacement\.secret|alertdialog/u,
      `${plan} page must not expose replacement UI`);
  }
  assert.doesNotMatch(keys, /cancelRef|confirmRef|copyRef|dismissRef|returnFocusRef/u);
  assert.match(keys, /onClick=\{\(\) => void revokeKey\(apiKey\.id, apiKey\.name\)\}/u);
});

test('Revoke confirmation and endpoint remain unchanged while Products retains key creation', () => {
  assert.match(keys, /window\.confirm\(/);
  assert.match(keys, /apiKeyRequest\(user, `\/\$\{encodeURIComponent\(id\)\}`, \{ method: "DELETE" \}\)/);
  assert.match(keys, /Select OK to revoke without creating a replacement/);
  assert.match(keys, /method: "DELETE"/);
  assert.doesNotMatch(keys, /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon/);
  assert.match(products, /api\/v1\/api-keys\/generate/);
  assert.match(products, /Generate API Key/);
});

test('server replacement is transactional, owner-bound, hash-only, and does not write generation/quota state', () => {
  const replacement = backend.slice(backend.indexOf('    replace: authenticated('), backend.indexOf('    rename: authenticated('));
  assert.match(routes, /router\.post\('\/:id\/replace', handlers\.replace\)/);
  assert.match(replacement, /assertOwner\(await tx\.get\(oldRef\), actor\.uid\)/);
  assert.match(replacement, /assertActiveKey\(oldKey/);
  assert.match(replacement, /tx\.update\(oldRef, \{ status: 'revoked'/);
  assert.match(replacement, /tx\.set\(newRef, replacement\)/);
  assert.match(replacement, /\.\.\.issued\.stored/);
  assert.doesNotMatch(replacement, /tx\.(?:set|update)\(marker|account_trial_usage|account_free_monthly_usage/);
  assert.doesNotMatch(replacement, /console\.|rawSecret|oldKey\.key[,}]/);
});
