import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import { normalizeRateLimitIp, createIpRateLimiter } from '../../services/rate-limit-client-ip.js';

describe('normalizeRateLimitIp', () => {
  test.each([
    ['127.0.0.1', '127.0.0.1'],
    [' 10.0.0.5 ', '10.0.0.5'],
    ['::ffff:192.168.1.1', '192.168.1.1'],
  ])('%p becomes %p', (input, expected) => expect(normalizeRateLimitIp(input)).toBe(expected));
  test.each(['', 'abc', '1.2.3.4, 5.6.7.8', 'fe80::1%eth0', null])('rejects %p', value => {
    expect(normalizeRateLimitIp(value)).toBeNull();
  });
});

describe('IP rate limiter (real HTTP requests)', () => {
  let server;
  let base;
  beforeAll(async () => {
    const app = express();
    const limits = createIpRateLimiter({ vercel: false, windowMs: 60_000, max: 5 });
    app.use(limits.verifyClientIp, limits.limiter);
    app.get('/ping', (req, res) => res.json({ ok: true }));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise(resolve => server.close(resolve)));

  test('allows 5 requests then answers 429', async () => {
    const statuses = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await fetch(`${base}/ping`)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
  });
});
