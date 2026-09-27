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

test('historical keys stay masked; replacement and revocation are distinct actions', () => {
  assert.match(keys, /apiKey\.keyPrefix\}••••••••/);
  assert.match(keys, /Secret shown only once/);
  assert.match(keys, /Replace API Key/);
  assert.match(keys, /Revoke/);
  assert.match(keys, /method: "DELETE"/);
  assert.match(keys, /method: "POST"/);
  assert.match(keys, /!currentSecret && <button/);
  assert.match(keys, /currentSecret \? <button onClick=\{\(\) => void copySecret\(\)\}/);
  assert.doesNotMatch(keys, /navigator\.clipboard\.writeText\(apiKey\.keyPrefix/);
});

test('destructive confirmation is separate from opening and protects duplicate clicks', () => {
  assert.match(keys, /Replace this API key\?/);
  assert.match(keys, /current API key will stop working immediately/);
  assert.match(keys, /Any integration using it must be updated/);
  assert.match(keys, /new API key will be displayed only once/);
  assert.match(keys, /setSelectedKey\(apiKey\)/);
  assert.match(keys, /onClick=\{\(\) => void replaceKey\(\)\}/);
  assert.match(keys, /if \(!selectedKey \|\| replacingRef\.current/);
  assert.match(keys, /disabled=\{replacing \|\| upgradeRequired\}/);
  assert.match(keys, /role="alertdialog" aria-modal="true"/);
  assert.match(keys, /event\.key === "Escape"/);
  assert.match(keys, /event\.key !== "Tab"/);
  assert.match(keys, /cancelRef\.current\?\.focus\(\)/);
});

test('replacement secret is once-only, copied exactly, and destroyed on dismissal/account switch', () => {
  assert.match(keys, /key=\{user\.uid\}/);
  assert.match(keys, /useState<OneTimeReplacement \| null>\(null\)/);
  assert.match(keys, /navigator\.clipboard\.writeText\(replacement\.secret\)/);
  assert.match(keys, /setCopyFeedback\("Copied"\)/);
  assert.match(keys, /role="status" aria-live="polite"/);
  assert.match(keys, /setReplacement\(null\)/);
  assert.doesNotMatch(keys, /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon/);
  assert.doesNotMatch(keys, /console\.(?:log|error|warn)\([^)]*(?:secret|replacement)/);
  assert.match(products, /<Copy className="w-5 h-5"/);
  assert.match(products, /\{copied \? "Copied" : "Copy API Key"\}/);
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
