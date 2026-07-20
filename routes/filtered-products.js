import express from 'express';
import { db } from '../database/connection.js'; // PostgreSQL connection

const router = express.Router();

/**
 * =====================================================
 * MIDDLEWARE: Verify API Key & Load Authorized Products
 * =====================================================
 * Intercepts every request to /api/v1/products
 * Validates the API key from Authorization header
 * Loads the list of product IDs this key can access
 */
const verifyApiKeyMiddleware = async (req, res, next) => {
    try {
        // 1. Extract API Key from Authorization header
        const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
        
        if (!authHeader) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'API key is required. Please provide it via Authorization header or x-api-key.'
            });
        }

        // Support both "Bearer <key>" and direct key formats
        const apiKey = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;

        // 2. Query database to verify API key validity
        const keyQuery = `
            SELECT 
                ak.id as api_key_id,
                ak.api_key,
                ak.status,
                ak.rate_limit_per_minute,
                ak.rate_limit_per_day,
                ak.requests_used_today,
                ak.expires_at,
                u.id as user_id,
                u.email,
                u.business_name,
                u.plan
            FROM api_keys ak
            JOIN users u ON ak.user_id = u.id
            WHERE ak.api_key = $1
        `;

        const keyResult = await db.query(keyQuery, [apiKey]);

        if (keyResult.rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid API Key',
                message: 'The provided API key does not exist or has been revoked.'
            });
        }

        const keyData = keyResult.rows[0];

        // 3. Validate API Key Status
        if (keyData.status !== 'active') {
            return res.status(403).json({
                error: 'API Key Suspended',
                message: `This API key is ${keyData.status}. Please contact support.`
            });
        }

        // 4. Check Expiration
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return res.status(403).json({
                error: 'API Key Expired',
                message: 'This API key has expired. Please generate a new one.'
            });
        }

        // 5. Check Rate Limits
        if (keyData.requests_used_today >= keyData.rate_limit_per_day) {
            return res.status(429).json({
                error: 'Rate Limit Exceeded',
                message: `Daily limit of ${keyData.rate_limit_per_day} requests exceeded. Resets at midnight UTC.`,
                quota: {
                    limit: keyData.rate_limit_per_day,
                    used: keyData.requests_used_today,
                    remaining: 0
                }
            });
        }

        // 6. Fetch Product IDs authorized for this API key
        const productsQuery = `
            SELECT akp.product_id
            FROM api_key_products akp
            WHERE akp.api_key_id = $1 AND akp.can_read = true
        `;

        const productsResult = await db.query(productsQuery, [keyData.api_key_id]);
        const authorizedProductIds = productsResult.rows.map(row => row.product_id);

        if (authorizedProductIds.length === 0) {
            return res.status(403).json({
                error: 'No Products Authorized',
                message: 'This API key has no products assigned. Please configure your product selection.'
            });
        }

        // 7. Attach data to request object for use in route handler
        req.apiKey = {
            ...keyData,
            authorizedProductIds
        };

        // 8. Increment usage counter (async, don't wait)
        db.query(
            `UPDATE api_keys 
             SET requests_used_today = requests_used_today + 1, 
                 last_request_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [keyData.api_key_id]
        ).catch(err => console.error('Error updating API key usage:', err));

        // 9. Log the request (async, don't wait)
        db.query(
            `INSERT INTO api_usage_logs 
             (api_key_id, endpoint, http_method, query_params, ip_address, user_agent) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                keyData.api_key_id,
                req.originalUrl,
                req.method,
                JSON.stringify(req.query),
                req.ip,
                req.get('user-agent')
            ]
        ).catch(err => console.error('Error logging API usage:', err));

        next();
    } catch (error) {
        console.error('[API Key Verification Error]', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to verify API key. Please try again later.'
        });
    }
};

/**
 * =====================================================
 * PUBLIC ENDPOINT: GET /api/v1/products
 * Returns ONLY products authorized for the provided API key
 * =====================================================
 */
