// Turns a CSV in any layout (for example an Open Food Facts export) into the
// Import CSV template columns. The API still validates every value; this only
// picks the right source column for each field and drops everything else.

export const TEMPLATE_COLUMNS = ['name', 'brand', 'segment', 'category', 'size', 'flavor', 'sku', 'description', 'expiration_date', 'image_url'] as const;
type Field = typeof TEMPLATE_COLUMNS[number];

// Header names the API already understands (services/catalog-import.js aliases).
const API_ALIASES: Record<string, Field | 'description'> = {
  name: 'name', product_name: 'name', productname: 'name', generic_name: 'name', genericname: 'name',
  item_name: 'name', medicine_name: 'name', drug_name: 'name', item: 'name', description: 'description',
  brand: 'brand', brands: 'brand', brand_name: 'brand', brandname: 'brand', manufacturer: 'brand', company: 'brand', lab: 'brand',
  segment: 'segment', category_type: 'segment', product_type: 'segment', type: 'segment', dept: 'segment', department: 'segment',
  category: 'category', drug_category: 'category', subcategory: 'category', sub_category: 'category',
  product_category: 'category', class: 'category', therapeutic_class: 'category', drug_class: 'category',
  sku: 'sku', barcode: 'sku', item_code: 'sku', product_code: 'sku', code: 'sku', item_id: 'sku', upc: 'sku', barcode_sku: 'sku', ean: 'sku',
  size: 'size', dosage: 'size', unit: 'size', packaging: 'size', form: 'size', strength: 'size',
  pack_size: 'size', weight: 'size', volume: 'size', net_weight: 'size', quantity: 'size', quantity_grams: 'size',
  flavor: 'flavor', flavors: 'flavor', variant: 'flavor', formulation: 'flavor', specs: 'size', expiration_date: 'expiration_date',
  expiry: 'expiration_date', expiry_date: 'expiration_date', exp_date: 'expiration_date', expirationdate: 'expiration_date',
  image_url: 'image_url', imageurl: 'image_url',
};

// Source columns to try for each field, best first. Open Food Facts names come first
// where they exist, so its many look-alike columns (packaging, product_name_fr…) lose.
const SOURCES: Record<Field, string[]> = {
  name: ['product_name_en', 'product_name', 'name', 'product', 'item_name', 'generic_name_en', 'generic_name', 'productname', 'item', 'medicine_name', 'drug_name', 'title', 'item_description', 'product_description', 'product_name_*'],
  brand: ['brands', 'brand', 'brand_name', 'brand_owner', 'manufacturer', 'company'],
  segment: ['segment', 'department', 'dept', 'product_type', 'category_type'],
  category: ['category', 'main_category_en', 'categories_en', 'categories_tags', 'categories', 'product_category', 'subcategory', 'drug_category', 'therapeutic_class'],
  size: ['size', 'specs', 'quantity', 'quantity_grams', 'pack_size', 'net_weight', 'weight', 'volume', 'dosage', 'strength'],
  flavor: ['flavor', 'flavors', 'flavour', 'variant'],
  sku: ['sku', 'code', 'barcode', 'barcode_sku', 'upc', 'ean', 'item_code', 'product_code', 'item_id'],
  description: ['description', 'generic_name_en', 'generic_name'],
  expiration_date: ['expiration_date', 'expiry_date', 'expiry', 'exp_date'],
  image_url: ['image_url', 'image_front_url', 'imageurl', 'image'],
};

// Same maximum lengths the API enforces.
const LIMITS: Partial<Record<Field, number>> = { name: 160, brand: 120, category: 120, description: 4000 };

const key = (header: string) => header.replace(/^﻿/u, '').trim().toLowerCase().replace(/\s+/gu, '_');
const titleCase = (text: string) => text.replace(/[-_]+/gu, ' ').replace(/\b\p{L}/gu, letter => letter.toUpperCase());

function clean(field: Field, source: string, value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (source === 'categories_tags') {
    const tags = text.split(',').map(tag => tag.trim()).filter(Boolean);
    const english = tags.find(tag => tag.toLowerCase().startsWith('en:')) ?? tags[0] ?? '';
    return titleCase(english.replace(/^[a-z]{2}:/iu, '')).slice(0, 120);
  }
  // Open Food Facts lists several brands/categories comma-separated; keep the first.
  if ((field === 'brand' && source === 'brands') || (field === 'category' && source.startsWith('categories'))) {
    return text.split(',')[0].trim().replace(/^[a-z]{2}:/iu, '');
  }
  return text;
}

// True when the API can read the file as it is: every required field has a
// column it knows, and the file is not too wide.
export function fitsTemplate(header: string[]): boolean {
  if (header.length > 64) return false;
  const mapped = new Set(header.map(column => API_ALIASES[key(column)]).filter(Boolean));
  return ['name', 'category', 'segment'].every(field => mapped.has(field as Field));
}

export type Extraction = { rows: string[][]; used: Partial<Record<Field, string>>; dropped: number };

// Blank segment and category cells stay blank: the API works out each new product's
// segment from its category or name, and never overwrites existing values with guesses.
export function extractTemplateRows(matrix: string[][]): Extraction {
  const [header = [], ...body] = matrix;
  const keys = header.map(key);
  const pick: Partial<Record<Field, number[]>> = {}, used: Partial<Record<Field, string>> = {};
  for (const field of TEMPLATE_COLUMNS) {
    const indexes: number[] = [];
    for (const source of SOURCES[field]) {
      if (source.endsWith('*')) keys.forEach((name, i) => { if (name.startsWith(source.slice(0, -1)) && !indexes.includes(i)) indexes.push(i); });
      else { const i = keys.indexOf(source); if (i >= 0 && !indexes.includes(i)) indexes.push(i); }
    }
    if (indexes.length) { pick[field] = indexes; used[field] = header[indexes[0]]; }
  }
  const rows: string[][] = [[...TEMPLATE_COLUMNS]];
  let dropped = 0;
  for (const values of body) {
    const record = Object.fromEntries(TEMPLATE_COLUMNS.map(field => {
      for (const i of pick[field] ?? []) {
        const value = clean(field, keys[i], values[i] ?? '');
        if (value) return [field, value];
      }
      return [field, ''];
    })) as Record<Field, string>;
    if (!record.name) { dropped++; continue; }
    // Never let one product's description repeat its name.
    if (record.description === record.name) record.description = '';
    rows.push(TEMPLATE_COLUMNS.map(field => record[field].slice(0, LIMITS[field] ?? 200)));
  }
  return { rows, used, dropped };
}
