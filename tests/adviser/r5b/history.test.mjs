import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiHistoryHandler, historyRecord, recordedTimestamp, HISTORY_LIMIT } from '../../../services/api-history.js';
import { invoke } from '../phase2a/memory-firestore.mjs';

const row = (id, userId = 'owner', extra = {}) => ({ id, userId, timestamp: new Date('2026-09-21T12:00:00Z'),
  keyName: 'Warehouse server', apiKeyId: 'daas_legacy_secret', endpoint: '/catalog', method: 'GET', statusCode: 200, ...extra });
function setup(records = [], account = { role: 'Developer', plan: 'Free' }, options = {}) {
  const calls = []; let accountReads = 0;
  const db = { collection(name) {
    if (name === 'users') return { doc(uid) { assert.equal(uid, 'owner'); return { async get() {
      accountReads++; return { data: () => options.afterRead && accountReads > 1 ? options.afterRead : account };
    } }; } };
    assert.equal(name, 'api_telemetry');
    let owner, bound;
    const q = {
      where(field, op, value) { calls.push(['where', field, op, value]); assert.equal(field, 'userId'); assert.equal(op, '=='); owner = value; return q; },
      orderBy(field, direction) { calls.push(['orderBy', field, direction]); return q; },
      limit(value) { calls.push(['limit', value]); bound = value; return q; },
      async get() {
        if (options.error) throw new Error('private Firebase stack daas_secret');
        const result = records.filter(r => (options.ignoreOwner || r.userId === owner) && r.timestamp !== undefined)
          .sort((a, b) => Number(b.timestamp) - Number(a.timestamp) || b.id.localeCompare(a.id)).slice(0, bound);
        return { docs: result.map(r => ({ id: r.id, data: () => r })) };
      },
    };
    return q;
  } };
  return { calls, handler: createApiHistoryHandler({ getDb: () => db, documentId: '__name__', verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true); if (token !== 'owner-token') throw new Error('revoked token');
    return { uid: 'owner', role: 'Admin', userId: 'other' };
  } }) };
}
test('only token owner history; token role/owner claims cannot override profile or UID', async () => {
  const { handler, calls } = setup([row('a'), row('b', 'other')]);
  const result = await invoke(handler);
  assert.equal(result.statusCode, 200); assert.equal(result.body.records.length, 1);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(calls, [['where','userId','==','owner'],['orderBy','timestamp','desc'],['orderBy','__name__','desc'],['limit',51]]);
});
for (const token of [null, 'invalid', 'revoked']) test('reject authentication: ' + token, async () => {
  const { handler, calls } = setup(); assert.equal((await invoke(handler, { token })).statusCode, 401); assert.equal(calls.length, 0);
});
for (const field of ['uid', 'userId', 'ownerId', 'accountId', 'customerId', 'keyId', 'documentId', 'cursor', 'limit', 'page']) {
  for (const location of ['query', 'body']) test('no caller lookup: ' + location + '.' + field, async () => {
    const { handler, calls } = setup([row('a', 'other')]);
    const result = await invoke(handler, { [location]: { [field]: 'other/secret' } });
    assert.equal(result.statusCode, 400); assert.equal(calls.length, 0); assert.equal(result.body.records, undefined);
  });
}
for (const uid of [undefined, null, '', '../other', 'other/account', '__reserved__']) test('malformed decoded UID denied before data access: ' + uid, async () => {
  let reads=0;
  const handler=createApiHistoryHandler({getDb:()=>{reads++;throw new Error('No access');},documentId:'__name__',verifyIdToken:async()=>({uid})});
  assert.equal((await invoke(handler)).statusCode,401);assert.equal(reads,0);
});
test('API credential header alone cannot authorize Firebase history',async()=>{
  const {handler,calls}=setup([row('a')]);
  assert.equal((await invoke(handler,{token:null,headers:{'x-api-key':'daas_synthetic_key'}})).statusCode,401);
  assert.equal(calls.length,0);
});
test('two independently authenticated Customers each receive only their own records',async()=>{
  const records=[row('a','customer-a',{keyName:'A integration'}),row('b','customer-b',{keyName:'B integration'})];
  for(const uid of ['customer-a','customer-b']) {
    const db={collection(name){
      if(name==='users') return {doc(id){assert.equal(id,uid);return {get:async()=>({data:()=>({role:'Developer'})})};}};
      assert.equal(name,'api_telemetry');let selected;
      const query={where(field,op,id){assert.equal(field,'userId');assert.equal(op,'==');selected=id;return query;},
        orderBy(){return query;},limit(n){assert.equal(n,51);return query;},
        async get(){return {docs:records.filter(r=>r.userId===selected).map(r=>({id:r.id,data:()=>r}))};}};
      return query;
    }};
    const handler=createApiHistoryHandler({getDb:()=>db,documentId:'__name__',verifyIdToken:async(token,revoked)=>{assert.equal(token,uid);assert.equal(revoked,true);return {uid};}});
    const result=await invoke(handler,{token:uid});
    assert.equal(result.statusCode,200);assert.deepEqual(result.body.records.map(r=>r.keyName),[uid==='customer-a'?'A integration':'B integration']);
  }
});
for (const account of [null, {}, { role:'Admin' }, { role:'Developer', disabled:true }, { role:'Developer', deleted:true },
  { role:'Developer', deletedAt:'yesterday' }, { role:'Developer', deletionRequested:true }, { role:'Developer', status:'pending_deletion' },
  { role:'Developer', status:'deleting' }, { role:'Developer', accountState:'blocked' }, { role:'Developer', plan:'Deleted' }]) {
  test('missing/forbidden/blocked account ' + JSON.stringify(account), async () => {
    const { handler, calls } = setup([], account); assert.equal((await invoke(handler)).statusCode, 403); assert.equal(calls.length, 0);
  });
}
test('rechecks deletion barrier after reading records', async () => {
  const { handler } = setup([row('a')], undefined, { afterRead: { role:'Developer', deletionRequested:true } });
  assert.equal((await invoke(handler)).statusCode, 403);
});
for (const role of ['Developer', 'Consumer', 'Business', 'developer']) test('existing Customer role alias: ' + role, async () => {
  assert.equal((await invoke(setup([row('a')], { role }).handler)).statusCode, 200);
});
test('empty is a successful bounded response', async () => {
  assert.deepEqual((await invoke(setup().handler)).body, { success:true, records:[], limit:50, hasMore:false });
});
test('stable newest-first and 50-record bound with older-record indication', async () => {
  const records = Array.from({ length: 70 }, (_, index) => row(String(index).padStart(3,'0'), 'owner', { keyName:String(index), timestamp:new Date(1000 * Math.floor(index / 2)) }));
  const result = (await invoke(setup(records).handler)).body;
  assert.equal(result.records.length, HISTORY_LIMIT); assert.equal(result.hasMore, true);
  assert.deepEqual(result.records.map(r => r.keyName), records.slice(-50).reverse().map(r => r.keyName));
});
test('database/index failure is sanitized error, never empty success', async () => {
  const result = await invoke(setup([], undefined, { error:true }).handler);
  assert.equal(result.statusCode, 503); assert.equal(result.body.success, false); assert.equal(result.body.records, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /stack|daas_secret|Firebase/);
});
test('fail closed if a query result violates owner isolation', async () => {
  const result = await invoke(setup([row('b', 'other')], undefined, { ignoreOwner:true }).handler);
  assert.equal(result.statusCode, 503); assert.equal(result.body.records, undefined);
});
for (const statusCode of [200, 201, 301, 401, 403, 429, 500, 503, null, undefined, '200', 0, 600]) {
  test('recorded HTTP status without success boolean inference: ' + statusCode, () => {
    assert.equal(historyRecord(row('a','owner',{statusCode,success:true})).statusCode, Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 ? statusCode : null);
  });
}
for (const value of [undefined, null, '', '2026-01-01', 0, {}, new Date('bad'), { toDate: () => { throw new Error(); } }]) {
  test('malformed timestamp is unavailable: ' + String(value), () => assert.equal(recordedTimestamp(value), null));
}
test('Firestore timestamp becomes UTC ISO without synthesis', () => assert.equal(recordedTimestamp({ toDate: () => new Date('2026-09-21T12:00:00Z') }), '2026-09-21T12:00:00.000Z'));
test('multiple keys and revoked legacy records need no credential lookup', async () => {
  const records = [row('b','owner',{keyName:'Legacy integration',status:'revoked'}), row('a','owner',{keyName:'Second integration',apiKeyId:'selector'})];
  const result = (await invoke(setup(records).handler)).body.records;
  assert.deepEqual(result.map(r=>r.keyName), ['Legacy integration','Second integration']);
  assert.ok(result.every(r=>Object.keys(r).sort().join(',') === 'endpoint,keyName,method,statusCode,timestamp'));
});
test('allowlist excludes credentials, legacy IDs, owner, IP, tokens, hashes and unknown routes', () => {
  const record = historyRecord(row('id','other',{ key:'daas_secret', credentialHash:'hash', authorization:'Bearer secret', accessToken:'token', ip:'private', error:{stack:'secret'}, payment:{secret:true}, endpoint:'/catalog?apiKey=daas_secret' }));
  assert.equal(record.endpoint,null); assert.doesNotMatch(JSON.stringify(record), /daas_|other|private|token|hash|payment|stack/);
});
for (const name of [null, '', 'daas_old_secret', 'daas_v2_'+'a'.repeat(32)+'.'+'b'.repeat(64), 'Bearer secret', 'eyJtoken', 'c'.repeat(64), 'x'.repeat(121), 'bad\nname']) {
  test('unsafe/missing key alias suppressed: ' + String(name).slice(0,18), () => assert.equal(historyRecord(row('a','owner',{keyName:name})).keyName,null));
}
