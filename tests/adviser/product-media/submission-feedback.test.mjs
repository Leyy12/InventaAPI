import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, load, nodes, flush } from '../workspace-refresh/harness.mjs';
import { normalizeProductImageUrl } from '../../../dashboard/src/lib/product-image-url.ts';
import { reviewSubmission } from '../../../admin-panel/src/lib/submission-review.ts';

const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null ? '' : String(tree);
const button = (h, label) => nodes(h.output, n => n.type === 'button' && text(n) === label)[0];
const feedback = h => nodes(h.output, n => n.type === 'feedback')[0];

function customerFixture(transport) {
  const h = hooks(), calls = [], uploads = [];
  let closed = 0, added = 0, keys = 0;
  const user = { uid: 'synthetic-customer', getIdToken: async () => 'synthetic-only' };
  const Modal = load('dashboard/src/components/products/AddProductModal.tsx', 'AddProductModal', h, {
    'lucide-react': new Proxy({}, { get: () => 'svg' }),
    '@/lib/product-image-url': { normalizeProductImageUrl },
    '@/lib/supabase/auth-context': { useAuth: () => ({ user, appUser: { plan: 'Free', businessSegment: 'Grocery' } }) },
    '../../../../services/customer-segment.js': { restrictedSegmentAccount: () => true, activeCustomerSegment: () => 'Grocery' },
    './ProductImageField': 'image-field', './SubmissionFeedbackDialog': 'feedback',
    '@/lib/product-media-client': { uploadProductImage: async (_, workflow, operation) => {
      uploads.push(operation); operation.assetId = 'a'.repeat(64); return operation.assetId;
    } },
  }, { crypto: { randomUUID: () => 'operation-' + ++keys }, fetch: async (_, init) => { calls.push(init); return transport(calls.length); } });
  const props = { open: true, onClose() { closed++; }, onAdded() { added++; } };
  h.mount(Modal, props);
  return { h, props, calls, uploads, get closed() { return closed; }, get added() { return added; } };
}
async function fill(f) {
  await flush();
  const input = placeholder => nodes(f.h.output, n => n.type === 'input' && n.props.placeholder === placeholder)[0];
  input('e.g. Piattos Cheese').props.onChange({ target: { value: 'Bottle' } });
  input('e.g. Snacks').props.onChange({ target: { value: 'Beverages' } });
  nodes(f.h.output, n => n.type === 'image-field')[0].props.onFileChange({ name: 'bottle.png', type: 'image/png', size: 100 });
  await flush();
}

test('confirmed Customer success closes form, retains receipt while closed, and dismiss never submits', async () => {
  let release;
  const f = customerFixture(() => new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ id: 'receipt-1', status: 'submitted' }) }); }));
  await fill(f);
  const submit = button(f.h, 'Submit for Review');
  submit.props.onClick(); submit.props.onClick(); await flush();
  assert.equal(f.calls.length, 1); assert.equal(button(f.h, 'Submitting…').props.disabled, true);
  assert.equal(f.closed, 0); assert.equal(feedback(f.h), undefined);
  release(); await flush();
  assert.equal(f.closed, 1); assert.equal(f.added, 1);
  assert.equal(nodes(f.h.output, n => n.type === 'dialog').length, 0);
  assert.equal(feedback(f.h).props.feedback.kind, 'success'); assert.equal(feedback(f.h).props.feedback.reference, 'receipt-1');
  submit.props.onClick(); await flush(); assert.equal(f.calls.length, 1, 'stale handler cannot submit again');
  f.h.render({ ...f.props, open: false });
  feedback(f.h).props.onDismiss(); await flush(); assert.equal(f.calls.length, 1);
  assert.equal(feedback(f.h), undefined); f.h.stop();
});

