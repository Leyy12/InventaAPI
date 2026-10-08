// Browser-only synthetic transport. Real React, Products, Navbar, LayoutWrapper,
// header slot, catalog/selection helpers; no Firebase SDK or external requests.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../dashboard/package.json', import.meta.url));
const ts = require('typescript');
const modules = new Map();
function source(id, code) {
  modules.set(id, ts.transpileModule(code, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText);
}
for (const id of [
  'dashboard/src/app/dashboard/products/page.tsx', 'dashboard/src/components/layout/Navbar.tsx',
  'dashboard/src/components/layout/LayoutWrapper.tsx', 'dashboard/src/components/layout/WorkspaceHeaderSlot.tsx',
  'dashboard/src/components/layout/dashboard-navigation.ts', 'dashboard/src/lib/customer-readiness.ts',
  'dashboard/src/lib/segment-catalog.ts', 'dashboard/src/lib/trial-catalog-selection.ts',
  'dashboard/src/lib/trial-display.mjs', 'dashboard/src/lib/linked-product-selection.ts',
  'services/customer-segment.js', 'services/product-contract.js', 'services/auth-navigation.ts',
  'functions/entitlement-limits.mjs', 'functions/subscription-lifecycle.mjs',
]) source(id, readFileSync(new URL('../../'+id, import.meta.url),'utf8'));
for (const [id, path] of [
  ['react','react/cjs/react.production.js'], ['react/jsx-runtime','react/cjs/react-jsx-runtime.production.js'],
  ['react-dom','react-dom/cjs/react-dom.production.js'], ['react-dom/client','react-dom/cjs/react-dom-client.production.js'],
  ['scheduler','scheduler/cjs/scheduler.production.js'],
]) modules.set(id, readFileSync(new URL('../../dashboard/node_modules/'+path, import.meta.url),'utf8'));

source('fixture', `
import React from 'react';
import {createRoot} from 'react-dom/client';
import LayoutWrapper from './dashboard/src/components/layout/LayoutWrapper';
import Products from './dashboard/src/app/dashboard/products/page';
export const Context=React.createContext(null);
export const runtime={calls:[],currentUser:null, evidence:null, holdPatch:false, releasePatch:null};
export function useFixture(){return React.useContext(Context);}
export function transport(user,path='',init){
  runtime.calls.push({path,method:init?.method||'GET'});
  if(init?.method==='PATCH'){
    const save=()=>{const body=JSON.parse(init.body),key={...runtime.evidence.keys[0],...body,scopeVersion:body.expectedScopeVersion+1};
      const size=new Set([...key.linkedProductIds,...Object.keys(key.linkedVariantSelections)]).size;
      runtime.evidence={keys:[key],trialCatalog:{productsIncluded:size,productsAvailable:Math.max(50-size,0),activeKeys:1,expiresAt:null}};
      return {};};
    if(runtime.holdPatch)return new Promise(resolve=>{runtime.releasePatch=()=>resolve(save());});
    return Promise.resolve(save());
  }
  return Promise.resolve(runtime.evidence);
}
function App({options}){
  const [pathname,setPath]=React.useState('/dashboard/products'),[signedIn,setSignedIn]=React.useState(true);
  const user=React.useMemo(()=>({uid:'synthetic-header-dock',getIdToken:async()=> 'synthetic-only'}),[]);
  runtime.currentUser=signedIn?user:null;
  const auth=React.useMemo(()=>({user:signedIn?user:null,appUser:signedIn?{role:'business',plan:options.trial===false?'Pro':'Free',businessSegment:'Grocery'}:null,
    entitlement:signedIn?{activeTrial:options.trial!==false,activePro:options.trial===false,plan:options.trial===false?'Pro':'Free',subscription_status:options.trial===false?'active':'trial',secondsRemaining:86400*30}:null,
    authStatus:signedIn?'verified':'unauthenticated',loading:false,logout:()=>setSignedIn(false)}),[signedIn,user,options.trial]);
  const navigate=React.useCallback(href=>setPath(href.split('?')[0]),[]);
  window.fixture.navigate=navigate;window.fixture.logout=()=>setSignedIn(false);
  const value=React.useMemo(()=>({auth,pathname,navigate}),[auth,pathname,navigate]);
  return <Context.Provider value={value}><LayoutWrapper>{pathname==='/dashboard/products'?<Products/>:<div data-testid="other-route">Other Customer route</div>}</LayoutWrapper></Context.Provider>;
}
const root=createRoot(document.getElementById('root'));let version=0;
window.fixture={runtime,configure(options={}){
  const included=options.included||0, ids=Array.from({length:included},(_,i)=>'grocery-'+i);
  runtime.calls=[];runtime.holdPatch=false;runtime.releasePatch=null;
  runtime.evidence={keys:included?[{id:'fixture-key',scopeVersion:3,linkedProductIds:ids,linkedVariantSelections:{},productIds:ids}]:[],trialCatalog:{productsIncluded:included,productsAvailable:Math.max(50-included,0),activeKeys:included?1:0,expiresAt:null}};
  root.render(<App key={++version} options={options}/>);
}};
window.fetch=async(url,init)=>{
  runtime.calls.push({path:String(url),method:init?.method||'GET'});
  if(init?.method)throw Error('Unexpected synthetic fetch mutation');
  const segment=new URL(url).searchParams.get('businessSegment');
  const products=['Grocery','Hardware','Pharmacy'].flatMap(s=>Array.from({length:60},(_,i)=>({id:s.toLowerCase()+'-'+i,name:s+' '+(i%2?'Rice':'Milk')+' '+i,sku:s+'-SKU-'+i,description:'Synthetic fixture only',segment:s,variants:[{flavor:'a',size:'each'},{flavor:'b',size:'each'}]}))).filter(p=>segment==='All'||p.segment===segment);
  return {ok:true,json:async()=>({products,availability:{segment:segment==='All'?null:segment,total:products.length},pagination:{total:products.length,offset:0,limit:200,returned:products.length}})};
};
window.fixture.configure(window.fixtureOptions||{});
`);
source('next/navigation', `import {useFixture} from 'fixture';export const usePathname=()=>useFixture().pathname;export const useRouter=()=>({push:useFixture().navigate,replace:useFixture().navigate});`);
source('next/link', `import React from 'react';import {useFixture} from 'fixture';export default function Link({href,onClick,children,...props}){const f=useFixture();return <a {...props} href={href} onClick={e=>{e.preventDefault();onClick?.(e);f.navigate(href);}}>{children}</a>;}`);
source('@/lib/firebase/auth-context', `import {useFixture} from 'fixture';export const useAuth=()=>useFixture().auth;`);
source('@/lib/api-keys', `export {transport as apiKeyRequest} from 'fixture';`);
source('@/lib/firebase/config', `import {runtime} from 'fixture';export const auth={get currentUser(){return runtime.currentUser;}};`);
source('@/components/shared/NotificationBell', `import React from 'react';export default function Bell(){return <button aria-label="Notifications" className="p-2 rounded-full text-slate-400"><svg className="h-5 w-5"/></button>;}`);
source('dashboard/src/components/layout/Sidebar.tsx', `import React from 'react';export default function Sidebar(){return <aside className="w-64 shrink-0 hidden md:flex"/>;}`);
source('@/components/shared/SubscriptionExpiryBanner', `export default ()=>null;`);
source('@/components/auth/SessionLoadingScreen', `export default ()=>null;export const SessionRecoveryState=()=>null;`);
source('@/components/product-request/ProductNotFound', `import React from 'react';export default ()=> <div>Empty catalog</div>;`);
source('@/components/products/AddProductModal', `export default ()=>null;`);
source('@/lib/firebase/notifications', `export const notifySubscriptionExpiringSoon=()=>{throw Error('Unexpected fixture notification mutation');};`);
source('@/lib/account-usage-events', `export const invalidateAccountUsage=()=>{};`);
source('@/lib/api-key-generation', `export const GENERATION_POLICY='Synthetic policy';export const generationErrorMessage=data=>data.error;`);
source('@/lib/product-image-url', `export const productImageSource=()=>'';export const showProductImageFallback=()=>{};`);
source('@/lib/firebase/products-service', `export const getBasePrice=()=>1;export const getBaseSize=()=> 'each';export const hasNearExpiry=()=>false;`);
modules.set('lucide-react', `const R=require('react');module.exports=new Proxy({}, {get:()=>props=>R.createElement('svg',props)});`);

const bundle=`const process={env:{NODE_ENV:'production',NEXT_PUBLIC_API_URL:'https://synthetic.invalid'}};const factories={${[...modules].map(([id,code])=>JSON.stringify(id)+':function(module,exports,require){\n'+code+'\n}').join(',')}};
const cache={};function normalize(name){const parts=[];for(const p of name.split('/')){if(p==='..')parts.pop();else if(p!=='.'&&p)parts.push(p);}return parts.join('/');}
function load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;factories[id](module,module.exports,name=>{let key=name;if(!factories[key]){key=name.startsWith('@/')?'dashboard/src/'+name.slice(2):normalize(id.slice(0,id.lastIndexOf('/')+1)+name);key=[key,key+'.tsx',key+'.ts',key+'.mjs',key+'.js'].find(k=>factories[k]);}if(!key)throw Error('Unexpected fixture module: '+name+' from '+id);return load(key);});return module.exports;}load('fixture');`;

export function headerDockDocument(css,options={}) {
  return `<!doctype html><html><head><style>${css}</style></head><body class="bg-slate-950 text-slate-50"><div id="root"></div><script>window.fixtureOptions=${JSON.stringify(options)};${bundle.replaceAll('</script','<\\/script')}</script></body></html>`;
}