router.get('/products', verifyApiKeyMiddleware, async (req, res) => {
    try {
        const { authorizedProductIds, business_name, email, plan } = req.apiKey;
        const { segment, category, search, limit = 100, offset = 0 } = req.query;

        // Build dynamic WHERE clause
        let whereConditions = ['p.id = ANY($1)', 'p.is_active = true'];
        let queryParams = [authorizedProductIds];
        let paramIndex = 2;

        // Filter by segment
        if (segment) {
            whereConditions.push(`p.segment = $${paramIndex}`);
            queryParams.push(segment);
            paramIndex++;
        }

        // Filter by category
        if (category) {
            whereConditions.push(`p.category = $${paramIndex}`);
            queryParams.push(category);
            paramIndex++;
        }

        // Search by name or description
        if (search) {
            whereConditions.push(`(p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        // Add pagination params
        queryParams.push(parseInt(limit), parseInt(offset));

        // Execute query
        const productsQuery = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.description,
                p.category,
                p.segment,
                p.price,
                p.stock,
                p.metadata,
                p.image_url,
                p.thumbnail_url,
                p.tags,
                p.is_featured
            FROM products p
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY p.name ASC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const result = await db.query(productsQuery, queryParams);

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM products p
            WHERE ${whereConditions.join(' AND ')}
        `;

        const countResult = await db.query(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
        const totalProducts = parseInt(countResult.rows[0].total);

        // Return filtered products
        res.json({
            success: true,
            api_key_info: {
                business_name,
                email,
                plan,
                authorized_products: authorizedProductIds.length
            },
            pagination: {
                total: totalProducts,
                limit: parseInt(limit),
                offset: parseInt(offset),
                returned: result.rows.length
            },
            products: result.rows
        });

    } catch (error) {
        console.error('[Products API Error]', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch products. Please try again later.'
        });
    }
});

/**
 * =====================================================
 * ENDPOINT: GET /api/v1/products/:id
 * Get a single product by ID (if authorized)
 * =====================================================
 */
router.get('/products/:id', verifyApiKeyMiddleware, async (req, res) => {
    try {
        const { authorizedProductIds } = req.apiKey;
        const productId = parseInt(req.params.id);

        // Check if product is authorized
        if (!authorizedProductIds.includes(productId)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have access to this product. Please check your API key configuration.'
            });
        }

        const query = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.description,
                p.category,
                p.segment,
                p.price,
                p.stock,
                p.metadata,
                p.image_url,
                p.thumbnail_url,
                p.tags,
                p.is_featured,
                p.created_at,
                p.updated_at
            FROM products p
            WHERE p.id = $1 AND p.is_active = true
        `;

        const result = await db.query(query, [productId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Product not found or has been deactivated.'
            });
        }

        res.json({
            success: true,
            product: result.rows[0]
        });

    } catch (error) {
        console.error('[Product Detail API Error]', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch product details.'
        });
    }
});

/**
 * =====================================================
 * ENDPOINT: GET /api/v1/products/stats
 * Get statistics about authorized products
 * =====================================================
 */
router.get('/products/stats', verifyApiKeyMiddleware, async (req, res) => {
    try {
        const { authorizedProductIds } = req.apiKey;

        const query = `
            SELECT 
                COUNT(*) as total_products,
                COUNT(CASE WHEN segment = 'Pharmacy' THEN 1 END) as pharmacy_count,
                COUNT(CASE WHEN segment = 'Hardware' THEN 1 END) as hardware_count,
                COUNT(CASE WHEN segment = 'Grocery' THEN 1 END) as grocery_count,
                COUNT(DISTINCT category) as total_categories,
                SUM(stock) as total_stock_units
            FROM products
            WHERE id = ANY($1) AND is_active = true
        `;

        const result = await db.query(query, [authorizedProductIds]);

        res.json({
            success: true,
            stats: result.rows[0]
        });

    } catch (error) {
        console.error('[Product Stats API Error]', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch product statistics.'
        });
    }
});

export default router;
