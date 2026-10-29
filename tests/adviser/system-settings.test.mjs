import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import { memoryStore, invoke } from './r2a/memory-store.mjs';
import { createSystemSettingsHandlers, createSystemPolicyMiddleware } from '../../services/system-settings.js';
import { DEFAULT_SYSTEM_SETTINGS, deploymentEnvironment } from '../../services/system-settings-contract.mjs';
import { createIpRateLimiter } from '../../services/rate-limit-client-ip.js';
import { completeCustomerSignup, readRegistrationPolicy } from '../../services/customer-registration.mjs';

function fixture(settings = DEFAULT_SYSTEM_SETTINGS, extra = {}) {
  const db = memoryStore({ 'users/admin': { role: 'Admin' }, 'users/customer': { role: 'Developer' },
    ...(settings ? { 'system/settings': structuredClone(settings) } : {}), ...extra });
  const decorate = snap => ({ ...snap, updateTime: snap.exists ? {
    seconds: parseInt(createHash('sha256').update(JSON.stringify(snap.data())).digest('hex').slice(0, 12), 16), nanoseconds: 0 } : undefined });
  const originalCollection = db.collection, originalTransaction = db.runTransaction;
  db.collection = name => {
    const col = originalCollection(name);
    return { ...col, doc: id => {
      const ref = col.doc(id);
      return { ...ref, get: async () => {
        if (ref.path.startsWith(db.failRead || '\0') || ref.path === db.failDirectRead) throw Error('Synthetic private provider error');
        return decorate(await ref.get());
      } };
    } };
  };
  db.runTransaction = (callback, options) => originalTransaction(tx => callback({ ...tx, get: async ref => decorate(await tx.get(ref)) }), options);
  const verified = [], diagnostics = [];
  const handlers = createSystemSettingsHandlers({ getDb: () => db, apiVersion: '1.0.0',
    env: { VERCEL_ENV: 'production', DATA_PROJECT_ID: 'inventaapi-db' },
    now: () => new Date('2026-10-14T00:00:00Z'), report: () => diagnostics.push('safe audit failure'),
    verifyIdToken: async (token, revoked) => {
      verified.push([token, revoked]); if (!['admin', 'customer'].includes(token)) throw Error('private token error');
      return { uid: token, email: `${token}@verified.invalid`, secret: 'sensitive-token-sentinel' };
    } });
  const read = () => invoke(handlers.read, { token: 'admin' });
  const save = async (changes, options = {}) => invoke(handlers.save, { token: 'admin',
    body: { version: (await read()).body.version, changes }, ...options });
  const logs = () => Object.entries(db.dump()).filter(([key]) => key.startsWith('audit_logs/')).map(([, value]) => value);
  return { db, handlers, read, save, logs, verified, diagnostics };
}

test('authoritative read distinguishes missing settings and exposes only effective safe values', async () => {
  const f = fixture(null), result = await f.read();
  assert.equal(result.statusCode, 200); assert.equal(result.body.source, 'defaults'); assert.equal(result.body.version, 'missing');
  assert.deepEqual(result.body.settings, DEFAULT_SYSTEM_SETTINGS);
  const legacy = await fixture({ ...DEFAULT_SYSTEM_SETTINGS, maxRequestsPerMinute: 999, strictApiValidation: false, private: 'secret' }).read();
  assert.deepEqual(legacy.body.settings.planRequestLimits, { free_trial: null, pro: 500, pro_max: null });
  assert.equal(Object.hasOwn(legacy.body.settings, 'maxRequestsPerMinute'), false);
  assert.equal(Object.hasOwn(legacy.body.settings, 'strictApiValidation'), false); assert.doesNotMatch(JSON.stringify(legacy.body), /secret/);
});

for (const token of [null, 'invalid', 'customer']) test(`settings read/save denies ${token}`, async () => {
  const f = fixture();
  for (const handler of [f.handlers.read, f.handlers.save, f.handlers.information]) {
    assert.equal((await invoke(handler, { token })).statusCode, token === 'customer' ? 403 : 401);
  }
  assert.equal(f.logs().length, 0); assert.equal(f.db.commits, 0);
});
for (const account of [{ disabled: true }, { active: false }, { blocked: true }, { status: 'inactive' }, { accountState: 'deleted' }]) {
  test(`inactive Admin cannot save: ${JSON.stringify(account)}`, async () => {
    const f = fixture(undefined, { 'users/admin': { role: 'Admin', ...account } });
    assert.equal((await invoke(f.handlers.save, { token: 'admin' })).statusCode, 403); assert.equal(f.db.commits, 0);
  });
}

