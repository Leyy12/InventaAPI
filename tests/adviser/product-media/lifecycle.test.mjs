import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductMediaHandlers } from '../../../services/product-media.js';
import { mediaDigest } from '../../../services/product-media-binding.js';
import { createProductSubmissionHandlers } from '../../../services/product-submissions.js';
import { createCatalogHandlers } from '../../../services/catalog-management.js';
import { memoryFirestore, invoke } from '../r2a/memory-firestore.mjs';
import { productIdentityKeys } from '../../../services/product-contract.js';

const key='stable-operation-key-1234', bytes=Buffer.from('synthetic processed webp');
const product={name:'Tall bottle',brand:'Brand',segment:'Grocery',category:'Drinks',variants:[{size:'330ml',price:10,sku:'BOTTLE-330'}],image_url:''};
function fixture() {
  const db=memoryFirestore({'users/customer':{role:'Developer',plan:'Free',apiRequestLimit:50,businessSegment:'Grocery'},
    'users/other':{role:'Developer',plan:'Free',apiRequestLimit:50,businessSegment:'Grocery'},'users/admin':{role:'Admin'},'users/blocked':{role:'Admin',disabled:true}});
  const objects=new Map();let puts=0,failUpload=false;
  const verifyIdToken=async (token,revoked)=>{assert.equal(revoked,true);if(token==='revoked')throw Error('revoked');return {uid:token};};
  const storage={async putImmutable(path,data,digest){if(failUpload){failUpload=false;throw Error('Storage unavailable');}
    if(objects.has(path))assert.equal(mediaDigest(objects.get(path)),digest);else{objects.set(path,data);puts++;}},async read(path){if(!objects.has(path))throw Error('missing');return objects.get(path);}};
  const media=createProductMediaHandlers({getDb:()=>db,verifyIdToken,storage,enabled:true,publicOrigin:'https://api.example.invalid',
    processImage:async body=>({bytes:body,width:100,height:300}),now:()=>new Date('2026-10-09T00:00:00Z')});
  const submissions=createProductSubmissionHandlers({getDb:()=>db,verifyIdToken,makeId:()=> 'request-1'});
  const catalog=createCatalogHandlers({getDb:()=>db,verifyIdToken,makeId:()=> 'admin-product'});
  const upload=(token='customer',workflow='submission',operationKey=key,body=bytes)=>invoke(media.upload,{token,params:{workflow},headers:{'content-type':'image/webp','idempotency-key':operationKey},body});
  const image=async (id,token,privateAccess=false)=> {
    const req={params:{id},query:{},headers:token?{authorization:'Bearer '+token}:{}};
    const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;}};
    await (privateAccess?media.privateImage:media.publicImage)(req,res);return res;
  };
  const submit=id=>invoke(submissions.submit,{token:'customer',headers:{'idempotency-key':key},body:{...product,image_asset_id:id}});
  const review=decision=>invoke(submissions[decision],{token:'admin',params:{id:'request-1'}});
  return {db,media,submissions,catalog,upload,image,submit,review,objects,puts:()=>puts,failUpload:()=>{failUpload=true;}};
}
for(const token of [null,'revoked','blocked'])test(`upload denies ${token} before creating an object`,async()=>{const f=fixture();const r=await f.upload(token);assert.ok([401,403].includes(r.statusCode));assert.equal(f.puts(),0);});
test('customer cannot use catalog workflow, forge a path, or use invalid operation keys',async()=>{const f=fixture();assert.equal((await f.upload('customer','catalog')).statusCode,403);assert.equal((await f.upload('customer','../catalog')).statusCode,400);assert.equal((await f.upload('customer','submission','short')).statusCode,400);assert.equal(f.puts(),0);});
test('disabled managed mode fails closed and performs no object operation',async()=>{const r=await invoke(createProductMediaHandlers({enabled:false}).upload);assert.equal(r.statusCode,503);assert.match(r.body.error,/staging storage/);});
test('concurrent/replayed upload is immutable; different bytes under same key conflict',async()=>{const f=fixture();const responses=await Promise.all([f.upload(),f.upload(),f.upload()]);assert.ok(responses.every(r=>r.statusCode===200));assert.equal(new Set(responses.map(r=>r.body.image_asset_id)).size,1);assert.equal(f.puts(),1);assert.equal((await f.upload('customer','submission',key,Buffer.from('different'))).statusCode,409);});
test('failed upload never reports success and retry recovers the reserved image without a duplicate',async()=>{const f=fixture();f.failUpload();const r=await f.upload();assert.equal(r.statusCode,503);assert.equal(f.puts(),0);assert.equal(Object.values(f.db.dump()).filter(v=>v.state==='uploading').length,1);const retry=await f.upload();assert.equal(retry.statusCode,200);assert.equal(f.puts(),1);});
test('pending attachments are private to owner and current authorized Admin',async()=>{const f=fixture();const id=(await f.upload()).body.image_asset_id;assert.equal((await f.image(id)).statusCode,404);assert.equal((await f.image(id,'other',true)).statusCode,403);assert.equal((await f.image(id,'revoked',true)).statusCode,401);assert.equal((await f.image(id,'blocked',true)).statusCode,403);assert.equal((await f.image(id,'admin',true)).statusCode,200);const own=await f.image(id,'customer',true);assert.equal(own.headers['Cache-Control'],'private, no-store');assert.deepEqual(own.body,bytes);});
test('forged/cross-account media and wrong submission key cannot bind',async()=>{const f=fixture();const id=(await f.upload('other')).body.image_asset_id;assert.equal((await f.submit(id)).statusCode,403);assert.equal((await f.submit('a'.repeat(64))).statusCode,409);const own=(await f.upload('customer','submission','another-stable-key-1234')).body.image_asset_id;assert.equal((await f.submit(own)).statusCode,403);assert.equal(f.db.read('product_requests/request-1'),undefined);});
test('submission/approval atomically binds immutable media and canonical product; replays do not duplicate',async()=>{const f=fixture();const id=(await f.upload()).body.image_asset_id;const body={...product,image_asset_id:id};const submit=await f.submit(id);assert.equal(submit.statusCode,201);assert.equal((await f.submit(id)).body.replayed,true);assert.equal(f.db.read('product_media/'+id).state,'pending');assert.equal((await f.image(id)).statusCode,404);
  const approved=await f.review('approve');assert.equal(approved.statusCode,200);const saved=f.db.read('products/submission_request-1');assert.equal(saved.image_asset_id,id);assert.match(saved.image_url,/https:\/\/api.example.invalid/);assert.deepEqual(productIdentityKeys(saved),productIdentityKeys(body));assert.equal(f.db.read('product_media/'+id).state,'published');assert.equal(f.db.read('product_media/'+id).open,false);assert.equal((await f.image(id)).statusCode,200);assert.equal((await f.review('approve')).body.replayed,true);assert.equal(f.puts(),1);});
