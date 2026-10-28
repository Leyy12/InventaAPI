// Real UI components/React/CSS, with isolated synthetic auth and HTTP transport.
// No Firebase initialization, external network, or staging data writes.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../dashboard/package.json', import.meta.url));
const ts = require('typescript');
const rootRequire = createRequire(new URL('../../../package.json', import.meta.url));
const webp = await rootRequire('sharp')({ create: { width: 128, height: 192, channels: 3, background: '#2388c6' } }).webp().toBuffer();
const modules = new Map();
function source(id, code) { modules.set(id, ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText); }
for (const id of [
  'dashboard/src/components/products/AddProductModal.tsx', 'dashboard/src/components/products/SubmissionFeedbackDialog.tsx',
  'dashboard/src/components/products/ProductImageField.tsx', 'dashboard/src/lib/product-media-client.ts', 'dashboard/src/lib/product-image-url.ts',
  'admin-panel/src/app/submissions/page.tsx', 'admin-panel/src/components/products/SubmissionReviewDialog.tsx',
  'admin-panel/src/components/products/PrivateProductImage.tsx', 'admin-panel/src/components/products/ProductImagePreview.tsx',
  'admin-panel/src/lib/product-image-url.ts', 'admin-panel/src/lib/submission-review.ts', 'services/customer-segment.js', 'services/product-contract.js',
]) source(id, readFileSync(new URL('../../../' + id, import.meta.url), 'utf8'));
for (const [id, file] of [
  ['react', 'react/cjs/react.production.js'], ['react/jsx-runtime', 'react/cjs/react-jsx-runtime.production.js'],
  ['react-dom', 'react-dom/cjs/react-dom.production.js'], ['react-dom/client', 'react-dom/cjs/react-dom-client.production.js'],
  ['scheduler', 'scheduler/cjs/scheduler.production.js'], ['lucide-react', 'lucide-react/dist/cjs/lucide-react.js'],
]) modules.set(id, readFileSync(new URL('../../../dashboard/node_modules/' + file, import.meta.url), 'utf8'));
source('@/lib/supabase/auth-context', `export const useAuth=()=>({user:window.fixture.user,appUser:{plan:'Free',businessSegment:'Grocery'}});`);
source('@/lib/supabase/admin-auth-context', `export const useAdminAuth=()=>({user:window.fixture.user});`);
source('fixture', `
import React from 'react';import {createRoot} from 'react-dom/client';
import Customer from './dashboard/src/components/products/AddProductModal';
import Admin from './admin-panel/src/app/submissions/page';
let operationSequence=0;if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++operationSequence).padStart(12,'0');
const imageBytes=Uint8Array.from(atob('${webp.toString('base64')}'),c=>c.charCodeAt(0));
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const sample=(i)=>({id:'submission-reference-'+i,userId:'synthetic-customer-uid-'+i,status:'submitted',createdAt:'2026-10-10T04:40:00Z',productId:null,
content:{name:i===0?'Bluefield Sparkling Tea':'Sundale Pantry Rice '+i,brand:i===0?'Bluefield':'Sundale',segment:'Grocery',category:'Beverages',description:'A full product description for the reviewer. Private photo is only published after approval.',image_asset_id:'a'.repeat(64),image_url:'',sku:'PRODUCT-SKU-'+i,
variants:[{sku:'VARIANT-'+i,flavor:'Original',size:'250 ml',price:19.5},{sku:'VARIANT-LARGE-'+i,flavor:'Lemon',size:'500 ml',price:32.5}]}});
window.fixture={user:{uid:'synthetic-user',getIdToken:async()=> 'synthetic-only'},calls:[],mode:'success',release:null,rows:Array.from({length:6},(_,i)=>sample(i)),added:0};
window.fetch=async(url,init={})=>{
const f=window.fixture,path=String(url);f.calls.push({path,method:init.method||'GET',key:init.headers?.['Idempotency-Key'],body:typeof init.body==='string'?init.body:null});
if(path.includes('/product-media/')&&path.endsWith('/private'))return new Response(imageBytes,{status:200,headers:{'Content-Type':'image/webp'}});
if(path.includes('/product-media/upload/'))return response({image_asset_id:'a'.repeat(64),width:128,height:192});
if(path.endsWith('/product-submissions')&&init.method==='POST'){
  if(f.mode==='hold')return new Promise(resolve=>{f.release=()=>resolve(response({id:'submission-confirmed-reference',status:'submitted'},201));});
  if(f.mode==='network')throw Error('Lost response');
  if(f.mode==='malformed')return response({});
  if(f.mode==='unavailable')return response({error:'Service unavailable'},503);
  if(f.mode==='validation')return response({error:'Product validation did not pass.'},400);
  return response({id:'submission-confirmed-reference',status:'submitted'},201);
}
if(path.includes('/admin/product-submissions')){
  const parsed=new URL(path);
  if(init.method==='POST'){
    const id=parsed.pathname.split('/').at(-2),status=parsed.pathname.endsWith('/approve')?'approved':'rejected';
    const finish=()=>{f.rows=f.rows.map(r=>r.id===id?{...r,status,productId:status==='approved'?'published-product':null}:r);return response({id,status,productId:status==='approved'?'published-product':null});};
    if(f.mode==='unavailable')return response({error:'Review outcome uncertain.'},503);
    if(f.mode==='hold')return new Promise(resolve=>{f.release=()=>resolve(finish());});
    return finish();
  }
  const status=parsed.searchParams.get('status');return response({submissions:f.rows.filter(r=>r.status===status),next:null});
}
throw Error('Unexpected isolated request: '+path);
};
function App(){const[open,setOpen]=React.useState(false);return <div className="min-h-screen bg-slate-950 font-sans text-slate-200">
<header className="flex h-16 items-center border-b border-slate-800 px-6 text-lg font-semibold">InventaAPI <span className="ml-3 text-xs font-normal text-slate-500">{window.fixtureApp==='admin'?'Admin workspace':'Customer workspace'}</span></header>
{window.fixtureApp==='admin'?<Admin/>:<main className="p-6"><h1 className="text-2xl font-semibold">Product Catalog</h1><p className="mt-2 text-sm text-slate-400">Submit a product for review.</p><button className="mt-5 rounded-xl bg-indigo-500 px-5 py-3 font-semibold" onClick={()=>setOpen(true)}>Add Product</button><Customer open={open} onClose={()=>setOpen(false)} onAdded={()=>{window.fixture.added++;}}/></main>}
</div>}
createRoot(document.getElementById('root')).render(<App/>);
`);
const bundle = `(function(){const process={env:{NODE_ENV:'production',NEXT_PUBLIC_API_URL:'https://synthetic.invalid'}};const factories={${[...modules].map(([id, code]) => JSON.stringify(id) + ':function(module,exports,require){\n' + code + '\n}').join(',')}};
const cache={};function normalize(name){const a=[];for(const p of name.split('/')){if(p==='..')a.pop();else if(p!=='.'&&p)a.push(p);}return a.join('/');}
function load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;factories[id](module,module.exports,name=>{let key=name;if(!factories[key]){const app=id.startsWith('admin-panel')?'admin-panel':'dashboard';key=name.startsWith('@/')?app+'/src/'+name.slice(2):normalize(id.slice(0,id.lastIndexOf('/')+1)+name);key=[key,key+'.tsx',key+'.ts',key+'.mjs',key+'.js'].find(k=>factories[k]);}if(!key)throw Error('Unexpected fixture module '+name+' from '+id);return load(key);});return module.exports;}load('fixture');})();`;
export function submissionDocument(css, app = 'customer') {
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script>window.fixtureApp=' + JSON.stringify(app) + ';' + bundle.replaceAll('</script', '<\\/script') + '</script></body></html>';
}
