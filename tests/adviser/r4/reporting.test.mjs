import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_SEGMENTS, reportSelection, customerReportScope, catalogReport, categoryUsageReport, reportView, quotaSummary, telemetryReport } from '../../../services/reporting.js';
const product = (price, segment = 'Grocery', extra = {}) => ({ name: 'Product', category: 'Category', segment, status: 'Active', variants: [{ price }], ...extra });
const now = new Date('2026-09-20T12:00:00Z');
const usage = { scope: 'account', used: 10, limit: 50, window: '2026-09-20', resetsAt: '2026-09-21T00:00:00.000Z' };
for (const segment of REPORT_SEGMENTS) test('canonical segment and Free scope: ' + segment, () => {
  assert.equal(reportSelection(segment.toLowerCase()), segment);
  assert.deepEqual(customerReportScope('Free', segment), { state: 'ready', segment, restricted: true });
});
for (const value of [undefined, null, '', 'Other', 'invalid']) test('missing/invalid preference is neutral, never loading or Pharmacy: ' + value, () => {
  assert.equal(reportSelection(value), null);
  assert.deepEqual(customerReportScope('Free', value), { state: 'preference_required', segment: null, restricted: true });
});
for (const plan of ['Pro', 'Enterprise', 'Unlimited']) test('paid overall scope ' + plan, () => {
  assert.deepEqual(customerReportScope(plan, 'invalid'), { state: 'ready', segment: 'All', restricted: false });
});
test('unverified plan never grants all segments', () => assert.equal(customerReportScope(undefined, 'Grocery').segment, null));
for (const segment of REPORT_SEGMENTS) test('one selection updates count, segment and category together: ' + segment, () => {
  const fixtures = REPORT_SEGMENTS.map((name, index) => product((index + 1) * 60, name, { category: name + ' category' }));
  const report = catalogReport(fixtures, segment);
  assert.equal(report.total, 1);
  assert.deepEqual(report.segments.filter(row => row.count), [{ name: segment, count: 1 }]);
  assert.deepEqual(report.categories, [{ name: segment + ' category', count: 1 }]);
});
test('catalog report carries no price metrics', () => {
  const report = catalogReport([product(10)]);
  for (const field of ['priced', 'missingPrice', 'averagePrice', 'distribution']) assert.ok(!(field in report));
});
test('overall view counts all supported segments, excludes unknown instead of Pharmacy fallback', () => {
  const report = catalogReport([...REPORT_SEGMENTS.map(segment => product(1, segment)), product(9, 'Other')]);
  assert.equal(report.total, 3); assert.equal(report.segments.find(row => row.name === 'Pharmacy').count, 1);
  assert.throws(() => catalogReport([], 'Other'));
});
const catalog = [
  product(1, 'Grocery', { id: 'rice', category: 'Rice' }), product(1, 'Grocery', { id: 'oil', category: 'Cooking Oil' }),
  product(1, 'Grocery', { id: 'rice2', category: 'Rice' }), product(1, 'Pharmacy', { id: 'med', category: 'Vitamins' }),
  product(1, 'Grocery', { id: 'old', category: 'Snacks', status: 'Archived' }),
];
test('category usage counts distinct customers and their picked products, most used first', () => {
  const holders = [{ userId: 'a', productIds: ['rice', 'rice2', 'oil'] }, { userId: 'a', productIds: ['rice'] },
    { userId: 'b', productIds: ['rice', 'med', 'missing', 'old'] }, { userId: 'c', productIds: ['med'] }];
  assert.deepEqual(categoryUsageReport(catalog, holders), [
    { name: 'Rice', users: 2, products: 3 }, { name: 'Vitamins', users: 2, products: 2 }, { name: 'Cooking Oil', users: 1, products: 1 }]);
  assert.deepEqual(categoryUsageReport(catalog, holders, 'Pharmacy'), [{ name: 'Vitamins', users: 2, products: 2 }]);
  assert.deepEqual(categoryUsageReport(catalog, holders, 'Hardware'), []);
  assert.throws(() => categoryUsageReport(catalog, holders, 'Other'));
});
for (const change of [{ status: 'Archived' }, { status: 'Inactive' }, { published: false }, { status: 'draft' }, { is_active: false }, { archived: true, status: 'Active' }]) {
  test('canonical visibility excludes ' + JSON.stringify(change), () => assert.equal(catalogReport([product(10, 'Grocery', change)]).total, 0));
}
test('loading/error/empty states never confuse failure with measured zero', () => {
  for (const status of ['loading', 'error']) assert.deepEqual(reportView({ status, records: [product(10)] }, 'All'), { state: status, report: null });
  const empty = reportView({ status: 'ready', records: [] }, 'All');
  assert.equal(empty.state, 'empty'); assert.equal(empty.report.total, 0);
});
for (const [plan, limit] of [['Free', 50], ['Pro', 5000]]) test('authoritative ' + plan + ' limit/used/remaining', () => {
  assert.deepEqual(quotaSummary({ ...usage, limit }, now), { used: 10, limit, remaining: limit - 10, percent: 1000 / limit, pending: false, resetsAt: usage.resetsAt });
});
test('unlimited and zero quotas avoid division by zero', () => {
  for (const limit of [null, 0]) { const summary = quotaSummary({ ...usage, limit }, now); assert.equal(summary.percent, null); assert.equal(summary.remaining, limit); }
});
for (const invalid of [{ scope: 'key' }, { used: -1 }, { used: NaN }, { limit: Infinity }, { limit: undefined }, { window: '2026-09-19' }, { resetsAt: 'bad' }]) {
  test('unverified/stale quota is unavailable ' + JSON.stringify(invalid), () => assert.equal(quotaSummary({ ...usage, ...invalid }, now), null));
}
test('pending clean window does not claim a fresh measured allowance', () => {
  const summary = quotaSummary({ ...usage, used: 0, holdUntil: usage.resetsAt }, now);
  assert.equal(summary.used, null); assert.equal(summary.remaining, 0); assert.equal(summary.pending, true);
});
test('over-limit quota clamps remaining and utilization without changing backend limit', () => {
  const summary = quotaSummary({ ...usage, used: 100 }, now);
  assert.equal(summary.remaining, 0); assert.equal(summary.percent, 100); assert.equal(summary.limit, 50);
});
test('telemetry uses real chronological UTC hours across days, no synthetic previous series', () => {
  const report = telemetryReport([{ timestamp: '2026-09-20T01:15:00Z', success: true, latencyMs: 10 },
    { timestamp: { toDate: () => new Date('2026-09-19T01:30:00Z') }, success: false, latencyMs: 30 }]);
  assert.deepEqual(report.series, [{ hour: '2026-09-19T01:00Z', count: 1 }, { hour: '2026-09-20T01:00Z', count: 1 }]);
  assert.equal(report.successPercent, 50); assert.equal(report.averageLatency, 20);
});
test('telemetry unknown outcomes, invalid timestamps and latency are not measured zero', () => {
  const report = telemetryReport([{ timestamp: 'bad', success: true }, { timestamp: now, latencyMs: Infinity }]);
  assert.equal(report.recorded, 1); assert.equal(report.excluded, 1);
  assert.equal(report.successPercent, null); assert.equal(report.averageLatency, null);
  const empty = telemetryReport([]); assert.equal(empty.successPercent, null); assert.deepEqual(empty.series, []);
});
test('extreme numeric values never produce non-finite report output', () => {
  const results = [telemetryReport([{ timestamp: now, latencyMs: Number.MAX_VALUE }])];
  const visit = value => { if (typeof value === 'number') assert.ok(Number.isFinite(value)); else if (value && typeof value === 'object') Object.values(value).forEach(visit); };
  results.forEach(visit);
});
