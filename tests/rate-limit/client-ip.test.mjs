import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import {
    createIpRateLimiter,
    normalizeRateLimitIp,
    trustedRateLimitIp,
} from '../../services/rate-limit-client-ip.js';

const forwarded = (ip, extra = {}) => ({
    'x-vercel-forwarded-for': ip,
    'x-forwarded-for': ip,
    ...extra,
});

async function withServer(run, { vercel = true } = {}) {
    const app = express();
    const { verifyClientIp, limiter } = createIpRateLimiter({ vercel });
    app.use('/api/', verifyClientIp, limiter);
    app.use('/daas/', verifyClientIp, limiter);
    app.get('/api/v1/products', (_req, res) => res.json({ ok: true }));
    app.get('/daas/v1/health', (_req, res) => res.json({ ok: true }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        await run((path, headers) => fetch(`${base}${path}`, { headers }));
    } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

test('normalizes strict IPv4, IPv6, and IPv4-mapped IPv6 to stable exact-IP keys', () => {
    assert.equal(normalizeRateLimitIp('203.0.113.8'), '203.0.113.8');
    assert.equal(normalizeRateLimitIp('::ffff:203.0.113.8'), '203.0.113.8');
    assert.equal(normalizeRateLimitIp('2001:0db8:0:0:0:0:0:1'), '2001:db8::1');
    assert.equal(normalizeRateLimitIp('2001:db8::1'), '2001:db8::1');
    for (const invalid of [undefined, '', 'unknown', '999.0.0.1', '203.0.113.8:443',
        '203.0.113.8, 198.51.100.9', 'fe80::1%eth0', ['203.0.113.8']]) {
        assert.equal(normalizeRateLimitIp(invalid), null);
    }
});

test('uses Vercel primary header only when it agrees with overwritten X-Forwarded-For', () => {
    const request = headers => ({ headers, socket: { remoteAddress: '127.0.0.1' } });
    assert.equal(trustedRateLimitIp(request(forwarded('203.0.113.8')), { vercel: true }), '203.0.113.8');
    assert.equal(trustedRateLimitIp(request({ 'x-forwarded-for': '2001:db8::1' }), { vercel: true }), '2001:db8::1');
    assert.equal(trustedRateLimitIp(request(forwarded('2001:0db8::1', {
        'x-forwarded-for': '2001:db8::1',
    })), { vercel: true }), '2001:db8::1');
    assert.equal(trustedRateLimitIp(request(forwarded('203.0.113.8', {
        'x-real-ip': '198.51.100.9',
    })), { vercel: true }), '203.0.113.8');
    assert.equal(trustedRateLimitIp(request(forwarded('203.0.113.8', {
        'x-forwarded-for': '198.51.100.9',
    })), { vercel: true }), null);
    assert.equal(trustedRateLimitIp(request(forwarded('203.0.113.8', {
        'x-forwarded-for': '203.0.113.8, 198.51.100.9',
    })), { vercel: true }), null);
    assert.equal(trustedRateLimitIp(request({ 'x-vercel-forwarded-for': '203.0.113.8' }), { vercel: true }), null);
    assert.equal(trustedRateLimitIp(request({}), { vercel: true }), null);
    assert.equal(trustedRateLimitIp(request(forwarded('203.0.113.8', {
        'x-forwarded-for': '203.0.113.8, 198.51.100.9',
    })), { vercel: false }), '127.0.0.1');
});

test('Vercel IPv4 and IPv6 clients get stable, separate buckets', async () => {
    await withServer(async request => {
        const a1 = await request('/api/v1/products', forwarded('203.0.113.8'));
        const a2 = await request('/api/v1/products', forwarded('203.0.113.8'));
        const b = await request('/api/v1/products', forwarded('198.51.100.9'));
        const v6 = await request('/api/v1/products', forwarded('2001:0db8::1'));
        const v6Again = await request('/api/v1/products', forwarded('2001:db8::1'));
        const v6Other = await request('/api/v1/products', forwarded('2001:db8::2'));
        const mapped = await request('/api/v1/products', forwarded('::ffff:203.0.113.8', {
            'x-forwarded-for': '203.0.113.8',
        }));
        assert.deepEqual([a1.status, a2.status, b.status, v6.status, v6Again.status,
            v6Other.status, mapped.status], [200, 200, 200, 200, 200, 200, 200]);
        assert.equal(a1.headers.get('ratelimit-remaining'), '59');
        assert.equal(a2.headers.get('ratelimit-remaining'), '58');
        assert.equal(b.headers.get('ratelimit-remaining'), '59');
        assert.equal(v6.headers.get('ratelimit-remaining'), '59');
        assert.equal(v6Again.headers.get('ratelimit-remaining'), '58');
        assert.equal(v6Other.headers.get('ratelimit-remaining'), '59');
        assert.equal(mapped.headers.get('ratelimit-remaining'), '57');
    });
});

test('health and public products intentionally share the 60/minute IP limiter', async () => {
    await withServer(async request => {
        const ip = forwarded('203.0.113.25');
        for (let index = 0; index < 59; index += 1) {
            assert.equal((await request('/api/v1/products', ip)).status, 200);
        }
        const sixtieth = await request('/daas/v1/health', ip);
        assert.equal(sixtieth.status, 200);
        assert.equal(sixtieth.headers.get('ratelimit-remaining'), '0');
        const sixtyFirst = await request('/api/v1/products', ip);
        assert.equal(sixtyFirst.status, 429);
        assert.match((await sixtyFirst.json()).error, /Maximum 60 requests per minute/);
        assert.equal((await request('/daas/v1/health', forwarded('198.51.100.25'))).status, 200);
    });
});

test('missing, malformed, and spoofed forwarding input fails closed without consuming another bucket', async () => {
    await withServer(async request => {
        for (const headers of [
            {},
            { 'x-vercel-forwarded-for': '203.0.113.8' },
            forwarded('not-an-ip'),
            forwarded('203.0.113.8, 198.51.100.9'),
            forwarded('203.0.113.8', { 'x-forwarded-for': '198.51.100.9' }),
            forwarded('203.0.113.8', { 'x-vercel-forwarded-for': '198.51.100.9' }),
        ]) {
            assert.equal((await request('/daas/v1/health', headers)).status, 503);
        }
        const valid = await request('/daas/v1/health', forwarded('203.0.113.8'));
        assert.equal(valid.status, 200);
        assert.equal(valid.headers.get('ratelimit-remaining'), '59');
        const spoofedExtra = await request('/daas/v1/health', forwarded('203.0.113.8', {
            'x-real-ip': '198.51.100.9',
        }));
        assert.equal(spoofedExtra.status, 200);
        assert.equal(spoofedExtra.headers.get('ratelimit-remaining'), '58');
        const fallback = await request('/daas/v1/health', { 'x-forwarded-for': '203.0.113.8' });
        assert.equal(fallback.status, 200);
        assert.equal(fallback.headers.get('ratelimit-remaining'), '57');
    });
});

test('custom key path prevents the old X-Forwarded-For validation error', async () => {
    const errors = [];
    const original = console.error;
    console.error = (...parts) => errors.push(parts.map(String).join(' '));
    try {
        await withServer(async request => {
            assert.equal((await request('/daas/v1/health', forwarded('203.0.113.8'))).status, 200);
        });
    } finally {
        console.error = original;
    }
    assert.equal(errors.some(message => message.includes('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')), false);
});

test('server mounts one verified limiter on both route families without changing auth or quota', async () => {
    const source = await readFile(new URL('../../server.js', import.meta.url), 'utf8');
    assert.match(source, /app\.use\('\/api\/', verifyClientIp, limiter\)/);
    assert.match(source, /app\.use\('\/daas\/', verifyClientIp, limiter\)/);
    assert.doesNotMatch(source, /app\.set\(['"]trust proxy['"],\s*true\)/);
    assert.match(source, /app\.use\('\/api\/v1\/auth', authRouter\)/);
    assert.match(source, /app\.use\('\/daas\/v1', daasRouter\)/);
    assert.match(source, /IP: \$\{trustedRateLimitIp\(req\) \?\? 'unverified'\}/);
});
