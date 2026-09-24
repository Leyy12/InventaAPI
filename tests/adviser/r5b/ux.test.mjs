import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryRefresh, requestStatus, historyDate } from '../../../dashboard/src/lib/api-history.ts';
import { apiExamples } from '../../../dashboard/src/lib/api-examples.ts';
import { quotaSummary } from '../../../services/reporting.js';
import { evaluateEntitlement } from '../../../functions/subscription-lifecycle.mjs';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';
const record = { keyName:'Integration',timestamp:'2026-09-21T12:00:00.000Z',endpoint:'/daas/v1/catalog',method:'GET',statusCode:200 };
const payload = (records = [record]) => ({ success:true, records, limit:50, hasMore:false });
test('history loading → data → refresh loading → failure clears old rows → retry empty', async () => {
  const states = []; let mode = 'data';
  const reader = createHistoryRefresh(async () => { if (mode === 'error') throw new Error(); return payload(mode === 'empty' ? [] : [record]); }, value => states.push(value));
  await reader.refresh(); mode = 'error'; await reader.refresh(); mode = 'empty'; await reader.refresh();
  assert.deepEqual(states.map(s=>s.status), ['loading','ready','loading','error','loading','ready']);
  assert.equal(states[1].records.length,1); assert.equal(states[3].records.length,0); assert.equal(states[5].records.length,0);
});
for (const value of [null, {}, {success:false,records:[]}, {...payload(),limit:500}, {...payload(),records:Array(51).fill(record)},
  {...payload(), records:[{...record,statusCode:'200'}]}, {...payload(),records:[null]}, {...payload(),hasMore:undefined}]) {
  test('malformed history response becomes error: ' + JSON.stringify(value)?.slice(0,80), async () => {
    const states=[]; await createHistoryRefresh(async()=>value,s=>states.push(s)).refresh(); assert.equal(states.at(-1).status,'error');
  });
}
test('late old refresh cannot overwrite new result', async () => {
  let resolveFirst; let calls=0; const states=[];
  const reader=createHistoryRefresh(async()=>++calls===1 ? new Promise(resolve=>{resolveFirst=resolve;}) : payload([]), s=>states.push(s));
  const first=reader.refresh(); await reader.refresh(); resolveFirst(payload()); await first;
  assert.deepEqual(states.at(-1),{status:'ready',records:[],hasMore:false});
});
test('unmount/account switch aborts and suppresses old account response', async () => {
  let resolveRead; let signal; const states=[];
  const reader=createHistoryRefresh(s=>{signal=s;return new Promise(resolve=>{resolveRead=resolve;});},s=>states.push(s));
  const pending=reader.refresh(); reader.stop(); resolveRead(payload()); await pending;
  assert.equal(signal.aborted,true); assert.equal(states.length,1);
});
test('bounded timeout clears history and rejects late success', async () => {
  let timeout, finish; const states=[];
  const reader=createHistoryRefresh(()=>new Promise(resolve=>{finish=resolve;}),s=>states.push(s),{schedule:fn=>{timeout=fn;return 1;},cancel:()=>{}});
  const pending=reader.refresh(); timeout(); finish(payload()); await pending;
  assert.equal(states.at(-1).status,'error'); assert.equal(states.at(-1).records.length,0);
});
for (const [code,label] of [[200,'Success'],[302,'Redirect'],[401,'Client error'],[429,'Client error'],[500,'Server error'],[100,'Informational'],[null,'Not recorded'],[undefined,'Not recorded']]) {
  test('HTTP presentation: '+code,()=>assert.ok(requestStatus(code).includes(label)));
}
test('date rendering rejects invalid/missing and uses browser locale for recorded ISO',()=>{
  assert.equal(historyDate(null),'Not recorded'); assert.equal(historyDate('bad'),'Not recorded');
  assert.equal(historyDate(record.timestamp),new Date(record.timestamp).toLocaleString());
});
const now=new Date('2026-09-21T12:00:00Z');
test('lower Free server cap is the stored daily account override, not an IP limiter',()=>{
  for(const limit of [0,7,50,500]) assert.equal(evaluateEntitlement({plan:'Free',apiRequestLimit:limit},now).limit,Math.min(limit,50));
});
test('expired Pro resolves to Free 50 despite a cached high account limit',()=>{
  const result=evaluateEntitlement({plan:'Pro',apiRequestLimit:5000,subscription_status:'active',subscriptionExpiresAt:'2026-09-20T00:00:00Z'},now);
  assert.equal(result.plan,'Free');assert.equal(result.limit,50);
});
for (const [plan,limit] of [['Free',50],['Pro',5000],['Enterprise',null]]) test('unchanged backend entitlement '+plan,()=>{
  assert.equal(evaluateEntitlement({plan,apiRequestLimit:limit,subscription_status:'active',subscriptionExpiresAt:'2027-01-01T00:00:00.000Z'},now).limit,limit);
});
const usage={scope:'account',window:'2026-09-21',used:17,limit:50,resetsAt:'2026-09-22T00:00:00Z'};
test('authoritative account quota shows used/limit/remaining/reset, never telemetry-derived',()=>{
  const value=quotaSummary(usage,now); assert.equal(value.used,17);assert.equal(value.limit,50);assert.equal(value.remaining,33);assert.equal(value.resetsAt,usage.resetsAt);
});
test('unlimited remains explicit null, not Infinity',()=>{
  const value=quotaSummary({...usage,limit:null},now);assert.equal(value.limit,null);assert.equal(value.remaining,null);assert.equal(value.used,17);
});
for(const invalid of [null,undefined,{...usage,scope:'key'},{...usage,used:NaN},{...usage,limit:Infinity},{...usage,window:'2026-09-20'}]) {
  test('unavailable quota does not become zero: '+JSON.stringify(invalid),()=>assert.equal(quotaSummary(invalid,now),null));
}
test('R5C generation frequency does not change shared request usage across existing keys',async()=>{
  const db=memoryFirestore({'users/owner':{role:'Developer',plan:'Free',apiRequestLimit:50,selectedSegment:'Grocery',businessSegment:'Grocery'},
    'account_free_monthly_usage/owner':{window:'2026-09',used:17}});
  let generationTime = new Date('2026-09-20T12:00:00Z');
  const handlers=createApiKeyHandlers({getDb:()=>db,clock:()=>generationTime,verifyIdToken:async()=>({uid:'owner'})});
  const first=await invoke(handlers.create,{body:{keyName:'First'}});
  generationTime = now;
  // Crossing midnight for generation must not reset the existing monthly balance.
  const second=await invoke(handlers.create,{body:{keyName:'Second'}});
  assert.equal(first.statusCode,200);assert.equal(second.statusCode,200);assert.equal(db.read('account_free_monthly_usage/owner').used,17);
  for(const key of [first.body,second.body]) await consumeAccountQuota(db,{keyId:key.id,userId:'owner',credential:key.key,clock:()=>now});
  assert.equal(db.read('account_free_monthly_usage/owner').used,19);
  const metadata=(await invoke(handlers.list)).body;
  assert.equal(metadata.usage.scope,'account');assert.equal(metadata.usage.used,19);assert.equal(metadata.keys.length,2);
});
for(const language of ['curl','javascript','python','php']) test('header-only placeholder example: '+language,()=>{
  const example=apiExamples('https://api.example.invalid/daas/v1/catalog?q=rice&page=2&perPage=20')[language];
  assert.match(example,/x-api-key/);assert.match(example,/YOUR_API_KEY/);assert.match(example,/\/daas\/v1\/catalog/);
  assert.doesNotMatch(example,/Bearer|[?&](?:apiKey|key|token)=/i);assert.doesNotMatch(example,/data\.data|error\.error\.message/);
});
for(const url of ['javascript:alert(1)','https://user:secret@example.invalid/daas/v1/catalog','https://api.example.invalid/products',
  'https://api.example.invalid/daas/v1/catalog?apiKey=secret','https://api.example.invalid/daas/v1/catalog#secret','//evil.example/daas/v1/catalog']) {
  test('unsafe/stale example endpoint fails closed: '+url,()=>assert.throws(()=>apiExamples(url)));
}
test('example text escapes query characters rather than injecting code',()=>{
  const examples=apiExamples("https://api.example.invalid/daas/v1/catalog?q='$test");
  for(const example of Object.values(examples)) assert.doesNotMatch(example,/q='\$test/);
});
