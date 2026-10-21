import { comparisonText, normalizeSku, productIdentityKeys, projectProduct } from './product-contract.js';
import { brandNameKey, catalogDigest, catalogError, validateCatalogProduct } from './catalog-contract.js';

// Preserve recognized legacy aliases. No filename/semantic guessing or manual map existed.
const aliases = {
  name: 'name', product_name: 'name', productname: 'name', generic_name: 'name', genericname: 'name',
  item_name: 'name', medicine_name: 'name', drug_name: 'name', item: 'name', description: 'description',
  brand: 'brand', brands: 'brand', brand_name: 'brand', brandname: 'brand', manufacturer: 'brand', company: 'brand', lab: 'brand',
  segment: 'segment', category_type: 'segment', product_type: 'segment', type: 'segment', dept: 'segment', department: 'segment',
  category: 'category', drug_category: 'category', subcategory: 'category', sub_category: 'category',
  product_category: 'category', class: 'category', therapeutic_class: 'category', drug_class: 'category',
  sku: 'sku', barcode: 'sku', item_code: 'sku', product_code: 'sku', code: 'sku', item_id: 'sku', upc: 'sku', barcode_sku: 'sku', ean: 'sku',
  size: 'size', dosage: 'size', unit: 'size', packaging: 'size', form: 'size', strength: 'size',
  pack_size: 'size', weight: 'size', volume: 'size', net_weight: 'size', quantity: 'size', quantity_grams: 'size',
  flavor: 'flavor', variant: 'flavor', formulation: 'flavor', expiration_date: 'expirationDate',
  expiry: 'expirationDate', expiry_date: 'expirationDate', exp_date: 'expirationDate', expirationdate: 'expirationDate',
  image_url: 'image_url', imageurl: 'image_url',
};
// Products carry no price, so price columns are skipped without a warning.
const priceColumns = new Set(['price', 'srp', 'retail_price', 'unit_price', 'selling_price', 'market_price', 'msrp']);
const VARIANT_MATCH_FIELDS = ['size', 'flavor'];

// Works out how one CSV row changes the existing product it matched. Only fields
// the CSV fills in are compared; blank CSV cells never clear existing data.
// Returns { input, changes } for an edit, or null when there is nothing to change.
// Throws when the CSV row cannot be tied to exactly one existing variant.
export function planImportUpdate(existing, csv) {
  const old = projectProduct(existing);
  if (!old) throw catalogError(409, 'Existing product could not be read.');
  const changes = [], input = {};
  for (const field of ['name', 'brand', 'category', 'description', 'image_url']) {
    const value = csv[field] ?? '';
    if (value && value !== (old[field] ?? '')) { input[field] = value; changes.push(`${field}: "${old[field] || ''}" → "${value}"`); }
  }
  if (csv.segment && csv.segment !== old.segment) { input.segment = csv.segment; changes.push(`segment: ${old.segment || 'none'} → ${csv.segment}`); }
  const variants = structuredClone(Array.isArray(existing.variants) && existing.variants.length ? existing.variants : old.variantPayloads || []);
  const row = csv.variants[0], sku = normalizeSku(row.sku);
  let matches = sku ? variants.filter(variant => normalizeSku(variant.sku) === sku) : [];
  if (!matches.length) {
    matches = variants.filter(variant => VARIANT_MATCH_FIELDS.every(field => !row[field] || comparisonText(variant[field]) === comparisonText(row[field])));
    if (matches.length !== 1 && variants.length === 1) matches = variants;
  }
  if (matches.length !== 1) throw catalogError(409, 'Matches an existing product but not exactly one of its variants; edit it by hand.');
  const variant = matches[0];
  for (const field of [...VARIANT_MATCH_FIELDS, 'expirationDate']) {
    if (row[field] && row[field] !== (variant[field] ?? '')) { changes.push(`${field}: "${variant[field] || ''}" → "${row[field]}"`); variant[field] = row[field]; }
  }
  if (!changes.length) return null;
  input.variants = variants;
  return { input, changes };
}

