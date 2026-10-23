import test from 'node:test';
import assert from 'node:assert/strict';
import { nodes } from './workspace-refresh/harness.mjs';
import { productsFixture, text } from './products-selection-fixture.mjs';

async function using(options, run) {
  const f = await productsFixture(options);
  try { await run(f); } finally { f.stop(); }
}
const ids = f => f.cards().map(card => card.key);
const highlighted = card => {
  assert.match(card.props.className, /border-2 border-indigo-500/);
  assert.equal(card.props.style.borderWidth, 2);
  assert.equal(card.props.style.borderColor, '#6366f1');
  assert.match(card.props.style.boxShadow, /0 0 0 1px #818cf8/);
};
const notHighlighted = card => {
  assert.doesNotMatch(card.props.className, /border-2 border-indigo-500/);
  assert.equal(card.props.style.borderColor, '#334155');
  assert.equal(card.props.style.boxShadow, undefined);
};

test('All Products default; three labelled filter options; changing filter performs no requests', () => using({}, async f => {
  const control = f.find(n => n.props.id === 'selection-filter');
  assert.equal(control.props.value, 'all');
  assert.deepEqual(nodes(control, n => n.type === 'option').map(text), ['Selection: All', 'Selection: Checked', 'Selection: Not checked']);
  assert.ok(f.find(n => n.type === 'label' && n.props.htmlFor === 'selection-filter'));
  assert.equal(f.cards().length, 60);
  assert.doesNotMatch(text(f.h.output), /New Product Selections/);
  await f.filter('selected'); assert.equal(f.cards().length, 0);
  await f.filter('not-selected'); assert.equal(f.cards().length, 60);
  await f.filter('all'); assert.equal(f.cards().length, 60);
  assert.equal(f.calls.length, 1); assert.equal(f.keyCalls.length, 1);
}));

test('a product picked under Not checked stays in place, highlighted; deselecting under Checked removes it', () => using({}, async f => {
  await f.filter('not-selected'); await f.click(f.card('grocery-0'));
  assert.equal(f.cards().length, 60); highlighted(f.card('grocery-0'));
  assert.match(text(f.h.output), /1 selected to add/);
  await f.filter('selected'); assert.deepEqual(ids(f), ['grocery-0']); highlighted(f.card('grocery-0'));
  await f.click(f.card('grocery-0')); assert.equal(f.cards().length, 0);
  assert.match(text(f.h.output), /No selected products\./);
  await f.filter('not-selected'); await f.click(f.card('grocery-1'));
  await f.filter('selected'); await f.click(f.button('Clear New Selections'));
  assert.equal(f.cards().length, 0); assert.doesNotMatch(text(f.h.output), /New Product Selections/);
  await f.filter('not-selected'); assert.equal(f.cards().length, 60);
  assert.equal(f.calls.length, 1); assert.equal(f.keyCalls.length, 1);
}));

test('Checked means picked now; Included products are locked, labelled and never highlighted', () => using({ included: 2 }, async f => {
  const saved = JSON.stringify(f.evidence);
  notHighlighted(f.card('grocery-0')); assert.match(text(f.card('grocery-0')), /Included/);
  assert.equal(f.card('grocery-0').props['aria-disabled'], true);
  assert.equal(nodes(f.card('grocery-0'), n => n.type === 'button' && n.props.className.includes('bg-indigo-500')).length, 0);
  await f.click(f.card('grocery-0')); assert.doesNotMatch(text(f.h.output), /New Product Selections/);
  await f.click(f.card('grocery-2')); await f.filter('selected');
  assert.deepEqual(ids(f), ['grocery-2']);
  await f.filter('not-selected'); assert.equal(f.cards().length, 60); highlighted(f.card('grocery-2'));
  await f.click(f.button('Clear New Selections')); await f.filter('selected');
  assert.equal(f.cards().length, 0);
  await f.filter('all');
  for (const id of ['grocery-0', 'grocery-1']) { notHighlighted(f.card(id)); assert.equal(f.card(id).props['aria-disabled'], true); }
  assert.equal(JSON.stringify(f.evidence), saved);
}));

test('partial variant selection highlights the full card; clearing returns its neutral border', () => using({}, async f => {
  const neutral = f.card('grocery-0');
  assert.doesNotMatch(neutral.props.className, /border-2 border-indigo/);
  assert.equal(neutral.props.style.borderColor, '#334155');
  await f.click(nodes(neutral, n => n.type === 'button')[0]);
  highlighted(f.card('grocery-0'));
  assert.equal(nodes(f.card('grocery-0'), n => n.type === 'button' && n.props.className.includes('bg-indigo-500')).length, 1);
  await f.filter('selected'); assert.deepEqual(ids(f), ['grocery-0']);
  await f.click(f.button('Clear New Selections')); await f.filter('all');
  assert.equal(f.card('grocery-0').props.style.borderColor, '#334155');
  assert.equal(f.card('grocery-0').props.style.boxShadow, undefined);
}));

test('search composes with selection; selection empty and search empty are distinct from segment empty', () => using({ included: 2 }, async f => {
  await f.click(f.card('grocery-2')); await f.filter('selected'); await f.search('milk');
  assert.deepEqual(ids(f), ['grocery-2']);
  await f.filter('not-selected'); assert.equal(f.cards().length, 30);
  assert.ok(f.cards().every(card => /Milk/.test(text(card))));
  await f.filter('selected'); await f.search('Grocery-SKU-0');
  assert.match(text(f.h.output), /No selected products\./);
  assert.match(text(f.h.output), /Within your current search and business segment/);
  assert.equal(f.find(n => n.type === 'fixture-empty-catalog'), undefined);
  await f.search('nonexistent-fixture-query');
  assert.equal(f.find(n => n.type === 'fixture-empty-catalog').props.kind, 'search');
  assert.doesNotMatch(text(f.h.output), /No selected products/);
  assert.match(text(f.find(n => n.props['aria-label'] === 'Catalog availability')), /60\s+Grocery/);
}));

test('paid selection composes with verified current segment; full segment availability remains authoritative', () => using({ trial: false }, async f => {
  // 60 cards per page: open each segment to reach its first card.
  await f.segment('Hardware'); await f.click(f.card('hardware-0'));
  await f.segment('Grocery'); await f.click(f.card('grocery-0')); await f.filter('selected');
  assert.deepEqual(ids(f), ['grocery-0']); assert.match(text(f.find(n => n.props['aria-label'] === 'Catalog availability')), /60\s+Grocery/);
  await f.filter('not-selected'); await f.search('milk');
  assert.equal(f.cards().length, 30); assert.ok(ids(f).every(id => id.startsWith('grocery-')));
  assert.match(text(f.h.output), /60\s+Grocery/);
  await f.search(''); await f.segment('Hardware'); await f.filter('selected');
  assert.deepEqual(ids(f), ['hardware-0']);
  await f.click(f.button('Clear All')); assert.equal(f.cards().length, 0);
  // One catalog read per view opened (start, Hardware, Grocery, Hardware again); one read labels products already in a key.
  assert.equal(f.calls.length, 4); assert.equal(f.keyCalls.length, 1);
}));

test('full Trial: disabled but unselected products remain in Not Selected; Select All cannot bypass capacity', () => using({ included: 50 }, async f => {
  await f.keyFilter('unused'); await f.filter('not-selected'); assert.equal(f.cards().length, 10);
  assert.ok(f.cards().every(card => card.props['aria-disabled'] === true));
  assert.match(text(f.button('Select All')), /Select All \(\s*0\s*\)/);
  assert.equal(f.button('Select All').props.disabled, true);
  await f.click(f.card('grocery-50')); await f.click(f.button('Select All'));
  assert.equal(f.cards().length, 10); assert.doesNotMatch(text(f.h.output), /New Product Selections/);
  await f.filter('selected'); assert.equal(f.cards().length, 0);
}));

test('Select All uses search + selection + segment result, excludes Included and honours remaining capacity/count', () => using({ included: 48 }, async f => {
  await f.keyFilter('unused'); await f.filter('not-selected'); await f.search('milk');
  const milk = ['grocery-48', 'grocery-50', 'grocery-52', 'grocery-54', 'grocery-56', 'grocery-58'];
  assert.deepEqual(ids(f), milk);
  assert.match(text(f.button('Select All')), /Select All \(\s*2\s*\)/);
  await f.click(f.button('Select All'));
  assert.deepEqual(ids(f), milk); highlighted(f.card('grocery-48')); highlighted(f.card('grocery-50'));
  assert.match(text(f.h.output), /2 selected to add/);
  assert.match(text(f.button('Select All')), /Select All \(\s*0\s*\)/);
  await f.filter('selected'); assert.deepEqual(ids(f), ['grocery-48', 'grocery-50']);
  await f.search(''); assert.equal(f.cards().length, 2);
  await f.click(f.button('Clear New Selections')); assert.equal(f.cards().length, 0);
}));

test('paid Select All is limited to the current visible search and selection result', () => using({ trial: false }, async f => {
  await f.segment('Grocery'); await f.search('Milk'); await f.filter('not-selected');
  assert.match(text(f.button('Select All')), /Select All \(\s*30\s*\)/);
  await f.click(f.button('Select All')); assert.equal(f.cards().length, 30);
  assert.ok(f.cards().every(card => card.props.style.borderColor === '#6366f1'));
  await f.filter('selected'); assert.equal(f.cards().length, 30);
  assert.match(text(f.find(n => n.props['aria-label'] === 'Catalog availability')), /60\s+Grocery/);
}));

test('legitimate empty verified catalog still uses segment empty state under either selection filter', () => using({ count: 0 }, async f => {
  for (const filter of ['all', 'selected', 'not-selected']) {
    await f.filter(filter);
    assert.equal(f.find(n => n.type === 'fixture-empty-catalog').props.kind, 'segment');
    assert.doesNotMatch(text(f.h.output), /No (?:un)?selected products/);
  }
}));

test('full-width catalog has no selection bar at the top; selection actions sit beside Generate and Add Product', () => using({}, async f => {
  assert.equal(f.find(n => n.type === 'aside'), undefined);
  assert.equal(f.find(n => n.props['aria-label'] === 'Product selection summary'), undefined);
  const workspace = f.find(n => n.props['aria-label'] === 'Product catalog workspace');
  assert.doesNotMatch(workspace.props.className, /grid-cols|col-start|(?:^|:)h-|min-h-|max-h-|overflow|overscroll/);
  const list = f.find(n => n.props['aria-label'] === 'Product list');
  assert.doesNotMatch(list.props.className, /(?:^|:)h-|min-h-|max-h-|overflow|overscroll|scrollbar-gutter|flex-1/);
  assert.equal(list.props.tabIndex, undefined);
  const gridBefore = nodes(list, n => n.props.style?.gridTemplateColumns)[0];
  assert.equal(gridBefore.props.style.gridTemplateColumns, 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))');
  const actions = () => f.find(n => n.props['aria-label'] === 'Catalog actions');
  assert.equal(nodes(actions(), n => n.type === 'a' && n.props.href?.startsWith('/dashboard/api-playground')).length, 0);
  await f.click(f.card('grocery-0'));
  // No selection bar in the page at the top; it only docks into the top bar after scrolling.
  assert.equal(f.find(n => n.props['aria-label'] === 'Product selection summary'), undefined);
  assert.doesNotMatch(actions().props.className, /sticky|fixed/);
  assert.ok(nodes(actions(), n => n.type === 'button' && /Generate API Key/.test(text(n))).length);
  assert.ok(nodes(actions(), n => n.type === 'button' && /Add Product/.test(text(n))).length);
  assert.ok(nodes(actions(), n => n.type === 'button' && /Clear New Selections/.test(text(n))).length);
  assert.ok(nodes(actions(), n => n.type === 'a' && n.props.href?.startsWith('/dashboard/api-playground')).length);
  const listAfter = f.find(n => n.props['aria-label'] === 'Product list');
  assert.equal(listAfter.props.className, list.props.className);
  assert.deepEqual(nodes(listAfter, n => n.props.style?.gridTemplateColumns)[0].props.style, gridBefore.props.style);
  await f.click(f.button('Clear New Selections'));
  assert.equal(nodes(actions(), n => n.type === 'a' && n.props.href?.startsWith('/dashboard/api-playground')).length, 0);
}));

