import { comparisonText, normalizeSku, productIdentityKeys, projectProduct } from './product-contract.js';
import { brandNameKey, catalogDigest, catalogError, strictPrice, validateCatalogProduct } from './catalog-contract.js';

// Preserve recognized legacy aliases. No filename/semantic guessing or manual map existed.
const aliases = {
  name: 'name', product_name: 'name', productname: 'name', generic_name: 'name', genericname: 'name',
  item_name: 'name', medicine_name: 'name', drug_name: 'name', item: 'name', description: 'description',
  brand: 'brand', brand_name: 'brand', brandname: 'brand', manufacturer: 'brand', company: 'brand', lab: 'brand',
  segment: 'segment', category_type: 'segment', product_type: 'segment', type: 'segment', dept: 'segment', department: 'segment',
  category: 'category', drug_category: 'category', subcategory: 'category', sub_category: 'category',
  product_category: 'category', class: 'category', therapeutic_class: 'category', drug_class: 'category',
  sku: 'sku', barcode: 'sku', item_code: 'sku', product_code: 'sku', code: 'sku', item_id: 'sku', upc: 'sku',
  price: 'price', srp: 'price', retail_price: 'price', unit_price: 'price', selling_price: 'price', market_price: 'price', msrp: 'price',
  size: 'size', dosage: 'size', unit: 'size', packaging: 'size', form: 'size', strength: 'size',
  pack_size: 'size', weight: 'size', volume: 'size', net_weight: 'size',
  flavor: 'flavor', variant: 'flavor', formulation: 'flavor', expiration_date: 'expirationDate',
  expiry: 'expirationDate', expiry_date: 'expirationDate', exp_date: 'expirationDate', expirationdate: 'expirationDate',
  image_url: 'image_url', imageurl: 'image_url',
  // Column names of the admin panel's own catalog export.
  pricing: 'price', specs: 'size', flavors: 'flavor', sizes: 'size',
};
const money = value => typeof value === 'number' ? `₱${value.toFixed(2)}` : String(value ?? '');
const VARIANT_MATCH_FIELDS = ['size', 'flavor'];
const parts = value => String(value ?? '').split(/\s*,\s*/u).map(comparisonText).filter(Boolean);

// Merge mode (the admin panel's importer) reads prices the way the catalog export
// writes them: "12.50" or "₱12.50". Price is optional there: a blank price, or an
// exported price range, keeps existing prices, and new products and sizes are
// stored with price 0.
function importPrice(text, merge) {
  const value = String(text ?? '').trim();
  if (!merge) return { price: strictPrice(value), missing: false };
  const plain = value.replace(/^₱\s*/u, '').replace(/,/gu, '');
  if (!plain || plain === '—' || /\d\s*[-–]\s*₱?\s*\d/u.test(value)) return { price: 0, missing: true };
  return { price: strictPrice(plain), missing: false };
}

// Product-level fields a CSV row may change. With fillImageOnly an existing photo is
// never replaced; a photo is only added where the product has none.
function productFieldChanges(old, csv, fields, { fillImageOnly = false } = {}) {
  const changes = [], input = {};
  for (const field of fields) {
    const value = csv[field] ?? '';
    if (!value || value === (old[field] ?? '')) continue;
    if (field === 'image_url' && fillImageOnly) {
      if (old.image_url || old.image_asset_id) continue;
      input.image_url = value; changes.push('photo added');
      continue;
    }
    input[field] = value; changes.push(`${field}: "${old[field] || ''}" → "${value}"`);
  }
  return { input, changes };
}
function applyVariantChanges(variant, row, changes, keepPrice) {
  if (!keepPrice && variant.price !== row.price) { changes.push(`price: ${money(variant.price)} → ${money(row.price)}`); variant.price = row.price; }
  for (const field of [...VARIANT_MATCH_FIELDS, 'expirationDate']) {
    if (row[field] && row[field] !== (variant[field] ?? '')) { changes.push(`${field}: "${variant[field] || ''}" → "${row[field]}"`); variant[field] = row[field]; }
  }
}

