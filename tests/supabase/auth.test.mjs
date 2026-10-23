import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAuth } from '../../services/supabase-auth.js';

// Supabase Auth over a synthetic HTTP endpoint and SQL look-ups; nothing leaves the process.
const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const SECRET = 'sb_secret_SYNTHETIC', PUBLISHABLE = 'sb_publishable_SYNTHETIC';
const legacy = { id: '11111111-1111-4111-8111-111111111111', email: 'old@inventa.ph', email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { legacy_uid: 'firebaseUid123' } };
const fresh = { id: '22222222-2222-4222-8222-222222222222', email: 'new@inventa.ph', email_confirmed_at: null, app_metadata: {} };

function fixture({ users = [legacy, fresh], profiles = {}, respond } = {}) {
  const calls = [], sql = [];
  let clock = 0;
  const json = (status, body) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) });
  const request = async (url, init) => {
    calls.push({ url, ...init });
    const path = url.slice(`${URL_}/auth/v1`.length);
    if (respond) { const custom = await respond(path, init); if (custom) return custom; }
    if (path === '/user') {
      const user = users.find(u => init.headers.Authorization === `Bearer token-${u.id}`);
      return user ? json(200, user) : json(401, { msg: 'invalid JWT' });
    }
    if (path === '/admin/users' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      if (users.some(u => u.email === body.email)) return json(422, { error_code: 'email_exists', msg: 'already been registered' });
      const user = { id: `33333333-3333-4333-8333-33333333333${users.length}`, email: body.email,
        email_confirmed_at: body.email_confirm ? '2026-10-23T00:00:00Z' : null, app_metadata: body.app_metadata || {} };
      users.push(user); return json(200, user);
    }
    const match = /^\/admin\/users\/(.+)$/u.exec(path);
    if (match) {
      const user = users.find(u => u.id === match[1]);
      if (!user) return json(404, { error_code: 'user_not_found' });
      if (init.method === 'DELETE') { users.splice(users.indexOf(user), 1); return json(200, {}); }
      if (init.method === 'PUT') { const body = JSON.parse(init.body); if (body.password === 'weak') return json(422, { error_code: 'weak_password', msg: 'password too weak' }); return json(200, user); }
    }
    return json(500, {});
  };
  const query = async (text, params) => {
    sql.push({ text, params });
    if (/delete from auth\.sessions/u.test(text)) return { rows: [] };
    if (/lower\(email\)/u.test(text)) return { rows: users.filter(u => u.email.toLowerCase() === params[0].toLowerCase()) };
    return { rows: users.filter(u => u.app_metadata?.legacy_uid === params[0] || u.id === params[0]) };
  };
  const auth = createSupabaseAuth({ url: URL_, publishableKey: PUBLISHABLE, secretKey: SECRET, query, request,
    findProfileByEmail: async email => profiles[email] || null, now: () => clock });
  return { auth, calls, sql, users, tick: ms => { clock += ms; } };
}