test('settings commit preserves compatible fields, reloads persisted state, and audits verified safe changes', async () => {
  const f = fixture({ ...DEFAULT_SYSTEM_SETTINGS, compatible: { retained: true }, secret: 'private-body-sentinel' });
  const saved = await f.save({ maintenanceMode: true, allowNewRegistrations: false, planRequestLimits: { pro: 1000 } });
  assert.equal(saved.statusCode, 200); assert.equal(saved.body.saved, true);
  assert.deepEqual(saved.body.settings, { maintenanceMode: true, allowNewRegistrations: false, planRequestLimits: { free_trial: null, pro: 1000, pro_max: null },
    maintenanceStartsAt: null, maintenanceEndsAt: null });
  assert.deepEqual((await f.read()).body.settings, saved.body.settings);
  assert.deepEqual(f.db.read('system/settings').compatible, { retained: true });
  assert.equal(f.logs().length, 2); assert.equal(f.logs()[0].action, 'System Settings Updated');
  assert.equal(f.logs()[0].userEmail, 'admin@verified.invalid'); assert.equal(f.logs()[0].userId, 'admin');
  assert.equal(f.logs()[0].timestamp.toISOString(), '2026-10-14T00:00:00.000Z');
  assert.deepEqual(f.logs()[0].metadata.changedFields, ['maintenanceMode', 'allowNewRegistrations']);
  assert.equal(f.logs()[1].action, 'Plan Request Limits Updated');
  assert.deepEqual(f.logs()[1].metadata.changes, [{ plan: 'pro', before: 500, after: 1000 }]);
  assert.doesNotMatch(JSON.stringify(f.logs()), /sentinel|secret|authorization/);
  assert.ok(f.verified.every(([, revoked]) => revoked === true));
});

test('prepared Maintenance OFF save is versioned, independently readable and audits only that policy change', async () => {
  const pricing = { pro: 149900, pro_max: 499900 };
  const f = fixture({ ...DEFAULT_SYSTEM_SETTINGS, maintenanceMode: true, allowNewRegistrations: false, pricing });
  const before = await f.read(); assert.equal(before.body.settings.maintenanceMode, true);
  const result = await invoke(f.handlers.save, { token: 'admin', body: {
    version: before.body.version, changes: { maintenanceMode: false },
  } });
  assert.equal(result.statusCode, 200);
  const after = await f.read(); assert.equal(after.body.settings.maintenanceMode, false);
  assert.equal(after.body.settings.allowNewRegistrations, false);
  assert.deepEqual(after.body.settings.planRequestLimits, before.body.settings.planRequestLimits);
  assert.deepEqual(f.db.read('system/settings').pricing, pricing);
  assert.deepEqual(f.logs()[0].metadata.changes, [{ field: 'maintenanceMode', before: true, after: false }]);
  assert.equal(f.logs()[0].userId, 'admin'); assert.equal(f.logs().length, 1);
  assert.equal((await invoke(f.handlers.save, { token: 'admin', body: {
    version: before.body.version, changes: { maintenanceMode: true },
  } })).statusCode, 409);
  assert.equal((await f.read()).body.settings.maintenanceMode, false);
});

