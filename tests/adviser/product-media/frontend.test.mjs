import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hooks, load, nodes, flush } from '../workspace-refresh/harness.mjs';
import { normalizeProductImageUrl, productImageSource, showProductImageFallback } from '../../../dashboard/src/lib/product-image-url.ts';
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):tree==null?'':String(tree);
const button=(h,label)=>nodes(h.output,n=>n.type==='button'&&text(n)===label)[0];
for(const app of ['dashboard','admin-panel'])test(`${app} actual image picker previews/replaces/removes files and rejects type, extension and size`,async()=>{
  const h=hooks();h.React.useId=()=> 'image-field';let made=0;const revoked=[];
  const Field=load(`${app}/src/components/products/ProductImageField.tsx`,'ProductImageField',h,{
    '@/lib/product-image-url':{productImageSource,showProductImageFallback}},
    {queueMicrotask,URL:{createObjectURL:()=> 'blob:synthetic-'+ ++made,revokeObjectURL:url=>revoked.push(url)}});
  function Wrapper(){const[url,setUrl]=h.React.useState('https://example.invalid/old.webp');const[file,setFile]=h.React.useState(null);return Field({imageUrl:url,onImageUrlChange:setUrl,file,onFileChange:setFile});}
  h.mount(Wrapper);const choose=file=>nodes(h.output,n=>n.type==='input'&&n.props.type==='file')[0].props.onChange({target:{files:[file],value:'x'}});
  for(const file of [{name:'evil.svg',type:'image/svg+xml',size:10},{name:'fake.jpg',type:'image/png',size:10},{name:'big.png',type:'image/png',size:4*1024*1024}]){
    choose(file);await flush();assert.equal(made,0);assert.ok(nodes(h.output,n=>n.props.role==='alert').length);
  }
  choose({name:'photo.png',type:'image/png',size:100});await flush();assert.equal(made,1);
  assert.equal(nodes(h.output,n=>n.type==='input'&&n.props.type==='url')[0].props.disabled,true);
  assert.match(nodes(h.output,n=>n.type==='img')[0].props.className,/object-contain/);
  choose({name:'replacement.webp',type:'image/webp',size:100});await flush();assert.equal(made,2);assert.deepEqual(revoked,['blob:synthetic-1']);
  button(h,'Remove Image').props.onClick();await flush();assert.equal(nodes(h.output,n=>n.type==='input'&&n.props.type==='url')[0].props.value,'');
  assert.equal(nodes(h.output,n=>n.type==='img').length,0);assert.deepEqual(revoked,['blob:synthetic-1','blob:synthetic-2']);h.stop();
});
test('Customer retries exact file/key/payload across failed upload, failed submission and close/reopen; never reports early success',async()=>{
  const h=hooks();let uploads=0,posts=0,added=0;const uploadOperations=[],bodies=[];
  const user={uid:'customer',getIdToken:async()=> 'synthetic-token'};
  const Modal=load('dashboard/src/components/products/AddProductModal.tsx','AddProductModal',h,{
    'lucide-react':Object.fromEntries(['Plus','X','AlertTriangle','Check','Save','Loader2','Upload'].map(key=>[key,'svg'])),
    '@/lib/product-image-url':{normalizeProductImageUrl},'@/lib/firebase/auth-context':{useAuth:()=>({user,appUser:{plan:'Free',businessSegment:'Grocery'}})},
    '../../../../services/customer-segment.js':{restrictedSegmentAccount:()=>true,activeCustomerSegment:()=> 'Grocery'},
    './ProductImageField':'image-field','@/lib/product-media-client':{uploadProductImage:async(_,workflow,operation)=>{assert.equal(workflow,'submission');uploadOperations.push(operation);if(++uploads===1)throw Error('Upload unavailable');operation.assetId='a'.repeat(64);return operation.assetId;}},
    './SubmissionFeedbackDialog':'submission-feedback',
  },{crypto:{randomUUID:()=> 'stable-operation-key-1234'},fetch:async(_,options)=>{posts++;bodies.push(options.body);return {ok:posts>1,status:posts>1?200:503,json:async()=>posts>1?{id:'request-1'}:{error:'Retry same request'}};}});
  const props={open:true,onClose(){},onAdded(){added++;}};h.mount(Modal,props);await flush();
  nodes(h.output,n=>n.type==='input'&&n.props.placeholder==='e.g. Piattos Cheese')[0].props.onChange({target:{value:'Bottle'}});
  nodes(h.output,n=>n.type==='input'&&n.props.placeholder==='e.g. Snacks')[0].props.onChange({target:{value:'Drinks'}});
  const file={name:'bottle.png',type:'image/png',size:100};nodes(h.output,n=>n.type==='image-field')[0].props.onFileChange(file);await flush();
  const submit=button(h,'Submit for Review');submit.props.onClick();submit.props.onClick();await flush();assert.equal(uploads,1);assert.equal(posts,0);assert.equal(added,0);
  h.render({...props,open:false});h.render(props);await flush();assert.equal(nodes(h.output,n=>n.type==='image-field')[0].props.file,file);
  button(h,'Retry Same Submission').props.onClick();await flush();assert.equal(uploads,2);assert.equal(posts,1);assert.equal(added,0);assert.equal(uploadOperations[0],uploadOperations[1]);
  button(h,'Retry Same Submission').props.onClick();await flush();assert.equal(uploads,2);assert.equal(posts,2);assert.equal(bodies[0],bodies[1]);assert.equal(JSON.parse(bodies[0]).image_asset_id,'a'.repeat(64));assert.equal(added,1);h.stop();
});
test('real upload client validates receipts, refuses cross-account cache reuse, and reuses successful receipt without another request',async()=>{
  const h=hooks();let calls=0;
  const upload=load('dashboard/src/lib/product-media-client.ts','uploadProductImage',h,{}, {fetch:async(_,options)=>{calls++;assert.equal(options.headers['Idempotency-Key'],'stable-key');return{ok:true,json:async()=>({image_asset_id:'a'.repeat(64)})};}});
  const operation={uid:'customer',key:'stable-key',file:{type:'image/png'}};
  const user={uid:'customer',getIdToken:async()=> 'token'};
  assert.equal(await upload(user,'submission',operation),'a'.repeat(64));assert.equal(await upload(user,'submission',operation),'a'.repeat(64));assert.equal(calls,1);
  await assert.rejects(upload({...user,uid:'other'},'submission',operation),/uploading account/);assert.equal(calls,1);
});
test('product image fit has stable height, preserves complete packaging and retains lazy/fallback/selection wiring',()=>{
  const source=readFileSync(new URL('../../../dashboard/src/app/dashboard/products/page.tsx',import.meta.url),'utf8');
  const area=source.slice(source.indexOf('{/* Image Area */}'),source.indexOf('{/* Top overlay row: segment badge only */}'));
  assert.match(area,/w-full h-44/);assert.match(area,/object-contain p-5 pt-9/);assert.match(area,/loading="lazy"/);assert.match(area,/showProductImageFallback/);assert.doesNotMatch(area,/object-cover|scale-/);
  assert.ok(source.includes("gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))'"));
  assert.match(source,/Pending|pending/);
});

