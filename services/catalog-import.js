import { productIdentityKeys } from './product-contract.js';
import { brandNameKey, catalogDigest, catalogError, possibleDuplicates, strictPrice, validateCatalogProduct } from './catalog-contract.js';

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
};
export function previewCatalogImport(matrix, records) {
  if (!Array.isArray(matrix) || matrix.length < 2 || matrix.length > 201 || JSON.stringify(matrix).length > 200000
    || matrix.some(row => !Array.isArray(row) || row.length > 64 || row.some(v => typeof v !== 'string' || v.length > 4000))) {
    throw catalogError(400, 'Provide a CSV header and 1–200 rows, at most 200 KB of parsed data.');
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
  const missing = ['name', 'category', 'segment', 'price'].filter(field => !seen.has(field));
  if (missing.length) throw catalogError(400, `Missing required columns: ${missing.join(', ')}.`);
  const rows = matrix.slice(1).map((values, index) => {
    const row = { row: index + 2, status: 'INVALID', reason: '', product: null, matches: [], possibleDuplicates: [] };
    try {
      if (values.length !== headers.length) throw catalogError(400, 'Column count does not match header.');
      const fields = {};
      headers.forEach((field, i) => { if (field) fields[field] = values[i].trim(); });
      const { name, brand = '', category, segment, description = '', sku = '', size = '', flavor = '', expirationDate = '' } = fields;
      row.product = validateCatalogProduct({ name, brand, category, segment, description, sku,
        variants: [{ size, flavor, sku, expirationDate, price: strictPrice(fields.price) }] });
      delete row.product.is_active; // Re-derived by the writer, never a client input.
      const keys = new Set(productIdentityKeys(row.product));
      row.matches = records.filter(record => productIdentityKeys(record.data).some(key => keys.has(key))).map(record => record.id).sort();
      row.possibleDuplicates = possibleDuplicates(row.product, records);
      row.status = row.matches.length > 1 ? 'CONFLICT' : row.matches.length ? 'EXACT_EXISTING_MATCH'
        : row.possibleDuplicates.length ? 'POSSIBLE_DUPLICATE' : 'NEW';
      row.reason = row.matches.length ? 'Canonical identity already exists; skipped without changes.'
        : row.possibleDuplicates.length ? 'Brand + Product Name matches different canonical identities; review before creation.' : '';
    } catch (error) { row.status = 'INVALID'; row.reason = error.message; row.product = null; }
    return row;
  });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; if (!row.product) continue;
    const keys = new Set(productIdentityKeys(row.product));
    for (let j = 0; j < i; j++) {
      const earlier = rows[j]; if (!earlier.product) continue;
      if (productIdentityKeys(earlier.product).some(key => keys.has(key))) {
        if (catalogDigest(earlier.product) === catalogDigest(row.product) && earlier.status !== 'CONFLICT') {
          row.status = 'EXACT_EXISTING_MATCH'; row.reason = `Repeated canonical row ${earlier.row}; skipped.`;
        } else {
          row.status = earlier.status = 'CONFLICT';
          row.reason = earlier.reason = `Conflicting within-file canonical rows ${earlier.row} and ${row.row}; neither will be written.`;
        }
      } else if (brandNameKey(row.product) && brandNameKey(row.product) === brandNameKey(earlier.product)) {
        for (const [target, other] of [[row, earlier], [earlier, row]]) {
          if (['NEW', 'POSSIBLE_DUPLICATE'].includes(target.status)) {
            target.status = 'POSSIBLE_DUPLICATE'; target.reason = `Brand + Product Name also matches CSV row ${other.row}; distinct canonical variant, no automatic merge.`;
          }
        }
      }
    }
  }
  const counts = Object.fromEntries(['NEW', 'EXACT_EXISTING_MATCH', 'POSSIBLE_DUPLICATE', 'INVALID', 'CONFLICT']
    .map(status => [status, rows.filter(row => row.status === status).length]));
  return { total: rows.length, counts, warnings, rows };
}
