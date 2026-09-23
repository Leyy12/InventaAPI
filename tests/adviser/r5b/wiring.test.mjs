import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
test('history route precedes arbitrary key ID route; SDK checks revocation and document-ID ordering',()=>{
  const route=source('routes/apikeys.js');assert.ok(route.indexOf("router.get('/history'")<route.indexOf("router.get('/:id'"));
  assert.match(route,/FieldPath.documentId\(\)/);assert.match(route,/verifyIdToken\(token, checkRevoked\)/);
});
test('composite index matches account and stable descending query',()=>{
  const indexes=JSON.parse(source('firestore.indexes.json')).indexes;
  assert.ok(indexes.some(i=>i.collectionGroup==='api_telemetry' && JSON.stringify(i.fields)===JSON.stringify([
    {fieldPath:'userId',order:'ASCENDING'},{fieldPath:'timestamp',order:'DESCENDING'},{fieldPath:'__name__',order:'DESCENDING'}])));
});
test('Customer history uses Bearer-authenticated backend, never direct Firestore telemetry reads',()=>{
  const ui=source('dashboard/src/components/api/RequestHistory.tsx');assert.match(ui,/apiKeyRequest\(user, '\/history'/);assert.match(ui,/key=\{user.uid\}/);
  assert.doesNotMatch(ui,/firebase\/firestore|collection\(/);
  assert.match(source('dashboard/src/lib/api-keys.ts'),/getIdToken\(\)/);
  assert.doesNotMatch(source('firestore.rules'),/match \/api_telemetry/);
});
test('no fabricated Consumer Name, status fallback or complete-history claim',()=>{
  const ui=source('dashboard/src/components/api/RequestHistory.tsx');
  assert.match(ui,/Key name \(at request\)/);assert.match(ui,/No recorded requests available/);assert.match(ui,/Unable to load request history/);
  assert.match(ui,/not a complete history/);assert.doesNotMatch(ui,/appUser|businessName|fullName|email|Consumer Name/);
});
test('API key quota uses existing authoritative R4 summary once, not repeated key counters',()=>{
  const ui=source('dashboard/src/app/dashboard/api-keys/page.tsx');assert.match(ui,/<CustomerUsageSummary/);assert.match(ui,/<RequestHistory/);
  assert.doesNotMatch(ui,/apiKey\.requestsUsed|apiKey\.requestLimit/);assert.match(ui,/listError \?/);
});
test('copy targets are deliberate, contextual and report clipboard failure',()=>{
  const snippets=source('dashboard/src/components/shared/CodeSnippet.tsx');
  assert.match(snippets,/copy\(endpoint, 'Endpoint'\)/);assert.match(snippets,/copy\(examples\[language\], 'Example'\)/);
  assert.match(snippets,/Copy endpoint/);assert.match(snippets,/Copy example/);assert.match(snippets,/await navigator.clipboard.writeText/);
  assert.match(snippets,/Copy failed/);assert.doesNotMatch(snippets,/useEffect|apiKey:/);
  for(const path of ['api-keys','products']) {
    const ui=source(`dashboard/src/app/dashboard/${path}/page.tsx`);assert.match(ui,/Copy API key/i);assert.match(ui,/await navigator.clipboard.writeText/);assert.match(ui,/Copy failed/);
  }
});
test('placeholder examples centralized across keys/docs/playground and admin route is not a DaaS example',()=>{
  for(const path of ['dashboard/api-keys','dashboard/api-playground','docs']) assert.match(source(`dashboard/src/app/${path}/page.tsx`),/<CodeSnippet/);
  const play=source('dashboard/src/app/dashboard/api-playground/page.tsx');assert.doesNotMatch(play,/api_key_info|response\.pagination|\/api\/v1\/products/);
  assert.match(play,/'x-api-key': apiKey/);
});
test('same key catalog sync accurately documented without guarantee of push updates',()=>{
  const doc=source('dashboard/src/app/docs/page.tsx');assert.match(doc,/same valid key/);assert.match(doc,/no key regeneration is required/);
  assert.match(doc,/not a push or real-time/);assert.match(doc,/x-api-key: YOUR_API_KEY/);assert.match(doc,/meta.pagination/);
});
test('Admin key inventory labels account usage and stored key status accurately',()=>{
  const page=source('admin-panel/src/app/consumers/page.tsx');assert.match(page,/API Key Inventory/);assert.match(page,/Shared account usage/);
  assert.match(page,/not proof of current account authorization/);assert.doesNotMatch(page,/API Consumers|Loading consumers|k\.(requestsUsed|requestLimit|plan)/);
  assert.doesNotMatch(source('admin-panel/src/components/layout/AdminSidebar.tsx'),/API Consumers/);
});
test('isolated runner blocks SDKs, process escape and network',async()=>{
  for(const mod of ['node:https','node:net','node:child_process','node:module','node:worker_threads','firebase-admin']) await assert.rejects(import(mod));
  assert.throws(()=>globalThis.fetch('https://example.invalid'));assert.throws(()=>new WebSocket('wss://example.invalid'));
});
test('actual shared copy handler reports success only after clipboard resolution; failure is truthful',async()=>{
  const code=source('dashboard/src/components/shared/CodeSnippet.tsx');
  const body=code.replaceAll('\r\n', '\n').match(/async function copy\(text: string, target: string\) \{([\s\S]*?)\n  \}\n  return/)?.[1];assert.ok(body);
  const make=new Function('navigator','setMessage','return async (text,target)=>{'+body+'}');
  const messages=[],writes=[];let finish;
  const copy=make({clipboard:{writeText:text=>{writes.push(text);return new Promise(resolve=>{finish=resolve;});}}},m=>messages.push(m));
  assert.deepEqual(writes,[]);const pending=copy('https://api.example.invalid/daas/v1/catalog','Endpoint');
  assert.equal(messages.length,0);finish();await pending;assert.deepEqual(messages,['Endpoint copied.']);
  assert.deepEqual(writes,['https://api.example.invalid/daas/v1/catalog']);
  const failed=make({clipboard:{writeText:async()=>{throw new Error('denied');}}},m=>messages.push(m));
  await failed('example text','Example');assert.match(messages.at(-1),/Copy failed/);
});
test('actual Products one-time copy failure retains the secret view and never schedules navigation',async()=>{
  const code=source('dashboard/src/app/dashboard/products/page.tsx');
  const body=code.match(/const handleCopyAndClose = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[generatedKey, router\]\)/)?.[1];assert.ok(body);
  const make=new Function('navigator','generatedKey','alert','setCopied','setTimeout','router','COPY_REDIRECT_DELAY','return async()=>{'+body+'}');
  const events=[];let finish;
  const deps=[ 'synthetic-one-time-key',m=>events.push(m),value=>events.push(value),fn=>{events.push('scheduled');fn();},{push:path=>events.push(path)},0 ];
  await make({clipboard:{writeText:async()=>{throw new Error();}}},...deps)();
  assert.equal(events.length,1);assert.match(events[0],/Copy failed/);events.length=0;
  const pending=make({clipboard:{writeText:text=>{assert.equal(text,'synthetic-one-time-key');return new Promise(resolve=>{finish=resolve;});}}},...deps)();
  assert.deepEqual(events,[]);finish();await pending;assert.deepEqual(events,[true,'scheduled','/dashboard/api-keys']);
});
test('telemetry records request-time key snapshots and quota rejection precedes route logging',()=>{
  const route=source('routes/daas.js');assert.match(route,/keyName: req\.apiKeyData.name/);assert.match(route,/timestamp: ts/);
  assert.match(route,/router.get\('\/catalog', authenticateApiKey, enforceRequestLimit/);
  assert.doesNotMatch(source('services/daas-security.js'),/collection\('api_telemetry'\)/);
  const history=source('services/api-history.js');assert.doesNotMatch(history,/collection\('api_keys'\)/);
  const docs=source('dashboard/src/app/docs/page.tsx');assert.match(docs,/503 with QUOTA_CUTOVER_PENDING/);
});