test('products already in a key stay listed and labelled; filter by one key name', () => using({ trial: false, included: 5 }, async f => {
  await f.segment('Grocery');
  const control = f.find(n => n.props.id === 'key-usage-filter');
  assert.equal(control.props.value, 'all');
  assert.deepEqual(nodes(control, n => n.type === 'option').map(n => text(n).replace(/\s+/g, ' ')), ['API key: All', 'API key: Fixture POS']);
  assert.equal(f.cards().length, 60);
  // Paid accounts can reuse a product already in a key for another key.
  await f.click(f.card('grocery-0')); highlighted(f.card('grocery-0'));
  await f.click(f.card('grocery-0'));
  await f.keyFilter('unused');
  assert.equal(f.cards().length, 55); assert.ok(!ids(f).includes('grocery-0'));
  await f.keyFilter('key:fixture-key');
  assert.deepEqual(ids(f), ['grocery-0', 'grocery-1', 'grocery-2', 'grocery-3', 'grocery-4']);
  assert.match(text(f.card('grocery-0')), /In key:\s+Fixture POS/);
  await f.keyFilter('all'); assert.equal(f.cards().length, 60);
  assert.doesNotMatch(text(f.card('grocery-5')), /In key:/);
}));

test('default shows every product; products in a key carry a quiet note and no highlight', () => using({ trial: false, included: 5, keyFilter: 'unused' }, async f => {
  await f.segment('Grocery');
  assert.equal(f.find(n => n.props.id === 'key-usage-filter').props.value, 'all');
  assert.equal(f.cards().length, 60);
  assert.match(text(f.card('grocery-0')), /In key:\s+Fixture POS/); notHighlighted(f.card('grocery-0'));
  await f.keyFilter('key:fixture-key'); await f.click(f.card('grocery-0'));
  await f.keyFilter('all'); highlighted(f.card('grocery-0'));
}));

test('product category filter lists the categories in view and composes with search and selection', () => using({ trial: false }, async f => {
  await f.segment('Grocery');
  const control = f.find(n => n.props.id === 'product-category-filter');
  assert.deepEqual(nodes(control, n => n.type === 'option').map(n => n.props.value), ['All', 'Dairy', 'Rice']);
  await f.category('Rice');
  assert.equal(f.cards().length, 30); assert.ok(ids(f).every(id => Number(id.split('-')[1]) % 2 === 1));
  await f.search('Rice 1'); assert.ok(ids(f).every(id => id.startsWith('grocery-1')));
  await f.search(''); await f.category('Dairy'); await f.filter('selected');
  assert.equal(f.cards().length, 0);
  assert.match(text(f.h.output), /No selected products\./);
  await f.click(f.button('View All Products'));
  assert.equal(f.find(n => n.props.id === 'product-category-filter').props.value, 'All');
  assert.equal(f.cards().length, 60);
}));
