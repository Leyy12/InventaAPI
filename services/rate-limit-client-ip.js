import { isIP } from 'node:net';
import rateLimit from 'express-rate-limit';
import ipaddr from 'ipaddr.js';

// This is deliberately an exact-IP key. The existing policy is per IP, not
// per IPv6 subnet; ipaddr also collapses IPv4-mapped IPv6 to its IPv4 key.
export function normalizeRateLimitIp(value) {
    if (typeof value !== 'string') return null;
    const candidate = value.trim();
    if (!candidate || candidate.includes(',') || candidate.includes('%') || !isIP(candidate)) return null;
    try {
        return ipaddr.process(candidate).toString();
    } catch {
        return null;
    }
}

export function trustedRateLimitIp(req, { vercel = process.env.VERCEL === '1' } = {}) {
    if (!vercel) return normalizeRateLimitIp(req.socket?.remoteAddress);

    // Direct Vercel deployments overwrite X-Forwarded-For with the client IP.
    // X-Vercel-Forwarded-For is the preferred source, but must agree with that
    // platform-controlled header. Never select a client-supplied extra header.
    const forwarded = normalizeRateLimitIp(req.headers?.['x-forwarded-for']);
    if (!forwarded) return null;
    const vercelForwarded = req.headers?.['x-vercel-forwarded-for'];
    if (vercelForwarded === undefined) return forwarded;
    const primary = normalizeRateLimitIp(vercelForwarded);
    return primary === forwarded ? primary : null;
}

export function createIpRateLimiter({
    vercel = process.env.VERCEL === '1',
    windowMs = 60 * 1000,
    max = 60,
    publicImages = false,
    message = 'Too many requests. Please try again after 1 minute to maintain system security. Maximum 60 requests per minute.',
} = {}) {
    const verifiedIp = Symbol('verified rate-limit client IP');
    const verifyClientIp = (req, res, next) => {
        const ip = trustedRateLimitIp(req, { vercel });
        if (!ip) return res.status(503).json({ error: 'Client IP could not be verified for rate limiting.' });
        req[verifiedIp] = ip;
        return next();
    };

    const createLimiter = (limit, message) => rateLimit({
        windowMs,
        max: limit,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: message },
        keyGenerator: req => {
            if (!req[verifiedIp]) throw new Error('Rate-limit client IP verification was bypassed');
            return req[verifiedIp];
        },
    });
    const ordinary = createLimiter(max, message);
    // Four office users can each scroll a 200-image catalog batch in a minute.
    // Browser cache hits need no request; revalidations and failures still count.
    // Separate MemoryStores are process-local bounds, not distributed/edge limits.
    const images = publicImages ? createLimiter(800, 'Too many image requests. Please try again after 1 minute. Maximum 800 image requests per minute.') : null;
    const limiter = images ? (req, res, next) => {
        // Match the raw canonical URL, not Express's decoded/case-insensitive
        // routing. HEAD, queries, private routes and uploads retain the 60 limit.
        const publicGet = req.method === 'GET' && /^\/api\/v1\/product-media\/[a-f0-9]{64}\/image$/u.test(req.originalUrl);
        return (publicGet ? images : ordinary)(req, res, next);
    } : ordinary;
    return { verifyClientIp, limiter };
}
