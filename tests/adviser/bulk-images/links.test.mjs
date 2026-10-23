import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageMatcher } from '../../../admin-panel/src/lib/bulk-image-match.ts';
import { planImageLinks, sendImageBatches } from '../../../admin-panel/src/lib/bulk-image-links.ts';

const products = [
  { id: 'p1', name: 'Sardines in Tomato Sauce', brand: '555' },
  { id: 'p2', name: 'Evaporated Milk', brand: 'Alaska' },
  { id: 'p3', name: 'Evaporated Milk', brand: 'Alaska' },
  { id: 'p4', name: 'Zesto Dalandan 1.5L' },
  { id: 'p5', name: 'Coke', image_url: 'https://x.invalid/c.jpg' },
];
const match = createImageMatcher(products);
const hasPhoto = id => !!products.find(p => p.id === id)?.image_url;
const link = 'https://images.invalid/a.jpg';

test('a CSV is planned without review: clear matches queue, repeats and photos skip, the rest is set aside', () => {
  const plan = planImageLinks([
    { brand: '555', name: 'Sardines in Tomato Sauce', image_url: link },
    { name: 'Zesto Dalandan 1.5L', image_url: link },
    { brand: '555', name: 'Sardines in Tomato Sauce', image_url: 'https://images.invalid/b.jpg' },
    { name: 'Coke', image_url: link },
    { brand: 'Alaska', name: 'Evaporated Milk', image_url: link },
    { name: 'Unknown thing', image_url: link },
    { name: 'Zesto Dalandan 1.5L', image_url: 'http://insecure.invalid/a.jpg' },
    { name: 'No link', image_url: '' },
    { id: 'p3', image_url: link },
  ], match, hasPhoto, url => { if (!url.startsWith('https://')) throw Error('bad'); return url; });
  assert.deepEqual(plan.queue.map(q => [q.row, q.productId]), [[2, 'p1'], [3, 'p4'], [10, 'p3']]);
  assert.deepEqual(plan.skipped.map(s => [s.row, s.reason]), [[4, 'Same product as row 2.'], [5, 'Product already has a photo.']]);
  assert.deepEqual(plan.attention.map(a => a.row), [6, 7, 8]);
  assert.match(plan.attention[0].reason, /Matches 2 products/u);
});

test('batches are sent in order, rate limits wait and retry, and failures do not stop later batches', async () => {
  const queue = Array.from({ length: 250 }, (_, i) => ({ row: i + 2, label: 'x' + i, productId: 'p' + i, image_url: link }));
  const sizes = [], waits = [];
  let calls = 0;
  const send = async items => {
    calls++;
    if (calls === 2) throw Object.assign(new Error('Too many'), { status: 429 });
    if (calls === 4) throw Object.assign(new Error('Admin access required.'), { status: 403 });
    sizes.push(items.length);
    return { results: items.map(item => ({ productId: item.productId, status: 'SAVED', product: { id: item.productId } })) };
  };
  const result = await sendImageBatches({ queue, send, onProgress: () => {}, wait: async ms => { waits.push(ms); } });
  assert.deepEqual(sizes, [100, 100]);
  assert.deepEqual(waits, [60000]);
  assert.equal(result.sent, 250);
  assert.equal(result.saved.length, 200);
  assert.equal(result.results.filter(r => r.status === 'FAILED').length, 50);
  assert.equal(result.results.at(-1).reason, 'Admin access required.');
});

test('network errors retry with backoff, and stop ends after the current batch', async () => {
  const queue = Array.from({ length: 300 }, (_, i) => ({ row: i + 2, label: '', productId: 'p' + i, image_url: link }));
  let calls = 0, stop = false;
  const waits = [];
  const result = await sendImageBatches({ queue, wait: async ms => { waits.push(ms); },
    send: async items => { if (++calls === 1) throw new TypeError('Failed to fetch'); stop = true; return { results: items.map(i => ({ productId: i.productId, status: 'SKIPPED' })) }; },
    onProgress: () => {}, stopped: () => stop });
  assert.deepEqual(waits, [2000]);
  assert.equal(result.sent, 100);
});
