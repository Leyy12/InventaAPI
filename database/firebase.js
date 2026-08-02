import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── Firebase Initialization ────────────────────────────────────────────────
// Loads credentials directly from the service account JSON file.
// Place your downloaded Firebase service account key at:
//   <project-root>/service-account.json
// This file is listed in .gitignore and must NEVER be committed to version control.
if (!getApps().length) {
    let serviceAccount;
    try {
        serviceAccount = require(path.resolve(__dirname, '../service-account.json'));
    } catch (err) {
        console.error(
            '[Firebase] ERROR: service-account.json not found.\n' +
            '  → Download your service account key from:\n' +
            '    Firebase Console → Project Settings → Service Accounts → Generate new private key\n' +
            '  → Save it as: <project-root>/service-account.json\n' +
            '  → Make sure it is listed in .gitignore (already done).'
        );
        process.exit(1);
    }

    initializeApp({
        credential: cert(serviceAccount),
    });
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
