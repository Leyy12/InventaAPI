// Run after the Customer build. Render the actual Products component and built
// CSS with synthetic state in a fresh browser context; every network request is blocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { productsFixture } from './products-selection-fixture.mjs';
const require = createRequire(new URL('../../dashboard/package.json', import.meta.url));
const { createElement, Fragment } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cssRoot = new URL('../../dashboard/.next/static/', import.meta.url);
const css = readdirSync(cssRoot, { recursive: true }).filter(name => name.endsWith('.css'))
  .map(name => readFileSync(new URL(name.replaceAll('\\', '/'), cssRoot), 'utf8')).join('\n');
assert.ok(css.includes('grid-template-columns'), 'Customer built CSS required');
function element(value, key = 'root') {
  if (Array.isArray(value)) return value.map((child, index) => element(child, String(index)));
  if (!value || typeof value !== 'object') return value;
  // The isolated JSX runtime represents React fragments with an undefined type.
  return createElement(value.type ?? Fragment, { ...value.props, key: value.key ?? key }, element(value.props.children));
}
function document(tree) {
  const content = renderToStaticMarkup(element(tree));
  return `<!doctype html><html><head><style>${css}</style></head><body class="bg-slate-950 text-slate-50">
    <div class="flex h-screen overflow-hidden"><aside class="w-64 shrink-0 hidden md:flex"></aside>
    <div class="flex-1 flex flex-col overflow-hidden relative"><header class="h-16 shrink-0">Customer workspace</header>
    <main class="flex-1 overflow-y-auto p-6 lg:p-10">${content}</main></div></div></body></html>`;
}
test('full-width catalog uses only the outer page scroll with no/one/many selections', { timeout: 60000 }, async () => {
  const f = await productsFixture({ included: 2 });
  const before = document(f.h.output);
  await f.click(f.card('grocery-2'));
  const selected = document(f.h.output);
  await f.click(f.button('Select All'));
  const many = document(f.h.output);
  const headerCases = [];
  for (const [name, options] of [['first-key', {}], ['full-trial', {included:50}], ['paid-all', {trial:false}], ['verification-error', {trialMode:'error'}]]) {
    const fixture = await productsFixture(options);
    try { headerCases.push([name, document(fixture.h.output)]); } finally { fixture.stop(); }
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ hasTouch: true });
    const touch = await page.context().newCDPSession(page);
    await page.route('**/*', route => route.abort());
    for (const [width, height] of [[1920,1080], [1440,900], [1366,768], [768,1024], [390,844]]) {
      await page.setViewportSize({ width, height });
      let initial;
      for (const [state, html] of [['none',before], ['one',selected], ['many',many]]) {
        await page.setContent(html);
        const result = await page.evaluate(() => {
          const workspace = document.querySelector('[aria-label="Product catalog workspace"]');
          const list = document.querySelector('[aria-label="Product list"]');
          const grid = list.querySelector('.grid');
          const summary = document.querySelector('[aria-label="Product selection summary"]');
          const trialStatus = document.querySelector('[aria-label="Free Trial status"]');
          const availability = document.querySelectorAll('[aria-label="Catalog availability"]');
          const main = document.querySelector('main');
          const box = node => { const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}; };
          const w=box(workspace), l=box(list), g=box(grid), s=summary && box(summary);
          const controls=['product-search','category-filter','selection-filter'].map(id => document.getElementById(id));
          const selectedCard=list.querySelector('[aria-label$=", Selected"]');
          const style=selectedCard && getComputedStyle(selectedCard);
          return {workspace:w,list:l,grid:g,summary:s,summaryPosition:summary && getComputedStyle(summary).position,
            columns:getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,
            trialStatusHeight:trialStatus.getBoundingClientRect().height,
            trialStatusText:trialStatus.textContent.trim(),availabilityCount:availability.length,
            listOverflow:getComputedStyle(list).overflowY,
            listClipped:list.scrollHeight>list.clientHeight+1,
            verticalScrollers:[...document.querySelectorAll('body *')].filter(node=>
              /^(auto|scroll)$/.test(getComputedStyle(node).overflowY) && node.scrollHeight>node.clientHeight+1
            ).map(node=>node.tagName),
            pageOverflow:document.documentElement.scrollHeight>innerHeight+1,
            overflow:main.scrollWidth>main.clientWidth || list.scrollWidth>list.clientWidth || document.documentElement.scrollWidth>innerWidth,
            controls:controls.every(control=>{const r=box(control);return r.width>0 && r.x>=0 && r.right<=innerWidth && (!s || r.bottom<=s.y);}),
            border:style && ['Top','Right','Bottom','Left'].map(side=>[style['border'+side+'Width'],style['border'+side+'Color']])};
        });
        assert.equal(result.overflow, false, `${width}/${state}: horizontal overflow`);
        assert.equal(result.trialStatusText, 'Free Trial · 7 days · Included: 2/50 · Slots left: 48 · Active keys: 1/1');
        assert.equal(result.availabilityCount, 1);
        if (width >= 1024) {
          assert.ok(result.trialStatusHeight <= 24, `${width}/${state}: compact single Trial status row`);
          assert.ok(result.list.y <= (state === 'none' ? 300 : 380), `${width}/${state}: cards begin higher than previous header`);
        }
        assert.deepEqual(result.verticalScrollers, ['MAIN'], `${width}/${state}: only outer page scrollbar`);
        assert.equal(result.pageOverflow, false, `${width}/${state}: no second browser scrollbar`);
        assert.equal(result.listOverflow, 'visible', `${width}/${state}: list in document flow`);
        assert.equal(result.listClipped, false, `${width}/${state}: cards not clipped`);
        assert.equal(result.controls, true, `${width}/${state}: controls usable above summary`);
        assert.equal(result.list.width, result.workspace.width, `${width}/${state}: no side reservation`);
        assert.ok(result.grid.width >= result.workspace.width - 32, `${width}/${state}: full-width grid`);
        if (state === 'none') { assert.equal(result.summary, null); initial=result; }
        else {
          assert.equal(result.grid.x, initial.grid.x); assert.equal(result.grid.width, initial.grid.width);
          assert.equal(result.columns, initial.columns, `${width}/${state}: column count unchanged`);
          assert.equal(result.summaryPosition, 'static');
          assert.equal(result.summary.width, result.workspace.width);
          assert.ok(result.summary.bottom <= result.list.y, `${width}/${state}: summary above list`);
          if (width >= 1024) assert.ok(result.summary.height <= 96, `${width}/${state}: compact horizontal bar`);
          for (const edge of result.border) assert.deepEqual(edge, ['2px','rgb(99, 102, 241)']);
        }
        const card = page.locator('[aria-label="Product list"] .glass-card').nth(2);
        await card.scrollIntoViewIfNeeded();
        const point = await card.boundingBox();
        const start = await page.evaluate(()=>document.querySelector('main').scrollTop);
        await page.mouse.move(point.x+point.width/2, point.y+point.height/2);
        await page.mouse.wheel(0, 500);
        await page.waitForFunction(start=>document.querySelector('main').scrollTop>start+20, start, {timeout:3000});
        assert.equal(await page.evaluate(()=>document.querySelector('[aria-label="Product list"]').scrollTop), 0);
        if (state !== 'none') {
          const after = await page.evaluate(()=>{
            const summary=document.querySelector('[aria-label="Product selection summary"]');
            const s=summary.getBoundingClientRect(),list=document.querySelector('[aria-label="Product list"]').getBoundingClientRect();
            return {y:s.y,noOverlap:s.bottom<=list.top};
          });
          assert.ok(after.y<result.summary.y, `${width}/${state}: summary scrolls away naturally`);
          assert.equal(after.noOverlap,true);
        }
        await card.scrollIntoViewIfNeeded();
        await card.locator('button').first().focus();
        const keyboardStart = await page.evaluate(()=>document.querySelector('main').scrollTop);
        await page.keyboard.press('PageDown');
        await page.waitForFunction(start=>document.querySelector('main').scrollTop>start+20, keyboardStart, {timeout:3000});
        if (width < 1024) {
          await card.scrollIntoViewIfNeeded();
          const box = await card.boundingBox();
          const touchStart = await page.evaluate(()=>document.querySelector('main').scrollTop);
          const x=box.x+box.width/2, y=Math.min(height-40,box.y+box.height/2+100);
          await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
          for (const offset of [40,100,180,260]) {
            await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-offset}]});
          }
          await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForFunction(start=>document.querySelector('main').scrollTop>start+20, touchStart, {timeout:3000});
        }
        const last = page.locator('[aria-label="Product list"] .glass-card').last();
        await card.locator('button').first().focus();
        await page.keyboard.press('Control+End');
        await page.waitForFunction(()=>{
          const main=document.querySelector('main'); return main.scrollTop+main.clientHeight>=main.scrollHeight-2;
        },null,{timeout:3000});
        const bottom = await page.evaluate(()=>{
          const main=document.querySelector('main').getBoundingClientRect();
          const cards=document.querySelectorAll('[aria-label="Product list"] .glass-card');
          const last=cards[cards.length-1].getBoundingClientRect();
          return {visible:last.top>=main.top&&last.bottom<=main.bottom,innerScroll:document.querySelector('[aria-label="Product list"]').scrollTop};
        });
        assert.equal(bottom.visible,true,`${width}/${state}: final row reachable through page scroll`);
        assert.equal(bottom.innerScroll,0);
        assert.equal(await last.isVisible(),true);
        if (width === 1366 && state === 'one') {
          await page.evaluate(()=>{document.querySelector('main').scrollTop=0;});
          await page.screenshot({path:process.env.PRODUCT_SELECTION_SCREENSHOT || join(tmpdir(),'inventa-products-selection-layout.png')});
        }
      }
      console.log(`Layout ${width}x${height}: ${initial.columns} columns; first row y=${initial.list.y}; compact status, single availability, no/one/many selections; single outer scroll, wheel, keyboard, final row PASS`);
      for (const [name, html] of headerCases) {
        await page.setContent(html);
        const header = await page.evaluate(()=>{
          const main=document.querySelector('main'), root=main.firstElementChild, heading=root.firstElementChild;
          const status=heading.querySelector('[aria-label="Free Trial status"]');
          const warning=[...root.querySelectorAll('[role="alert"],[role="status"]')].find(node=>
            /product limit reached|Catalog verification unavailable/.test(node.textContent));
          const m=main.getBoundingClientRect(), s=status?.getBoundingClientRect(), w=warning?.getBoundingClientRect();
          const controls=root.querySelector('[aria-label="Product catalog workspace"]').firstElementChild.getBoundingClientRect();
          return {overflow:main.scrollWidth>main.clientWidth || document.documentElement.scrollWidth>innerWidth,
            availability:[...root.querySelectorAll('[aria-label="Catalog availability"]')].map(node=>node.textContent.trim()),
            status:status?.textContent.trim(),statusHeight:s?.height,
            warningVisible:w&&w.top>=m.top&&w.bottom<=m.bottom&&w.bottom<=controls.top,
            actions:[...heading.querySelectorAll('button,a')].every(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>=32&&r.left>=0&&r.right<=innerWidth&&r.bottom<=controls.top;})};
        });
        assert.equal(header.overflow,false,`${width}/${name}: header no horizontal overflow`);
        assert.equal(header.actions,true,`${width}/${name}: header actions usable`);
        assert.equal(header.availability.length,1,`${width}/${name}: availability shown once`);
        if (name==='paid-all') { assert.equal(header.status,undefined); assert.equal(header.availability[0],'Product Available: 180'); }
        else if (width>=1024) assert.ok(header.statusHeight<=24,`${width}/${name}: one compact Trial status row`);
        if (name==='first-key') assert.equal(header.status,'Free Trial · 7 days · Included: 0/50 · Slots left: 50 · Active keys: 0/1');
        if (name==='full-trial'||name==='verification-error') assert.equal(header.warningVisible,true,`${width}/${name}: important warning visible above controls`);
      }
    }
  } finally { f.stop(); await browser.close(); }
});
