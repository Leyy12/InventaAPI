import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createServer } from 'node:net';
import express from 'express';
import sharp from 'sharp';
import { createProductMediaHandlers } from '../../../services/product-media.js';
import { processProductImage } from '../../../services/product-media-processing.js';
import { createProductSubmissionHandlers } from '../../../services/product-submissions.js';
import { memoryFirestore } from '../r2a/memory-firestore.mjs';

const require=createRequire(import.meta.url), project='demo-inventa-product-media', bucket=project+'.appspot.com';
let emulator, registry, origin, apiServer, apiOrigin;
const scratch=mkdtempSync(join(tmpdir(),'inventa-private-media-emulator-'));
const freePort=async()=>{const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};
const token=uid=>[Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:uid,user_id:uid,role:uid==='admin'?'admin':'customer',aud:project,iss:'https://securetoken.google.com/'+project,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'custom'}})).toString('base64url'),''].join('.');
const call=(path,options={})=>fetch(origin+path,{...options,signal:AbortSignal.timeout(15000)});
const objectPath='product-media/synthetic.webp';
before(async()=>{
  // Use installed CLI library and cached runtime only; no credential/config bootstraps.
  const toolsRoot=join(homedir(),'AppData','Roaming','npm','node_modules','firebase-tools','lib','emulator');
  const {StorageEmulator}=require(join(toolsRoot,'storage','index.js'));
  ({EmulatorRegistry:registry}=require(join(toolsRoot,'registry.js')));
  class IsolatedStorage extends StorageEmulator {getPersistenceTmpDir(){return join(scratch,'blobs');}}
  const port=await freePort(),rulesPath=new URL('../../../product-media.storage.rules',import.meta.url);
  emulator=new IsolatedStorage({projectId:project,host:'127.0.0.1',port,auto_download:false,rules:{name:rulesPath.pathname.replace(/^\/([A-Z]:)/u,'$1'),content:readFileSync(rulesPath,'utf8')}});
  await registry.start(emulator);origin='http://127.0.0.1:'+port;
  const seeded=await call(`/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'image/webp'},body:Buffer.from('synthetic bytes')});
  assert.equal(seeded.status,200);
  const db=memoryFirestore({'users/customer':{role:'Developer',plan:'Free',apiRequestLimit:50,businessSegment:'Grocery'},'users/admin':{role:'Admin'}});
  const stored=new Set();
  const storage={async putImmutable(path,bytes){if(stored.has(path))return;const r=await call(`/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(path)}`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'image/webp'},body:bytes});assert.equal(r.status,200);stored.add(path);},
    async read(path){const r=await call(`/storage/v1/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`,{headers:{Authorization:'Bearer owner'}});assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());}};
  const verifyIdToken=async(value,revoked)=>{assert.equal(revoked,true);if(!['customer','admin'].includes(value))throw Error('invalid');return {uid:value};};
  const media=createProductMediaHandlers({getDb:()=>db,verifyIdToken,storage,processImage:processProductImage,enabled:true,publicOrigin:'https://media.example.invalid'});
  const submissions=createProductSubmissionHandlers({getDb:()=>db,verifyIdToken,makeId:()=> 'local-request'});
  const app=express();app.post('/upload',express.raw({type:()=>true,limit:3*1024*1024}), (req,res)=>{req.params.workflow='submission';return media.upload(req,res);});
  app.get('/image/:id',media.publicImage);app.get('/private/:id',media.privateImage);
  app.use(express.json());app.post('/submit',submissions.submit);app.post('/approve/:id',submissions.approve);
  await new Promise(resolve=>{apiServer=app.listen(0,'127.0.0.1',resolve);});apiOrigin='http://127.0.0.1:'+apiServer.address().port;
},{timeout:45000});
after(async()=>{if(apiServer)await new Promise(resolve=>apiServer.close(resolve));if(registry)await registry.stop('storage');},{timeout:30000});
for(const actor of ['anonymous','customer','other','admin'])for(const action of ['read','create','overwrite','delete','list'])test(`Storage rules deny direct ${action} by ${actor}, including client role claims`,async()=>{
  const headers=actor==='anonymous'?{}:{Authorization:'Bearer '+token(actor)};
  let path=`/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}`,options={headers};
  if(action==='read')path+='?alt=media';
  if(action==='list')path=`/v0/b/${bucket}/o`;
  if(['create','overwrite'].includes(action)){path=`/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(action==='create'?'product-media/forged.webp':objectPath)}`;options={method:'POST',headers:{...headers,'Content-Type':'image/webp'},body:Buffer.from('forged')};}
  if(action==='delete')options.method='DELETE';
  assert.ok([401,403].includes((await call(path,options)).status));
});
test('real raw HTTP photo processing → private Storage → submission → approval → public processed image',async()=>{
  const source=await sharp({create:{width:80,height:240,channels:4,background:{r:30,g:100,b:20,alpha:0.5}}}).png().toBuffer();
  const headers={Authorization:'Bearer customer','Idempotency-Key':'local-image-operation-1234','Content-Type':'image/png'};
  const upload=await fetch(apiOrigin+'/upload',{method:'POST',headers,body:source});assert.equal(upload.status,200);const {image_asset_id:id}=await upload.json();
  assert.equal((await fetch(apiOrigin+'/image/'+id)).status,404);
  assert.equal((await fetch(apiOrigin+'/private/'+id,{headers:{Authorization:'Bearer admin'}})).status,200);
  const submit=await fetch(apiOrigin+'/submit',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'Local fixture bottle',brand:'Fixture',category:'Drinks',segment:'Grocery',variants:[{size:'240ml',price:10}],image_url:'',image_asset_id:id})});assert.equal(submit.status,201);
  assert.equal((await fetch(apiOrigin+'/image/'+id)).status,404);
  assert.equal((await fetch(apiOrigin+'/approve/local-request',{method:'POST',headers:{Authorization:'Bearer admin'}})).status,200);
  const published=await fetch(apiOrigin+'/image/'+id);assert.equal(published.status,200);assert.equal(published.headers.get('content-type'),'image/webp');const meta=await sharp(Buffer.from(await published.arrayBuffer())).metadata();assert.equal(meta.width,80);assert.equal(meta.height,240);
});
