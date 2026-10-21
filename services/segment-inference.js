import { comparisonText, normalizeSegment, projectProduct } from './product-contract.js';

// Works out the segment of an imported row that has none, so one CSV can mix
// Grocery, Pharmacy and Hardware products. In order: the segment existing products
// with the same category already use, the built-in categories below, words in the
// category, words in the name, brand, size or flavor, and finally Grocery.

// The catalog's own categories (from the master catalog), each in exactly one segment.
const CATEGORY_SEGMENTS = {
  Grocery: ['Bakery', 'Beverages', 'Biscuits & Crackers', 'Candy & Gum', 'Canned Goods', 'Chocolate', 'Coffee',
    'Condiments & Sauces', 'Cooking Oil', 'Dairy & Eggs', 'Health & Nutrition', 'Household & Cleaning', 'Ice Cream',
    'Instant Noodles', 'Personal Care', 'Rice', 'Snacks'],
  Pharmacy: ['Allergy Care', 'Antibiotics, Antivirals & Antifungals', 'Cough & Cold', 'Digestive & Stomach Care',
    'First Aid, Skin Care & Supplies', 'General Healthcare', 'Maintenance Medicine', 'Motion Sickness', 'Oral Rehydration',
    'Pain & Fever Relief', 'Vitamins & Supplements'],
  Hardware: ['Abrasives', 'Adhesives', 'Blacksmithing Tools', 'Bolts & Nuts', 'Cabinet Hardware', 'Cement', 'Circuit Protection',
    'Cleaning Tools', 'Cutting Discs', 'Door Hardware', 'Drill Bits', 'Electrical Accessories', 'Electrical Boxes',
    'Electrical Conduit', 'Electrical Fittings', 'Electrical Fixtures', 'Electrical Wire', 'Extension Cords', 'Fiber Cement',
    'Grinding Discs', 'Hammers', 'Hand Tools', 'Hinges', 'Hoses', 'Lighting', 'Locks', 'Lumber', 'Masonry', 'Measuring Tools',
    'Metalworking Tools', 'Nails', 'PPR Fittings', 'PPR Pipe', 'PVC Fittings', 'PVC Pipe', 'Paint', 'Paint Brushes',
    'Paint Rollers', 'Painting Supplies', 'Plumbing Fixtures', 'Plywood', 'Primer', 'Rivets', 'Roofing', 'Roofing Accessories',
    'Roofing Fasteners', 'Ropes & Chains', 'Safety Equipment', 'Screws', 'Sealants', 'Steel', 'Steel Wire', 'Tape', 'Thinner',
    'Valves', 'Washers', 'Waterproofing', 'Welding Supplies', 'Wire Mesh', 'Workshop Tools'],
};

