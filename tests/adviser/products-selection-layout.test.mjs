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
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cssRoot = new URL('../../dashboard/.next/static/', import.meta.url);
const css = readdirSync(cssRoot, { recursive: true }).filter(name => name.endsWith('.css'))
  .map(name => readFileSync(new URL(name.replaceAll('\\', '/'), cssRoot), 'utf8')).join('\n');
assert.ok(css.includes('grid-template-columns'), 'Customer built CSS required');
function element(value, key = 'root') {
  if (Array.isArray(value)) return value.map((child, index) => element(child, String(index)));
  if (!value || typeof value !== 'object') return value;
  return createElement(value.type, { ...value.props, key: value.key ?? key }, element(value.props.children));
}
function document(tree) {
  const content = renderToStaticMarkup(element(tree));
  return `<!doctype html><html><head><style>${css}</style></head><body class="bg-slate-950 text-slate-50">
    <div class="flex h-screen overflow-hidden"><aside class="w-64 shrink-0 hidden md:flex"></aside>
    <div class="flex-1 flex flex-col overflow-hidden relative"><header class="h-16 shrink-0">Customer workspace</header>
    <main class="flex-1 overflow-y-auto p-6 lg:p-10">${content}</main></div></div></body></html>`;
}
test('full-width catalog stays the same width with no/one/many selections; upper bar never overlays the product scroller', { timeout: 60000 }, async () => {
  const f = await productsFixture({ included: 2 });
  const before = document(f.h.output);
  await f.click(f.card('grocery-2'));
  const selected = document(f.h.output);
  await f.click(f.button('Select All'));
  const many = document(f.h.output);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    for (const [width, height] of [[1920,1080], [1440,900], [1366,768], [768,1024], [390,844]]) {
      await page.setViewportSize({ width, height });
      let initial;
      for (const [state, html] of [['none',before], ['one',selected], ['many',many]]) {
        await page.setContent(html);
        if (width >= 1024) await page.locator('[aria-label="Product catalog workspace"]').scrollIntoViewIfNeeded();
        const result = await page.evaluate(() => {
          const workspace = document.querySelector('[aria-label="Product catalog workspace"]');
          const list = document.querySelector('[aria-label="Product list"]');
          const grid = list.querySelector('.grid');
          const summary = document.querySelector('[aria-label="Product selection summary"]');
          const main = document.querySelector('main');
          const box = node => { const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}; };
          const w=box(workspace), l=box(list), g=box(grid), s=summary && box(summary);
          const controls=['product-search','category-filter','selection-filter'].map(id => document.getElementById(id));
          const selectedCard=list.querySelector('[aria-label$=", Selected"]');
          const style=selectedCard && getComputedStyle(selectedCard);
          return {workspace:w,list:l,grid:g,summary:s,summaryPosition:summary && getComputedStyle(summary).position,
            columns:getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,
            listOverflow:getComputedStyle(list).overflowY,
            overflow:main.scrollWidth>main.clientWidth || list.scrollWidth>list.clientWidth || document.documentElement.scrollWidth>innerWidth,
            controls:controls.every(control=>{const r=box(control);return r.width>0 && r.x>=0 && r.right<=innerWidth && (!s || r.bottom<=s.y);}),
            border:style && ['Top','Right','Bottom','Left'].map(side=>[style['border'+side+'Width'],style['border'+side+'Color']])};
        });
        assert.equal(result.overflow, false, `${width}/${state}: horizontal overflow`);
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
        if (width >= 1024 && state !== 'none') {
          assert.equal(result.listOverflow, 'auto');
          for (const scroll of [500,2000,10000]) {
            await page.evaluate(scroll=>{document.querySelector('[aria-label="Product list"]').scrollTop=scroll;},scroll);
            const after=await page.evaluate(()=>{
              const summary=document.querySelector('[aria-label="Product selection summary"]');
              const s=summary.getBoundingClientRect(),list=document.querySelector('[aria-label="Product list"]').getBoundingClientRect();
              const main=document.querySelector('main').getBoundingClientRect();
              const top=document.elementFromPoint(s.left+s.width/2,s.top+s.height/2);
              return {y:s.y,noOverlap:s.bottom<=list.top,visible:s.top>=main.top&&s.bottom<=main.bottom,ownsPoint:summary.contains(top),
                actions:[...summary.querySelectorAll('button,a')].every(node=>{const r=node.getBoundingClientRect();return r.top>=main.top&&r.bottom<=main.bottom;})};
            });
            assert.equal(after.y,result.summary.y, `${width}: upper bar stable during list scroll`);
            assert.equal(after.noOverlap,true);assert.equal(after.visible,true);assert.equal(after.ownsPoint,true);assert.equal(after.actions,true);
          }
        }
        if (width === 1366 && state === 'one') {
          await page.evaluate(()=>{document.querySelector('[aria-label="Product list"]').scrollTop=0;});
          await page.screenshot({path:process.env.PRODUCT_SELECTION_SCREENSHOT || join(tmpdir(),'inventa-products-selection-layout.png')});
        }
      }
      console.log(`Layout ${width}x${height}: ${initial.columns} columns; no/one/many selections PASS`);
    }
  } finally { f.stop(); await browser.close(); }
});
