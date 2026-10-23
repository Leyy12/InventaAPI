// Runs the Firestore-compatible Supabase data layer against a real Postgres.
// Needs TEST_DATABASE_URL pointing at a database with supabase/migrations applied;
// skipped otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresFirestore, FieldValue, FieldPath, Timestamp } from '../../database/postgres-firestore.js';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';

let db;
test.before(async () => {
    if (!url) return;
    db = new PostgresFirestore({ connectionString: url, projectId: 'inventaapi-staging' });
    await db._run(client => client.query('truncate public.products, public.users, public.notifications, public.system'));
});
test.after(async () => { if (db) await db.terminate(); });

test('set, get and Firestore-shaped timestamps', { skip }, async () => {
    const when = new Date('2026-10-21T06:00:00.123Z');
    await db.collection('users').doc('u1').set({ name: 'Ann', at: when, nested: { a: 1 }, gone: undefined });
    const snap = await db.collection('users').doc('u1').get();
    assert.equal(snap.exists, true);
    assert.equal(snap.id, 'u1');
    const data = snap.data();
    assert.ok(data.at instanceof Timestamp);
    assert.equal(data.at.toDate().toISOString(), when.toISOString());
    assert.equal(JSON.parse(JSON.stringify(data.at))._seconds, Math.floor(when.getTime() / 1000));
    assert.equal('gone' in data, false);
    assert.ok(snap.createTime.toDate() instanceof Date);
    assert.equal(typeof snap.updateTime.seconds, 'number');
    assert.equal((await db.collection('users').doc('missing').get()).exists, false);
    assert.equal(db.projectId, 'inventaapi-staging');
});

test('merge, update paths and field values', { skip }, async () => {
    const ref = db.collection('users').doc('u2');
    await ref.set({ profile: { first: 'A', last: 'B' }, count: 1, tags: ['x'] });
    await ref.set({ profile: { first: 'C' } }, { merge: true });
    await ref.update({ 'profile.age': 30, count: FieldValue.increment(2), tags: FieldValue.arrayUnion('x', 'y'), stamp: FieldValue.serverTimestamp() });
    await ref.update('profile.last', FieldValue.delete());
    const data = (await ref.get()).data();
    assert.deepEqual(data.profile, { first: 'C', age: 30 });
    assert.equal(data.count, 3);
    assert.deepEqual(data.tags, ['x', 'y']);
    assert.ok(data.stamp instanceof Timestamp);
    await ref.set({ only: true });
    assert.deepEqual((await ref.get()).data(), { only: true });
});

test('create and update preconditions use Firestore error codes', { skip }, async () => {
    const ref = db.collection('users').doc('u3');
    await ref.create({ a: 1 });
    await assert.rejects(ref.create({ a: 2 }), e => e.code === 6);
    await assert.rejects(db.collection('users').doc('nope').update({ a: 1 }), e => e.code === 5);
    const added = await db.collection('notifications').add({ userId: 'u3' });
    assert.equal(added.id.length, 20);
    await ref.delete();
    assert.equal((await ref.get()).exists, false);
});

test('queries: filters, ordering, cursors, select and count', { skip }, async () => {
    const col = db.collection('products');
    for (let i = 0; i < 6; i += 1) {
        await col.doc(`p${i}`).set({ name: `N${i}`, price: i * 10, type: i % 2 ? 'odd' : 'even', at: new Date(Date.UTC(2026, 0, i + 1)), flag: i === 0 ? null : true });
    }
    await col.doc('nofield').set({ type: 'even' });
    const evens = await col.where('type', '==', 'even').get();
    assert.equal(evens.size, 4);
    const ranged = await col.where('price', '>=', 20).where('price', '<', 50).orderBy('price', 'desc').get();
    assert.deepEqual(ranged.docs.map(d => d.id), ['p4', 'p3', 'p2']);
    const byDate = await col.where('at', '>', new Date(Date.UTC(2026, 0, 4))).orderBy('at').get();
    assert.deepEqual(byDate.docs.map(d => d.id), ['p4', 'p5']);
    const page1 = await col.orderBy('price').limit(2).get();
    const page2 = await col.orderBy('price').startAfter(page1.docs[1]).limit(2).get();
    assert.deepEqual(page2.docs.map(d => d.id), ['p2', 'p3']);
    const byId = await col.orderBy(FieldPath.documentId()).startAfter('p3').get();
    assert.deepEqual(byId.docs.map(d => d.id), ['p4', 'p5']);
    const inList = await col.where('name', 'in', ['N1', 'N5']).get();
    assert.equal(inList.size, 2);
    const ids = await col.where(FieldPath.documentId(), 'in', ['p1', 'p2']).get();
    assert.equal(ids.size, 2);
    assert.equal((await col.where('flag', '==', null).get()).size, 1);
    assert.equal((await col.where('type', '!=', 'odd').get()).size, 4);
    const picked = await col.select('name').where('price', '==', 10).get();
    assert.deepEqual(picked.docs[0].data(), { name: 'N1' });
    assert.equal((await col.count().get()).data().count, 7);
    assert.equal((await col.where('type', '==', 'odd').count().get()).data().count, 3);
});

test('transactions serialize concurrent read-modify-write', { skip }, async () => {
    const ref = db.collection('system').doc('counter');
    await ref.set({ n: 0 });
    await Promise.all(Array.from({ length: 8 }, () => db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        tx.update(ref, { n: snap.data().n + 1 });
    }, { maxAttempts: 30 })));
    assert.equal((await ref.get()).data().n, 8);
    const result = await db.runTransaction(async tx => {
        const q = await tx.get(db.collection('system').where('n', '==', 8));
        tx.set(db.collection('system').doc('other'), { seen: q.size });
        return 'ok';
    });
    assert.equal(result, 'ok');
    await assert.rejects(db.runTransaction(async tx => {
        tx.set(db.collection('system').doc('rolled'), { x: 1 });
        throw new Error('boom');
    }), /boom/u);
    assert.equal((await db.collection('system').doc('rolled').get()).exists, false);
});

test('batch writes commit together', { skip }, async () => {
    const batch = db.batch();
    batch.set(db.collection('notifications').doc('b1'), { read: false });
    batch.set(db.collection('notifications').doc('b2'), { read: false });
    await batch.commit();
    const unread = await db.collection('notifications').where('read', '==', false).get();
    const second = db.batch();
    unread.docs.forEach(doc => second.update(doc.ref, { read: true }));
    await second.commit();
    assert.equal((await db.collection('notifications').where('read', '==', false).get()).size, 0);
});


