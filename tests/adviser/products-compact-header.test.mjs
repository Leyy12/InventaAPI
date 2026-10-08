import test from 'node:test';
import assert from 'node:assert/strict';
import { nodes } from './workspace-refresh/harness.mjs';
import { productsFixture, text } from './products-selection-fixture.mjs';

const normalized = tree => text(tree).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
const status = f => f.find(n => n.props['aria-label'] === 'Free Trial status');
const availability = f => nodes(f.h.output, n => n.props['aria-label'] === 'Catalog availability');
async function using(options, run) {
  const f = await productsFixture(options);
  try { await run(f); } finally { f.stop(); }
}

for (const included of [0, 17, 48, 50, 51]) {
  test(`compact Trial status shows persisted ${included} products and keeps pending selections separate`, () => using({ included }, async f => {
    const expected = `Free Trial · 7 days · Included: ${included}/50 · Slots left: ${Math.max(50-included, 0)} · Active keys: ${included ? 1 : 0}/1`;
    assert.equal(normalized(status(f)), expected);
    assert.match(status(f).props.className, /text-xs leading-5/);
    const header = f.h.output.props.children.find(node => node?.type === 'div');
    assert.equal(nodes(header, n => n.props['aria-label'] === 'Free Trial status').length, 1);
    assert.equal(availability(f).length, 1);
    assert.equal(normalized(availability(f)[0]), '60 Grocery');
    assert.doesNotMatch(text(f.h.output), /Products are managed under one account allowance|Select products to link to your first API key/);
    if (included < 50) {
      await f.click(f.card(`grocery-${included}`));
      assert.equal(normalized(status(f)), expected);
      assert.match(text(f.h.output), /1 selected to add/);
      await f.click(f.button('Clear New Selections'));
      assert.equal(normalized(status(f)), expected);
    } else {
      assert.match(text(f.h.output), included === 50 ? /Free Trial product limit reached/ : /Your Free Trial product limit is 50 products/);
    }
  }));
}

test('paid All Categories and individual segments each show exactly one authoritative availability badge', () => using({ trial: false }, async f => {
  assert.equal(status(f), undefined);
  assert.equal(availability(f).length, 1);
  assert.equal(normalized(availability(f)[0]), 'Product Available: 180');
  await f.search('milk');
  assert.equal(normalized(availability(f)[0]), 'Product Available: 180 · 90 results');
  await f.filter('selected');
  assert.equal(normalized(availability(f)[0]), 'Product Available: 180 · 0 results');
  await f.filter('all'); await f.segment('Grocery');
  assert.equal(availability(f).length, 1);
  assert.equal(normalized(availability(f)[0]), '60 Grocery · 30 results');
  assert.doesNotMatch(text(f.h.output), /Product Available:/);
  await f.search(''); await f.segment('All');
  assert.equal(normalized(availability(f)[0]), 'Product Available: 180');
  assert.equal((text(f.h.output).match(/Product Available:/g) ?? []).length, 1);
}));

for (const catalogMode of ['loading', 'error']) {
  test(`${catalogMode} catalog keeps unavailable availability distinct from a verified zero`, () => using({ catalogMode }, f => {
    assert.equal(availability(f).length, 1);
    assert.equal(normalized(availability(f)[0]), '— Grocery');
    if (catalogMode === 'error') {
      assert.match(text(f.find(n => n.props.role === 'alert')), /Catalog unavailable/);
      assert.ok(f.button('Retry catalog'));
    } else assert.equal(f.cards().length, 0);
  }));
}

test('legitimate empty catalog keeps verified zero availability visible once', () => using({ count: 0 }, f => {
  assert.equal(availability(f).length, 1);
  assert.equal(normalized(availability(f)[0]), '0 Grocery');
}));

for (const trialMode of ['loading', 'error']) {
  test(`${trialMode} Trial verification retains guidance/errors without inventing Included counts`, () => using({ trialMode }, f => {
    assert.equal(normalized(status(f)), 'Verifying persisted Trial catalog…');
    assert.doesNotMatch(text(status(f)), /Included:|Slots left:|Active keys:/);
    assert.equal(f.button('Generate API Key').props.disabled, true);
    if (trialMode === 'error') assert.match(text(f.find(n => n.props.role === 'alert')), /Catalog verification unavailable/);
  }));
}
