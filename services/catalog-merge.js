// Merging products that are only different sizes of one product.
//
// Imports often hold one product per size ("555 tuna afritada 110g", "555 Tuna
// Afritada 155G"). A group is merged into one product ("555 Tuna Afritada") whose
// variants are all the sizes. Rules for a group:
//   - same segment, and the same name once sizes ("155g", "1.5 L") are removed. Tags
//     such as "(p)" and "(h)" are kept: they may mean different kinds;
//   - compatible brands: equal, or the brand's first word appears in the name
//     ("555", "Century"), or "Generic"/empty. Different real brands ("Biogesic" and
//     "Tylenol" Paracetamol) are never merged. A "Generic" product joins a group only
//     when the name has exactly one real brand.
//
// One transaction per group: the kept product gets every size, the others are
// deleted, and their identity reservations are transferred to the kept product (an
// explicit, audited transfer; a normal edit/delete keeps them reserved forever).
// Customers' API keys that used a removed product are pointed at the kept one, with
// the same sizes selected.
import { productIdentityKeys, withoutPrices } from './product-contract.js';
import { catalogError, identityId, reservationIntegrityError, reservationIntegrityProblems, validateCatalogProduct } from './catalog-contract.js';
import { auditCatalog } from './catalog-audit.js';
import { readCatalog, requireCatalogAdmin } from './catalog-writer.js';

const SIZE = /\b\d+(?:[.,]\d+)?\s*(?:ml|l|ltr|g|gm|gms|grams?|kg|kgs|mg|oz|pcs?|s)\b/giu;
const words = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
export const nameKey = name => words(String(name ?? '').toLowerCase().replace(SIZE, ' '));
const brandKey = brand => String(brand ?? '').toLowerCase().replace(/[^a-z0-9]+/gu, '');
const isGeneric = brand => ['', 'generic'].includes(brandKey(brand));
// Name shown for the merged product: the kept name without its size.
export const mergedName = name => String(name ?? '').replace(SIZE, ' ').replace(/\s+/gu, ' ').trim();
// "155 g", "155g" and "155 grams" are one size.
const sizeKey = size => String(size ?? '').toLowerCase().replace(/grams?\b/gu, 'g').replace(/\s+/gu, '');
const variantKey = variant => `${String(variant?.flavor ?? '').trim().toLowerCase()}|${sizeKey(variant?.size)}`;
const selectionKey = variant => `${variant?.flavor || ''}|${variant?.size || ''}`;
const active = data => data?.status !== 'Archived';

