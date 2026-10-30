// Automatic app detection: how a call's source is identified, and the owner's
// list / block endpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyConsumer, ipRange, recordConsumer, consumerDocId } from '../../../services/api-consumers.js';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { memoryStore, invoke } from '../phase2a/memory-store.mjs';

const ip = value => () => value;

test('a website is identified by its domain, otherwise a server by its IP range', () => {
  assert.equal(identifyConsumer({ headers: { origin: 'https://Shop.Example.com' } }, { clientIp: ip('1.2.3.4') }).label, 'shop.example.com');
  assert.equal(identifyConsumer({ headers: { referer: 'https://blog.example.org/page?x=1' } }, { clientIp: ip('1.2.3.4') }).label, 'blog.example.org');
  const server = identifyConsumer({ headers: {} }, { clientIp: ip('203.0.113.77') });
  assert.deepEqual([server.kind, server.label, server.ip], ['ip', '203.0.113.0/24', '203.0.113.77']);
  assert.equal(identifyConsumer({ headers: { origin: 'null' } }, { clientIp: ip('203.0.113.9') }).label, '203.0.113.0/24');
  assert.equal(identifyConsumer({ headers: { origin: 'javascript:alert(1)' } }, { clientIp: ip('203.0.113.9') }).kind, 'ip');
  assert.equal(identifyConsumer({ headers: {} }, { clientIp: ip(null) }).kind, 'unknown');
  assert.equal(ipRange('2001:db8:1:2::5'), '2001:db8:1::/48');
  assert.equal(ipRange('::ffff:10.1.2.3'), '10.1.2.0/24');
  assert.equal(ipRange('not an ip'), null);
});

test('the first call records a new app; later calls update it; blocked state is kept', async () => {
  const db = memoryStore({});
  const consumer = identifyConsumer({ headers: { origin: 'https://a.example' } }, { clientIp: ip('1.2.3.4') });
  const first = await recordConsumer(db, { userId: 'owner', keyId: 'k1', consumer });
  assert.deepEqual([first.isNew, first.blocked], [true, false]);
  const second = await recordConsumer(db, { userId: 'owner', keyId: 'k1', consumer });
  assert.equal(second.isNew, false);
  assert.equal(db.read(`api_key_consumers/${consumerDocId('k1', consumer.group)}`).requests, 2);
});

test('the owner lists apps and can block / unblock only their own', async () => {
  const db = memoryStore({
    'api_key_consumers/k1_a': { userId: 'owner', keyId: 'k1', kind: 'domain', label: 'a.example', lastSeen: '2026-10-30T01:00:00.000Z', requests: 3 },
    'api_key_consumers/k1_b': { userId: 'owner', keyId: 'k1', kind: 'ip', label: '1.2.3.0/24', lastSeen: '2026-10-30T02:00:00.000Z', requests: 1 },
    'api_key_consumers/k9_c': { userId: 'someone-else', keyId: 'k9', kind: 'domain', label: 'c.example', requests: 1 },
  });
  const handlers = createApiKeyHandlers({ getDb: () => db, verifyIdToken: async () => ({ uid: 'owner' }), clock: () => new Date('2026-10-30T03:00:00Z') });
  const listed = await invoke(handlers.consumers, { token: 'owner-token' });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.body.apps.map(app => [app.label, app.blocked]), [['1.2.3.0/24', false], ['a.example', false]]);
  const blocked = await invoke(handlers.blockConsumer, { token: 'owner-token', params: { consumerId: 'k1_a' }, body: { blocked: true } });
  assert.equal(blocked.statusCode, 200); assert.equal(db.read('api_key_consumers/k1_a').blocked, true);
  const notMine = await invoke(handlers.blockConsumer, { token: 'owner-token', params: { consumerId: 'k9_c' }, body: { blocked: true } });
  assert.equal(notMine.statusCode, 404); assert.equal(db.read('api_key_consumers/k9_c').blocked, undefined);
  const bad = await invoke(handlers.blockConsumer, { token: 'owner-token', params: { consumerId: 'k1_a' }, body: { blocked: 'yes' } });
  assert.equal(bad.statusCode, 400);
});
