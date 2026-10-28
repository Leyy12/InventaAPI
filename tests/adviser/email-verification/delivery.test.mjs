import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { createEmailSender, senderAddress } from '../../../services/email-delivery.js';
import { validateReleaseConfig, formatValidation } from '../../../scripts/validate-release-config.mjs';

// Providers are synthetic: no SMTP connection or HTTP request leaves the process.
const message = { to: 'juan.delacruz@gmail.com', subject: 'Your InventaAPI verification code',
  text: 'Your InventaAPI verification code is 482913.', html: '<p>482913</p>' };
const smtp = { EMAIL_DELIVERY_PROVIDER: 'smtp', EMAIL_FROM: 'InventaAPI <inventa.signup@gmail.com>', SMTP_HOST: 'smtp.gmail.com',
  SMTP_USER: 'inventa.signup@gmail.com', SMTP_PASS: 'syntheticapppass' };
const resend = { EMAIL_DELIVERY_PROVIDER: 'resend', EMAIL_FROM: 'InventaAPI <no-reply@inventa-release.com>', RESEND_API_KEY: 're_synthetic_key' };
const offline = { fetchImpl: () => assert.fail('no HTTP request expected'), loadMailer: () => assert.fail('no SMTP transport expected') };

test('SMTP uses implicit TLS on 465 and mandatory STARTTLS elsewhere, with bounded timeouts', async () => {
  for (const [port, secure] of [[undefined, true], ['465', true], ['587', false]]) {
    const transports = [], sent = [];
    const send = createEmailSender({ ...smtp, ...(port ? { SMTP_PORT: port } : {}) }, { loadMailer: async () => ({ default: {
      createTransport: options => { transports.push(options); return { sendMail: async mail => { sent.push(mail); } }; } } }) });
    assert.equal(send.provider, 'smtp');
    await send(message); await send(message);
    assert.equal(transports.length, 1, 'one transport is reused');
    assert.deepEqual(transports[0], { host: 'smtp.gmail.com', port: Number(port || 465), secure, requireTLS: !secure,
      auth: { user: 'inventa.signup@gmail.com', pass: 'syntheticapppass' }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
    assert.deepEqual(sent, [{ from: smtp.EMAIL_FROM, ...message }, { from: smtp.EMAIL_FROM, ...message }]);
  }
});
test('Resend posts one message with the server-only key and rejects refusals', async () => {
  const requests = [];
  const send = createEmailSender(resend, { fetchImpl: async (url, init) => { requests.push([url, init]); return { ok: requests.length === 1, status: 422 }; } });
  assert.equal(send.provider, 'resend');
  await send(message);
  const [url, init] = requests[0];
  assert.equal(url, 'https://api.resend.com/emails'); assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer re_synthetic_key'); assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(init.body), { from: resend.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text, html: message.html });
  await assert.rejects(send(message), /Resend did not accept the email \(HTTP 422\)/);
});
test('missing or invalid configuration fails closed without exposing secrets', async () => {
  for (const env of [{}, { NODE_ENV: 'production' }, { ...smtp, EMAIL_DELIVERY_PROVIDER: 'gmail' }, { ...smtp, EMAIL_FROM: 'not an address' },
    { ...smtp, EMAIL_FROM: 'InventaAPI <a@inventa.com>\r\nBcc: victim@gmail.com' }, { ...smtp, SMTP_HOST: 'smtp gmail com' },
    { ...smtp, SMTP_PORT: '70000' }, { ...smtp, SMTP_USER: ' ' }, { ...smtp, SMTP_PASS: '' }, { ...resend, RESEND_API_KEY: 'sk_live_wrong' },
    { EMAIL_DELIVERY_PROVIDER: 'console', NODE_ENV: 'production' }, { EMAIL_DELIVERY_PROVIDER: 'console', NODE_ENV: 'test' }]) {
    const send = createEmailSender(env, offline);
    assert.equal(send.provider, null, JSON.stringify(env));
    await assert.rejects(send(message), error => /not configured/u.test(error.message) && !/syntheticapppass|re_synthetic/u.test(error.message));
  }
});
test('development without a provider prints the code to the API server log only', async () => {
  for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'development', EMAIL_DELIVERY_PROVIDER: 'console' }]) {
    const lines = [];
    const send = createEmailSender(env, { ...offline, log: { warn: line => lines.push(line) } });
    assert.equal(send.provider, 'console'); await send(message);
    assert.equal(lines.length, 1); assert.match(lines[0], /juan\.delacruz@gmail\.com/u); assert.match(lines[0], /482913/u);
  }
});
test('sender addresses allow display names but never header injection', () => {
  assert.equal(senderAddress('InventaAPI <no-reply@inventa.com>'), 'no-reply@inventa.com');
  assert.equal(senderAddress('"Inventa Team" <signup@inventa.com>'), 'signup@inventa.com');
  assert.equal(senderAddress(' plain@inventa.com '), 'plain@inventa.com');
  for (const value of ['InventaAPI', '<a@inventa.com>', 'a@inventa', 'A <a@inventa.com>\nBcc: c@d.com', 'A <a@inventa.com',
    'a b@inventa.com', 'A <<a@inventa.com>>', 42, undefined]) assert.equal(senderAddress(value), null, String(value));
});

