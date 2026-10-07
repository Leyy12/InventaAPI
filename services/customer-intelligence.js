import { createHash } from 'node:crypto';
import { dateMillis, planKind } from '../functions/subscription-lifecycle.mjs';
import { validDocumentId } from './api-key-security.js';

export class IntelligenceError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const reject = (status, code, message) => { throw new IntelligenceError(status, code, message); };
const own = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
const only = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(field => fields.includes(field));
const day = value => value.toISOString().slice(0, 10);
const pesos = minor => minor / 100;
const maxEvents = 5000;

export function paidSalesEligible(account, entitlement) {
  return !!entitlement && !entitlement.activeTrial && !entitlement.upgradeRequired
    && (entitlement.activePro === true || planKind(account?.plan) === 'legacy_unlimited');
}

function unitPriceMinor(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/u.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 10000000 ? minor : null;
}

export function canonicalSaleInput(raw, now = new Date()) {
  if (!only(raw, ['externalTransactionId', 'occurredAt', 'currency', 'items'])
    || typeof raw.externalTransactionId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(raw.externalTransactionId)
    || typeof raw.occurredAt !== 'string' || raw.currency !== 'PHP'
    || !Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 50) {
    reject(400, 'INVALID_SALE', 'Invalid completed-sale fields.');
  }
  const at = dateMillis(raw.occurredAt);
  if (!Number.isFinite(at) || at > now.getTime() + 300000 || at < now.getTime() - 10 * 365 * 86400000) {
    reject(400, 'INVALID_SALE', 'Sale occurrence must be an explicitly zoned, plausible instant.');
  }
  const seen = new Set();
  const items = raw.items.map(item => {
    if (!only(item, ['productId', 'quantity', 'unitPrice']) || !validDocumentId(item.productId)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) {
      reject(400, 'INVALID_SALE', 'Invalid sale item.');
    }
    const priceMinor = unitPriceMinor(item.unitPrice);
    if (priceMinor === null) reject(400, 'INVALID_SALE', 'Invalid PHP unit price.');
    if (seen.has(item.productId)) reject(400, 'INVALID_SALE', 'Duplicate sale item product.');
    seen.add(item.productId);
    return { productId: item.productId, quantity: item.quantity,
      unitPriceMinor: priceMinor, lineTotalMinor: priceMinor * item.quantity };
  }).sort((a, b) => a.productId.localeCompare(b.productId));
  const totalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  if (!Number.isSafeInteger(totalMinor)) reject(400, 'INVALID_SALE', 'Sale amount exceeds the supported range.');
  return { externalTransactionId: raw.externalTransactionId, occurredAt: new Date(at).toISOString(),
    currency: 'PHP', items, totalMinor };
}

export function validateSale(raw, authorizedProducts, now = new Date()) {
  const canonical = canonicalSaleInput(raw, now);
  const products = new Map(authorizedProducts.map(product => [product.id, product]));
  const items = canonical.items.map(item => {
    const product = products.get(item.productId);
    if (!product) reject(403, 'PRODUCT_SCOPE', 'Product is not authorized for this key and account.');
    return { ...item, productName: product.name };
  });
  return { ...canonical, items };
}

export function saleDocumentId(uid, externalTransactionId) {
  return createHash('sha256').update(JSON.stringify([uid, externalTransactionId])).digest('hex');
}

export function saleFingerprint(sale) {
  return createHash('sha256').update(JSON.stringify({ externalTransactionId: sale.externalTransactionId,
    occurredAt: sale.occurredAt, currency: sale.currency, totalMinor: sale.totalMinor,
    items: sale.items.map(({ productId, quantity, unitPriceMinor, lineTotalMinor }) => ({
      productId, quantity, unitPriceMinor, lineTotalMinor })) })).digest('hex');
}

