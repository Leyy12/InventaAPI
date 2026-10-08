import test from 'node:test';
import assert from 'node:assert/strict';
import { nodes, flush } from './workspace-refresh/harness.mjs';
import { productsFixture, text } from './products-selection-fixture.mjs';

function observerFixture() {
  const observers = [];
  class Observer {
    constructor(callback, options) { this.callback=callback; this.options=options; this.disconnected=false; observers.push(this); }
    observe(target) { this.target=target; }
    disconnect() { this.disconnected=true; }
    async position(bottom) { this.callback([{boundingClientRect:{bottom},rootBounds:{top:64}}]); await flush(); }
  }
  const main = {scrollHeight:4800}, returns = [];
  const summary = {closest: name => { assert.equal(name,'main'); return main; }, scrollIntoView: options=>returns.push(options)};
  return { Observer, observers, main, summary, returns };
}
const inline = f => f.find(n=>n.props['aria-label']==='Product selection summary');
const dock = f => f.find(n=>n.props['aria-label']==='Docked product selections');
const buttons = tree => nodes(tree,n=>n.type==='button');

for (const options of [{}, {included:2}, {trial:false}]) {
  test(`zero pending selections have no inline/dock/observer: ${JSON.stringify(options)}`, async()=>{
    const io=observerFixture(), f=await productsFixture({...options,headerTarget:{},Observer:io.Observer});
    try { assert.equal(inline(f),undefined);assert.equal(dock(f),undefined);assert.equal(io.observers.length,0); }
    finally {f.stop();}
  });
}

for (const options of [{}, {included:2}, {trial:false}]) {
  test(`visibility transitions and shared actions use only current Products state: ${JSON.stringify(options)}`, async()=>{
    const io=observerFixture(), f=await productsFixture({...options,headerTarget:{},Observer:io.Observer});
    try {
      for (const id of [2,3,4,5]) await f.click(f.card(`grocery-${id}`));
      inline(f).props.ref(io.summary); await flush();
      const observer=io.observers[0]; assert.equal(observer.options.root,io.main);
      assert.equal(observer.options.rootMargin,'0px 0px 4800px 0px');
      await observer.position(1200); assert.equal(dock(f),undefined,'initially below viewport must not dock');
      await observer.position(90); assert.equal(dock(f),undefined,'partial inline visibility must not duplicate controls');
      await observer.position(64); assert.match(text(dock(f)),/4\s+selected/);
      const inButtons=buttons(inline(f)), dockButtons=buttons(dock(f));
      assert.equal(dockButtons[1].props.onClick,inButtons[0].props.onClick);
      assert.equal(dockButtons[1].props.disabled,inButtons[0].props.disabled);
      assert.equal(dockButtons[2].props.onClick,inButtons[1].props.onClick);
      assert.equal(dockButtons[2].props.disabled,inButtons[1].props.disabled);
      assert.equal(nodes(dock(f),n=>n.type==='a')[0].props.href,nodes(inline(f),n=>n.type==='a')[0].props.href);
      dockButtons[0].props.onClick(); assert.equal(io.returns.length,1); assert.equal(io.returns[0].block,'center');
      for (const filter of ['selected','not-selected','all']) {
        await f.filter(filter); assert.match(text(dock(f)),/4\s+selected/);
      }
      assert.equal(f.calls.length,1);assert.equal(f.keyCalls.length,options.trial===false?0:1);
      assert.equal(io.observers.length,1,'filters do not recreate the observer or poll');
      await observer.position(200); assert.equal(dock(f),undefined);
      await observer.position(0); assert.ok(dock(f));
      const oldRef=inline(f).props.ref;
      await f.click(buttons(dock(f))[2]); oldRef(null); await flush();
      assert.equal(inline(f),undefined);assert.equal(dock(f),undefined);assert.equal(observer.disconnected,true);
      if (options.included) {
        assert.equal(f.card('grocery-0').props['aria-disabled'],true);
        assert.match(text(f.card('grocery-0')),/Included/);
      }
      await f.click(f.card('grocery-2'));
      inline(f).props.ref({...io.summary}); await flush();
      assert.equal(dock(f),undefined,'new summary must not inherit the old dock visibility');
      await io.observers[1].position(1200); assert.equal(dock(f),undefined);
      f.stop(); assert.equal(io.observers[1].disconnected,true);
      await io.observers[1].position(0); assert.equal(dock(f),undefined,'queued observer callbacks after unmount are ignored');
    } finally {f.stop();}
  });
}