const backend = { NODE_ENV: 'production', DATA_PROJECT_ID: 'inventaapi-staging',
  SUPABASE_DB_URL: 'postgresql://synthetic@db.fixture.net:5432/postgres', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SYNTHETIC_ONLY', SUPABASE_SECRET_KEY: 'sb_secret_SYNTHETIC_ONLY',
  PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_SYNTHETIC_ONLY', PAYMONGO_WEBHOOK_SECRET: 'SYNTHETIC_SIGNING_SECRET',
  DASHBOARD_URL: 'https://customer.signup-fixture.net', NEXT_PUBLIC_APP_URL: 'https://customer.signup-fixture.net' };
const validate = env => validateReleaseConfig(env, { scope: 'backend', nodeVersion: 'v22.20.0' });
const failing = env => validate(env).errors.map(issue => issue.name);

test('backend release requires one complete signup email provider', () => {
  for (const delivery of [smtp, { ...smtp, SMTP_PORT: '587' }, resend]) assert.deepEqual(failing({ ...backend, ...delivery }), []);
  assert.deepEqual(failing(backend), ['EMAIL_DELIVERY_PROVIDER', 'EMAIL_FROM']);
  for (const [override, name] of [[{ EMAIL_DELIVERY_PROVIDER: 'console' }, 'EMAIL_DELIVERY_PROVIDER'],
    [{ EMAIL_FROM: 'InventaAPI <signup@example.com>' }, 'EMAIL_FROM'], [{ EMAIL_FROM: 'signup@inventa.test' }, 'EMAIL_FROM'],
    [{ EMAIL_FROM: 'replace-with-sender@gmail.com' }, 'EMAIL_FROM'], [{ SMTP_HOST: '' }, 'SMTP_HOST'],
    [{ SMTP_PORT: 'smtps' }, 'SMTP_PORT'], [{ SMTP_USER: 'replace-with-sender@gmail.com' }, 'SMTP_USER'],
    [{ SMTP_PASS: '' }, 'SMTP_PASS'], [{ SMTP_PASS: 'REPLACE_WITH_APP_PASSWORD' }, 'SMTP_PASS']]) {
    assert.ok(failing({ ...backend, ...smtp, ...override }).includes(name), JSON.stringify(override));
  }
  const missingKey = validate({ ...backend, ...resend, RESEND_API_KEY: '' });
  assert.ok(missingKey.errors.some(issue => issue.name === 'RESEND_API_KEY' && issue.code === 'MISSING_SECRET'));
  assert.ok(failing({ ...backend, ...resend, RESEND_API_KEY: 'key-without-prefix' }).includes('RESEND_API_KEY'));
});
test('validator output names email settings but never prints their secrets', () => {
  const output = formatValidation(validate({ ...backend, ...smtp, SMTP_PASS: 'REPLACE_PASSWORD_SENTINEL' }))
    + formatValidation(validate({ ...backend, ...resend, RESEND_API_KEY: 'sk_RESEND_SENTINEL' }));
  assert.match(output, /SMTP_PASS/u); assert.match(output, /RESEND_API_KEY/u); assert.doesNotMatch(output, /SENTINEL/u);
});
test('the release template ships email placeholders that cannot pass validation', () => {
  const template = dotenv.parse(readFileSync(new URL('../../../.env.example', import.meta.url)));
  const delivery = Object.fromEntries(['EMAIL_DELIVERY_PROVIDER', 'EMAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']
    .map(name => [name, template[name]]));
  assert.equal(delivery.EMAIL_DELIVERY_PROVIDER, 'smtp'); assert.equal(template.RESEND_API_KEY, undefined);
  assert.deepEqual(failing({ ...backend, ...delivery }), ['EMAIL_FROM', 'SMTP_USER', 'SMTP_PASS']);
});
