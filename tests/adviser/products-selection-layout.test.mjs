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
test('desktop scrolling never overlaps cards/controls; reserved lane prevents jumps; mobile/tablet stay in flow', { timeout: 60000 }, async () => {
  const f = await productsFixture({ included: 2 });
  const before = document(f.h.output);
  await f.click(f.card('grocery-2'));
  const selected = document(f.h.output);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    for (const [width, height] of [[1920,1080], [1440,900], [1366,768], [768,1024], [390,844]]) {
      await page.setViewportSize({ width, height });
      await page.setContent(before);
      const initial = await page.locator('[aria-label="Grocery Milk 0, Included"]').boundingBox();
      await page.setContent(selected);
      const after = await page.locator('[aria-label="Grocery Milk 0, Included"]').boundingBox();
      if (width >= 1024) { assert.equal(after.x, initial.x); assert.equal(after.width, initial.width); assert.equal(after.y, initial.y); }
      const start = await page.evaluate(() => {
        const summary = document.querySelector('[aria-label="Product selection summary"]');
        const main = document.querySelector('main');
        const controls = ['product-search','category-filter','selection-filter'].map(id => document.getElementById(id));
        const card = document.querySelector('[aria-label="Grocery Milk 2, Selected"]');
        const style = getComputedStyle(card);
        return { sticky: getComputedStyle(summary).position, overflow: main.scrollWidth > main.clientWidth || document.documentElement.scrollWidth > innerWidth,
          controls: controls.every(control => { const r=control.getBoundingClientRect(); return r.width>0 && r.left>=0 && r.right<=innerWidth; }),
          border: ['Top','Right','Bottom','Left'].map(side => [style['border'+side+'Width'],style['border'+side+'Color']]) };
      });
      assert.equal(start.overflow, false, `${width}: horizontal overflow`);
      assert.equal(start.controls, true, `${width}: usable controls`);
      for (const edge of start.border) assert.deepEqual(edge, ['2px','rgb(99, 102, 241)']);
      assert.equal(start.sticky, width >= 1024 ? 'sticky' : 'static');
      if (width >= 1024) {
        for (const scroll of [500, 2000, 10000]) {
          await page.evaluate(scroll => { document.querySelector('main').scrollTop = scroll; }, scroll);
          const result = await page.evaluate(() => {
            const summary = document.querySelector('[aria-label="Product selection summary"]').getBoundingClientRect();
            const main = document.querySelector('main').getBoundingClientRect();
            const obstacles = [...document.querySelectorAll('.glass-card, #product-search, #category-filter, #selection-filter')];
            const intersects = rect => summary.left < rect.right && summary.right > rect.left && summary.top < rect.bottom && summary.bottom > rect.top;
            return { overlap: obstacles.some(node => intersects(node.getBoundingClientRect())), visible: summary.top >= main.top && summary.bottom <= main.bottom,
              actions: [...document.querySelectorAll('[aria-label="Product selection summary"] button')].every(button => { const r=button.getBoundingClientRect(); return r.top>=main.top && r.bottom<=main.bottom; }) };
          });
          assert.equal(result.overlap, false, `${width}: overlap at ${scroll}`);
          assert.equal(result.visible, true, `${width}: persistent at ${scroll}`);
          assert.equal(result.actions, true, `${width}: actions usable at ${scroll}`);
        }
      }
      if (width === 1366) {
        await page.evaluate(() => { document.querySelector('main').scrollTop = 500; });
        await page.screenshot({ path: process.env.PRODUCT_SELECTION_SCREENSHOT || join(tmpdir(), 'inventa-products-selection-layout.png') });
      }
      console.log(`Layout ${width}x${height}: PASS`);
    }
  } finally { f.stop(); await browser.close(); }
});