// Whole words or phrases only. Words that are common in more than one segment
// ("cream", "oil", "elbow" as in elbow macaroni, "nuts", "gel", "cold") are left out.
const SEGMENT_WORDS = {
  Pharmacy: ['medicine', 'medicines', 'medicinal', 'medication', 'medical', 'pharma', 'pharmacy', 'pharmaceutical', 'drug', 'drugs',
    'tablet', 'tablets', 'capsule', 'capsules', 'caplet', 'caplets', 'softgel', 'softgels', 'syrup', 'suspension', 'ointment',
    'vitamin', 'vitamins', 'multivitamin', 'multivitamins', 'supplement', 'supplements', 'analgesic', 'antibiotic',
    'antibiotics', 'antiviral', 'antifungal', 'antiseptic', 'antihistamine', 'antacid', 'laxative', 'allergy', 'allergies',
    'cough', 'fever', 'flu', 'paracetamol', 'ibuprofen', 'mefenamic', 'amoxicillin', 'cetirizine', 'loratadine', 'losartan',
    'metformin', 'amlodipine', 'salbutamol', 'omeprazole', 'ascorbic', 'diarrhea', 'rehydration', 'hypertension', 'diabetes',
    'cholesterol', 'first aid', 'bandage', 'bandages', 'gauze', 'thermometer', 'isopropyl', 'povidone', 'pain relief',
    'pain reliever', 'healthcare', 'motion sickness'],
  Hardware: ['hardware', 'tool', 'tools', 'wrench', 'spanner', 'hammer', 'hammers', 'screwdriver', 'pliers', 'saw', 'hacksaw',
    'drill', 'chisel', 'clamp', 'screw', 'screws', 'nail', 'nails', 'bolt', 'bolts', 'rivet', 'rivets', 'hinge', 'hinges',
    'padlock', 'pipe', 'pipes', 'pvc', 'ppr', 'fitting', 'fittings', 'valve', 'valves', 'faucet', 'plumbing', 'electrical',
    'wire', 'wires', 'cable', 'cables', 'conduit', 'circuit breaker', 'bulb', 'bulbs', 'lighting', 'paint', 'paints', 'primer',
    'varnish', 'lacquer', 'thinner', 'sealant', 'sealants', 'adhesive', 'adhesives', 'epoxy', 'cement', 'concrete', 'mortar',
    'masonry', 'plywood', 'lumber', 'tile', 'tiles', 'grout', 'sandpaper', 'abrasive', 'abrasives', 'grinding', 'cutting disc',
    'welding', 'roofing', 'galvanized', 'steel', 'rebar', 'tape', 'measuring', 'ladder', 'shovel', 'hose', 'hoses',
    'extension cord', 'rope', 'ropes', 'chain', 'chains', 'wire mesh', 'waterproofing', 'safety equipment'],
  Grocery: ['grocery', 'groceries', 'food', 'foods', 'beverage', 'beverages', 'drink', 'drinks', 'juice', 'juices', 'coffee',
    'tea', 'milk', 'dairy', 'cheese', 'butter', 'yogurt', 'yoghurt', 'egg', 'eggs', 'bread', 'bakery', 'biscuit', 'biscuits',
    'cookie', 'cookies', 'cracker', 'crackers', 'chips', 'snack', 'snacks', 'candy', 'candies', 'chocolate', 'chocolates',
    'gum', 'noodle', 'noodles', 'pasta', 'macaroni', 'spaghetti', 'rice', 'flour', 'sugar', 'salt', 'sauce', 'sauces',
    'ketchup', 'catsup', 'vinegar', 'soy', 'seasoning', 'spice', 'spices', 'condiment', 'condiments', 'canned', 'sardines',
    'tuna', 'corned', 'beef', 'pork', 'chicken', 'meat', 'sausage', 'hotdog', 'ham', 'bacon', 'frozen', 'cereal', 'oats', 'jam',
    'spread', 'soup', 'instant', 'water', 'soda', 'cola', 'beer', 'wine', 'fruit', 'fruits', 'vegetable', 'vegetables',
    'ice cream', 'cooking oil', 'coconut', 'mango', 'banana', 'peanut', 'detergent', 'soap', 'shampoo', 'conditioner',
    'toothpaste', 'toothbrush', 'dishwashing', 'fabric softener', 'bleach', 'tissue', 'diaper', 'diapers', 'household',
    'cleaning', 'personal care', 'nutrition'],
};
const SEGMENTS = Object.keys(SEGMENT_WORDS);
const builtInCategories = new Map(Object.entries(CATEGORY_SEGMENTS)
  .flatMap(([segment, categories]) => categories.map(category => [comparisonText(category), segment])));
// "500mg", "10 mcg" and "400 IU" are doses: only medicines and supplements are sold that way.
const DOSE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|iu)\b/u;

const words = value => ` ${String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

// The single segment with the most keyword hits, or null when none or tied.
function segmentFromWords(text) {
  const padded = words(text);
  const scores = SEGMENTS.map(segment => SEGMENT_WORDS[segment].filter(word => padded.includes(` ${word} `)).length);
  if (DOSE.test(String(text || '').toLowerCase())) scores[SEGMENTS.indexOf('Pharmacy')] += 1;
  const best = Math.max(...scores);
  return best > 0 && scores.filter(score => score === best).length === 1 ? SEGMENTS[scores.indexOf(best)] : null;
}

// `records` are the catalog's products ({ id, data }); their categories teach this
// import which segment each category belongs to.
export function createSegmentInference(records = []) {
  const learned = new Map();
  for (const record of records) {
    const product = projectProduct(record.data);
    const category = comparisonText(product?.category), segment = normalizeSegment(product?.segment);
    if (!category || !segment) continue;
    if (!learned.has(category)) learned.set(category, new Map());
    learned.get(category).set(segment, (learned.get(category).get(segment) || 0) + 1);
  }
  const fromCatalog = category => {
    const counts = learned.get(category);
    if (!counts) return null;
    const best = Math.max(...counts.values());
    const leaders = [...counts].filter(([, count]) => count === best);
    return leaders.length === 1 ? leaders[0][0] : null;
  };
  // Returns { segment, source } where source is 'category', 'name' or 'default'.
  return ({ category = '', name = '', brand = '', size = '', flavor = '' } = {}) => {
    const key = comparisonText(category);
    const byCategory = key ? fromCatalog(key) || builtInCategories.get(key) || segmentFromWords(category) : null;
    if (byCategory) return { segment: byCategory, source: 'category' };
    // Sizes such as "500mg" or "Tablet" say Pharmacy even when the name does not.
    const byName = segmentFromWords(`${name} ${brand} ${size} ${flavor}`);
    if (byName) return { segment: byName, source: 'name' };
    return { segment: 'Grocery', source: 'default' };
  };
}