export function previewCatalogImport(matrix, records) {
  // No row-count cap: large files are stored in chunks by the preview handler.
  if (!Array.isArray(matrix) || matrix.length < 2
    || matrix.some(row => !Array.isArray(row) || row.length > 64 || row.some(v => typeof v !== 'string' || v.length > 4000))) {
    throw catalogError(400, 'Provide a CSV header and at least 1 row (up to 64 columns, 4,000 characters per cell).');
  }
  const warnings = [], seen = new Set();
  const headers = matrix[0].map(raw => {
    const key = raw.replace(/^\uFEFF/u, '').trim().toLowerCase().replace(/\s+/gu, '_');
    const field = Object.hasOwn(aliases, key) ? aliases[key] : null;
    if (!field && priceColumns.has(key)) return null;
    if (!field) warnings.push(`Ignored unknown column: ${raw || '(blank)'}`);
    else if (seen.has(field)) throw catalogError(400, `Duplicate column mapping for ${field}.`);
    if (field) seen.add(field);
    return field;
  });
  const missing = ['name', 'category', 'segment'].filter(field => !seen.has(field));
  if (missing.length) throw catalogError(400, `Missing required columns: ${missing.join(', ')}.`);
  // Index the catalog once so each row looks up matches instead of rescanning
  // every product (thousands of rows x thousands of products otherwise).
  const byKey = new Map(), byBrandName = new Map();
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
      // Lets the preview name a row even when it turns out invalid.
      row.display = { name: (fields.name || '').slice(0, 160), brand: (fields.brand || '').slice(0, 120) };
      const { name, brand = '', category, segment, description = '', sku = '', size = '', flavor = '', expirationDate = '', image_url = '' } = fields;
      row.product = validateCatalogProduct({ name, brand, category, segment, description, sku, image_url,
        variants: [{ size, flavor, sku, expirationDate }] });
      delete row.product.is_active; // Re-derived by the writer, never a client input.
      const keys = new Set(productIdentityKeys(row.product));
      row.matches = [...new Set([...keys].flatMap(key => byKey.get(key) || []))].sort();
      // Same result as possibleDuplicates(row.product, records), from the index.
      row.possibleDuplicates = (byBrandName.get(brandNameKey(row.product)) || [])
        .filter(record => !record.keys.some(key => keys.has(key))).map(record => record.id).sort();
      row.status = row.matches.length > 1 ? 'CONFLICT' : row.matches.length ? 'EXACT_EXISTING_MATCH'
        : row.possibleDuplicates.length ? 'POSSIBLE_DUPLICATE' : 'NEW';
      row.reason = row.matches.length > 1 ? 'Matches more than one existing product; skipped.'
        : row.possibleDuplicates.length ? 'Brand + Product Name matches different canonical identities; review before creation.' : '';
      if (row.matches.length === 1) {
        const record = records.find(item => item.id === row.matches[0]);
        try {
          const update = planImportUpdate(record.data, row.product);
          if (update) {
            row.status = 'UPDATE'; row.reason = update.changes.join('; ');
            row.update = { productId: record.id, catalogRevision: record.data.catalogRevision ?? 0 };
          } else row.reason = 'Already matches the existing product; nothing to change.';
        } catch (error) { row.reason = error.message; }
      }
    } catch (error) { row.status = 'INVALID'; row.reason = error.message; row.product = null; }
    return row;
  });
  // Only earlier rows sharing an identity key or Brand + Name can affect a row,
  // so look those up by index and visit them in file order.
  const rowKeys = rows.map(row => row.product ? productIdentityKeys(row.product) : []);
  const rowGroups = rows.map(row => row.product ? brandNameKey(row.product) : null);
  const earlierByKey = new Map(), earlierByGroup = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; if (!row.product) continue;
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
  const counts = Object.fromEntries(['NEW', 'UPDATE', 'EXACT_EXISTING_MATCH', 'POSSIBLE_DUPLICATE', 'INVALID', 'CONFLICT']
    .map(status => [status, rows.filter(row => row.status === status).length]));
  return { total: rows.length, counts, warnings, rows };
}
