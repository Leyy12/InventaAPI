// Browser data endpoint (/api/v1/client-db) applying the access rules in services/client-db-rules.js,
// run against a real Postgres. Needs TEST_DATABASE_URL; skipped otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
if (url) Object.assign(process.env, { DATA_BACKEND: 'supabase', SUPABASE_DB_URL: url });

let db, handler;
const tokens = {
    admin: { uid: 'admin1' },
    ann: { uid: 'ann', email: 'ann@example.com', email_verified: true },
    bob: { uid: 'bob', email: 'bob@example.com', email_verified: false },
};

async function call(who, body) {
    let status = 200, payload;
    const res = { status(code) { status = code; return this; }, json(value) { payload = value; return this; } };
    await handler({ headers: who ? { authorization: `Bearer ${who}` } : {}, body }, res);
    return { status, ...payload };
}

test.before(async () => {
    if (!url) return;
    const { PostgresDataStore } = await import('../../database/postgres-data-store.js');
    const { createClientDbHandler } = await import('../../routes/client-db.js');
    db = new PostgresDataStore({ connectionString: url });
    await db._run(client => client.query('truncate public.users, public.notifications, public.products, public.audit_logs, public.system, public.api_keys'));
    await db.collection('users').doc('admin1').set({ uid: 'admin1', role: 'Admin' });
    await db.collection('users').doc('bob').set({ uid: 'bob', role: 'Developer', plan: 'Free', apiRequestLimit: 50, email: 'bob@example.com' });
    await db.collection('products').doc('p1').set({ name: 'Coke', segment: 'Grocery', price: 10, variants: [{ size: '1L', price: 10 }] });
    await db.collection('api_keys').doc('k1').set({ userId: 'bob', status: 'active', key: 'secret' });
    handler = createClientDbHandler({ getDb: () => db, verifyIdToken: async token => {
        if (!tokens[token]) throw new Error('bad token');
        return tokens[token];
    } });
});
test.after(async () => { if (db) await db.terminate(); });

const profile = { uid: 'ann', email: 'ann@example.com', fullName: 'Ann', businessName: 'Shop', businessSegment: 'Grocery',
    plan: 'Free', role: 'Developer', apiRequestLimit: 50, apiRequestsUsed: 0, createdAt: { __fv: 'serverTimestamp' },
    termsAccepted: true, termsVersion: 'v1', termsAcceptedAt: { __fv: 'serverTimestamp' }, privacyConsent: true };

test('signup profile creation follows the users rules', { skip }, async () => {
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'set', path: 'users/ann', data: { ...profile, role: 'Admin' } }] })).status, 403);
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'set', path: 'users/ann', data: { ...profile, trialUsed: true } }] })).status, 403);
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'set', path: 'users/bob', data: profile }] })).status, 403);
    await db.collection('system').doc('settings').set({ allowNewRegistrations: false });
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'set', path: 'users/ann', data: profile }] })).status, 403);
    await db.collection('system').doc('settings').delete();
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'set', path: 'users/ann', data: profile }] })).status, 200);
    const read = await call('ann', { op: 'get', path: 'users/ann' });
    assert.equal(read.exists, true);
    assert.match(read.data.createdAt.__ts, /^\d{4}-/u);
    assert.equal((await call('bob', { op: 'get', path: 'users/ann' })).status, 403);
    assert.equal((await call(null, { op: 'get', path: 'users/ann' })).status, 403);
    assert.equal((await call('admin', { op: 'get', path: 'users/ann' })).exists, true);
    assert.equal((await call('ann', { op: 'get', path: 'users/nobody' })).status, 403);
    assert.equal((await call('bob', { op: 'get', path: 'users/bob' })).exists, true);
});

test('owners edit only allowed profile fields', { skip }, async () => {
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'update', path: 'users/ann', data: { fullName: 'Ann B' } }] })).status, 200);
    for (const data of [{ role: 'Admin' }, { plan: 'Pro' }, { email: 'x@example.com' }, { trialUsed: true }, { selectedSegment: 'Pharmacy' }]) {
        assert.equal((await call('ann', { op: 'write', writes: [{ type: 'update', path: 'users/ann', data }] })).status, 403, JSON.stringify(data));
    }
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'update', path: 'users/ann', data: { selectedSegment: 'Grocery' } }] })).status, 200);
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'delete', path: 'users/ann' }] })).status, 403);
});

