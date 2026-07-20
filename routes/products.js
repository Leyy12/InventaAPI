import express from 'express';
import { db } from '../database/db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Retrieve products (Supports Multi-Business filtering e.g. ?businessType=hardware)
// Supports pagination via ?page=1&limit=50
router.get('/', async (req, res) => {
    const { businessType, limit, page } = req.query;
    try {
        const pageLimit = parseInt(limit) || 100;
        const products = await db.getProducts(businessType, pageLimit);
        res.json({ products, count: products.length });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch products: " + err.message });
    }
});

// Barcode Lookup - Key hook for POS scanning and the Intelligent Product Acquisition logic
router.get('/barcode/:barcode', async (req, res) => {
    const { barcode } = req.params;
    try {
        const product = await db.getProductByBarcode(barcode);

        if (!product) {
            // Intelligent Recommendation System integration:
            // Respond with structured advice prompting the cashier/admin to acquire/add this new item
            return res.status(404).json({
                error: "Product not registered in database.",
                barcode: barcode,
                suggestAcquisition: true,
                message: "Barcode detected is unregistered. The DaaS recommendation engine suggests adding this new item to the inventory to prevent future unrecorded sales.",
                action_url: `/add-product?barcode=${barcode}`
            });
        }

        res.json({ product });
    } catch (err) {
        res.status(500).json({ error: "Barcode query failure: " + err.message });
    }
});

// Retrieve recommendations
router.get('/recommendations/list', (req, res) => {
    const { businessType } = req.query;
    try {
        let recos = db.getRecommendations();
        if (businessType && businessType !== 'Admin') {
            recos = recos.filter(r => r.businessType === businessType);
        }
        res.json({ recommendations: recos });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch recommendations: " + err.message });
    }
});

// Add a recommendation
router.post('/recommendations', (req, res) => {
    try {
        const reco = db.addRecommendation(req.body);
        res.json({ success: true, recommendation: reco });
    } catch (err) {
        res.status(500).json({ error: "Failed to add recommendation: " + err.message });
    }
});

// Update a recommendation (Approve/Ignore)
router.put('/recommendations/:id', (req, res) => {
    try {
        const updated = db.updateRecommendation(req.params.id, req.body);
        res.json({ success: true, recommendation: updated });
    } catch (err) {
        res.status(500).json({ error: "Failed to update recommendation: " + err.message });
    }
});

// Retrieve specific product by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const product = await db.getProductById(id);
        if (!product) return res.status(404).json({ error: "Product not found." });
        res.json({ product });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch product: " + err.message });
    }
});

// Add a new product (RBAC secured, supports images, variations, sizes/capacities, and dynamic attributes)
router.post('/', async (req, res) => {
    const { barcode, name, description, category, businessType, price, stock, image, size, capacity, variations, attributes, expirationDate, supplierInfo } = req.body;

    if (!barcode || !name || !businessType || price === undefined || stock === undefined) {
        return res.status(400).json({ error: "Barcode, name, businessType, price, and stock are required." });
    }

    try {
        const newProd = await db.addProduct({
            barcode,
            name,
            description: description || "",
            category: category || "General",
            businessType,
            price: parseFloat(price),
            stock: parseInt(stock),
            image_url: image || "https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=300&auto=format&fit=crop",
            image: image || "https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=300&auto=format&fit=crop",
            size: req.body.size || "Standard",
            color: req.body.color || "Assorted",
            capacity: capacity || "Standard",
            weight: req.body.weight || "N/A",
            uom: req.body.uom || "pcs",
            status: req.body.status || "Active",
            variations: variations || [],
            attributes: attributes || { brand: req.body.brand || "Generic" },
            expirationDate: expirationDate || null,
            supplierInfo: supplierInfo || { name: "N/A", contact: "N/A" }
        });

        res.status(201).json({
            message: "Product added successfully to Firestore.",
            product: newProd
        });
    } catch (err) {
        // Duplicate barcode or name errors are thrown from firebase.js addProduct()
        const isDuplicate = err.message.startsWith('Duplicate');
        res.status(isDuplicate ? 409 : 500).json({ error: err.message });
    }
});

// Update an existing product (RBAC secured)
router.put('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const updated = await db.updateProduct(id, req.body);
        if (!updated) {
            return res.status(404).json({ error: "Product not found." });
        }
        res.json({
            message: "Product updated successfully.",
            product: updated
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to update product: " + err.message });
    }
});

export default router;