test('a carried-over account keeps its old id; the token is checked with the publishable key only', async () => {
  const f = fixture();
  const claims = await f.auth.verifyIdToken(`token-${legacy.id}`);
  assert.equal(claims.uid, 'firebaseUid123'); assert.equal(claims.email, 'old@inventa.ph'); assert.equal(claims.email_verified, true);
  assert.equal((await f.auth.verifyIdToken(`token-${fresh.id}`)).uid, fresh.id);
  const check = f.calls[0];
  assert.equal(check.headers.apikey, PUBLISHABLE); assert.equal(check.headers.Authorization, `Bearer token-${legacy.id}`);
  assert.doesNotMatch(JSON.stringify(f.calls), /sb_secret_/u);
});
test('invalid tokens are refused; a valid one is cached briefly', async () => {
  const f = fixture();
  for (const token of ['nope', '', 42, 'x'.repeat(9000)]) await assert.rejects(f.auth.verifyIdToken(token), /Invalid/u);
  await f.auth.verifyIdToken(`token-${legacy.id}`); await f.auth.verifyIdToken(`token-${legacy.id}`);
  const checks = () => f.calls.filter(call => call.url.endsWith('/user')).length;
  const before = checks();
  f.tick(31000); await f.auth.verifyIdToken(`token-${legacy.id}`);
  assert.equal(checks(), before + 1);
});
test('a banned account is refused', async () => {
  const banned = { ...fresh, banned_until: '2999-01-01T00:00:00Z' };
  const f = fixture({ users: [banned] });
  await assert.rejects(f.auth.verifyIdToken(`token-${banned.id}`), error => error.code === 'auth/user-disabled');
});
test('account changes use the secret key on the apikey header, never Authorization', async () => {
  const f = fixture();
  const created = await f.auth.createUser({ email: 'shop@inventa.ph', password: 'secret-pass', emailVerified: true });
  assert.equal(created.email, 'shop@inventa.ph'); assert.equal(created.emailVerified, true);
  const post = f.calls.at(-1);
  assert.equal(post.headers.apikey, SECRET); assert.equal(post.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(post.body), { email: 'shop@inventa.ph', password: 'secret-pass', email_confirm: true });
  await assert.rejects(f.auth.createUser({ email: 'shop@inventa.ph', password: 'x' }), error => error.code === 'auth/email-already-exists');
});
test('updates and deletes address the account by its old id', async () => {
  const f = fixture();
  await f.auth.updateUser('firebaseUid123', { password: 'new-password' });
  assert.ok(f.calls.at(-1).url.endsWith(`/admin/users/${legacy.id}`)); assert.equal(f.calls.at(-1).method, 'PUT');
  await assert.rejects(f.auth.updateUser('firebaseUid123', { password: 'weak' }), error => error.code === 'auth/invalid-password');
  await assert.rejects(f.auth.updateUser('missing', {}), error => error.code === 'auth/user-not-found');
  await f.auth.deleteUser('firebaseUid123');
  assert.equal(f.users.some(u => u.id === legacy.id), false);
});
test('signing out everywhere removes the sessions and forgets cached tokens', async () => {
  const f = fixture();
  await f.auth.verifyIdToken(`token-${legacy.id}`);
  await f.auth.revokeRefreshTokens('firebaseUid123');
  const revoke = f.sql.at(-1);
  assert.match(revoke.text, /delete from auth\.sessions where user_id = \$1::uuid/u); assert.deepEqual(revoke.params, [legacy.id]);
  const before = f.calls.length; await f.auth.verifyIdToken(`token-${legacy.id}`);
  assert.equal(f.calls.length, before + 1);
});
test('an existing profile without a Supabase account gets one (no password) so "Forgot password" can move it', async () => {
  const f = fixture({ users: [], profiles: { 'owner@inventa.ph': { uid: 'firebaseOwner', email: 'owner@inventa.ph' } } });
  const account = await f.auth.getUserByEmail('owner@inventa.ph');
  assert.equal(account.uid, 'firebaseOwner'); assert.equal(account.emailVerified, true);
  assert.deepEqual(JSON.parse(f.calls.at(-1).body), { email: 'owner@inventa.ph', email_confirm: true, app_metadata: { legacy_uid: 'firebaseOwner' } });
  assert.equal((await f.auth.getUserByEmail('OWNER@inventa.ph')).uid, 'firebaseOwner');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  await assert.rejects(f.auth.getUserByEmail('nobody@inventa.ph'), error => error.code === 'auth/user-not-found');
});
test('without configuration nothing is called', async () => {
  const auth = createSupabaseAuth({ url: '', publishableKey: '', secretKey: '', query: async () => ({ rows: [] }),
    request: async () => { throw Error('must not be called'); } });
  await assert.rejects(auth.verifyIdToken('token'), error => error.code === 'auth/internal-error');
});