test('notifications: customers write to admin, read their own, toggle only read', { skip }, async () => {
    const toAdmin = await call('ann', { op: 'add', collection: 'notifications', data: { userId: 'admin', title: 'Hi', read: false, createdAt: { __fv: 'serverTimestamp' } } });
    assert.equal(toAdmin.status, 200);
    assert.equal((await call('ann', { op: 'add', collection: 'notifications', data: { userId: 'bob', read: false } })).status, 403);
    const toAnn = await call('admin', { op: 'add', collection: 'notifications', data: { userId: 'ann', read: false, createdAt: { __fv: 'serverTimestamp' } } });
    const mine = await call('ann', { op: 'query', collection: 'notifications', filters: [['userId', '==', 'ann']], orderBy: [['createdAt', 'desc']] });
    assert.deepEqual(mine.docs.map(d => d.id), [toAnn.id]);
    assert.equal((await call('ann', { op: 'query', collection: 'notifications', filters: [['userId', '==', 'admin']] })).status, 403);
    assert.equal((await call('admin', { op: 'query', collection: 'notifications', filters: [['userId', '==', 'admin']] })).docs.length, 1);
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'update', path: `notifications/${toAnn.id}`, data: { title: 'x' } }] })).status, 403);
    assert.equal((await call('ann', { op: 'write', writes: [{ type: 'update', path: `notifications/${toAnn.id}`, data: { read: true } }] })).status, 200);
    assert.equal((await call('bob', { op: 'write', writes: [{ type: 'update', path: `notifications/${toAnn.id}`, data: { read: false } }] })).status, 403);
});

test('products are public and read-only; admin-only collections stay admin-only', { skip }, async () => {
    const products = await call(null, { op: 'query', collection: 'products' });
    assert.equal(products.docs.length, 1);
    const byId = await call(null, { op: 'query', collection: 'products', filters: [['__name__', 'in', ['p1', 'p9']]] });
    assert.deepEqual(byId.docs.map(d => d.id), ['p1']);
    assert.equal((await call('admin', { op: 'add', collection: 'products', data: { name: 'x' } })).status, 403);
    assert.equal((await call('bob', { op: 'query', collection: 'api_keys' })).status, 403);
    assert.equal((await call('admin', { op: 'query', collection: 'api_keys' })).docs.length, 1);
    assert.equal((await call('admin', { op: 'query', collection: 'payment_orders' })).status, 403);
    assert.equal((await call('admin', { op: 'get', path: 'email_verifications/x' })).status, 403);
    assert.equal((await call('admin', { op: 'write', writes: [{ type: 'set', path: 'system/settings', data: { maintenanceMode: true } }] })).status, 403);
    assert.equal((await call('ann', { op: 'add', collection: 'audit_logs', data: { action: 'Customer Login', userId: 'ann' } })).status, 200);
    assert.equal((await call('ann', { op: 'add', collection: 'audit_logs', data: { action: 'Customer Login', userId: 'bob' } })).status, 403);
    assert.equal((await call('ann', { op: 'add', collection: 'enterprise_inquiries', data: { fullName: 'A', email: 'a@b.c', company: 'C', message: '' } })).status, 403);
    assert.equal((await call('ann', { op: 'add', collection: 'enterprise_inquiries', data: { fullName: 'A', email: 'a@b.c', company: 'C', message: 'Hi' } })).status, 200);
    assert.equal((await call('nobody', { op: 'query', collection: 'products' })).status, 401);
});

test('field names cannot reach the shared Object prototype', { skip }, async () => {
    for (const data of [{ '__proto__.polluted': 'yes' }, { 'constructor.prototype.polluted': 'yes' }, { profile: { 'x.__proto__': 1 } }]) {
        const result = await call('bob', { op: 'write', writes: [{ type: 'update', path: 'users/bob', data }] });
        assert.equal(result.status, 400);
        assert.equal(({}).polluted, undefined);
    }
});

test('product prices are never sent to the browsers', { skip }, async () => {
    const [doc] = (await call(null, { op: 'query', collection: 'products' })).docs;
    assert.equal(doc.data.price, undefined);
    assert.deepEqual(doc.data.variants, [{ size: '1L' }]);
    assert.equal((await call(null, { op: 'get', path: 'products/p1' })).data.price, undefined);
});
