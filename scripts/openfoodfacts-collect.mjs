#!/usr/bin/env node
// Collects products from Open Food Facts (world.openfoodfacts.org) into a CSV
// the admin Import CSV dialog reads directly: name, brand, segment, category,
// size, price, sku (barcode), description, image_url (front photo).
//
// Open Food Facts has no prices, so the price column is left empty (price is optional).
// A second file (<out>-credits.csv) lists each product page and photo licence.
//
// Usage:
//   node scripts/openfoodfacts-collect.mjs [--country philippines] [--brand "Nestlé"]
//     [--category snacks] [--search "pancit canton"] [--barcodes codes.txt]
//     [--limit 500] [--segment Grocery] [--out openfoodfacts-import.csv] [--start-page 1]
//
// A search stops after 10 pages (1,000 products) for signed-out clients; for more,
// split it by --brand or --category, or look products up one by one with --barcodes.
//
// Data licences: database under ODbL 1.0 (credit "Open Food Facts" and share
// any public database built from it under ODbL); photos under CC BY-SA 3.0.
import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://world.openfoodfacts.org';
// Open Food Facts asks every client to identify itself.
const USER_AGENT = 'InventaAPI-catalog-import/1.0 (https://inventa-dashboard-tau.vercel.app)';
// Published limits: 10 search requests/min and 100 product requests/min.
const SEARCH_DELAY_MS = 6500;
const PRODUCT_DELAY_MS = 650;
const PAGE_SIZE = 100;
const FIELDS = 'code,product_name,product_name_en,generic_name_en,brands,quantity,categories_tags,image_front_url';

function parseArgs(argv) {
  const options = { country: 'philippines', limit: Infinity, segment: 'Grocery', out: 'openfoodfacts-import.csv', startPage: 1 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[i + 1];
    if (!flag.startsWith('--') || value === undefined) throw new Error(`Unexpected argument: ${flag}`);
    const name = flag.slice(2);
    if (!['country', 'brand', 'category', 'search', 'barcodes', 'limit', 'segment', 'out', 'start-page'].includes(name)) throw new Error(`Unknown option: ${flag}`);
    if (name === 'start-page') options.startPage = Number(value);
    else options[name] = name === 'limit' ? Number(value) : value;
    i++;
  }
  if (!(options.limit > 0)) throw new Error('--limit must be a positive number.');
  return options;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url, attempt = 1) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  // The search service is often briefly overloaded (503); back off and keep going.
  if ((response.status === 429 || response.status >= 500) && attempt <= 10) {
    const wait = Math.min(15000 * attempt, 90000);
    console.warn(`  ${response.status} from Open Food Facts; waiting ${wait / 1000}s before retrying.`);
    await sleep(wait);
    return getJson(url, attempt + 1);
  }
  // Signed-out clients only get the first 10 search pages (1,000 products).
  if (response.status === 401) throw new Error('Open Food Facts only serves the first 10 search pages to signed-out clients; narrow the search with --brand or --category, or use --barcodes');
  if (!response.ok) throw new Error(`Open Food Facts returned ${response.status} for ${url}`);
  return response.json();
}

async function* searchProducts({ country, brand, category, search, startPage }) {
  for (let page = startPage; ; page++) {
    const params = new URLSearchParams({ fields: FIELDS, page_size: String(PAGE_SIZE), page: String(page), sort_by: 'code' });
    if (country) params.set('countries_tags_en', country);
    if (brand) params.set('brands_tags', brand);
    if (category) params.set('categories_tags_en', category);
    // Full-text search uses the older search endpoint; tag filters use v2.
    const url = search
      ? `${API}/cgi/search.pl?${new URLSearchParams({ search_terms: search, search_simple: '1', action: 'process', json: '1', fields: FIELDS, page_size: String(PAGE_SIZE), page: String(page), ...(country ? { tagtype_0: 'countries', tag_contains_0: 'contains', tag_0: country } : {}) })}`
      : `${API}/api/v2/search?${params}`;
    const body = await getJson(url);
    const products = body.products || [];
    console.log(`  page ${page}: ${products.length} products (of ${body.count ?? '?'})`);
    yield* products;
    // Pages can come back a few products short, so stop on the total count instead.
    if (!products.length || page * PAGE_SIZE >= (body.count ?? 0)) return;
    await sleep(SEARCH_DELAY_MS);
  }
}

async function* barcodeProducts(file) {
  const codes = [...new Set(readFileSync(file, 'utf8').split(/[\s,;]+/u).map(code => code.trim()).filter(code => /^\d{6,14}$/u.test(code)))];
  console.log(`  ${codes.length} barcodes to look up`);
  for (const [index, code] of codes.entries()) {
    const body = await getJson(`${API}/api/v2/product/${code}?fields=${FIELDS}`);
    if (body.product) yield { code, ...body.product };
    else console.warn(`  ${code}: not found on Open Food Facts`);
    if ((index + 1) % 50 === 0) console.log(`  looked up ${index + 1}/${codes.length}`);
    await sleep(PRODUCT_DELAY_MS);
  }
}

const titleCase = text => text.replace(/[-_]+/gu, ' ').replace(/\b\p{L}/gu, letter => letter.toUpperCase());
const csvCell = value => /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

function toRow(product, segment) {
  const name = (product.product_name_en || product.product_name || '').trim();
  if (!name) return null;
  const tag = (product.categories_tags || []).find(item => item.startsWith('en:'));
  const image = typeof product.image_front_url === 'string' && product.image_front_url.startsWith('https://') ? product.image_front_url : '';
  return {
    name: name.slice(0, 160),
    brand: (product.brands || '').split(',')[0].trim().slice(0, 120),
    segment,
    category: tag ? titleCase(tag.slice(3)).slice(0, 120) : 'Uncategorized',
    size: (product.quantity || '').trim().slice(0, 200),
    price: '',
    sku: product.code,
    description: (product.generic_name_en || '').trim().slice(0, 4000),
    image_url: image,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log('Collecting from Open Food Facts…');
  const source = options.barcodes ? barcodeProducts(options.barcodes) : searchProducts(options);
  const rows = [], seen = new Set();
  let skipped = 0, failure = null;
  try {
    for await (const product of source) {
      const row = toRow(product, options.segment);
      if (!row || seen.has(row.sku)) { skipped++; continue; }
      seen.add(row.sku); rows.push(row);
      if (rows.length >= options.limit) break;
    }
  } catch (error) {
    // Keep what was collected; rerun with --start-page to continue a search.
    failure = error;
  }
  const columns = ['name', 'brand', 'segment', 'category', 'size', 'price', 'sku', 'description', 'image_url'];
  writeFileSync(options.out, [columns.join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n') + '\n');
  const credits = options.out.replace(/\.csv$/iu, '') + '-credits.csv';
  writeFileSync(credits, ['barcode,name,product_page,image_url,data_license,image_license,source',
    ...rows.map(row => [row.sku, row.name, `${API}/product/${row.sku}`, row.image_url, 'ODbL 1.0', row.image_url ? 'CC BY-SA 3.0' : '', 'Open Food Facts contributors']
      .map(value => csvCell(value)).join(','))].join('\n') + '\n');
  console.log(`Wrote ${rows.length} products to ${options.out} (${rows.filter(row => row.image_url).length} with a photo; ${skipped} skipped without a name or repeated).`);
  console.log(`Credits: ${credits}. Price is optional; add it now or later in the admin panel.`);
  if (failure) throw new Error(`Stopped early: ${failure.message}. The products collected so far were saved.`);
}

main().catch(error => { console.error(error.message); process.exit(1); });