for (const first of ['validation', 'unavailable', 'lost-response', 'missing-reference']) test(`Customer ${first} popup preserves form/image/key and retries exact request`, async () => {
  const f = customerFixture(async count => {
    if (count > 1) return { ok: true, json: async () => ({ id: 'same-receipt' }) };
    if (first === 'lost-response') throw Error('Network disconnected');
    if (first === 'missing-reference') return { ok: true, json: async () => ({}) };
    return { ok: false, status: first === 'validation' ? 400 : 503, json: async () => ({ error: 'Synthetic response' }) };
  });
  await fill(f); button(f.h, 'Submit for Review').props.onClick(); await flush();
  assert.equal(f.closed, 0); assert.equal(f.added, 0);
  assert.equal(feedback(f.h).props.feedback.kind, first === 'validation' ? 'error' : 'uncertain');
  assert.equal(nodes(f.h.output, n => n.type === 'input' && n.props.placeholder === 'e.g. Piattos Cheese')[0].props.value, 'Bottle');
  feedback(f.h).props.onDismiss(); await flush(); assert.equal(f.calls.length, 1);
  f.h.render({ ...f.props, open: false }); f.h.render(f.props); await flush();
  const retry = button(f.h, 'Retry Same Submission'); retry.props.onClick(); retry.props.onClick(); await flush();
  assert.equal(f.calls.length, 2); assert.equal(f.uploads.length, 1);
  assert.equal(f.calls[0].body, f.calls[1].body);
  assert.equal(f.calls[0].headers['Idempotency-Key'], f.calls[1].headers['Idempotency-Key']);
  assert.equal(JSON.parse(f.calls[1].body).image_asset_id, 'a'.repeat(64)); assert.equal(f.closed, 1); f.h.stop();
});

function adminFixture(mutate) {
  const h = hooks(), calls = [];
  const user = { getIdToken: async () => 'synthetic-admin' };
  let row = { id: 'submission-1', userId: 'customer', status: 'submitted', productId: null, createdAt: '2026-10-10T00:00:00Z',
    content: { name: 'Bottle', brand: 'Brand', segment: 'Grocery', category: 'Beverages', description: 'Description', sku: 'SKU', image_url: '', variants: [{ size: '250ml', price: 10 }] } };
  const Page = load('admin-panel/src/app/submissions/page.tsx', 'SubmissionsPage', h, {
    'lucide-react': new Proxy({}, { get: () => 'svg' }),
    '@/lib/supabase/admin-auth-context': { useAdminAuth: () => ({ user }) },
    '@/lib/submission-review': { reviewSubmission },
    '@/components/products/SubmissionReviewDialog': { __esModule: true, default: 'review-dialog', SubmissionImage: 'image', ReviewStatus: 'status', submittedDate: x => x, reviewButtonClass: 'button' },
  }, { fetch: async (url, init) => {
    calls.push({ url, method: init.method });
    if (init.method === 'POST') { const receipt = await mutate(); row = { ...row, ...receipt }; return { ok: true, json: async () => receipt }; }
    return { ok: true, json: async () => ({ submissions: [row], next: null }) };
  } });
  h.mount(Page); return { h, calls };
}

test('Admin modal guards rapid/opposite decisions and retains final decision across refresh', async () => {
  let resolve;
  const f = adminFixture(() => new Promise(done => { resolve = done; }));
  await new Promise(done => setTimeout(done, 10)); await flush();
  button(f.h, 'Review').props.onClick(); await flush();
  const modal = nodes(f.h.output, n => n.type === 'review-dialog')[0];
  modal.props.onReview('submission-1', 'approve'); modal.props.onReview('submission-1', 'reject'); await flush();
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(nodes(f.h.output, n => n.type === 'review-dialog')[0].props.busy, true);
  resolve({ id: 'submission-1', status: 'approved', productId: 'product' }); await flush();
  modal.props.onReview('submission-1', 'approve'); await flush();
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1); f.h.stop();
});

test('Admin uncertain decision locks actions until authoritative refresh, without another mutation', async () => {
  const f = adminFixture(async () => { throw Error('Response unavailable'); });
  await new Promise(done => setTimeout(done, 10)); await flush(); button(f.h, 'Review').props.onClick(); await flush();
  nodes(f.h.output, n => n.type === 'review-dialog')[0].props.onReview('submission-1', 'reject'); await flush();
  const modal = nodes(f.h.output, n => n.type === 'review-dialog')[0];
  assert.equal(modal.props.locked, true); assert.match(modal.props.error, /unavailable/);
  modal.props.onReview('submission-1', 'approve'); await flush(); assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  modal.props.onRefresh(); await flush(); assert.equal(nodes(f.h.output, n => n.type === 'review-dialog')[0].props.locked, false);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1); f.h.stop();
});