for (const changes of [{ strictApiValidation: false }, { role: 'admin' }, { maxRequestsPerMinute: 61 }, { maxRequestsPerMinute: 0 },
  { maxRequestsPerMinute: 2.5 }, { maxRequestsPerMinute: '20' }, { maintenanceMode: 'true' },
  { planRequestLimits: { pro: null } }, { planRequestLimits: { pro: 0 } }, { planRequestLimits: { pro: 1.5 } },
  { planRequestLimits: { pro_max: 'unlimited' } }, { planRequestLimits: { unknown: 20 } }, {}, []]) {
  test(`invalid/unsafe setting changes are rejected: ${JSON.stringify(changes)}`, async () => {
    const f = fixture(); assert.equal((await f.save(changes)).statusCode, 400); assert.equal(f.db.commits, 0); assert.equal(f.logs().length, 0);
  });
}
test('missing document initialization and no-op save do not manufacture an effective-change audit', async () => {
  const f = fixture(null); await f.save({ maintenanceMode: false }); assert.equal(f.db.commits, 0); assert.equal(f.logs().length, 0);
  await f.save({ allowNewRegistrations: false }); assert.equal(f.db.read('system/settings').maintenanceMode, false); assert.equal(f.logs().length, 1);
});
test('concurrent Admin writes reject stale state without overwriting the winner or duplicating audits', async () => {
  const f = fixture(), version = (await f.read()).body.version;
  const responses = await Promise.all([true, false].map(value => invoke(f.handlers.save, { token: 'admin',
    body: { version, changes: value ? { maintenanceMode: true } : { allowNewRegistrations: false } } })));
  assert.deepEqual(responses.map(result => result.statusCode).sort(), [200, 409]); assert.equal(f.logs().length, 1);
  const saved = f.db.read('system/settings'); assert.notEqual(saved.maintenanceMode, !saved.allowNewRegistrations);
});
test('transaction retry produces exactly one post-commit audit; revoked Admin cannot commit', async () => {
  const f = fixture(); f.db.beforeCommit = () => { f.db.beforeCommit = null; f.db.seed('users/admin', { role: 'Admin', unrelated: true }); };
  assert.equal((await f.save({ maintenanceMode: true })).statusCode, 200); assert.ok(f.db.retries > 0); assert.equal(f.logs().length, 1);
  const denied = fixture(); denied.db.beforeCommit = () => { denied.db.beforeCommit = null; denied.db.seed('users/admin', { role: 'Admin', disabled: true }); };
  assert.equal((await denied.save({ maintenanceMode: true })).statusCode, 403); assert.equal(denied.logs().length, 0);
  assert.equal(denied.db.read('system/settings').maintenanceMode, false);
});
test('audit-only fault leaves one confirmed settings commit; diagnostic failure cannot replay it', async () => {
  const f = fixture(), original = f.db.collection;
  f.db.collection = name => name === 'audit_logs' ? { add: async () => { throw Error('private provider sentinel'); } } : original(name);
  const saved = await f.save({ maintenanceMode: true }); assert.equal(saved.statusCode, 200); assert.equal(saved.body.saved, true);
  assert.equal(f.db.commits, 1); assert.equal(f.db.read('system/settings').maintenanceMode, true); assert.equal(f.diagnostics.length, 1);
});
test('failed persistence never claims success or produces a success audit', async () => {
  const f = fixture(); f.db.failWrite = 'system/settings';
  assert.equal((await f.save({ maintenanceMode: true })).statusCode, 503); assert.equal(f.logs().length, 0);
  assert.equal(f.db.read('system/settings').maintenanceMode, false);
  f.db.failRead = 'system/settings'; assert.equal((await f.read()).statusCode, 503);
});
test('successful commit with unavailable reload tells the client to refresh without replay', async () => {
  const f = fixture(), original = f.db.collection;
  f.db.collection = name => name === 'audit_logs' ? { add: async () => { f.db.failDirectRead = 'system/settings'; } } : original(name);
  const saved = await f.save({ maintenanceMode: true }); assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.body, { success: true, saved: true, reloadRequired: true }); assert.equal(f.db.commits, 1);
});

