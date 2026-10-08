import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { headerDockDocument } from './products-header-browser-fixture.mjs';

const cssRoot = new URL('../../dashboard/.next/static/',import.meta.url);
const css = readdirSync(cssRoot,{recursive:true}).filter(name=>name.endsWith('.css'))
  .map(name=>readFileSync(new URL(name.replaceAll('\\','/'),cssRoot),'utf8')).join('\n');
const dockSelector='[aria-label="Docked product selections"]';
const summarySelector='[aria-label="Product selection summary"]';
const cardSelector='[aria-label="Product list"] .glass-card';

async function loadFixture(page, options={}) {
  await page.goto('about:blank');
  await page.setContent(headerDockDocument(css,options));
}

async function waitDock(page,visible) {
  await page.waitForFunction(({selector,visible})=>Boolean(document.querySelector(selector))===visible,{selector:dockSelector,visible},{timeout:3000});
}
async function down(page) {
  await page.evaluate(()=>{document.querySelector('main').scrollTop=100000;});
  const above=await page.evaluate(()=>document.querySelector('[aria-label="Product selection summary"]').getBoundingClientRect().bottom<=document.querySelector('main').getBoundingClientRect().top);
  await waitDock(page,above);return above;
}
async function top(page) {
  await page.evaluate(()=>{document.querySelector('main').scrollTop=0;});await waitDock(page,false);
}
async function dimensions(page) {
  return page.evaluate(()=>{
    const main=document.querySelector('main'),list=document.querySelector('[aria-label="Product list"]'),grid=list.querySelector('.grid'),header=document.querySelector('header');
    const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const bell=document.querySelector('[aria-label="Notifications"]'),b=box(bell),h=box(header);
    return {grid:box(grid),header:h,bell:b,main:box(main),columns:getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,
      overflow:document.documentElement.scrollWidth>innerWidth||main.scrollWidth>main.clientWidth,
      innerScroll:getComputedStyle(list).overflowY,scrollbars:[...document.querySelectorAll('body *')].filter(n=>/^(auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1).map(n=>n.tagName),
      bellAccessible:bell.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};
  });
}

test('real Products + Navbar dock transitions, shared actions, route/auth cleanup, responsive single-scroll layout', {timeout:180000}, async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({hasTouch:true});const errors=[];let outgoing=0;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{outgoing++;return route.abort();});
    for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[768,1024],[390,844]]) {
      await page.setViewportSize({width,height});
      await loadFixture(page,{included:2});
      await page.locator(cardSelector).nth(59).waitFor({timeout:5000});
      assert.equal(await page.locator(summarySelector).count(),0);await waitDock(page,false);
      const initial=await dimensions(page);assert.equal(initial.header.height,64);assert.equal(initial.overflow,false);
      assert.equal(initial.innerScroll,'visible');assert.deepEqual(initial.scrollbars,['MAIN']);
      assert.equal(initial.columns,width===1920?5:width===1440?4:width===1366?3:1);
      for(const id of [2,3,4,5]) await page.locator(`[aria-label="Grocery ${id%2?'Rice':'Milk'} ${id}"]`).click();
      await top(page);
      assert.match(await page.locator(summarySelector).innerText(),/4 selected to add/);
      const selected=await dimensions(page);assert.equal(selected.grid.width,initial.grid.width);
      assert.equal(await down(page),true);const docked=await dimensions(page);
      assert.equal(docked.header.height,64);assert.equal(docked.grid.width,initial.grid.width);assert.equal(docked.grid.x,initial.grid.x);
      assert.equal(docked.bell.x,initial.bell.x);assert.equal(docked.bellAccessible,true);assert.equal(docked.overflow,false);
      assert.ok(docked.main.y>=docked.header.bottom);assert.deepEqual(docked.scrollbars,['MAIN']);
      const inHeader=await page.locator(dockSelector).evaluate(node=>{
        const h=node.closest('header').getBoundingClientRect();return [...node.querySelectorAll('button,a')].filter(n=>getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().width>0).every(n=>{const r=n.getBoundingClientRect();return r.top>=h.top&&r.bottom<=h.bottom&&r.right<=h.right;});
      });assert.equal(inHeader,true);
      assert.match(await page.locator(dockSelector).innerText(),/4 selected/);
      assert.match(await page.locator('[aria-label="Free Trial status"]').innerText(),/Included: 2\/50/);
      if(width>=1280) {
        await page.locator(dockSelector).getByRole('button',{name:'Add Selected Products',exact:true}).waitFor();
        assert.equal(await page.locator(dockSelector).getByRole('button',{name:'Clear new selections',exact:true}).isEnabled(),true);
        assert.match(await page.locator(dockSelector).getByRole('link',{name:'Playground'}).getAttribute('href'),/products=grocery-2,grocery-3,grocery-4,grocery-5/);
      } else {
        assert.equal(await page.locator(dockSelector).getByRole('button',{name:'Add Selected Products'}).isVisible(),false);
        await page.locator(dockSelector).getByRole('button',{name:/Return to product selections/}).click();await waitDock(page,false);
        const shown=await page.locator(summarySelector).evaluate(node=>{const s=node.getBoundingClientRect(),m=node.closest('main').getBoundingClientRect();return s.top>=m.top&&s.bottom<=m.bottom;});assert.equal(shown,true);
      }
      const readCount=await page.evaluate(()=>window.fixture.runtime.calls.length);
      for(const filter of ['selected','not-selected','all']) {
        await top(page);await page.locator('#selection-filter').selectOption(filter);
        await down(page);
        assert.match(await page.locator(summarySelector).innerText(),/4 selected to add/);
        if(await page.locator(dockSelector).count()) assert.match(await page.locator(dockSelector).innerText(),/4 selected/);
      }
      assert.equal(await page.evaluate(()=>window.fixture.runtime.calls.length),readCount);
      await top(page);await waitDock(page,false);await down(page);
      if(width===1366) await page.screenshot({path:process.env.PRODUCT_DOCK_SCREENSHOT||join(tmpdir(),'inventa-products-header-dock.png')});
      if(width>=1280) await page.locator(dockSelector).getByRole('button',{name:'Clear new selections',exact:true}).click();
      else {await page.locator(dockSelector).getByRole('button',{name:/Return to product selections/}).click();await waitDock(page,false);await page.locator(summarySelector).getByRole('button',{name:'Clear new selections',exact:true}).click();}
      await page.locator(summarySelector).waitFor({state:'detached'});await waitDock(page,false);
      await top(page);assert.match(await page.locator('[aria-label="Grocery Milk 0, Included"]').innerText(),/Included/);
      assert.equal(await page.locator('[aria-label="Grocery Milk 0, Included"]').getAttribute('aria-disabled'),'true');
      await page.locator('[aria-label="Grocery Milk 2"]').click();await down(page);await waitDock(page,true);
      if(width<768) {
        await page.getByRole('button',{name:'Open workspace navigation'}).click();
        await page.getByRole('navigation',{name:'Customer workspace'}).getByRole('link',{name:'Overview',exact:true}).click();
      } else await page.evaluate(()=>window.fixture.navigate('/dashboard/api-keys'));
      await page.getByTestId('other-route').waitFor();await waitDock(page,false);
      assert.equal(await page.locator('header').evaluate(n=>n.getBoundingClientRect().height),64);
      await page.evaluate(()=>window.fixture.navigate('/dashboard/products'));
      await page.locator(cardSelector).nth(59).waitFor();assert.equal(await page.locator(summarySelector).count(),0);
      await page.locator('[aria-label="Grocery Milk 2"]').click();await down(page);
      await page.evaluate(()=>window.fixture.logout());await page.locator('header').waitFor({state:'detached'});await waitDock(page,false);
      console.log(`Dock ${width}x${height}: no/4/clear, inline/dock/return, filters, route/auth cleanup, 64px Navbar, notifications, full width PASS`);
    }
    // Existing-key submission: a second click while the shared request is pending
    // cannot issue another PATCH; only the synthetic transport is modified.
    await page.setViewportSize({width:1366,height:768});await loadFixture(page,{included:2});
    await page.locator(cardSelector).nth(59).waitFor();
    await page.locator('[aria-label="Grocery Milk 2"]').click();await down(page);
    await page.evaluate(()=>{window.fixture.runtime.holdPatch=true;});
    const add=page.locator(dockSelector).getByRole('button',{name:'Add Selected Products',exact:true});
    await add.dblclick();assert.equal(await add.isDisabled(),true);
    assert.equal(await page.locator(dockSelector).getByRole('button',{name:'Clear new selections',exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.fixture.runtime.calls.filter(c=>c.method==='PATCH').length),1);
    await page.evaluate(()=>window.fixture.runtime.releasePatch());await waitDock(page,false);
    await top(page);assert.match(await page.locator('[aria-label="Free Trial status"]').innerText(),/Included: 3\/50/);
    for(const options of [{}, {trial:false}]) {
      await loadFixture(page,options);await page.locator(cardSelector).nth(59).waitFor();
      await page.locator('[aria-label="Grocery Milk 2"]').click();await down(page);
      await page.locator(dockSelector).getByRole('button',{name:'Generate API Key',exact:true}).click();
      await page.getByPlaceholder('e.g., Production POS, Dev Server').waitFor();
      assert.equal(await page.evaluate(()=>window.fixture.runtime.calls.some(c=>c.method==='POST'||c.method==='PATCH')),false);
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.locator(dockSelector).getByRole('link',{name:'Playground',exact:true}).click();await page.getByTestId('other-route').waitFor();await waitDock(page,false);
    }
    // Initial summary below a short mobile viewport must never activate the dock.
    await page.setViewportSize({width:390,height:320});await loadFixture(page);
    await page.locator(cardSelector).nth(59).waitFor();
    await page.getByRole('button',{name:/Select 50 new products in view/}).click();await top(page);
    assert.equal(await page.locator(summarySelector).evaluate(n=>n.getBoundingClientRect().top>=n.closest('main').getBoundingClientRect().bottom),true);
    await waitDock(page,false);
    await down(page);await waitDock(page,true);
    await top(page);await waitDock(page,false);
    assert.equal(outgoing,0);assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
