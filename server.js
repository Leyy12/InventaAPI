import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import routers
import authRouter from './routes/auth.js';
import productsRouter from './routes/products.js';
import recommendationsRouter from './routes/recommendations.js';
import daasRouter from './routes/daas.js';
import apiKeysRouter from './routes/apikeys.js';

dotenv.config();

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
            connectSrc: ["'self'", "http://localhost:5000"]
        }
    }
}));

// 2. CORS: Restrict cross-origin communications to approved origins
app.use(cors({
    origin: '*', // In production, replace with specific domain e.g., 'https://sme-sales-pwa.vercel.app'
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

// Express body parsers
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
app.use('/api/v1/recommendations', recommendationsRouter);
app.use('/api/v1/api-keys', apiKeysRouter);

// DaaS Integration Layer (Guarded internally by API Key)
app.use('/daas/v1', daasRouter);

// --- Serve static assets (CSS, images, etc.) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Base / Root Endpoint — Serves the Landing Page ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// --- Developer Portal Route ---
app.get('/developer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API Info endpoint (for raw JSON consumers) ---
app.get('/api', (req, res) => {
    res.json({
        message: "API-Based Data-as-a-Service Sales & Inventory Management System Engine is online.",
        documentation: "http://localhost:5000/",
        compliance: "Data Privacy Act (DPA) of 2012 Secure Access Enabled",
        version: "1.0.0",
        endpoints: {
            auth: "/api/v1/auth/login",
            products: "/api/v1/products",
            recommendations: "/api/v1/recommendations",
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

// Start Server
app.listen(PORT, () => {
    console.log(`========================================================================`);
    console.log(` SUCCESS: DaaS sales & inventory service running on http://localhost:${PORT}`);
    console.log(` Compliance Level: Data Privacy Act of 2012 / GDPR Standard`);
    console.log(` Architecture: Security-Hardened API-based Data-as-a-Service (DaaS)`);
    console.log(`========================================================================`);
});