test('system information uses API package version and a real bounded-scope database read', async () => {
  const f = fixture(), healthy = await invoke(f.handlers.information, { token: 'admin' });
  assert.equal(healthy.body.databaseStatus, 'Connected'); assert.equal(healthy.body.apiVersion, '1.0.0');
  assert.equal(healthy.body.environment, 'Production'); assert.equal(healthy.body.uptime, 'Not tracked');
  f.db.failDirectRead = 'system/settings'; assert.equal((await invoke(f.handlers.information, { token: 'admin' })).body.databaseStatus, 'Unavailable');
});
for (const [configuration, expected] of [
  [{ development: true }, 'Development'], [{ vercelEnvironment: 'production', dataProjectId: 'inventaapi-db' }, 'Production'],
  [{ cloudRunService: 'inventaapi-api-staging', dataProjectId: 'inventaapi-staging' }, 'Staging'],
  [{ dataProjectId: 'inventaapi-staging', apiOrigin: 'https://inventaapi-api-staging-or463scbca-as.a.run.app' }, 'Staging'],
  [{ vercelEnvironment: 'preview', dataProjectId: 'inventaapi-db' }, 'Unknown'], [{}, 'Unknown'],
  [{ vercelEnvironment: 'production', dataProjectId: 'unexpected' }, 'Unknown'],
]) test(`environment evidence resolves ${expected}: ${JSON.stringify(configuration)}`, () => assert.equal(deploymentEnvironment(configuration), expected));

