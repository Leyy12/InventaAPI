import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ⚠️  IMPORTANT: Import Firebase initialization FIRST before any routes.
// Route files call getFirestore() at module load time, so Firebase must
// be initialized (via database/firebase.js) before any route is imported.
import './database/firebase.js';

// Import routers
import authRouter from './routes/auth.js';
import productsRouter from './routes/products.js';
import daasRouter from './routes/daas.js';
import apiKeysRouter from './routes/apikeys.js';
import notificationsRouter from './routes/notifications.js';
import webhooksRouter from './routes/webhooks.js';
import checkoutRouter from './routes/checkout.js';
import adminRouter from './routes/admin.js';
import contactRouter from './routes/contact.js';





const app = express();
const PORT = process.env.API_PORT || 5000;


// --- Security Middleware Integration ---
// 1. Helmet: Secure HTTP headers to prevent XSS, clickjacking, and MIME-sniffing
app.use(helmet({
    hsts: false, // Disable HSTS for local development to prevent ERR_CONNECTION_REFUSED on localhost
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
            connectSrc: ["'self'", `http://localhost:${PORT}`]
        }
    }
}));

// 2. CORS: Restrict cross-origin communications to approved origins
// Allow both customer dashboard (3000) and admin panel (3001)
const allowedOrigins = [
    'http://localhost:3000',  // Customer Dashboard (local)
    'http://localhost:3001',  // Admin Panel (local)
    // Production Vercel domains
    /\.vercel\.app$/,         // Any *.vercel.app subdomain
    /^https:\/\/inventa/,     // Any custom inventa* domain
];

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, curl, server-to-server)
        if (!origin) return callback(null, true);
        
        const allowed = allowedOrigins.some(o => {
            if (typeof o === 'string') return o === origin;
            if (o instanceof RegExp) return o.test(origin);
            return false;
        });
        
        if (allowed) {
            callback(null, true);
        } else {
            console.warn('[CORS] Blocked request from origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
}));

// 3. Express Rate Limit: Prevent Denial of Service (DoS) and brute-force scanning
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // limit each IP/SME to 60 requests per minute
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: "Too many requests. Please try again after 1 minute to maintain system security. Maximum 60 requests per minute." }
});
app.use('/api/', limiter);
app.use('/daas/', limiter);

// 4. Data Compression: Ensure JSON responses are lightweight for Mobile Computing
app.use(compression());

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK RAW BODY CAPTURE
// PayMongo signature verification requires the raw (un-parsed) request body.
// We attach it to req.rawBody via the verify callback BEFORE express.json()
// processes the body. This ONLY applies to the /api/webhooks/* path.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/webhooks', express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}));

// Express body parsers (for all other routes)
app.use(express.json({ limit: '10mb' })); // Support larger base64 images if needed
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Request Logging for Security Auditing ---
app.use((req, res, next) => {
    console.log(`[AUDIT] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
    next();
});

// --- API Routing Hookup (Version 1) ---
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/api-keys', apiKeysRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/checkout', checkoutRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/contact', contactRouter);

// --- Webhook Routes (raw body required — mounted BEFORE express.json above) ---
app.use('/api/webhooks', webhooksRouter);

// DaaS Integration Layer (Guarded internally by API Key)
app.use('/daas/v1', daasRouter);

// --- Serve static assets (CSS, images, etc.) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Base / Root Endpoint — API Info (production-safe) ---
app.get('/', (req, res) => {
    res.json({
        name: "InventaAPI DaaS Engine",
        status: "online",
        version: "1.0.0",
        message: "API-Based Data-as-a-Service Sales & Inventory Management System is running.",
        endpoints: {
            api_info:        "/api",
            auth:            "/api/v1/auth/login",
            products:        "/api/v1/products",
            daas_catalog:    "/daas/v1/catalog (x-api-key required)"
        }
    });
});

// --- Developer Portal Route ---
app.get('/developer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API Info endpoint (for raw JSON consumers) ---
app.get('/api', (req, res) => {
    res.json({
        message: "API-Based Data-as-a-Service Sales & Inventory Management System Engine is online.",
        documentation: "http://localhost:3000/",
        compliance: "Data Privacy Act (DPA) of 2012 Secure Access Enabled",
        version: "1.0.0",
        endpoints: {
            auth: "/api/v1/auth/login",
            products: "/api/v1/products",
            daas_catalog: "/daas/v1/catalog (x-api-key required)"
        }
    });
});

// --- Global Error Handling Middleware ---
app.use((err, req, res, next) => {
    console.error("[SERVER ERROR]", err.stack);
    res.status(500).json({ 
        error: "An internal server error occurred. Transaction halted for data safety.",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start Server (only when running locally, not on Vercel Serverless)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`========================================================================`);
        console.log(` SUCCESS: DaaS sales & inventory service running on http://localhost:${PORT}`);
        console.log(` Compliance Level: Data Privacy Act of 2012 / GDPR Standard`);
        console.log(` Architecture: Security-Hardened API-based Data-as-a-Service (DaaS)`);
        console.log(`========================================================================`);
    });
}

export default app;
