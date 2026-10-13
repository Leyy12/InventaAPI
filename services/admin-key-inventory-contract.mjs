import { dateMillis } from '../functions/subscription-lifecycle.mjs';

export const INVENTORY_PAGE_SIZE = 200;
export const INVENTORY_MAX_RECORDS = 10000;
export const INVENTORY_MAX_BYTES = 4 * 1024 * 1024;
const fields = ['id', 'userId', 'name', 'userEmail', 'status', 'createdAt', 'lastUsed', 'keyLabel', 'linkedProductIds'];
const statuses = ['active', 'revoked', 'inactive', 'disabled', 'expired', 'unknown'];
const id = value => typeof value === 'string' && value.length > 0 && value.trim() === value
  && !['.', '..'].includes(value) && !/[\/\u0000-\u001f\u007f]/u.test(value)
  && !/^__.*__$/u.test(value) && new TextEncoder().encode(value).length <= 1500;
const text = value => typeof value === 'string' ? value : '';

export function inventoryTimestamp(value) {
  try {
    if (value && typeof value === 'object' && !(value instanceof Date) && typeof value.toDate !== 'function') {
      const seconds = value.seconds ?? value._seconds;
      const nanos = value.nanoseconds ?? value._nanoseconds;
      if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanos) || nanos < 0 || nanos > 999999999
        || seconds < -62135596800 || seconds > 253402300799) return null;
      value = new Date(seconds * 1000 + Math.floor(nanos / 1000000));
    }
    const ms = dateMillis(value);
    if (!Number.isFinite(ms)) return null;
    const iso = new Date(ms).toISOString();
    return /^\d{4}-/u.test(iso) ? iso : null;
  } catch { return null; }
}

export function inventoryProductIds(data) {
  const full = Array.isArray(data.linkedProductIds) ? data.linkedProductIds : [];
  const legacy = Array.isArray(data.linkedProducts) ? data.linkedProducts.map(value => value?.id) : [];
  const partial = data.linkedVariantSelections && typeof data.linkedVariantSelections === 'object'
    && !Array.isArray(data.linkedVariantSelections) ? Object.keys(data.linkedVariantSelections) : [];
  return [...new Set([...full, ...legacy, ...partial].filter(value => typeof value === 'string')
    .map(value => value.trim()).filter(id))];
}

export function inventoryRecord(documentId, data = {}) {
  if (!id(documentId)) throw new Error('Invalid inventory document ID');
  const v2 = data.credentialVersion === 2;
  const prefix = v2 && typeof data.keyPrefix === 'string' && /^daas_v2_[a-f0-9]{8}$/u.test(data.keyPrefix) ? data.keyPrefix : null;
  // This explicit projection never spreads stored documents or embedded objects.
  return { id: documentId, userId: id(data.userId) ? data.userId : '', name: text(data.name), userEmail: text(data.userEmail),
    status: statuses.includes(data.status) ? data.status : 'unknown', createdAt: inventoryTimestamp(data.createdAt),
    lastUsed: data.lastUsed === null ? null : inventoryTimestamp(data.lastUsed) ?? 'unavailable',
    keyLabel: prefix ? `${prefix} · Hidden` : v2 ? 'V2 key · Hidden' : 'Legacy key · Hidden',
    linkedProductIds: inventoryProductIds(data) };
}

export function inventoryCounts(records) {
  const active = records.filter(row => row.status === 'active').length;
  const revoked = records.filter(row => row.status === 'revoked').length;
  return { total: records.length, active, revoked, other: records.length - active - revoked };
}

const only = (object, allowed) => object && typeof object === 'object' && !Array.isArray(object)
  && Object.keys(object).length === allowed.length && Object.keys(object).every(key => allowed.includes(key));
const iso = value => typeof value === 'string' && inventoryTimestamp(value) === value;
export function validateInventoryResponse(value) {
  if (!only(value, ['success', 'complete', 'records', 'counts']) || value.success !== true || value.complete !== true
    || !Array.isArray(value.records) || value.records.length > INVENTORY_MAX_RECORDS) throw new Error('Inventory unavailable');
  const seen = new Set();
  for (const row of value.records) {
    if (!only(row, fields) || !id(row.id) || seen.has(row.id) || !(row.userId === '' || id(row.userId))
      || typeof row.name !== 'string' || typeof row.userEmail !== 'string' || !statuses.includes(row.status)
      || !(row.createdAt === null || iso(row.createdAt)) || !(row.lastUsed === null || row.lastUsed === 'unavailable' || iso(row.lastUsed))
      || typeof row.keyLabel !== 'string' || !(row.keyLabel === 'Legacy key · Hidden' || row.keyLabel === 'V2 key · Hidden' || /^daas_v2_[a-f0-9]{8} · Hidden$/u.test(row.keyLabel))
      || !Array.isArray(row.linkedProductIds) || !row.linkedProductIds.every(id) || new Set(row.linkedProductIds).size !== row.linkedProductIds.length) {
      throw new Error('Inventory unavailable');
    }
    seen.add(row.id);
  }
  const counts = inventoryCounts(value.records);
  if (!only(value.counts, Object.keys(counts)) || Object.entries(counts).some(([key, count]) => value.counts[key] !== count)) throw new Error('Inventory unavailable');
  return value;
}