async function withPolicy(f, run) {
  const app = express(), executed = [];
  const { verifyClientIp, limiter } = createIpRateLimiter({ vercel: true, publicImages: true });
  app.use(verifyClientIp, limiter);
  app.use(createSystemPolicyMiddleware({ getDb: () => f.db }));
  app.use(express.json());
  app.patch('/api/v1/admin/system/settings', f.handlers.save);
  app.all('*', (req, res) => { executed.push(req.path); res.json({ ok: true }); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const call = (path, method = 'GET', ip = '203.0.113.12', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'x-forwarded-for': ip, 'x-vercel-forwarded-for': ip,
      ...(body ? { authorization: 'Bearer admin', 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try { await run(call, executed); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('maintenance blocks real HTTP business dispatch before quotas/mutations while preserving recovery, fulfillment and the customer API', async () => {
  const f = fixture({ ...DEFAULT_SYSTEM_SETTINGS, maintenanceMode: true });
  await withPolicy(f, async (call, executed) => {
    // The customer DaaS API keeps serving during maintenance.
    assert.equal((await call('/daas/v1/catalog')).status, 200);
    executed.length = 0;
    for (const [path, method] of [['/API/v1/API-KEYS/', 'POST'], ['/api/v1/product-submissions', 'POST'],
      ['/api/v1/checkout/create-gcash', 'POST'], ['/api/v1/product-media/upload/customer', 'POST'], ['/api/v1/free-trial/activate', 'POST']]) {
      const result = await call(path, method); assert.equal(result.status, 503); assert.equal((await result.json()).code, 'MAINTENANCE_MODE');
    }
    assert.equal(executed.length, 0); assert.equal(f.db.commits, 0);
    for (const [path, method] of [['/daas/v1/health', 'GET'], ['/api/v1/admin/system/settings', 'GET'], ['/api/v1/auth/login', 'POST'],
      ['/api/webhooks/paymongo', 'POST'], ['/api/v1/checkout/subscription-status', 'GET'], ['/api/v1/free-trial/session', 'POST'], ['/api/v1/account/deletion', 'POST'],
      ['/api/v1/api-keys/key', 'DELETE']]) {
      assert.equal((await call(path, method)).status, 200);
    }
    assert.equal((await call('/api/v1/admin/system/settings', 'PATCH', '203.0.113.12', {
      version: (await f.read()).body.version, changes: { maintenanceMode: false } })).status, 200);
    assert.equal((await call('/daas/v1/catalog')).status, 200);
  });
});
test('plan settings cannot change or reset the independent 60/minute IP limit or public-image limiter', async () => {
  const f = fixture({ ...DEFAULT_SYSTEM_SETTINGS, planRequestLimits: { free_trial: null, pro: 1000, pro_max: null } });
  await withPolicy(f, async call => {
    for (let i = 0; i < 59; i++) assert.equal((await call('/api/v1/products')).status, 200);
    f.db.seed('system/settings', { ...DEFAULT_SYSTEM_SETTINGS, planRequestLimits: { free_trial: 2, pro: 4000, pro_max: 2 } });
    assert.equal((await call('/api/v1/products')).status, 200); assert.equal((await call('/api/v1/products')).status, 429);
    for (let i = 0; i < 8; i++) assert.equal((await call(`/api/v1/product-media/${'a'.repeat(64)}/image`)).status, 200);
    assert.equal((await call('/api/v1/products', 'GET', '203.0.113.13')).status, 200);
    assert.equal((await call('/api/v1/products', 'GET', 'forged-header')).status, 503);
  });
});
test('unavailable settings fail closed only on affected routes; payment/recovery require no policy lookup', async () => {
  const f = fixture(); f.db.failRead = 'system/settings';
  await withPolicy(f, async call => {
    assert.equal((await call('/api/v1/products')).status, 503);
    assert.equal((await call('/api/webhooks/paymongo', 'POST')).status, 200);
    assert.equal((await call('/api/v1/admin/system/settings', 'GET')).status, 200);
  });
});

test('registration preflight verifies response; disabled/unavailable performs no Auth creation', async () => {
  assert.equal(await readRegistrationPolicy(async () => ({ ok: true, json: async () => ({ success: true, allowNewRegistrations: false }) })), false);
  await assert.rejects(readRegistrationPolicy(async () => ({ ok: true, json: async () => ({ allowNewRegistrations: true }) })));
  for (const canRegister of [async () => false, async () => { throw Error('offline'); }]) {
    let calls = 0; const result = await completeCustomerSignup({ canRegister, createUser: () => { calls++; } });
    assert.equal(result.ok, false); assert.equal(calls, 0);
  }
});
for (const [exists, expectedDelete, expectedSuccess] of [[true, false, true], [false, true, false], ['unknown', false, false]]) {
  test(`partial Auth cleanup after uncertain profile commit: ${exists}`, async () => {
    const events = [];
    const result = await completeCustomerSignup({ canRegister: async () => true,
      createUser: async () => ({ uid: 'new-only' }), writeProfile: async () => { events.push('profile'); throw Error('uncertain'); },
      profileExists: async () => { if (exists === 'unknown') throw Error('offline'); return exists; },
      deleteUser: async user => { assert.equal(user.uid, 'new-only'); events.push('delete'); }, signOut: async () => events.push('signout') });
    assert.equal(result.ok, expectedSuccess); assert.equal(events.includes('delete'), expectedDelete); assert.equal(events.at(-1), 'signout');
  });
}
test('registration has no automatic retries and preserves explicit sign-out on success', async () => {
  const events = []; const result = await completeCustomerSignup({ canRegister: async () => true,
    createUser: async () => { events.push('create'); return { uid: 'new-only' }; }, writeProfile: async () => events.push('profile'), signOut: async () => events.push('signout') });
  assert.equal(result.ok, true); assert.deepEqual(events, ['create', 'profile', 'signout']);
});

test('scheduled maintenance: both times required, end after start, and it is active only inside the window', async () => {
  const { maintenanceActive } = await import('../../services/system-settings-contract.mjs');
  const f = fixture({ ...DEFAULT_SYSTEM_SETTINGS });
  const bad = await f.save({ maintenanceStartsAt: '2026-10-20T10:00:00.000Z' });
  assert.equal(bad.statusCode, 400); assert.equal(bad.body.code, 'MAINTENANCE_SCHEDULE_INVALID');
  const reversed = await f.save({ maintenanceStartsAt: '2026-10-20T10:00:00.000Z', maintenanceEndsAt: '2026-10-20T09:00:00.000Z' });
  assert.equal(reversed.statusCode, 400);
  assert.equal((await f.save({ maintenanceStartsAt: 'tomorrow', maintenanceEndsAt: null })).statusCode, 400);
  const ok = await f.save({ maintenanceStartsAt: '2026-10-20T10:00:00.000Z', maintenanceEndsAt: '2026-10-20T12:00:00.000Z' });
  assert.equal(ok.statusCode, 200);
  const settings = ok.body.settings;
  assert.equal(maintenanceActive(settings, new Date('2026-10-20T09:59:59.999Z')), false);
  assert.equal(maintenanceActive(settings, new Date('2026-10-20T10:00:00.000Z')), true);
  assert.equal(maintenanceActive(settings, new Date('2026-10-20T12:00:00.000Z')), false);
  // Clearing the schedule needs both fields cleared together.
  assert.equal((await f.save({ maintenanceStartsAt: null, maintenanceEndsAt: null }, (await f.read()).body.version)).statusCode, 200);
});
