import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { authenticateCredential, accountEntitlement } from '../../../services/api-key-security.js';
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';

const account = { role: 'Developer', plan: 'Free', apiRequestLimit: 50, selectedSegment: 'Grocery', businessSegment: 'Grocery' };
const legacy = { key: 'daas_existing_legacy', name: 'Historical key', status: 'active', userId: 'owner' };
function setup(extra = {}) {
  let now = new Date('2026-09-22T12:00:00.000Z');
  const db = memoryFirestore({ 'users/owner': account, 'users/other': account, ...extra });
  const clock = () => new Date(now);
  const handlers = createApiKeyHandlers({ getDb: () => db, clock, verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true);
    if (!['owner-token', 'other-token'].includes(token)) throw new Error('invalid');
    return { uid: token === 'owner-token' ? 'owner' : 'other' };
  } });
  return { db, handlers, clock, setTime: value => { now = new Date(value); },
    create: (options = {}) => invoke(handlers.create, { body: { keyName: 'Integration' }, ...options }) };
}
const docs = async (db, collection) => (await db.collection(collection).get()).docs;
const counts = async db => [(await docs(db, 'api_keys')).length, (await docs(db, 'api_key_generation_days')).length];
const denied = response => {
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error, 'API_KEY_DAILY_GENERATION_LIMIT');
  assert.equal(response.body.success, false);
  assert.equal(Object.hasOwn(response.body, 'key'), false);
};

test('first creation commits a hash-only v2 key and one marker; only success returns secret', async () => {
  const { db, create, handlers } = setup();
  const result = await create();
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.match(result.body.key, /^daas_v2_[a-f0-9]{32}\.[a-f0-9]{64}$/);
  assert.deepEqual(await counts(db), [1, 1]);
  const key = db.read(`api_keys/${result.body.id}`);
  assert.equal(key.credentialVersion, 2);
  assert.match(key.credentialHash, /^[a-f0-9]{64}$/);
  const marker = (await docs(db, 'api_key_generation_days'))[0].data();
  assert.deepEqual(Object.keys(marker).sort(), ['createdAt', 'keyId', 'nextEligibleAt', 'userId', 'window']);
  assert.equal(marker.keyId, result.body.id);
  assert.equal(marker.userId, 'owner');
  assert.equal(marker.window, '2026-09-22');
  assert.equal(marker.nextEligibleAt, '2026-09-23T00:00:00.000Z');
  for (const collection of ['api_keys', 'api_key_generation_days', 'audit_logs']) {
    const stored = JSON.stringify((await docs(db, collection)).map(doc => doc.data()));
    assert.equal(stored.includes(result.body.key), false);
    assert.equal(stored.includes(result.body.key.split('.')[1]), false);
  }
  for (const operation of ['list', 'view']) {
    const response = await invoke(handlers[operation], { id: result.body.id });
    assert.equal(JSON.stringify(response.body).includes(result.body.key), false);
  }
  assert.equal((await authenticateCredential(db, result.body.key)).id, result.body.id);
});

test('second generation same day denied with server next midnight; no new key/audit', async () => {
  const { db, create } = setup();
  await create(); const response = await create(); denied(response);
  assert.equal(response.body.nextEligibleAt, '2026-09-23T00:00:00.000Z');
  assert.deepEqual(await counts(db), [1, 1]);
  assert.equal((await docs(db, 'audit_logs')).length, 1);
});

test('UTC 23:59:59.999 succeeds, repeat denied, 00:00:00.000 next day succeeds', async () => {
  const { db, create, setTime } = setup();
  setTime('2026-09-22T23:59:59.999Z');
  assert.equal((await create()).statusCode, 200); denied(await create());
  setTime('2026-09-23T00:00:00.000Z');
  assert.equal((await create()).statusCode, 200); denied(await create());
  assert.deepEqual(await counts(db), [2, 2]);
});

test('calendar day rather than rolling 24 hours, including year rollover', async () => {
  const { create, setTime } = setup();
  setTime('2026-12-31T23:59:59.999Z'); assert.equal((await create()).statusCode, 200);
  setTime('2027-01-01T00:00:00.000Z'); assert.equal((await create()).statusCode, 200);
});