// Groups of product ids to merge, from the catalog records [{ id, data }].
export function planSizeMerges(records) {
  const byName = new Map();
  for (const record of records) {
    const data = record.data || {};
    if (!active(data) || !Array.isArray(data.variants) || !data.variants.length) continue;
    const key = nameKey(data.name);
    if (!key) continue;
    const first = words(data.brand).split(' ')[0];
    const part = isGeneric(data.brand) ? '*' : ` ${key} `.includes(` ${first} `) ? 'in-name' : brandKey(data.brand);
    const groupKey = `${data.segment}\u0000${key}`;
    if (!byName.has(groupKey)) byName.set(groupKey, []);
    byName.get(groupKey).push({ id: record.id, data, part });
  }
  const groups = [];
  for (const members of byName.values()) {
    const named = [...new Set(members.filter(member => member.part !== '*').map(member => member.part))];
    const parts = new Map();
    for (const member of members) {
      // Generic joins only an unambiguous single real brand (or other generics).
      const part = member.part === '*' ? (named.length <= 1 ? named[0] ?? '*' : null) : member.part;
      if (part === null) continue;
      if (!parts.has(part)) parts.set(part, []);
      parts.get(part).push(member);
    }
    for (const list of parts.values()) {
      if (list.length < 2) continue;
      // Keep the product with the most sizes, then a real brand, then a photo, then the oldest id.
      const ranked = [...list].sort((a, b) => b.data.variants.length - a.data.variants.length
        || Number(isGeneric(a.data.brand)) - Number(isGeneric(b.data.brand))
        || Number(!a.data.image_url && !a.data.image_asset_id) - Number(!b.data.image_url && !b.data.image_asset_id)
        || a.id.localeCompare(b.id));
      groups.push({ keeperId: ranked[0].id, duplicateIds: ranked.slice(1).map(member => member.id),
        name: mergedName(ranked[0].data.name) || ranked[0].data.name,
        brand: (ranked.find(member => !isGeneric(member.data.brand)) ?? ranked[0]).data.brand,
        products: ranked.map(member => ({ id: member.id, name: member.data.name, brand: member.data.brand,
          sizes: member.data.variants.map(variant => [variant.flavor, variant.size].filter(Boolean).join(' ')).filter(Boolean) })) });
    }
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

// The kept product with every size, and how each removed size maps onto it.
export function mergeProductData(keeper, duplicates, { name, brand }) {
  const variants = keeper.variants.map(variant => ({ ...variant }));
  const seen = new Map(variants.map(variant => [variantKey(variant), variant]));
  const selectionMap = new Map(); // `${productId}\u0000${flavor|size}` -> kept product's flavor|size
  for (const { id, data } of duplicates) {
    for (const variant of data.variants || []) {
      const key = variantKey(variant);
      let target = seen.get(key);
      if (!target) { target = { ...variant }; variants.push(target); seen.set(key, target); }
      selectionMap.set(`${id}\u0000${selectionKey(variant)}`, selectionKey(target));
    }
  }
  if (variants.length > 50) throw catalogError(409, 'Merged product would have more than 50 sizes.');
  const photoDonor = [keeper, ...duplicates.map(item => item.data)].find(item => item.image_url);
  const input = { name, brand, segment: keeper.segment, category: keeper.category, description: keeper.description ?? '',
    sku: keeper.sku ?? '', variants, image_url: keeper.image_url || (keeper.image_asset_id ? '' : photoDonor?.image_url || '') };
  if (keeper.image_asset_id) input.image_asset_id = keeper.image_asset_id;
  if (keeper.status) input.status = keeper.status;
  return { input, selectionMap };
}

// Merges one group in one transaction. Returns what happened for the report.
export async function mergeCatalogGroup({ db, uid, keeperId, duplicateIds, at, deriveReservationId = identityId }) {
  return db.runTransaction(async tx => {
    await requireCatalogAdmin(tx, db, uid);
    const controlRef = db.collection('catalog_control').doc('writer');
    const control = (await tx.get(controlRef)).data();
    if (control?.frozen) throw catalogError(409, 'Catalog is frozen for operator maintenance.');
    const records = await readCatalog(tx, db);
    const audit = auditCatalog(records, [], { deriveReservationId });
    if (!audit.ok) throw catalogError(409, 'Catalog audit required: historical collision or malformed product.');
    // The plan is re-derived inside the transaction: only a still-valid group is merged.
    const group = planSizeMerges(records).find(item => item.keeperId === keeperId
      && item.duplicateIds.length === duplicateIds.length && item.duplicateIds.every(id => duplicateIds.includes(id)));
    if (!group) throw catalogError(409, 'These products changed; refresh the list and try again.');
    const byId = new Map(records.map(record => [record.id, record.data]));
    const keeper = byId.get(keeperId), duplicates = duplicateIds.map(id => ({ id, data: byId.get(id) }));
    const { input, selectionMap } = mergeProductData(keeper, duplicates, group);
    const product = { ...withoutPrices({ ...keeper, ...validateCatalogProduct(input, keeper) }), updatedAt: at,
      catalogRevision: (keeper.catalogRevision ?? 0) + 1 };
    const merged = new Set([keeperId, ...duplicateIds]);
    const newKeys = productIdentityKeys(product);
    // No product outside the group may already own one of the merged identities.
    const outside = records.filter(record => !merged.has(record.id));
    if (outside.some(record => productIdentityKeys(record.data).some(key => newKeys.includes(key)))) {
      throw catalogError(409, 'Canonical catalog conflict; no product was merged.');
    }
    // Reservations: every merged identity is bound to the kept product; identities the
    // merged product no longer has are marked deleted for the product that held them.
    const holders = [{ id: keeperId, keys: productIdentityKeys(keeper) },
      ...duplicates.map(item => ({ id: item.id, keys: productIdentityKeys(item.data) }))];
    const writes = new Map();
    for (const key of newKeys) writes.set(key, { identity: key, productId: keeperId, state: 'bound' });
    for (const holder of holders) for (const key of holder.keys) {
      if (!writes.has(key)) writes.set(key, { identity: key, productId: holder.id, state: holder.id === keeperId ? 'retired' : 'deleted' });
    }
    const claims = [];
    for (const [key, next] of writes) {
      const id = deriveReservationId(key);
      const ref = db.collection('product_submission_identity').doc(id);
      const existing = (await tx.get(ref)).data();
      // A reservation held by a product outside this group is never taken over.
      if (existing && existing.identity !== key) throw reservationIntegrityError([{ id, kind: 'RESERVATION_ID_COLLISION' }]);
      if (existing && !merged.has(existing.productId)) throw reservationIntegrityError(reservationIntegrityProblems([], [{ id, data: existing }], deriveReservationId).concat([{ id, kind: 'RESERVATION_CONFLICT' }]));
      claims.push({ ref, data: { version: 1, ...next, updatedAt: at } });
    }
    tx.set(db.collection('products').doc(keeperId), product);
    for (const id of duplicateIds) tx.delete(db.collection('products').doc(id));
    for (const claim of claims) tx.set(claim.ref, claim.data);
    tx.set(controlRef, { ...control, version: 1, revision: (control?.revision ?? 0) + 1, updatedAt: at });
    return { keeperId, removed: duplicateIds, name: product.name, sizes: product.variants.length,
      selectionMap: Object.fromEntries(selectionMap) };
  });
}

// Points API keys that used a removed product at the kept product, same sizes selected.
export async function remapApiKeys(db, { keeperId, removed, selectionMap }) {
  const removedSet = new Set(removed);
  const snapshot = await db.collection('api_keys').get();
  let changed = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const full = Array.isArray(data.linkedProductIds) ? data.linkedProductIds : [];
    const partial = data.linkedVariantSelections && typeof data.linkedVariantSelections === 'object' && !Array.isArray(data.linkedVariantSelections)
      ? data.linkedVariantSelections : {};
    if (!full.some(id => removedSet.has(id)) && !Object.keys(partial).some(id => removedSet.has(id))) continue;
    const ref = db.collection('api_keys').doc(doc.id);
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data() || {};
      const ids = Array.isArray(current.linkedProductIds) ? [...current.linkedProductIds] : [];
      const selections = { ...(current.linkedVariantSelections && typeof current.linkedVariantSelections === 'object' ? current.linkedVariantSelections : {}) };
      const keeperFull = ids.includes(keeperId);
      const picked = new Set(Array.isArray(selections[keeperId]) ? selections[keeperId] : []);
      const mapped = (id, key) => selectionMap[`${id}\u0000${key}`];
      for (const id of removed) {
        if (ids.includes(id)) {
          // A whole removed product = all of its sizes on the kept product.
          for (const [entry, target] of Object.entries(selectionMap)) if (entry.startsWith(`${id}\u0000`)) picked.add(target);
        }
        for (const key of Array.isArray(selections[id]) ? selections[id] : []) { const target = mapped(id, key); if (target) picked.add(target); }
        delete selections[id];
      }
      const nextIds = ids.filter(id => !removedSet.has(id));
      if (!keeperFull && picked.size) selections[keeperId] = [...picked].sort();
      tx.update(ref, { linkedProductIds: nextIds, linkedVariantSelections: selections });
    });
    changed += 1;
  }
  return changed;
}