// Works out how one CSV row changes the existing product it matched. Only fields
// the CSV fills in are compared; blank CSV cells never clear existing data.
// Returns { input, changes } for an edit, or null when there is nothing to change.
// Throws when the CSV row cannot be tied to exactly one existing variant.
export function planImportUpdate(existing, csv, { keepPrice = false, fillImageOnly = false } = {}) {
  const old = projectProduct(existing);
  if (!old) throw catalogError(409, 'Existing product could not be read.');
  const { input, changes } = productFieldChanges({ ...old, image_asset_id: existing.image_asset_id },
    csv, ['name', 'brand', 'category', 'description', 'image_url'], { fillImageOnly });
  if (csv.segment && csv.segment !== old.segment) { input.segment = csv.segment; changes.push(`segment: ${old.segment || 'none'} → ${csv.segment}`); }
  const variants = structuredClone(Array.isArray(existing.variants) && existing.variants.length ? existing.variants : old.variantPayloads || []);
  const row = csv.variants[0], sku = normalizeSku(row.sku);
  let matches = sku ? variants.filter(variant => normalizeSku(variant.sku) === sku) : [];
  if (!matches.length) {
    matches = variants.filter(variant => VARIANT_MATCH_FIELDS.every(field => !row[field] || comparisonText(variant[field]) === comparisonText(row[field])));
    if (matches.length !== 1 && variants.length === 1) matches = variants;
  }
  if (matches.length !== 1) throw catalogError(409, 'Matches an existing product but not exactly one of its variants; edit it by hand.');
  applyVariantChanges(matches[0], row, changes, keepPrice);
  if (!changes.length) return null;
  input.variants = variants;
  return { input, changes };
}

// A row whose Brand + Name equals an existing product but whose identity differs
// (another size or flavor, or an exported row listing several). Returns
// { kind: 'update' | 'append', input, changes }, or null when nothing changes.
// - The row's SKU, or its exact size/flavor, names one variant: update that variant.
// - Every size/flavor it lists is already on the product (an exported row): product
//   fields only, i.e. add a missing photo.
// - Otherwise it is one new size/flavor: append it as a new variant.
// Category, segment, name and brand of the existing product are never changed here.
export function planImportMerge(existing, csv, { keepPrice = false } = {}) {
  const old = projectProduct(existing);
  if (!old) throw catalogError(409, 'Existing product could not be read.');
  const { input, changes } = productFieldChanges({ ...old, image_asset_id: existing.image_asset_id }, csv, ['image_url'], { fillImageOnly: true });
  const variants = structuredClone(Array.isArray(existing.variants) && existing.variants.length ? existing.variants : old.variantPayloads || []);
  const row = csv.variants[0], sku = normalizeSku(row.sku);
  const given = VARIANT_MATCH_FIELDS.filter(field => row[field]);
  let matches = sku ? variants.filter(variant => normalizeSku(variant.sku) === sku) : [];
  if (!matches.length && given.length) {
    matches = variants.filter(variant => given.every(field => comparisonText(variant[field]) === comparisonText(row[field])));
  }
  if (matches.length > 1) throw catalogError(409, 'Matches more than one size of the existing product; edit it by hand.');
  let kind = 'update';
  if (matches.length === 1) applyVariantChanges(matches[0], row, changes, keepPrice);
  else if (!sku && (!given.length || given.every(field => {
    const known = new Set(variants.map(variant => comparisonText(variant[field])).filter(Boolean));
    return parts(row[field]).every(part => known.has(part));
  }))) {
    // Nothing variant-specific to apply: the row describes the product as a whole.
  } else if (given.some(field => parts(row[field]).length > 1)) {
    throw catalogError(409, 'Lists several sizes or flavors that are not all on the existing product; edit it by hand.');
  } else {
    const variant = { price: row.price };
    for (const field of [...VARIANT_MATCH_FIELDS, 'sku', 'expirationDate']) if (row[field]) variant[field] = row[field];
    variants.push(variant); kind = 'append';
    changes.push(`adds ${[row.size, row.flavor].filter(Boolean).join(' ') || row.sku || 'a variant'}`);
  }
  if (!changes.length) return null;
  if (kind === 'append' || matches.length === 1) input.variants = variants;
  return { kind, input, changes };
}