for (const [end, next] of [
  ['2026-09-30T23:59:59.999Z', '2026-10-01T00:00:00.000Z'],
  ['2026-12-31T23:59:59.999Z', '2027-01-01T00:00:00.000Z'],
  ['2028-02-28T23:59:59.999Z', '2028-02-29T00:00:00.000Z'],
  ['2028-02-29T23:59:59.999Z', '2028-03-01T00:00:00.000Z'],
]) test(`server nextEligibleAt across calendar boundary: ${end}`, async () => {
  const { db, create, setTime } = setup();
  setTime(end); assert.equal((await create()).statusCode, 200);
  const blocked = await create(); denied(blocked); assert.equal(blocked.body.nextEligibleAt, next);
  assert.equal((await docs(db, 'api_key_generation_days'))[0].data().nextEligibleAt, next);
  setTime(next); assert.equal((await create()).statusCode, 200); assert.deepEqual(await counts(db), [2, 2]);
});

test('two concurrent same-account requests: exactly one key/marker and one daily denial', async () => {
  const { db, create } = setup();
  const results = await Promise.all([create(), create()]);
  assert.equal(results.filter(r => r.statusCode === 200).length, 1);
  denied(results.find(r => r.statusCode !== 200));
  assert.ok(db.retries > 0, 'exercise an actual optimistic conflict and retry');
  assert.deepEqual(await counts(db), [1, 1]);
  assert.equal((await docs(db, 'api_key_generation_days'))[0].data().keyId, results.find(r => r.statusCode === 200).body.id);
});

test('many concurrent callers still commit exactly one generation', async () => {
  const { db, create } = setup();
  const results = await Promise.all(Array.from({ length: 20 }, () => create()));
  assert.equal(results.filter(r => r.statusCode === 200).length, 1);
  results.filter(r => r.statusCode !== 200).forEach(denied);
  assert.deepEqual(await counts(db), [1, 1]);
});

test('independent backend handler instances contend only through shared transactional state', async () => {
  const { db, create, clock } = setup();
  const secondInstance = createApiKeyHandlers({ getDb: () => db, clock,
    verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); return { uid: 'owner' }; } });
  const results = await Promise.all([create(), invoke(secondInstance.create, { body: { keyName: 'Another device' } })]);
  assert.equal(results.filter(result => result.statusCode === 200).length, 1);
  denied(results.find(result => result.statusCode !== 200));
  assert.ok(db.retries > 0); assert.deepEqual(await counts(db), [1, 1]);
  const restarted = createApiKeyHandlers({ getDb: () => db, clock, verifyIdToken: async () => ({ uid: 'owner' }) });
  denied(await invoke(restarted.create, { body: { keyName: 'After restart' } }));
});

test('two accounts independently generate on same day', async () => {
  const { db, create } = setup();
  const results = await Promise.all([create(), create({ token: 'other-token' })]);
  assert.deepEqual(results.map(r => r.statusCode), [200, 200]);
  assert.deepEqual(await counts(db), [2, 2]);
});

test('transaction conflict spanning midnight recomputes marker and creation time on retry', async () => {
  const { db, create, setTime } = setup(); const run = db.runTransaction; let conflicted = false;
  setTime('2026-09-22T23:59:59.999Z');
  db.runTransaction = cb => run(async tx => {
    const result = await cb(tx);
    if (result?.credentialVersion === 2 && !conflicted) {
      conflicted = true;
      await db.collection('users').doc('owner').update({ displayName: 'Concurrent profile update' });
      setTime('2026-09-23T00:00:00.000Z');
    }
    return result;
  });
  const made = await create(); assert.equal(made.statusCode, 200); assert.ok(db.retries > 0);
  assert.deepEqual(await counts(db), [1, 1]);
  const marker = (await docs(db, 'api_key_generation_days'))[0].data();
  assert.equal(marker.window, '2026-09-23'); assert.equal(marker.nextEligibleAt, '2026-09-24T00:00:00.000Z');
  assert.equal(db.read(`api_keys/${made.body.id}`).createdAt.toISOString(), '2026-09-23T00:00:00.000Z');
  denied(await create());
});

test('body identity, browser day, timezone, marker and request limits never control allowance', async () => {
  const { db, create } = setup();
  const forged = { keyName: 'Alias', userId: 'other', window: '2099-01-01', date: '2099-01-01', dayKey: '2099-01-01', timestamp: '2099', timezone: 'Pacific/Honolulu',
    nextEligibleAt: '2000-01-01', apiRequestLimit: 99999, generationAllowed: true };
  const response = await create({ body: forged });
  assert.equal(response.body.userId, 'owner');
  denied(await create({ body: { ...forged, keyName: 'Different alias' }, query: { userId: 'other', date: '2099' } }));
  assert.equal((await docs(db, 'api_key_generation_days'))[0].data().window, '2026-09-22');
});

