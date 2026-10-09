import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { processProductImage, MAX_IMAGE_BYTES } from '../../../services/product-media-processing.js';

for(const [format,mime] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']])test(`valid ${format} is decoded, oriented, stripped and optimized without stretching`,async()=>{
  const source=await sharp({create:{width:1800,height:900,channels:4,background:{r:10,g:100,b:30,alpha:0.5}}})[format]().withExif({IFD0:{Artist:'Private metadata'}}).toBuffer();
  const result=await processProductImage(source,mime);const meta=await sharp(result.bytes).metadata();
  assert.equal(meta.format,'webp');assert.equal(meta.width,1400);assert.equal(meta.height,700);assert.equal(meta.exif,undefined);assert.equal(result.mime,'image/webp');assert.ok(result.bytes.length<2*1024*1024);
});
test('EXIF rotation is corrected and small images are never upscaled',async()=>{const source=await sharp({create:{width:100,height:300,channels:3,background:'red'}}).jpeg().withMetadata({orientation:6}).toBuffer();const result=await processProductImage(source,'image/jpeg');assert.equal(result.width,300);assert.equal(result.height,100);assert.equal((await sharp(result.bytes).metadata()).orientation,undefined);});
for(const [bytes,mime] of [[Buffer.from('<svg/>'),'image/svg+xml'],[Buffer.from('MZ executable'),'image/jpeg'],[Buffer.from('<script/>'),'image/png'],[Buffer.from([137,80,78,71,13,10,26,10]),'image/png']])test(`reject unsupported/spoofed/malformed ${mime} bytes`,async()=>{await assert.rejects(processProductImage(bytes,mime),/supported|match|malformed/);});
test('oversized and misleading MIME files fail trusted validation',async()=>{await assert.rejects(processProductImage(Buffer.alloc(MAX_IMAGE_BYTES+1),'image/jpeg'),/3 MB/);const png=await sharp({create:{width:10,height:10,channels:3,background:'white'}}).png().toBuffer();await assert.rejects(processProductImage(png,'image/jpeg'),/match/);});
test('dimension bound rejects extremely wide images',async()=>{const png=await sharp({create:{width:12001,height:1,channels:3,background:'white'}}).png().toBuffer();await assert.rejects(processProductImage(png,'image/png'),/dimensions/);});
