import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

if (!getApps().length) {
  const serviceAccount = require(path.resolve(__dirname, '../service-account.json'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function countProducts() {
  try {
    const snapshot = await db.collection('products').get();
    console.log(`[LIVE COUNT] Total documents in 'products' collection: ${snapshot.size}`);
    
    // Also check how many are active
    let activeCount = 0;
    snapshot.forEach(doc => {
        if (doc.data().is_active === true) {
            activeCount++;
        }
    });
    console.log(`[LIVE COUNT] Total ACTIVE products: ${activeCount}`);
  } catch (err) {
    console.error("Error counting products:", err);
  }
}

countProducts().then(() => process.exit(0));
