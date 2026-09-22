import { createHash } from 'node:crypto';
import { auditCatalog } from '../services/catalog-audit.js';

export const REPAIR_IDS = Object.freeze(['KWusUA5m2FEP6Y5fQQx6', 'W3dRbwFB91ehYNr0XPVr',
  'MZwdfSGk0ZPl6sihK1Ya', 'S0SuWh7m289ND8oUBZge', 'jpjrb14dyZY4jQARduq9', 'oDKhLkR5wfA5DfzVf1oP']);
export const REVIEWED_EXPORT_SHA256 = '0627226fd3a9c4726b0081c01150de112632fd4483a9e007ceec6fdc3fd3788c';
const deny = () => { throw Error('R8C REPAIR STATE MISMATCH — KEEP FROZEN'); };

// Compare every stored field, including nanosecond timestamps. REST-export tags
// and Admin SDK Timestamp objects have the same lossless comparison form.
export function comparable(value) {
  if (value && typeof value.toDate === 'function' && Number.isInteger(value.seconds)
    && Number.isInteger(value.nanoseconds)) {
    return { $firestoreType: 'timestamp', value: new Date(value.seconds * 1000).toISOString()
      .replace(/\.000Z$/, `.${String(value.nanoseconds).padStart(9, '0')}Z`) };
  }
  if (value?.$firestoreType === 'timestamp' && typeof value.value === 'string' && Object.keys(value).length === 2) {
    return { $firestoreType: 'timestamp', value: value.value.replace(/(?:\.(\d{1,9}))?Z$/, (_, fraction = '') => `.${fraction.padEnd(9, '0')}Z`) };
  }
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, comparable(value[key])]));
  return value;
}
function typedValue(value, exported) {
  const sdkTimestamp = value && typeof value.toDate === 'function' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds);
  const exportTimestamp = exported && value?.$firestoreType === 'timestamp' && typeof value.value === 'string' && Object.keys(value).length === 2;
  if (sdkTimestamp || exportTimestamp) return ['timestamp', comparable(value).value];
  if (Array.isArray(value)) return ['array', value.map(item => typedValue(item, exported))];
  if (value && typeof value === 'object') return ['map', Object.keys(value).sort().map(key => [key, typedValue(value[key], exported)])];
  return [typeof value, value];
}
export const fingerprint = (value, exported = true) => createHash('sha256').update(JSON.stringify(typedValue(value, exported))).digest('hex');
const same = (a, b) => fingerprint(a) === fingerprint(b);
const sameStored = (stored, exported) => fingerprint(stored, false) === fingerprint(exported);

// Fixed decisions only. No caller-supplied patch, document ID, or field value.
export function planSixRepairs(records) {
  if (!Array.isArray(records) || records.length !== 6 || new Set(records.map(row => row.id)).size !== 6
    || records.some(row => !REPAIR_IDS.includes(row.id))) deny();
  const names = ['x-o', 'stick-o', 'Mefenamic Acid', 'Paracetamol', 'Metformin HCl', 'Carbocisteine'];
  const brands = ['DOLFENAL', 'Biogesic', 'GLUCOPHAGE', 'SOLMUX'];
  const prices = [[6.5, 6.5], [4, 4], [16.5, 18.5], [11, 12.5]];
  const plan = REPAIR_IDS.map((id, index) => {
    const before = records.find(row => row.id === id)?.data;
    if (!before || before.name !== names[index]) deny();
    let patch;
    if (index < 2) {
      if (Object.hasOwn(before, 'segment') || before.category !== 'Grocery'
        || before.sku !== ['AUTO-1787328885272', 'AUTO-1787373264031'][index]) deny();
      patch = { segment: 'Grocery' };
    } else {
      const expected = prices[index - 2].map(price => ({ flavor: '500mg', size: index === 5 ? 'Capsule' : 'Tablet', price }));
      if (before.brand !== brands[index - 2] || before.segment !== 'Pharmacy' || !same(before.variants, expected)) deny();
      patch = { variants: [structuredClone(before.variants[0])] };
    }
    return { id, before, patch, after: { ...before, ...patch } };
  });
  if (!auditCatalog(plan.map(row => ({ id: row.id, data: row.after }))).ok) deny();
  return plan;
}

async function inspect(tx, db, plan) {
  if ((await tx.get(db.collection('catalog_control').doc('writer'))).data()?.frozen !== true) {
    throw Error('R8C BOOLEAN FREEZE REQUIRED');
  }
  const states = [], snapshots = [];
  for (const row of plan) {
    const snapshot = await tx.get(db.collection('products').doc(row.id));
    const data = snapshot.data();
    if (!snapshot.exists || (!sameStored(data, row.before) && !sameStored(data, row.after))) deny();
    states.push(sameStored(data, row.before) ? 'before' : 'after');
    snapshots.push({ id: row.id, data: comparable(data), updateTime: snapshot.updateTime?.toDate().toISOString() ?? null });
  }
  if (new Set(states).size !== 1) deny(); // Partial repairs are never guessed through.
  return { state: states[0], snapshots };
}

export async function repairFrozenProducts(db, reviewedRecords, evidence) {
  if (typeof evidence?.before !== 'function' || typeof evidence?.after !== 'function') throw Error('R8C EVIDENCE REQUIRED');
  const plan = planSixRepairs(reviewedRecords);
  const before = await db.runTransaction(tx => inspect(tx, db, plan));
  await evidence.before({ ...before, changes: plan.map(row => ({ id: row.id, fields: Object.keys(row.patch),
    beforeSha256: fingerprint(row.before), afterSha256: fingerprint(row.after), afterFields: row.patch })) });
  const changed = await db.runTransaction(async tx => {
    const current = await inspect(tx, db, plan);
    if (current.state !== before.state) deny();
    if (current.state === 'after') return 0;
    for (const row of plan) tx.update(db.collection('products').doc(row.id), row.patch);
    return plan.length;
  });
  const after = await db.runTransaction(tx => inspect(tx, db, plan));
  if (after.state !== 'after') deny();
  await evidence.after({ changed, frozen: true, snapshots: after.snapshots });
  return { changed, verified: 6, frozen: true };
}