for (const body of [{}, { keyName: '' }, { keyName: 'x'.repeat(121) }, { keyName: 'Valid', linkedProductIds: ['a/b'] },
  { keyName: 'Valid', linkedProductIds: ['missing'] }, { keyName: 'Valid', linkedVariantSelections: { rice: [] } }]) {
  test(`invalid creation does not spend allowance: ${JSON.stringify(body)}`, async () => {
    const { db, create } = setup();
    assert.equal((await create({ body })).statusCode, 400);
    assert.deepEqual(await counts(db), [0, 0]);
    assert.equal((await create()).statusCode, 200);
  });
}

for (const token of [null, 'invalid', 'api-key-instead-of-firebase']) test(`authentication failure: ${token}`, async () => {
  const { db, create } = setup();
  assert.equal((await create({ token })).statusCode, 401);
  assert.deepEqual(await counts(db), [0, 0]);
  assert.equal((await create()).statusCode, 200);
});

for (const change of [{ disabled: true }, { deleted: true }, { deletedAt: '2026-09-21' }, { deletionRequested: true },
  { status: 'pending_deletion' }, { status: 'deleting' }, { status: 'disabled' }, { accountState: 'deleting' },
  { accountState: 'deleted' }, { plan: 'Deleted' }]) test(`account barrier preserved: ${JSON.stringify(change)}`, async () => {
  const { db, create } = setup({ 'users/owner': { ...account, ...change } });
  assert.equal((await create()).statusCode, 403);
  assert.deepEqual(await counts(db), [0, 0]);
});

test('missing authoritative account cannot generate or consume allowance', async () => {
  const { db, create } = setup({ 'users/owner': null });
  assert.equal((await create()).statusCode, 404); assert.deepEqual(await counts(db), [0, 0]);
});

test('deletion between preflight and mutation is rechecked transactionally', async () => {
  const { db, create } = setup(); const run = db.runTransaction; let calls = 0;
  db.runTransaction = async cb => {
    if (++calls === 2) await db.collection('users').doc('owner').update({ deletionRequested: true });
    return run(cb);
  };
  assert.equal((await create()).statusCode, 403); assert.deepEqual(await counts(db), [0, 0]);
});

test('transaction failure after both writes queued commits neither; next attempt can succeed', async () => {
  const { db, create } = setup(); const run = db.runTransaction;
  db.runTransaction = cb => run(async tx => {
    const result = await cb(tx);
    if (result?.credentialVersion === 2) db.failCommit = true;
    return result;
  });
  const failed = await create();
  assert.equal(failed.statusCode, 503); assert.equal(Object.hasOwn(failed.body, 'key'), false);
  assert.deepEqual(await counts(db), [0, 0]);
  db.runTransaction = run; db.failCommit = false;
  assert.equal((await create()).statusCode, 200);
});

test('response stays pending until the key and marker commit together', async () => {
  const { db, create } = setup(); const run = db.runTransaction;
  let release, entered, returned = false;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  db.runTransaction = cb => run(async tx => {
    const result = await cb(tx);
    if (result?.credentialVersion === 2) { entered(); await gate; }
    return result;
  });
  const pending = create().then(result => { returned = true; return result; });
  await ready;
  try { assert.equal(returned, false); assert.deepEqual(await counts(db), [0, 0]); }
  finally { release(); }
  assert.equal((await pending).statusCode, 200); assert.deepEqual(await counts(db), [1, 1]);
});

test('response failure after durable commit is sanitized and retry cannot create a duplicate', async () => {
  const { db, handlers, create } = setup(); let unreturnedSecret;
  const res = { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; },
    json(value) {
      if (value.success) { unreturnedSecret = value.key; throw new Error(`Synthetic serialization failure: ${value.key}`); }
      this.body = value; return this;
    } };
  await handlers.create({ headers: { authorization: 'Bearer owner-token' }, body: { keyName: 'Lost response' } }, res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.error, 'SERVICE_UNAVAILABLE');
  assert.equal(JSON.stringify(res.body).includes(unreturnedSecret), false);
  assert.deepEqual(await counts(db), [1, 1]); denied(await create());
  assert.deepEqual(await counts(db), [1, 1]);
});

