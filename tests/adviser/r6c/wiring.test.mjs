import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
test('both deployed payment routes receive explicit PAYMONGO_MODE', () => {
  for (const path of ['routes/checkout.js', 'routes/webhooks.js']) {
    assert.match(read(path), /paymentConfiguration\(\{ mode: process\.env\.PAYMONGO_MODE/);
  }
  assert.match(read('routes/webhooks.js'), /if \(process.env.NODE_ENV === 'production'\) getConfig\(\)/);
});
test('capstone template keeps production runtime with explicit sandbox mode and placeholder test key', () => {
  const env = read('.env.example');
  assert.match(env, /^NODE_ENV=production$/m);
  assert.match(env, /^PAYMONGO_MODE=test$/m);
  assert.match(env, /^PAYMONGO_SECRET_KEY=sk_test_REPLACE_IN_SECRET_STORE$/m);
});
