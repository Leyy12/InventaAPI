import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { mediaDigest } from '../../../services/product-media-binding.js';

// Execute the real adapter with synthetic SDK capabilities, no credentials or I/O.
function adapter({ enabled = 'true', meta = {}, token = false, existing = null, failure = null } = {}) {
  let storage, saved, reads = 0;
  const metadata = { name: 'approved-staging-bucket', projectNumber: '123',
    iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' }, ...meta };
  const object = { async save(bytes, options) { saved = options; if (failure) throw Object.assign(Error('failed'), {code:failure}); if (existing) throw Object.assign(Error('exists'), {code:412}); existing = bytes; },
    async download() { reads++; return [existing]; }, async getMetadata() { return [{metadata:token ? {firebaseStorageDownloadTokens:'forbidden'} : {}}]; } };
  const bucket = { async getMetadata() { return [metadata]; }, file() { return object; } };
  const router = {post(){},get(){},use(){}};
  const source = readFileSync(new URL('../../../routes/product-media.js', import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gmu,'').replace('export default router;','');
  runInNewContext(source, { process:{env:{PRODUCT_MEDIA_ENABLED:enabled,PRODUCT_MEDIA_BUCKET:'approved-staging-bucket',PRODUCT_MEDIA_BUCKET_PROJECT_NUMBER:'123',PRODUCT_MEDIA_PUBLIC_ORIGIN:'https://media.invalid'}},
    getStorage:()=>({bucket:()=>bucket}), getDataStore(){}, getAuth(){}, Router:()=>router, raw:()=>()=>{},
    mediaDigest, processProductImage(){}, MAX_IMAGE_BYTES:3*1024*1024,
    createProductMediaHandlers(options){storage=options.storage;return{};}, });
  return {storage,options:()=>saved,reads:()=>reads};
}
for (const [name,meta] of [ ['wrong project',{projectNumber:'999'}],['wrong bucket',{name:'other'}],
  ['public access',{iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'inherited'}}],
  ['object ACLs',{iamConfiguration:{uniformBucketLevelAccess:{enabled:false},publicAccessPrevention:'enforced'}}] ])
  test(`real adapter fails closed on ${name}`,async()=>{await assert.rejects(adapter({meta}).storage.verify(),/Private bucket/);});
test('real adapter is disabled without explicit operator activation',async()=>{await assert.rejects(adapter({enabled:'false'}).storage.verify(),/configuration/);});
test('real adapter conditionally creates immutable private WebP and proves durable bytes',async()=>{
  const bytes=Buffer.from('processed-image'),a=adapter();await a.storage.putImmutable('server-derived.webp',bytes,mediaDigest(bytes));
  assert.equal(a.options().preconditionOpts.ifGenerationMatch,0);assert.equal(a.options().metadata.cacheControl,'private, no-store');assert.equal(a.options().metadata.contentType,'image/webp');assert.equal(a.reads(),1);
});
test('real adapter recovers existing identical bytes but rejects mismatches, download tokens and write failure',async()=>{
  const bytes=Buffer.from('processed-image'),digest=mediaDigest(bytes);
  await adapter({existing:bytes}).storage.putImmutable('server-derived.webp',bytes,digest);
  await assert.rejects(adapter({existing:Buffer.from('different')}).storage.putImmutable('server-derived.webp',bytes,digest),/integrity/);
  await assert.rejects(adapter({token:true}).storage.putImmutable('server-derived.webp',bytes,digest),/download token/);
  await assert.rejects(adapter({failure:503}).storage.putImmutable('server-derived.webp',bytes,digest),/failed/);
});
