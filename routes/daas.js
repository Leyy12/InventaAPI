import express from 'express';
import { db } from '../database/db.js';
import { authenticateApiKey, activeApiKeys } from '../middleware/auth.js';

const router = express.Router();

// DaaS Health Check
router.get('/health', (req, res) => {
    res.json({
        status: "operational",
        service: "Mobile Computing Sales & Inventory DaaS Engine",
        database: "Firebase Firestore",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    });
});

// DaaS Product Catalog Endpoint (Guarded by API Key)
// Designed for third-party consumers (B2B integrations, suppliers, external web stores)
router.get('/catalog', authenticateApiKey, async (req, res) => {
    const { businessType, limit, barcode } = req.query;
    try {
        let products = [];
        if (barcode) {
            const product = await db.getProductByBarcode(barcode);
            if (!product) {
                return res.status(404).json({
                    error: "Product not registered in database.",
                    barcode: barcode,
                    suggestAcquisition: true,
                    message: "Barcode detected is unregistered. The DaaS recommendation engine suggests adding this new item to the inventory to prevent future unrecorded sales."
                });
            }
            products = [product];
        } else {
            products = await db.getProducts(businessType, parseInt(limit) || 100);
        }

        // Return highly structured, clean data perfect for integration consumers
        const formattedProducts = products.map(p => ({
            sku: p.id,
            barcode: p.barcode,
            name: p.name,
            description: p.description || "",
            classification: p.category,
            pricing: {
                retail: p.price,
                currency: "PHP"
            },
            inventory: {
                availableStock: p.stock,
                status: p.stock > 10 ? "IN_STOCK" : p.stock > 0 ? "LOW_STOCK" : "OUT_OF_STOCK"
            },
            specifications: {
                size: p.size,
                capacity: p.capacity,
                variations: p.variations,
                expirationDate: p.expirationDate || null
            },
            media: {
                thumbnailUrl: p.image
            }
        }));

        res.json({
            meta: {
                count: formattedProducts.length,
                businessSegment: businessType || "all_multi_business",
                compliance: "DPA 2012 Secure Access",
                disclaimer: "Confidential Data-as-a-Service access. Unauthorized sharing is prohibited."
            },
            catalog: formattedProducts
        });
    } catch (err) {
        res.status(500).json({ error: "DaaS query failure: " + err.message });
    }
});

// DaaS Sales Analytics Feed Endpoint (Guarded by API Key)
// Returns aggregated transaction data for Professional and Enterprise tiers
router.get('/sales-feed', authenticateApiKey, (req, res) => {
    // Generate or fetch some clean, mock aggregated sales data for B2B analytics
    res.json({
        summary: {
            totalRevenue: 48250.00,
            totalTransactions: 142,
            averageOrderValue: 339.79,
            currency: "PHP"
        },
        salesFeed: [
            { id: "TXN-001", amount: 490.00, segment: "hardware", timestamp: new Date().toISOString() },
            { id: "TXN-002", amount: 1200.00, segment: "hardware", timestamp: new Date().toISOString() },
            { id: "TXN-003", amount: 45.00, segment: "grocery", timestamp: new Date().toISOString() }
        ]
    });
});

// B2B Dynamic Key Generation / Subscription Endpoint
router.post('/subscribe', (req, res) => {
    const { email, plan, businessType } = req.body;

    if (!email) {
        return res.status(400).json({ error: "Email address is required to subscribe." });
    }

    // Generate a secure, recognizable key for the client
    const cleanEmail = email.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    const randomHash = Math.random().toString(36).substring(2, 8);
    const newKey = `daas_sme_${plan || 'starter'}_${cleanEmail}_${randomHash}`;

    // Register the key in the active keys Set
    activeApiKeys.add(newKey);

    console.log(`[SUBSCRIPTION] Registered new API key: ${newKey} for ${email} (${plan || 'starter'} - ${businessType || 'hardware'})`);

    res.json({
        success: true,
        message: "Subscription registered successfully.",
        apiKey: newKey,
        email: email,
        plan: plan || "starter",
        businessType: businessType || "hardware",
        quotaLimit: plan === 'professional' ? 5000 : plan === 'enterprise' ? 'unlimited' : 50
    });
});

export default router;