test('selector collision aborts without marker; fresh retry succeeds', async () => {
  const { db, create } = setup(); const run = db.runTransaction;
  db.runTransaction = cb => run(tx => cb({ ...tx, get: async ref => ref.path.startsWith('api_keys/')
    ? { exists: true } : tx.get(ref) }));
  const failed = await create(); assert.equal(failed.body.error, 'KEY_COLLISION');
  assert.equal(Object.hasOwn(failed.body, 'key'), false); assert.deepEqual(await counts(db), [0, 0]);
  db.runTransaction = run; assert.equal((await create()).statusCode, 200);
});

test('audit outage after committed creation does not replay key or release allowance', async () => {
  const { db, create } = setup(); const collection = db.collection;
  db.collection = name => name === 'audit_logs' ? { add: async () => { throw new Error('unavailable'); } } : collection(name);
  assert.equal((await create()).statusCode, 200); denied(await create());
  assert.deepEqual(await counts(db), [1, 1]);
});

test('revocation and deactivation do not restore the consumed generation', async () => {
  const { db, create, handlers } = setup(); const made = await create();
  await db.collection('api_keys').doc(made.body.id).update({ status: 'inactive' }); denied(await create());
  assert.equal((await invoke(handlers.revoke, { id: made.body.id })).statusCode, 200); denied(await create());
  assert.equal(db.read(`api_keys/${made.body.id}`).status, 'revoked'); assert.deepEqual(await counts(db), [1, 1]);
});

test('even privileged deletion of the key record does not refund the daily marker', async () => {
  const { db, create } = setup(); const made = await create();
  // Customer UI only revokes; this simulates an out-of-band server-side deletion.
  await db.collection('api_keys').doc(made.body.id).delete();
  denied(await create()); assert.deepEqual(await counts(db), [0, 1]);
});

test('old same-day keys and multiple historical keys survive clean deployment cutover', async () => {
  const old = { ...legacy, createdAt: new Date('2026-09-22T10:00:00Z') };
  const { db, create } = setup({ 'api_keys/legacy-a': old, 'api_keys/legacy-b': { ...old, key: 'daas_other_legacy' } });
  assert.equal((await create()).statusCode, 200); denied(await create());
  assert.deepEqual(db.read('api_keys/legacy-a'), old);
  assert.equal((await authenticateCredential(db, legacy.key)).id, 'legacy-a');
  assert.equal((await authenticateCredential(db, 'daas_other_legacy')).id, 'legacy-b');
  assert.deepEqual(await counts(db), [3, 1]);
});

for (const [plan, cap, expected] of [['Free', 50, 50], ['Free', 7, 7], ['Pro', 5000, 5000], ['Enterprise', null, null]]) {
  test(`generation and shared request quota independent: ${plan}/${cap}`, async () => {
    const usage = { window: plan === 'Free' ? '2026-09' : '2026-09-22', used: 2 };
    const counter = plan === 'Free' ? 'account_free_monthly_usage/owner' : 'account_api_usage/owner';
    const profile = { ...account, plan, apiRequestLimit: cap, subscription_status: 'active', subscriptionExpiresAt: '2027-01-01T00:00:00.000Z' };
    const { db, create, clock } = setup({ 'users/owner': profile, [counter]: usage, 'api_keys/old': legacy });
    const made = await create(); assert.equal(made.statusCode, 200);
    assert.deepEqual(db.read(counter), usage);
    assert.equal(accountEntitlement(profile, clock()).limit, expected);
    await consumeAccountQuota(db, { userId: 'owner', keyId: 'old', credential: legacy.key, clock });
    await consumeAccountQuota(db, { userId: 'owner', keyId: made.body.id, credential: made.body.key, clock });
    assert.equal(db.read(counter).used, 4); denied(await create());
    assert.equal((await docs(db, 'api_telemetry')).length, 0);
  });
}

test('generation does not initialize absent API request quota or fake history', async () => {
  const { db, create } = setup(); await create();
  assert.equal(db.read('account_api_usage/owner'), undefined);
  assert.equal((await docs(db, 'api_telemetry')).length, 0);
});

test('existing malformed generation marker fails closed rather than releasing allowance', async () => {
  const { db, create } = setup(); await create();
  const marker = (await docs(db, 'api_key_generation_days'))[0];
  await db.collection('api_key_generation_days').doc(marker.id).set({}); denied(await create());
});
