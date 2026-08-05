/**
 * backup-products.mjs
 *
 * Exports all documents from the Firestore "products" collection
 * to a local JSON file: backups/products-backup-[timestamp].json
 *
 * Usage:
 *   node scripts/backup-products.mjs
 */

import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = getFirestore();

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const outDir    = resolve(__dirname, '../backups');
  const outFile   = resolve(outDir, `products-backup-${timestamp}.json`);

  console.log('\n══════════════════════════════════════════════════');
  console.log('  backup-products.mjs');
  console.log('══════════════════════════════════════════════════\n');

  console.log('Fetching all documents from "products" collection…');
  const snap = await db.collection('products').get();

  const docs = snap.docs.map(d => {
    const data = d.data();
    // Convert Firestore Timestamps to ISO strings for JSON serialization
    const serialized = JSON.parse(JSON.stringify(data, (key, val) => {
      if (val && typeof val === 'object' && typeof val.toDate === 'function') {
        return val.toDate().toISOString();
      }
      return val;
    }));
    return { _id: d.id, ...serialized };
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(docs, null, 2), 'utf-8');

  console.log(`✅ Backup successful!`);
  console.log(`   Total documents backed up : ${docs.length}`);
  console.log(`   Saved to                  : ${outFile}\n`);
}

backup().catch(e => { console.error('Backup failed:', e); process.exit(1); });