test('failed decision commit cannot publish media or a product; same approval safely recovers',async()=>{const f=fixture();const id=(await f.upload()).body.image_asset_id;await f.submit(id);f.db.failCommit=true;assert.equal((await f.review('approve')).statusCode,503);assert.equal(f.db.read('product_media/'+id).state,'pending');assert.equal(f.db.read('products/submission_request-1'),undefined);assert.equal((await f.image(id)).statusCode,404);f.db.failCommit=false;assert.equal((await f.review('approve')).statusCode,200);});
test('revoked/disabled submitter cannot be published and rejection never exposes bytes',async()=>{const f=fixture();const id=(await f.upload()).body.image_asset_id;await f.submit(id);f.db.seed('users/customer',{role:'Developer',disabled:true});assert.equal((await f.review('approve')).statusCode,403);assert.equal((await f.review('reject')).statusCode,200);assert.equal(f.db.read('product_media/'+id).state,'rejected');assert.equal((await f.image(id)).statusCode,404);assert.equal(f.db.read('products/submission_request-1'),undefined);assert.equal((await f.review('approve')).statusCode,409);});
test('Admin Add receipt prevents concurrent replay; Edit keep/replace/remove and stale conflicts preserve authoritative bindings',async()=>{
  const f=fixture(),first=(await f.upload('admin','catalog')).body.image_asset_id;
  const body={product:{...product,image_asset_id:first}};
  const create=()=>invoke(f.catalog.create,{token:'admin',headers:{'idempotency-key':key},body});
  const results=await Promise.all([create(),create()]);assert.ok(results.every(r=>r.statusCode===200));const id=results[0].body.product.id;assert.equal(results[1].body.product.id,id);
  const edit=(payload,revision)=>invoke(f.catalog.edit,{token:'admin',params:{id},body:{product:payload,expectedRevision:revision}});
  assert.equal((await edit({description:'Metadata edit'},1)).statusCode,200);assert.equal(f.db.read('products/'+id).image_asset_id,first);
  const replacement=(await f.upload('admin','catalog','replacement-key-123456')).body.image_asset_id;
  assert.equal((await edit({image_asset_id:replacement,image_url:''},1)).statusCode,409);assert.equal(f.db.read('product_media/'+replacement).state,'ready');assert.equal((await f.image(first)).statusCode,200);
  f.db.failCommit=true;assert.equal((await edit({image_asset_id:replacement,image_url:''},2)).statusCode,503);f.db.failCommit=false;assert.equal(f.db.read('products/'+id).image_asset_id,first);
  assert.equal((await edit({image_asset_id:replacement,image_url:''},2)).statusCode,200);assert.equal(f.db.read('product_media/'+first).state,'retired');assert.equal((await f.image(first)).statusCode,404);assert.equal((await f.image(replacement)).statusCode,200);
  assert.equal((await edit({image_url:'',image_asset_id:''},3)).statusCode,200);assert.equal(f.db.read('products/'+id).image_url,'');assert.equal((await f.image(replacement)).statusCode,404);
  assert.equal((await edit({image_url:'https://external.example.invalid/photo.webp'},4)).statusCode,200);assert.equal(f.db.read('products/'+id).image_url,'https://external.example.invalid/photo.webp');
});
test('Admin cannot publish customer ready media, another Admin upload, or unknown assets',async()=>{const f=fixture();f.db.seed('users/admin2',{role:'Admin'});for(const token of ['customer','admin2']){const id=(await f.upload(token,token==='customer'?'submission':'catalog')).body.image_asset_id;const r=await invoke(f.catalog.create,{token:'admin',body:{product:{...product,image_asset_id:id}}});assert.equal(r.statusCode,403);}assert.equal(f.db.read('products/admin-product'),undefined);});
test('twenty outstanding uploads cap storage abuse without counting published history',async()=>{const f=fixture();for(let i=0;i<20;i++)assert.equal((await f.upload('customer','submission',`operation-number-${i}-long`)).statusCode,200);assert.equal((await f.upload('customer','submission','operation-over-limit-long')).statusCode,429);assert.equal(f.puts(),20);});
test('catalog receipt cannot be reused with different content',async()=>{const f=fixture();await invoke(f.catalog.create,{token:'admin',headers:{'idempotency-key':key},body:{product}});assert.equal((await invoke(f.catalog.create,{token:'admin',headers:{'idempotency-key':key},body:{product:{...product,name:'other'}}})).statusCode,409);});