function adminForm(name, h, request, upload) {
  h.React.useId = () => 'admin-form';
  const catalogPrice = load('admin-panel/src/lib/catalog-client.ts','catalogPrice',h,{'@/lib/firebase/config':{auth:{}}});
  const brandNameWarning = load('admin-panel/src/lib/catalog-client.ts','brandNameWarning',h,{'@/lib/firebase/config':{auth:{}}});
  return load('admin-panel/src/app/products/page.tsx',name,h,{
    '@/lib/product-image-url':{normalizeProductImageUrl,productImageSource,showProductImageFallback},
    '@/lib/catalog-csv':{catalogCsv(){}},'@/components/products/ProductImageField':'image-field',
    '@/lib/product-media-client':{uploadProductImage:upload},
    'lucide-react':new Proxy({},{get:()=> 'svg'}),'@/lib/data/firestore-client':{},
    '@/lib/catalog-client':{catalogRequest:request,catalogPrice,brandNameWarning},
    '@/lib/firebase/config':{db:{},auth:{currentUser:{uid:'admin',getIdToken:async()=> 'token'}}},
    '@/components/admin/ImportCsvModal':{__esModule:true,default:'csv-modal'},
  },{crypto:{randomUUID:()=> 'admin-stable-operation-key'},alert(){}});
}
test('actual Admin Edit keeps omitted image fields, replaces/removes explicitly and retains expectedRevision on failed saves',async()=>{
  const h=hooks(),requests=[];let fail=true,uploads=0;
  const Edit=adminForm('EditModal',h,async(_,method,body)=>{requests.push(structuredClone(body));assert.equal(method,'PATCH');if(fail)throw Error('Conflict');return{product:body.product,possibleDuplicates:[]};},async(_,workflow,op)=>{assert.equal(workflow,'catalog');uploads++;op.assetId='b'.repeat(64);return op.assetId;});
  const props={product:{id:'product',name:'Bottle',brand:'Brand',segment:'Grocery',category:'Drinks',catalogRevision:4,image_url:'https://image.invalid/old.webp',image_asset_id:'a'.repeat(64),variants:[{size:'330ml',price:10}]},onClose(){},onSaved(){}};
  h.mount(Edit,props);button(h,'Save Changes').props.onClick();await flush();
  assert.equal(Object.hasOwn(requests[0].product,'image_url'),false);assert.equal(Object.hasOwn(requests[0].product,'image_asset_id'),false);assert.equal(requests[0].expectedRevision,4);
  const field=()=>nodes(h.output,n=>n.type==='image-field')[0];field().props.onImageUrlChange('');await flush();button(h,'Save Changes').props.onClick();await flush();assert.equal(requests[1].product.image_asset_id,'');assert.equal(requests[1].product.image_url,'');
  field().props.onFileChange({name:'new.png',type:'image/png',size:100});await flush();button(h,'Save Changes').props.onClick();await flush();assert.equal(requests[2].product.image_asset_id,'b'.repeat(64));assert.equal(requests[2].expectedRevision,4);
  fail=false;button(h,'Save Changes').props.onClick();await flush();assert.equal(uploads,2);assert.deepEqual(requests[3],requests[2]);h.stop();
});
test('actual Admin Add freezes successful upload association and key across uncertain create responses',async()=>{
  const h=hooks(),requests=[];let uploads=0,created=0;
  const Add=adminForm('AddProductModal',h,async(_,method,body,key)=>{requests.push({body:structuredClone(body),key});assert.equal(method,'POST');if(requests.length===1)throw Error('Response lost');return{product:{id:'created'},possibleDuplicates:[]};},async(_,workflow,op)=>{assert.equal(workflow,'catalog');uploads++;op.assetId='c'.repeat(64);return op.assetId;});
  h.mount(Add,{existingProducts:[],onClose(){},onAdded(){created++;}});
  nodes(h.output,n=>n.type==='input'&&n.props.placeholder==='e.g. Piattos Cheese')[0].props.onChange({target:{value:'Bottle'}});
  nodes(h.output,n=>n.type==='image-field')[0].props.onFileChange({name:'image.png',type:'image/png',size:100});await flush();
  const save=button(h,'Save Product');save.props.onClick();save.props.onClick();await flush();assert.equal(created,0);assert.equal(uploads,1);assert.equal(requests.length,1);
  assert.equal(nodes(h.output,n=>n.type==='fieldset')[0].props.disabled,true);button(h,'Retry Same Product').props.onClick();await flush();assert.equal(created,1);assert.equal(uploads,1);assert.deepEqual(requests[1],requests[0]);h.stop();
});
