/**
 * OFF Sample Tester
 * Pulls 50 real Philippine grocery products from Open Food Facts,
 * maps them to our schema with category-based pricing,
 * and prints them — NO Firestore writes, preview only.
 */
import { createRequire } from 'module';

// Category-based pricing table (PHP retail estimates)
const CATEGORY_PRICE_MAP = {
  // Biscuits and crackers
  'en:crackers-appetizers':   { min: 10, max: 45 },
  'en:biscuits-and-crackers': { min: 10, max: 65 },
  'en:biscuits':              { min: 15, max: 60 },
  // Bread
  'en:sliced-breads':         { min: 55, max: 120 },
  'en:breads':                { min: 35, max: 120 },
  // Milks and dairy
  'en:milks':                 { min: 20, max: 650 },
  'en:milks-liquid-and-powder': { min: 20, max: 700 },
  // Snacks / chips
  'en:chips-and-fries':       { min: 20, max: 65 },
  'en:crisps':                { min: 20, max: 65 },
  'en:salty-snacks':          { min: 15, max: 65 },
  // Canned goods
  'en:canned-tunas':          { min: 30, max: 95 },
  'en:canned-sardines':       { min: 18, max: 55 },
  'en:canned-foods':          { min: 25, max: 150 },
  'en:corned-beef':           { min: 65, max: 120 },
  // Noodles
  'en:instant-noodles':       { min: 10, max: 45 },
  'en:noodles':               { min: 10, max: 55 },
  // Beverages / drinks
  'en:instant-coffees':       { min: 8, max: 60 },
  'en:coffees':               { min: 8, max: 90 },
  'en:soft-drinks':           { min: 20, max: 90 },
  'en:colas':                 { min: 20, max: 90 },
  'en:iced-teas':             { min: 15, max: 50 },
  'en:fruit-juices':          { min: 25, max: 90 },
  'en:waters':                { min: 15, max: 40 },
  'en:fermented-drinks':      { min: 15, max: 50 },
  'en:energy-drinks':         { min: 30, max: 75 },
  // Condiments / sauces
  'en:herbs-and-spices':      { min: 10, max: 55 },
  'en:condiments':            { min: 25, max: 120 },
  // Sweets/confectionery
  'en:chocolate-biscuits':    { min: 15, max: 55 },
  'en:sweet-snacks':          { min: 15, max: 65 },
  'en:cakes':                 { min: 20, max: 80 },
  // Peanut butter / spreads
  'en:peanut-butters':        { min: 80, max: 350 },
  'en:spreads':               { min: 60, max: 350 },
  // Default fallback
  'default':                  { min: 20, max: 150 },
};

function getPrice(categories_tags) {
  if (!categories_tags || !categories_tags.length) {
    return Math.floor(Math.random() * (150 - 20 + 1)) + 20;
  }
  for (const cat of categories_tags) {
    if (CATEGORY_PRICE_MAP[cat]) {
      const { min, max } = CATEGORY_PRICE_MAP[cat];
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
  }
  const { min, max } = CATEGORY_PRICE_MAP['default'];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getCategory(categories_tags) {
  if (!categories_tags || !categories_tags.length) return 'Grocery';
  const tag = categories_tags.find(t => t.startsWith('en:'));
  if (!tag) return 'Grocery';
  return tag
    .replace('en:', '')
    .replace(/-/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function fetchAndPreview() {
  console.log("Fetching 50 real Philippine grocery products from Open Food Facts...\n");

  const url = "https://world.openfoodfacts.net/api/v2/search?countries_tags=en:philippines&fields=product_name,brands,quantity,categories_tags&page_size=100&page=1";

  const res = await fetch(url, {
    headers: { 'User-Agent': 'InventaAPI-Preview/1.0 (https://api-inventa-b2-dev.web.app)' }
  });
  const json = await res.json();

  console.log(`Total PH products available in OFF: ${json.count}\n`);

  // Filter out entries with empty product names
  const valid = json.products.filter(p => p.product_name && p.product_name.trim().length > 2);

  const sample = valid.slice(0, 50);

  console.log("=".repeat(80));
  console.log(`PREVIEW — ${sample.length} records mapped to our schema:`);
  console.log("=".repeat(80));

  let i = 1;
  for (const p of sample) {
    const name = `${p.brands ? p.brands + ' ' : ''}${p.product_name}`.trim();
    const price = getPrice(p.categories_tags);
    const category = getCategory(p.categories_tags);
    const size = p.quantity || null;

    console.log(`\n[${i}] Name:     ${name}`);
    console.log(`    Category: ${category}`);
    console.log(`    Size:     ${size}`);
    console.log(`    Price:    ₱${price}`);
    console.log(`    Source:   Open Food Facts (openfoodfacts.org) — ODbL`);
    i++;
  }

  console.log("\n" + "=".repeat(80));
  console.log("PREVIEW COMPLETE. No writes to Firestore were made.");
  console.log("=".repeat(80));
}

fetchAndPreview().catch(console.error);