// options.merge: the admin panel's importer. Rows equal to a catalog product are
// skipped, existing photos are never replaced, a new size of an existing product
// (same Brand + Name) is appended to it, and blank prices keep existing ones.
// options.requireImage: rows without an image link are skipped.
export function previewCatalogImport(matrix, records, { merge = false, requireImage = false } = {}) {
  // No row-count cap: large files are stored in chunks by the preview handler.
  if (!Array.isArray(matrix) || matrix.length < 2
    || matrix.some(row => !Array.isArray(row) || row.length > 64 || row.some(v => typeof v !== 'string' || v.length > 4000))) {
    throw catalogError(400, 'Provide a CSV header and at least 1 row (up to 64 columns, 4,000 characters per cell).');
  }
  const warnings = [], seen = new Set();
  const headers = matrix[0].map(raw => {
    const key = raw.replace(/^\uFEFF/u, '').trim().toLowerCase().replace(/\s+/gu, '_');
    const field = Object.hasOwn(aliases, key) ? aliases[key] : null;
    if (!field) warnings.push(`Ignored unknown column: ${raw || '(blank)'}`);
    else if (seen.has(field)) throw catalogError(400, `Duplicate column mapping for ${field}.`);
    if (field) seen.add(field);
    return field;
  });
  const missing = ['name', 'category', 'segment', ...(merge ? [] : ['price'])].filter(field => !seen.has(field));
  if (missing.length) throw catalogError(400, `Missing required columns: ${missing.join(', ')}.`);
  // Index the catalog once so each row looks up matches instead of rescanning
  // every product (thousands of rows x thousands of products otherwise).
  const byKey = new Map(), byBrandName = new Map(), byId = new Map(records.map(record => [record.id, record]));
  const add = (map, key, value) => { if (map.has(key)) map.get(key).push(value); else map.set(key, [value]); };
  for (const record of records) {
    const keys = productIdentityKeys(record.data), group = brandNameKey(record.data);
    for (const key of keys) add(byKey, key, record.id);
    if (group) add(byBrandName, group, { id: record.id, keys });
  }
  const rows = matrix.slice(1).map((values, index) => {
    const row = { row: index + 2, status: 'INVALID', reason: '', product: null, matches: [], possibleDuplicates: [] };
    try {
      if (values.length !== headers.length) throw catalogError(400, 'Column count does not match header.');
      const fields = {};
      headers.forEach((field, i) => { if (field) fields[field] = values[i].trim(); });
      const { name, brand = '', category, segment, description = '', sku = '', size = '', flavor = '', expirationDate = '', image_url = '' } = fields;
      const { price, missing: noPrice } = importPrice(fields.price, merge);
      row.product = validateCatalogProduct({ name, brand, category, segment, description, sku, image_url,
        variants: [{ size, flavor, sku, expirationDate, price }] });
      delete row.product.is_active; // Re-derived by the writer, never a client input.
      if (noPrice) row.keepPrice = true;
      if (requireImage && !row.product.image_url) {
        row.status = 'NO_IMAGE'; row.reason = 'No image link; skipped.';
        return row;
      }
      const keys = new Set(productIdentityKeys(row.product));
      row.matches = [...new Set([...keys].flatMap(key => byKey.get(key) || []))].sort();
      // Same result as possibleDuplicates(row.product, records), from the index.
      row.possibleDuplicates = (byBrandName.get(brandNameKey(row.product)) || [])
        .filter(record => !record.keys.some(key => keys.has(key))).map(record => record.id).sort();
      row.status = row.matches.length > 1 ? 'CONFLICT' : row.matches.length ? 'EXACT_EXISTING_MATCH'
        : row.possibleDuplicates.length ? 'POSSIBLE_DUPLICATE' : 'NEW';
      row.reason = row.matches.length > 1 ? 'Matches more than one existing product; skipped.'
        : row.possibleDuplicates.length ? 'Brand + Product Name matches different canonical identities; review before creation.' : '';
      const flags = merge ? { keepPrice: !!row.keepPrice, fillImageOnly: true } : {};
      if (row.matches.length === 1) {
        const record = byId.get(row.matches[0]);
        try {
          const update = planImportUpdate(record.data, row.product, flags);
          if (update) {
            row.status = 'UPDATE'; row.reason = update.changes.join('; ');
            row.update = { productId: record.id, catalogRevision: record.data.catalogRevision ?? 0 };
          } else row.reason = merge ? 'Already in the catalog; skipped.' : 'Already matches the existing product; nothing to change.';
        } catch (error) { row.reason = error.message; }
      } else if (merge && row.possibleDuplicates.length) {
        // Same Brand + Name as existing products: update or extend the one it fits.
        const plans = row.possibleDuplicates.map(id => {
          try { return { id, plan: planImportMerge(byId.get(id).data, row.product, flags) }; }
          catch (error) { return { id, error }; }
        });
        const fits = plans.filter(item => !item.error && item.plan?.kind !== 'append');
        const chosen = fits.length === 1 ? fits[0] : !fits.length && plans.length === 1 ? plans[0] : null;
        if (!chosen) {
          row.status = 'POSSIBLE_DUPLICATE';
          row.reason = 'Several products share this brand and name; skipped. Edit the right one by hand.';
        } else if (chosen.error) {
          row.status = 'INVALID'; row.reason = chosen.error.message;
        } else if (!chosen.plan) {
          row.status = 'EXACT_EXISTING_MATCH'; row.reason = 'Already in the catalog; skipped.';
        } else {
          row.status = chosen.plan.kind === 'append' ? 'APPEND' : 'UPDATE'; row.reason = chosen.plan.changes.join('; ');
          row.update = { productId: chosen.id, catalogRevision: byId.get(chosen.id).data.catalogRevision ?? 0, merge: true };
        }
        row.matches = chosen && !chosen.error ? [chosen.id] : [];
      }
    } catch (error) { row.status = 'INVALID'; row.reason = error.message; row.product = null; }
    return row;
  });
  // Only earlier rows sharing an identity key or Brand + Name can affect a row,
  // so look those up by index and visit them in file order.
  const counted = row => row.product && row.status !== 'NO_IMAGE';
  const rowKeys = rows.map(row => counted(row) ? productIdentityKeys(row.product) : []);
  const rowGroups = rows.map(row => counted(row) ? brandNameKey(row.product) : null);
  const earlierByKey = new Map(), earlierByGroup = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; if (!counted(row)) continue;
    const keys = new Set(rowKeys[i]);
    const candidates = new Set(rowKeys[i].flatMap(key => earlierByKey.get(key) || []));
    for (const j of (rowGroups[i] && earlierByGroup.get(rowGroups[i])) || []) candidates.add(j);
    for (const j of [...candidates].sort((a, b) => a - b)) {
      const earlier = rows[j];
      if (rowKeys[j].some(key => keys.has(key))) {
        if (catalogDigest(earlier.product) === catalogDigest(row.product) && earlier.status !== 'CONFLICT') {
          row.status = 'EXACT_EXISTING_MATCH'; row.reason = `Repeated canonical row ${earlier.row}; skipped.`;
        } else {
          row.status = earlier.status = 'CONFLICT';
          row.reason = earlier.reason = `Conflicting within-file canonical rows ${earlier.row} and ${row.row}; neither will be written.`;
        }
      } else if (merge && rowGroups[i] && rowGroups[i] === rowGroups[j]) {
        // A new size of a product an earlier row creates (or extends) is added to it.
        if (row.status === 'NEW' && !row.appendTo) {
          const root = earlier.appendTo ?? (earlier.status === 'NEW' ? { row: earlier.row } : earlier.status === 'APPEND' ? { productId: earlier.update.productId } : null);
          if (root) {
            row.status = 'APPEND'; row.appendTo = root;
            row.reason = `adds ${[row.product.variants[0].size, row.product.variants[0].flavor].filter(Boolean).join(' ') || 'a variant'} to the product ${root.row ? `from row ${root.row}` : 'in the catalog'}`;
            if (root.productId) row.update = { productId: root.productId, merge: true };
          }
        }
      } else if (rowGroups[i] && rowGroups[i] === rowGroups[j]) {
        for (const [target, other] of [[row, earlier], [earlier, row]]) {
          if (['NEW', 'POSSIBLE_DUPLICATE'].includes(target.status)) {
            target.status = 'POSSIBLE_DUPLICATE'; target.reason = `Brand + Product Name also matches CSV row ${other.row}; distinct canonical variant, no automatic merge.`;
          }
        }
      }
    }
    for (const key of rowKeys[i]) add(earlierByKey, key, i);
    if (rowGroups[i]) add(earlierByGroup, rowGroups[i], i);
  }
  const counts = Object.fromEntries(['NEW', 'UPDATE', 'APPEND', 'EXACT_EXISTING_MATCH', 'POSSIBLE_DUPLICATE', 'INVALID', 'CONFLICT', 'NO_IMAGE']
    .map(status => [status, rows.filter(row => row.status === status).length]));
  return { total: rows.length, counts, warnings, rows };
}