export async function existingSale(db, uid, keyId, canonical) {
  const ref = db.collection('customer_sales').doc(saleDocumentId(uid, canonical.externalTransactionId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const saved = snapshot.data();
  if (saved.userId !== uid || saved.fingerprint !== saleFingerprint(canonical)) {
    reject(409, 'SALE_CONFLICT', 'Transaction reference already belongs to different sale content.');
  }
  if (keyId && saved.apiKeyId !== keyId) reject(403, 'KEY_SCOPE', 'This key cannot replay another integration’s sale.');
  return { created: false, id: ref.id, totalMinor: saved.totalMinor };
}

export async function recordSale(db, uid, sale, now = new Date(), keyId = null) {
  const ref = db.collection('customer_sales').doc(saleDocumentId(uid, sale.externalTransactionId));
  const fingerprint = saleFingerprint(sale);
  return db.runTransaction(async tx => {
    const prior = await tx.get(ref);
    if (prior.exists) {
      const stored = prior.data();
      if (stored.userId !== uid || stored.fingerprint !== fingerprint) {
        reject(409, 'SALE_CONFLICT', 'Transaction reference already belongs to different sale content.');
      }
      if (keyId && stored.apiKeyId !== keyId) reject(403, 'KEY_SCOPE', 'This key cannot replay another integration’s sale.');
      return { created: false, id: ref.id, totalMinor: sale.totalMinor };
    }
    tx.set(ref, { ...sale, userId: uid, ...(keyId ? { apiKeyId: keyId } : {}), fingerprint, createdAt: now.toISOString() });
    return { created: true, id: ref.id, totalMinor: sale.totalMinor };
  });
}

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && day(date) === value ? date : null;
}

export function salesRange(query = {}, now = new Date()) {
  if (!only(query, ['from', 'to']) || !Number.isFinite(now.getTime())) reject(400, 'INVALID_RANGE', 'Invalid sales date range.');
  const today = parseDay(day(now));
  const to = query.to === undefined ? today : parseDay(query.to);
  const from = query.from === undefined ? new Date(today.getTime() - 29 * 86400000) : parseDay(query.from);
  if (!from || !to || to > today || from > to || (to.getTime() - from.getTime()) / 86400000 >= 90) {
    reject(400, 'INVALID_RANGE', 'Select at most 90 UTC calendar days ending no later than today.');
  }
  const end = new Date(to.getTime() + 86400000);
  return { from: day(from), to: day(to), fromInclusive: from.toISOString(), toExclusive: end.toISOString() };
}

export async function readSales(db, uid, range) {
  const result = await db.collection('customer_sales').where('userId', '==', uid)
    .where('occurredAt', '>=', range.fromInclusive).where('occurredAt', '<', range.toExclusive)
    .orderBy('occurredAt', 'asc').limit(maxEvents + 1).get();
  if (result.docs.length > maxEvents) reject(503, 'SALES_REPORT_TOO_LARGE', 'Sales range exceeds the reporting safety limit. Select a shorter range.');
  const rows = result.docs.map(doc => doc.data());
  if (rows.some(row => row.userId !== uid || row.currency !== 'PHP' || !Number.isSafeInteger(row.totalMinor)
    || row.totalMinor < 0 || typeof row.occurredAt !== 'string' || !Number.isFinite(dateMillis(row.occurredAt))
    || !Array.isArray(row.items) || row.items.length < 1 || row.items.length > 50
    || row.items.some(item => !validDocumentId(item.productId) || typeof item.productName !== 'string'
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000
      || !Number.isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor < 1 || item.unitPriceMinor > 10000000
      || !Number.isSafeInteger(item.lineTotalMinor)
      || item.lineTotalMinor !== item.quantity * item.unitPriceMinor)
    || row.items.reduce((sum, item) => sum + item.lineTotalMinor, 0) !== row.totalMinor)) {
    reject(503, 'SALES_DATA_UNAVAILABLE', 'Sales data could not be verified.');
  }
  return rows;
}

export function aggregateSales(rows, range) {
  const dates = new Map(), products = new Map();
  let totalMinor = 0, unitsSold = 0;
  for (const row of rows) {
    totalMinor += row.totalMinor;
    const bucket = row.occurredAt.slice(0, 10);
    const daily = dates.get(bucket) || { date: bucket, salesMinor: 0, transactions: 0, units: 0 };
    daily.salesMinor += row.totalMinor; daily.transactions++;
    for (const item of row.items) {
      daily.units += item.quantity; unitsSold += item.quantity;
      const prior = products.get(item.productId) || { productId: item.productId, name: item.productName,
        unitsSold: 0, salesMinor: 0 };
      prior.unitsSold += item.quantity; prior.salesMinor += item.lineTotalMinor;
      products.set(item.productId, prior);
    }
    dates.set(bucket, daily);
  }
  if (!Number.isSafeInteger(totalMinor) || !Number.isSafeInteger(unitsSold)) {
    reject(503, 'SALES_DATA_UNAVAILABLE', 'Sales aggregation exceeds the safe numeric range.');
  }
  return { hasData: rows.length > 0, currency: 'PHP', range: { from: range.from, to: range.to },
    summary: { totalSales: pesos(totalMinor), totalTransactions: rows.length, unitsSold,
      averageTransactionValue: rows.length ? pesos(Math.round(totalMinor / rows.length)) : 0 },
    timeSeries: [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)).map(row => ({
      date: row.date, sales: pesos(row.salesMinor), transactions: row.transactions, units: row.units })),
    topProducts: [...products.values()].sort((a, b) => b.salesMinor - a.salesMinor || a.productId.localeCompare(b.productId))
      .slice(0, 10).map(row => ({ productId: row.productId, name: row.name,
        unitsSold: row.unitsSold, sales: pesos(row.salesMinor) })) };
}

export function intelligenceFailure(res, error) {
  const status = error instanceof IntelligenceError ? error.status : 503;
  return res.status(status).json({ error: status === 503 ? 'Intelligence service unavailable.' : error.message,
    code: error instanceof IntelligenceError ? error.code : 'INTELLIGENCE_UNAVAILABLE' });
}
