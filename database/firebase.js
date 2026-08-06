import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Firebase Initialization ────────────────────────────────────────────────
// Supports two modes:
//   1. Local dev: reads from service-account.json (git-ignored, must be present locally)
//   2. Production (Vercel): reads from individual environment variables
//      Set these in Vercel Dashboard → Project Settings → Environment Variables:
//        FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

if (!getApps().length) {
    // Mode 1: Try environment variables first (production / Vercel)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Vercel stores multi-line strings with literal \n — replace them back
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
        console.log('[Firebase] ✅ Initialized via environment variables.');

    } else {
        // Mode 2: Fall back to service-account.json (local dev)
        try {
            const { createRequire } = await import('module');
            const { fileURLToPath } = await import('url');
            const path = await import('path');
            const __dirname = path.default.dirname(fileURLToPath(import.meta.url));
            const require = createRequire(import.meta.url);
            const serviceAccount = require(path.default.resolve(__dirname, '../service-account.json'));
            initializeApp({ credential: cert(serviceAccount) });
            console.log('[Firebase] ✅ Initialized via service-account.json.');
        } catch (err) {
            console.error(
                '[Firebase] ERROR: No Firebase credentials found.\n' +
                '  → For local dev: place service-account.json in project root.\n' +
                '  → For Vercel: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY env vars.'
            );
            process.exit(1);
        }
    }
}


const firestore = getFirestore();

// ─── FirestoreDatabase Class ─────────────────────────────────────────────────
// Centralized Product Information Management (PIM) database layer
class FirestoreDatabase {

    // ─── Collection References ────────────────────────────────────────────
    get usersCol()           { return firestore.collection('users'); }
    get productsCol()        { return firestore.collection('products'); }

    // ═══════════════════════════════════════════════════════════════════════
    // USERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Find a user document by username (case-insensitive).
     * @param {string} username
     * @returns {Promise<Object|null>}
     */
    async findUser(username) {
        const snap = await this.usersCol
            .where('username', '==', username.toLowerCase())
            .limit(1)
            .get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    /**
     * Get a user by their document ID.
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getUserById(id) {
        const doc = await this.usersCol.doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRODUCTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Get all products, optionally filtered by businessType.
     * Supports pagination via `limit` and `startAfterDoc` for large datasets.
     * @param {string|null} businessType
     * @param {number} limit
     * @param {import('firebase-admin/firestore').DocumentSnapshot|null} startAfterDoc
     * @returns {Promise<Object[]>}
     */
    async getProducts(businessType = null, limit = 100, startAfterDoc = null) {
        let query = this.productsCol.orderBy('name');

        if (businessType) {
            query = query.where('businessType', '==', businessType);
        }
        if (limit) {
            query = query.limit(limit);
        }
        if (startAfterDoc) {
            query = query.startAfter(startAfterDoc);
        }

        const snap = await query.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    /**
     * Get a single product by its barcode string.
     * @param {string} barcode
     * @returns {Promise<Object|null>}
     */
    async getProductByBarcode(barcode) {
        const snap = await this.productsCol
            .where('barcode', '==', barcode)
            .limit(1)
            .get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    /**
     * Get a single product by its Firestore document ID.
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getProductById(id) {
        const doc = await this.productsCol.doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    /**
     * Add a new product to Firestore.
     * Enforces uniqueness by checking for duplicate barcode AND name before insert.
     * @param {Object} prod
     * @returns {Promise<Object>} The newly created product (with generated id).
     */
    async addProduct(prod) {
        // --- Duplicate Prevention ---
        // 1. Check barcode uniqueness
        const existingBarcode = await this.getProductByBarcode(prod.barcode);
        if (existingBarcode) {
            throw new Error(`Duplicate barcode: A product with barcode '${prod.barcode}' already exists.`);
        }

        // 2. Check name uniqueness (case-insensitive)
        const nameSnap = await this.productsCol
            .where('nameLower', '==', prod.name.toLowerCase())
            .limit(1)
            .get();
        if (!nameSnap.empty) {
            throw new Error(`Duplicate name: A product named '${prod.name}' already exists.`);
        }

        // 3. Write to Firestore
        const docRef = await this.productsCol.add({
            ...prod,
            nameLower: prod.name.toLowerCase(), // Lowercase index for case-insensitive dedup
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        return { id: docRef.id, ...prod };
    }

    /**
     * Update an existing product by document ID.
     * @param {string} id
     * @param {Object} updates
     * @returns {Promise<Object|null>}
     */
    async updateProduct(id, updates) {
        const docRef = this.productsCol.doc(id);
        const existing = await docRef.get();
        if (!existing.exists) return null;

        const safeUpdates = {
            ...updates,
            updatedAt: FieldValue.serverTimestamp(),
        };

        // If name is being updated, refresh the lowercase index too
        if (updates.name) {
            safeUpdates.nameLower = updates.name.toLowerCase();
        }

        await docRef.update(safeUpdates);
        const updated = await docRef.get();
        return { id: updated.id, ...updated.data() };
    }
}

export const db = new FirestoreDatabase();
